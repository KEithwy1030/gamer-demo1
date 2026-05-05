import crypto from "node:crypto";
import type { AttackRequestPayload, CombatEventPayload, MonsterSpawnDefinition, MonsterState, MonsterType, SkillCastPayload } from "@gamer/shared";
import { WEAPON_DEFINITIONS } from "@gamer/shared";
import {
  ELITE_MONSTER_AGGRO_RANGE,
  ELITE_MONSTER_ATTACK_COOLDOWN_MS,
  ELITE_MONSTER_ATTACK_DAMAGE,
  ELITE_MONSTER_ATTACK_RANGE,
  ELITE_MONSTER_LEASH_RANGE,
  ELITE_MONSTER_MAX_HP,
  ELITE_MONSTER_MOVE_SPEED,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH,
  MONSTER_CONTACT_RADIUS,
  MONSTER_TICK_MS,
  NORMAL_MONSTER_AGGRO_RANGE,
  NORMAL_MONSTER_ATTACK_COOLDOWN_MS,
  NORMAL_MONSTER_ATTACK_DAMAGE,
  NORMAL_MONSTER_ATTACK_RANGE,
  NORMAL_MONSTER_LEASH_RANGE,
  NORMAL_MONSTER_MAX_HP,
  NORMAL_MONSTER_MOVE_SPEED,
  PLAYER_HIT_RADIUS
} from "../internal-constants.js";
import { createDropsForMonster, listWorldDrops } from "../loot/loot-manager.js";
import {
  consumePendingBasicAttack,
  getBasicAttackBonusDamage,
  scaleOutgoingDamage,
  syncPlayerCombatState
} from "../combat/player-effects.js";
import type { DropState, RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../types.js";

interface CombatPlayerState {
  x: number;
  y: number;
  direction: { x: number; y: number };
}

const NORMAL_MONSTER_COUNT = 40;
const ELITE_MONSTER_COUNT = 3;
const CENTER_EXCLUSION_RADIUS = 300;
const SAFE_ZONE_EXCLUSION_RADIUS = 520;
const EXTRACT_ZONE_EXCLUSION_RADIUS = 260;
const SPAWN_JITTER_PX = 200;
const MONSTER_CORPSE_DURATION_MS = 10_000;
const MONSTER_RESPAWN_DELAY_MS = 60_000;
const MAP_MARGIN_PX = 96;
const ELITE_RESOURCE_GUARD_OFFSET_PX = 150;
const NORMAL_MONSTER_PATROL_RADIUS = 160;
const ELITE_MONSTER_PATROL_RADIUS = 90;
const NORMAL_MONSTER_GUARD_RADIUS = 180;
const ELITE_MONSTER_GUARD_RADIUS = 240;
const MONSTER_RETURN_DELAY_MS = 3000;
const MONSTER_IDLE_MIN_MS = 1000;
const MONSTER_IDLE_MAX_MS = 2000;
const SKILL_DAMAGE = {
  swordDashSlash: 24,
  bladeSweep: 22,
  spearHeavyThrust: 24
} as const;

export interface PlayerAttackOutcome {
  monsters: MonsterState[];
  drops: DropState[];
  combat?: CombatEventPayload;
  spawnedDrops: DropState[];
}

export interface MonsterTickResult {
  monsters: MonsterState[];
  drops: DropState[];
  combatEvents: CombatEventPayload[];
  playerStateChanged: boolean;
}

export interface PlayerSkillOutcome {
  monsters: MonsterState[];
  drops: DropState[];
  combatEvents: CombatEventPayload[];
  spawnedDrops: DropState[];
}

export function ensureMonsterState(room: RuntimeRoom): Map<string, RuntimeMonster> {
  if (!room.monsters) {
    room.monsters = new Map();
  }

  return room.monsters;
}

export function spawnInitialMonsters(room: RuntimeRoom): MonsterState[] {
  const monsters = ensureMonsterState(room);
  monsters.clear();

  room.pendingMonsterRespawns = [];
  room.monsterSpawnDefinitions = generateMonsterSpawnDefinitions(room);

  for (const spawn of room.monsterSpawnDefinitions) {
    const monster = buildRuntimeMonster(spawn);
    monsters.set(monster.id, monster);
  }

  return listMonsterStates(room);
}

export function listMonsterStates(room: RuntimeRoom): MonsterState[] {
  return [...ensureMonsterState(room).values()].map((monster) => ({
    id: monster.id,
    type: monster.type,
    x: Math.round(monster.x),
    y: Math.round(monster.y),
    hp: monster.hp,
    maxHp: monster.maxHp,
    targetPlayerId: monster.targetPlayerId,
    isAlive: monster.isAlive,
    deadAt: monster.deadAt
  }));
}

export function tickMonsters(context: RuntimeContext): MonsterTickResult {
  const room = context.room;
  const monsters = ensureMonsterState(room);
  const combatEvents: CombatEventPayload[] = [];
  let playerStateChanged = false;
  const now = Date.now();

  processMonsterRespawns(room, now);

  for (const monster of [...monsters.values()]) {
    if (!monster.isAlive) {
      if (monster.deadAt && now - monster.deadAt > MONSTER_CORPSE_DURATION_MS) {
        monsters.delete(monster.id);
      }
      continue;
    }

    const target = resolveTargetPlayer(room, monster);
    monster.targetPlayerId = target?.id;

    if (!target?.state || !target.state.isAlive) {
      tickMonsterReturn(monster, now);
      continue;
    }

    monster.lastAggroAt = now;
    monster.returningUntil = undefined;

    syncPlayerCombatState(target, now);
    const distance = distanceBetween(monster.x, monster.y, target.state.x, target.state.y);
    if (distance > monster.attackRange + MONSTER_CONTACT_RADIUS + PLAYER_HIT_RADIUS) {
      moveMonsterTowards(monster, target.state);
      continue;
    }

    if (now < monster.nextAttackAt) {
      continue;
    }

    monster.nextAttackAt = now + monster.attackCooldownMs;
    if (target.state.dodgeRate > 0 && Math.random() < target.state.dodgeRate) {
      combatEvents.push({
        attackerId: monster.id,
        targetId: target.id,
        amount: 0,
        targetHp: target.state.hp,
        targetAlive: true
      });
      playerStateChanged = true;
      continue;
    }

    const mitigatedDamage = Math.max(1, Math.round(monster.attackDamage * (1 - target.state.damageReduction)));
    target.state.hp = Math.max(0, target.state.hp - mitigatedDamage);
    target.state.isAlive = target.state.hp > 0;
    if (!target.state.isAlive) {
      target.state.direction = { x: 0, y: 1 };
    }

    combatEvents.push({
      attackerId: monster.id,
      targetId: target.id,
      amount: mitigatedDamage,
      targetHp: target.state.hp,
      targetAlive: target.state.isAlive
    });
    playerStateChanged = true;
  }

  return {
    monsters: listMonsterStates(room),
    drops: listWorldDrops(room),
    combatEvents,
    playerStateChanged
  };
}

export function handlePlayerAttack(
  context: RuntimeContext,
  playerId: string,
  _payload: AttackRequestPayload
): PlayerAttackOutcome | undefined {
  const room = context.room;
  const player = room.players.get(playerId);
  if (!player?.state || !player.state.isAlive) {
    return undefined;
  }

  const weapon = WEAPON_DEFINITIONS[player.state.weaponType];
  const now = Date.now();
  syncPlayerCombatState(player, now);
  if (now < (player.attackCooldownEndsAt ?? 0)) {
    return undefined;
  }

  player.attackCooldownEndsAt = now + Math.round((1000 / Math.max(weapon.attacksPerSecond, 0.1)) / Math.max(1 + player.state.attackSpeed, 0.1));
  const targetMonster = findAttackableMonster(room, player.state, weapon.range);
  if (!targetMonster) {
    return {
      monsters: listMonsterStates(room),
      drops: listWorldDrops(room),
      spawnedDrops: []
    };
  }

  const pendingBasicAttack = consumePendingBasicAttack(player);
  const basicAttackBonusDamage = getBasicAttackBonusDamage(player, now);
  const attackPower = scaleOutgoingDamage(
    player,
    weapon.attackPower + player.state.attackPower + basicAttackBonusDamage + (pendingBasicAttack?.bonusDamage ?? 0),
    now
  );
  targetMonster.targetPlayerId = player.id;
  targetMonster.hp = Math.max(0, targetMonster.hp - attackPower);

  const monsterDied = targetMonster.hp <= 0;
  if (monsterDied) {
    markMonsterDead(room, targetMonster, now);
  }

  const combat: CombatEventPayload = {
    attackerId: player.id,
    targetId: targetMonster.id,
    amount: attackPower,
    statusApplied: getEquippedWeaponAffixTotal(player, "bleed") > 0 ? ["bleed"] : undefined,
    targetHp: targetMonster.hp,
    targetAlive: !monsterDied
  };

  let spawnedDrops: DropState[] = [];
  if (monsterDied) {
    const nextKills = typeof player.state.killsMonsters === "number"
      ? player.state.killsMonsters + 1
      : 1;
    (player.state as unknown as Record<string, unknown>).killsMonsters = nextKills;
    spawnedDrops = createDropsForMonster(room, targetMonster);
  }

  return {
    monsters: listMonsterStates(room),
    drops: listWorldDrops(room),
    combat,
    spawnedDrops
  };
}

function getEquippedWeaponAffixTotal(player: RuntimePlayer, key: string): number {
  return player.inventory?.equipment.weapon?.affixes?.reduce((sum, affix) => (
    affix.key === key ? sum + affix.value : sum
  ), 0) ?? 0;
}

export function handlePlayerSkill(
  context: RuntimeContext,
  playerId: string,
  payload: SkillCastPayload,
  originState?: CombatPlayerState
): PlayerSkillOutcome | undefined {
  const room = context.room;
  const player = room.players.get(playerId);
  if (!player?.state || !player.state.isAlive) {
    return undefined;
  }

  const now = Date.now();
  syncPlayerCombatState(player, now);
  const skillSourceState: CombatPlayerState = originState ?? {
    x: player.state.x,
    y: player.state.y,
    direction: { ...player.state.direction }
  };

  switch (payload.skillId) {
    case "sword_dashSlash": {
      const targets = findDashSlashMonsters(room, skillSourceState, 150);
      movePlayerByDirection(player.state, 150);
      return applySkillDamageToMonsters(
        room,
        player,
        targets,
        scaleOutgoingDamage(player, SKILL_DAMAGE.swordDashSlash + player.state.attackPower, now),
        now
      );
    }
    case "blade_sweep":
      {
        const targets = findAttackableMonsters(room, skillSourceState, 148, 170);
        movePlayerByDirection(player.state, -110);
        return applySkillDamageToMonsters(room, player, targets, scaleOutgoingDamage(player, SKILL_DAMAGE.bladeSweep + player.state.attackPower, now), now);
      }
    case "spear_heavyThrust": {
      const target = findAttackableMonster(room, skillSourceState, 160, 50);
      return applySkillDamageToMonsters(
        room,
        player,
        target ? [target] : [],
        Math.max(1, Math.round(scaleOutgoingDamage(player, SKILL_DAMAGE.spearHeavyThrust + player.state.attackPower, now) * 1.5)),
        now,
        true
      );
    }
    default:
      return undefined;
  }
}

function buildRuntimeMonster(spawn: MonsterSpawnDefinition): RuntimeMonster {
  const stats = getMonsterStats(spawn.type);
  return {
    id: `monster_${spawn.id}_${crypto.randomUUID().slice(0, 8)}`,
    spawnId: spawn.id,
    type: spawn.type,
    x: spawn.x,
    y: spawn.y,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    targetPlayerId: undefined,
    isAlive: true,
    deadAt: undefined,
    respawnAt: undefined,
    spawnX: spawn.x,
    spawnY: spawn.y,
    aggroRange: stats.aggroRange,
    leashRange: stats.leashRange,
    attackRange: stats.attackRange,
    attackDamage: stats.attackDamage,
    moveSpeed: stats.moveSpeed,
    attackCooldownMs: stats.attackCooldownMs,
    nextAttackAt: 0,
    patrolX: spawn.x,
    patrolY: spawn.y,
    patrolRadius: stats.patrolRadius,
    guardRadius: stats.guardRadius,
    returnDelayMs: stats.returnDelayMs,
    lastAggroAt: undefined,
    returningUntil: undefined,
    idleUntil: Date.now() + randomBetween(MONSTER_IDLE_MIN_MS, MONSTER_IDLE_MAX_MS)
  };
}

function getMonsterStats(monsterType: MonsterType) {
  if (monsterType === "elite") {
    return {
      maxHp: ELITE_MONSTER_MAX_HP,
      aggroRange: ELITE_MONSTER_AGGRO_RANGE,
      leashRange: ELITE_MONSTER_LEASH_RANGE,
      attackRange: ELITE_MONSTER_ATTACK_RANGE,
      attackDamage: ELITE_MONSTER_ATTACK_DAMAGE,
      moveSpeed: ELITE_MONSTER_MOVE_SPEED,
      attackCooldownMs: ELITE_MONSTER_ATTACK_COOLDOWN_MS,
      patrolRadius: ELITE_MONSTER_PATROL_RADIUS,
      guardRadius: ELITE_MONSTER_GUARD_RADIUS,
      returnDelayMs: MONSTER_RETURN_DELAY_MS
    };
  }

  return {
    maxHp: NORMAL_MONSTER_MAX_HP,
    aggroRange: NORMAL_MONSTER_AGGRO_RANGE,
    leashRange: NORMAL_MONSTER_LEASH_RANGE,
    attackRange: NORMAL_MONSTER_ATTACK_RANGE,
    attackDamage: NORMAL_MONSTER_ATTACK_DAMAGE,
    moveSpeed: NORMAL_MONSTER_MOVE_SPEED,
    attackCooldownMs: NORMAL_MONSTER_ATTACK_COOLDOWN_MS,
    patrolRadius: NORMAL_MONSTER_PATROL_RADIUS,
    guardRadius: NORMAL_MONSTER_GUARD_RADIUS,
    returnDelayMs: MONSTER_RETURN_DELAY_MS
  };
}

function resolveTargetPlayer(room: RuntimeRoom, monster: RuntimeMonster): RuntimePlayer | undefined {
  const currentTarget = monster.targetPlayerId ? room.players.get(monster.targetPlayerId) : undefined;
  if (currentTarget?.state?.isAlive) {
    const distanceFromAnchor = distanceBetween(
      monster.patrolX,
      monster.patrolY,
      currentTarget.state.x,
      currentTarget.state.y
    );
    if (distanceFromAnchor <= monster.leashRange) {
      return currentTarget;
    }
  }

  let closestPlayer: RuntimePlayer | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const player of room.players.values()) {
    if (!player.state?.isAlive) {
      continue;
    }

    const distance = distanceBetween(monster.x, monster.y, player.state.x, player.state.y);
    if (distance > monster.aggroRange || distance >= closestDistance) {
      continue;
    }

    closestDistance = distance;
    closestPlayer = player;
  }

  return closestPlayer;
}

function moveMonsterTowards(monster: RuntimeMonster, target: CombatPlayerState): void {
  const distance = distanceBetween(monster.x, monster.y, target.x, target.y);
  if (distance === 0) {
    return;
  }

  const step = (monster.moveSpeed * MONSTER_TICK_MS) / 1000;
  monster.x = clamp(monster.x + ((target.x - monster.x) / distance) * step, 48, MATCH_MAP_WIDTH - 48);
  monster.y = clamp(monster.y + ((target.y - monster.y) / distance) * step, 48, MATCH_MAP_HEIGHT - 48);
}

function tickMonsterReturn(monster: RuntimeMonster, now: number): void {
  if (!monster.returningUntil) {
    monster.returningUntil = now + monster.returnDelayMs;
    return;
  }

  if (now < monster.returningUntil) {
    return;
  }

  const anchorDistance = distanceBetween(monster.x, monster.y, monster.patrolX, monster.patrolY);
  if (anchorDistance > monster.guardRadius) {
    moveMonsterTowards(monster, { x: monster.patrolX, y: monster.patrolY, direction: { x: 0, y: 0 } });
    monster.idleUntil = undefined;
    return;
  }

  tickMonsterPatrol(monster, now);
}

function tickMonsterPatrol(monster: RuntimeMonster, now: number): void {
  if (monster.idleUntil && now < monster.idleUntil) {
    return;
  }

  const target = ensurePatrolTarget(monster);
  const distance = distanceBetween(monster.x, monster.y, target.x, target.y);
  if (distance <= 18) {
    monster.spawnX = target.x;
    monster.spawnY = target.y;
    monster.idleUntil = now + randomBetween(MONSTER_IDLE_MIN_MS, MONSTER_IDLE_MAX_MS);
    ensurePatrolTarget(monster, true);
    return;
  }

  moveMonsterTowards(monster, { x: target.x, y: target.y, direction: { x: 0, y: 0 } });
}

function ensurePatrolTarget(monster: RuntimeMonster, reroll = false): { x: number; y: number } {
  const current = { x: monster.spawnX, y: monster.spawnY };
  if (!reroll && distanceBetween(current.x, current.y, monster.patrolX, monster.patrolY) > 0) {
    return current;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const radius = randomBetween(24, monster.patrolRadius);
    const x = clamp(monster.patrolX + Math.cos(angle) * radius, MAP_MARGIN_PX, MATCH_MAP_WIDTH - MAP_MARGIN_PX);
    const y = clamp(monster.patrolY + Math.sin(angle) * radius, MAP_MARGIN_PX, MATCH_MAP_HEIGHT - MAP_MARGIN_PX);
    monster.spawnX = x;
    monster.spawnY = y;
    return { x, y };
  }

  monster.spawnX = monster.patrolX;
  monster.spawnY = monster.patrolY;
  return { x: monster.patrolX, y: monster.patrolY };
}

function findAttackableMonster(
  room: RuntimeRoom,
  playerState: CombatPlayerState,
  attackRange: number,
  coneOverrideDeg?: number
): RuntimeMonster | undefined {
  return findAttackableMonsters(room, playerState, attackRange, coneOverrideDeg)[0];
}

function findAttackableMonsters(
  room: RuntimeRoom,
  playerState: CombatPlayerState,
  attackRange: number,
  coneOverrideDeg?: number
): RuntimeMonster[] {
  const facing = normalizeDirection(playerState.direction);
  const maxAngleDeg = coneOverrideDeg == null ? 78 : coneOverrideDeg / 2;

  return [...ensureMonsterState(room).values()]
    .filter((monster) => monster.isAlive)
    .map((monster) => {
      const dx = monster.x - playerState.x;
      const dy = monster.y - playerState.y;
      const distance = Math.hypot(dx, dy);
      const angleDeg = getAngleBetween(facing, normalizeDirection({ x: dx, y: dy }));
      return { monster, distance, angleDeg };
    })
    .filter(({ distance, angleDeg }) => (
      distance <= attackRange + MONSTER_CONTACT_RADIUS
      && (facing.x === 0 && facing.y === 0 ? true : angleDeg <= maxAngleDeg)
    ))
    .sort((a, b) => a.distance - b.distance)
    .map(({ monster }) => monster);
}

function findDashSlashMonsters(
  room: RuntimeRoom,
  playerState: CombatPlayerState,
  dashDistance: number
): RuntimeMonster[] {
  const facing = getFacingOrFallback(playerState.direction);
  const start = { x: playerState.x, y: playerState.y };
  const end = {
    x: playerState.x + facing.x * dashDistance,
    y: playerState.y + facing.y * dashDistance
  };

  return [...ensureMonsterState(room).values()]
    .filter((monster) => monster.isAlive)
    .map((monster) => {
      const distance = distancePointToSegment(monster.x, monster.y, start.x, start.y, end.x, end.y);
      const directDistance = Math.hypot(monster.x - start.x, monster.y - start.y);
      return { monster, distance, directDistance };
    })
    .filter(({ distance, directDistance }) => distance <= 72 || directDistance <= 96)
    .sort((a, b) => a.directDistance - b.directDistance)
    .map(({ monster }) => monster);
}

function applySkillDamageToMonsters(
  room: RuntimeRoom,
  player: RuntimePlayer,
  targets: RuntimeMonster[],
  damage: number,
  now: number,
  isCritical = false
): PlayerSkillOutcome {
  const combatEvents: CombatEventPayload[] = [];
  const spawnedDrops: DropState[] = [];

  for (const monster of targets) {
    monster.targetPlayerId = player.id;
    monster.hp = Math.max(0, monster.hp - damage);
    const monsterDied = monster.hp <= 0;

    if (monsterDied) {
      markMonsterDead(room, monster, now);
      const nextKills = typeof player.state!.killsMonsters === "number"
        ? player.state!.killsMonsters + 1
        : 1;
      (player.state! as unknown as Record<string, unknown>).killsMonsters = nextKills;
      spawnedDrops.push(...createDropsForMonster(room, monster));
    }

    combatEvents.push({
      attackerId: player.id,
      targetId: monster.id,
      amount: damage,
      isCritical,
      targetHp: monster.hp,
      targetAlive: !monsterDied
    });
  }

  return {
    monsters: listMonsterStates(room),
    drops: listWorldDrops(room),
    combatEvents,
    spawnedDrops
  };
}

function markMonsterDead(room: RuntimeRoom, monster: RuntimeMonster, deadAt: number): void {
  if (!monster.isAlive && monster.deadAt) {
    return;
  }

  monster.isAlive = false;
  monster.deadAt = deadAt;
  monster.respawnAt = deadAt + MONSTER_RESPAWN_DELAY_MS;
  monster.targetPlayerId = undefined;

  room.pendingMonsterRespawns ??= [];
  if (!room.pendingMonsterRespawns.some((entry) => entry.spawnId === monster.spawnId)) {
    room.pendingMonsterRespawns.push({
      spawnId: monster.spawnId,
      respawnAt: monster.respawnAt
    });
  }
}

function processMonsterRespawns(room: RuntimeRoom, now: number): void {
  const pending = room.pendingMonsterRespawns;
  const spawnDefinitions = room.monsterSpawnDefinitions;
  if (!pending || !spawnDefinitions || pending.length === 0) {
    return;
  }

  const monsters = ensureMonsterState(room);
  const remaining = [];

  for (const entry of pending) {
    if (entry.respawnAt > now) {
      remaining.push(entry);
      continue;
    }

    const spawn = spawnDefinitions.find((definition) => definition.id === entry.spawnId);
    if (!spawn) {
      continue;
    }

    const monster = buildRuntimeMonster(spawn);
    monsters.set(monster.id, monster);
  }

  room.pendingMonsterRespawns = remaining;
}

function generateMonsterSpawnDefinitions(room: RuntimeRoom): MonsterSpawnDefinition[] {
  const normals = generateNormalSpawnDefinitions(room);
  const elites = generateEliteSpawnDefinitions(room);
  return [...normals, ...elites];
}

function generateNormalSpawnDefinitions(room: RuntimeRoom): MonsterSpawnDefinition[] {
  const columns = 8;
  const rows = 6;
  const candidates: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const baseX = ((column + 0.5) / columns) * MATCH_MAP_WIDTH;
      const baseY = ((row + 0.5) / rows) * MATCH_MAP_HEIGHT;
      const point = jitterPoint(baseX, baseY);
      if (isValidSpawnPoint(room, point.x, point.y)) {
        candidates.push(point);
      }
    }
  }

  shuffleInPlace(candidates);

  while (candidates.length < NORMAL_MONSTER_COUNT) {
    const fallback = randomValidPoint(room);
    candidates.push(fallback);
  }

  return candidates.slice(0, NORMAL_MONSTER_COUNT).map((point, index) => ({
    id: `normal_${index + 1}`,
    type: "normal",
    x: Math.round(point.x),
    y: Math.round(point.y)
  }));
}

function generateEliteSpawnDefinitions(room: RuntimeRoom): MonsterSpawnDefinition[] {
  const resourcePoints = getHighValueResourcePoints(room);
  return Array.from({ length: ELITE_MONSTER_COUNT }, (_, index) => {
    const point = resourcePoints.length > 0
      ? resolveEliteGuardPoint(room, resourcePoints[index % resourcePoints.length], index)
      : randomMidRingPoint(room);
    return {
      id: `elite_${index + 1}`,
      type: "elite",
      x: Math.round(point.x),
      y: Math.round(point.y)
    };
  });
}

function getHighValueResourcePoints(room: RuntimeRoom): Array<{ x: number; y: number }> {
  return (room.matchLayout?.chestZones ?? [])
    .filter((zone) => zone.lane === "contested")
    .map((zone) => ({ x: zone.x, y: zone.y }));
}

function resolveEliteGuardPoint(
  room: RuntimeRoom,
  resourcePoint: { x: number; y: number },
  index: number
): { x: number; y: number } {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angle = ((index * 137) + attempt * 47) * (Math.PI / 180);
    const radius = ELITE_RESOURCE_GUARD_OFFSET_PX + (attempt % 3) * 45;
    const point = {
      x: clamp(resourcePoint.x + Math.cos(angle) * radius, MAP_MARGIN_PX, MATCH_MAP_WIDTH - MAP_MARGIN_PX),
      y: clamp(resourcePoint.y + Math.sin(angle) * radius, MAP_MARGIN_PX, MATCH_MAP_HEIGHT - MAP_MARGIN_PX)
    };
    if (isValidSpawnPoint(room, point.x, point.y)) {
      return point;
    }
  }

  return randomMidRingPoint(room);
}

function randomValidPoint(room: RuntimeRoom): { x: number; y: number } {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const point = {
      x: randomBetween(MAP_MARGIN_PX, MATCH_MAP_WIDTH - MAP_MARGIN_PX),
      y: randomBetween(MAP_MARGIN_PX, MATCH_MAP_HEIGHT - MAP_MARGIN_PX)
    };
    if (isValidSpawnPoint(room, point.x, point.y)) {
      return point;
    }
  }

  return {
    x: MATCH_MAP_WIDTH / 2 + CENTER_EXCLUSION_RADIUS + MAP_MARGIN_PX,
    y: MATCH_MAP_HEIGHT / 2
  };
}

function jitterPoint(x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(x + randomBetween(-SPAWN_JITTER_PX, SPAWN_JITTER_PX), MAP_MARGIN_PX, MATCH_MAP_WIDTH - MAP_MARGIN_PX),
    y: clamp(y + randomBetween(-SPAWN_JITTER_PX, SPAWN_JITTER_PX), MAP_MARGIN_PX, MATCH_MAP_HEIGHT - MAP_MARGIN_PX)
  };
}

function isValidSpawnPoint(room: RuntimeRoom, x: number, y: number): boolean {
  const centerDistance = distanceBetween(x, y, MATCH_MAP_WIDTH / 2, MATCH_MAP_HEIGHT / 2);
  if (centerDistance < CENTER_EXCLUSION_RADIUS) {
    return false;
  }

  const layout = room.matchLayout;
  if (!layout) {
    return true;
  }

  if (layout.safeZones.some((zone) => distanceBetween(x, y, zone.x, zone.y) < zone.radius + SAFE_ZONE_EXCLUSION_RADIUS)) {
    return false;
  }

  if (layout.extractZones.some((zone) => distanceBetween(x, y, zone.x, zone.y) < EXTRACT_ZONE_EXCLUSION_RADIUS)) {
    return false;
  }

  return true;
}

function randomMidRingPoint(room: RuntimeRoom): { x: number; y: number } {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const radius = randomBetween(1200, 1850);
    const point = jitterPoint(
      MATCH_MAP_WIDTH / 2 + Math.cos(angle) * radius,
      MATCH_MAP_HEIGHT / 2 + Math.sin(angle) * radius
    );
    if (isValidSpawnPoint(room, point.x, point.y)) {
      return point;
    }
  }
  return randomValidPoint(room);
}

function distanceBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function normalizeDirection(direction: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: direction.x / length,
    y: direction.y / length
  };
}

function getFacingOrFallback(direction: { x: number; y: number }): { x: number; y: number } {
  const normalized = normalizeDirection(direction);
  return normalized.x === 0 && normalized.y === 0 ? { x: 0, y: 1 } : normalized;
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSq = (abx * abx) + (aby * aby);
  if (abLengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp((((px - ax) * abx) + ((py - ay) * aby)) / abLengthSq, 0, 1);
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(px - closestX, py - closestY);
}

function movePlayerByDirection(
  state: {
    x: number;
    y: number;
    direction: { x: number; y: number };
  },
  distance: number
): void {
  const facing = normalizeDirection(state.direction);
  const fallbackFacing = facing.x === 0 && facing.y === 0
    ? { x: 0, y: 1 }
    : facing;

  state.x = clamp(state.x + fallbackFacing.x * distance, PLAYER_HIT_RADIUS, MATCH_MAP_WIDTH - PLAYER_HIT_RADIUS);
  state.y = clamp(state.y + fallbackFacing.y * distance, PLAYER_HIT_RADIUS, MATCH_MAP_HEIGHT - PLAYER_HIT_RADIUS);
}

function getAngleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dot = clamp((a.x * b.x) + (a.y * b.y), -1, 1);
  return (Math.acos(dot) * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function shuffleArray<T>(values: readonly T[]): T[] {
  const copy = [...values];
  shuffleInPlace(copy);
  return copy;
}

function shuffleInPlace<T>(values: T[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}


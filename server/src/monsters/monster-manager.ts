import crypto from "node:crypto";
import { WEAPON_DEFINITIONS } from "../../../shared/dist/data/weapons.js";
import type { AttackRequestPayload, CombatEventPayload, SkillCastPayload } from "../../../shared/dist/types/combat.js";
import type { MonsterSpawnDefinition, MonsterState, MonsterType } from "../../../shared/dist/types/monsters.js";
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
  scaleOutgoingDamage,
  syncPlayerCombatState
} from "../combat/player-effects.js";
import type { DropState, RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../types.js";

interface CombatPlayerState {
  x: number;
  y: number;
  direction: { x: number; y: number };
}

const MONSTER_SPAWN_DEFINITIONS: MonsterSpawnDefinition[] = [
  { id: "normal_nw_1", type: "normal", x: 900, y: 950 },
  { id: "normal_nw_2", type: "normal", x: 1350, y: 720 },
  { id: "normal_ne_1", type: "normal", x: 3900, y: 900 },
  { id: "normal_ne_2", type: "normal", x: 3450, y: 760 },
  { id: "normal_sw_1", type: "normal", x: 780, y: 3720 },
  { id: "normal_sw_2", type: "normal", x: 1320, y: 4040 },
  { id: "normal_se_1", type: "normal", x: 3940, y: 3820 },
  { id: "normal_se_2", type: "normal", x: 3480, y: 4100 },
  { id: "elite_north", type: "elite", x: 2400, y: 1120 },
  { id: "elite_west", type: "elite", x: 1120, y: 2400 },
  { id: "elite_east", type: "elite", x: 3680, y: 2400 }
];

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

  MONSTER_SPAWN_DEFINITIONS.forEach((spawn) => {
    monsters.set(spawn.id, buildRuntimeMonster(spawn));
  });

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
    isAlive: monster.isAlive
  }));
}

export function tickMonsters(context: RuntimeContext): MonsterTickResult {
  const room = context.room;
  const combatEvents: CombatEventPayload[] = [];
  let playerStateChanged = false;

  for (const monster of ensureMonsterState(room).values()) {
    if (!monster.isAlive) {
      continue;
    }

    const target = resolveTargetPlayer(room, monster);
    monster.targetPlayerId = target?.id;

    if (!target?.state || !target.state.isAlive) {
      continue;
    }

    syncPlayerCombatState(target);
    const distance = distanceBetween(monster.x, monster.y, target.state.x, target.state.y);
    if (distance > monster.attackRange + MONSTER_CONTACT_RADIUS + PLAYER_HIT_RADIUS) {
      moveMonsterTowards(monster, target.state);
      continue;
    }

    const now = Date.now();
    if (now < monster.nextAttackAt) {
      continue;
    }

    monster.nextAttackAt = now + monster.attackCooldownMs;
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

  player.attackCooldownEndsAt = now + Math.round(1000 / Math.max(weapon.attacksPerSecond + player.state.attackSpeed, 0.1));
  const targetMonster = findAttackableMonster(room, player.state, weapon.range);
  if (!targetMonster) {
    return {
      monsters: listMonsterStates(room),
      drops: listWorldDrops(room),
      spawnedDrops: []
    };
  }

  const pendingBasicAttack = consumePendingBasicAttack(player);
  const attackPower = scaleOutgoingDamage(
    player,
    weapon.attackPower + player.state.attackPower + (pendingBasicAttack?.bonusDamage ?? 0),
    now
  );
  targetMonster.targetPlayerId = player.id;
  targetMonster.hp = Math.max(0, targetMonster.hp - attackPower);
  targetMonster.isAlive = targetMonster.hp > 0;

  const combat: CombatEventPayload = {
    attackerId: player.id,
    targetId: targetMonster.id,
    amount: attackPower,
    targetHp: targetMonster.hp,
    targetAlive: targetMonster.isAlive
  };

  let spawnedDrops: DropState[] = [];
  if (!targetMonster.isAlive) {
    targetMonster.targetPlayerId = undefined;
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

export function handlePlayerSkill(
  context: RuntimeContext,
  playerId: string,
  payload: SkillCastPayload
): PlayerSkillOutcome | undefined {
  const room = context.room;
  const player = room.players.get(playerId);
  if (!player?.state || !player.state.isAlive) {
    return undefined;
  }

  const now = Date.now();
  syncPlayerCombatState(player, now);

  switch (payload.skillId) {
    case "blade_sweep":
      return applySkillDamageToMonsters(room, player, findAttackableMonsters(room, player.state, 80, 90), scaleOutgoingDamage(player, 22 + player.state.attackPower, now));
    case "spear_heavyThrust": {
      const target = findAttackableMonster(room, player.state, 160, 50);
      return applySkillDamageToMonsters(room, player, target ? [target] : [], scaleOutgoingDamage(player, 30 + player.state.attackPower, now));
    }
    default:
      return undefined;
  }
}

function buildRuntimeMonster(spawn: MonsterSpawnDefinition): RuntimeMonster {
  const stats = getMonsterStats(spawn.type);
  return {
    id: `monster_${spawn.id}_${crypto.randomUUID().slice(0, 8)}`,
    type: spawn.type,
    x: spawn.x,
    y: spawn.y,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    targetPlayerId: undefined,
    isAlive: true,
    spawnX: spawn.x,
    spawnY: spawn.y,
    aggroRange: stats.aggroRange,
    leashRange: stats.leashRange,
    attackRange: stats.attackRange,
    attackDamage: stats.attackDamage,
    moveSpeed: stats.moveSpeed,
    attackCooldownMs: stats.attackCooldownMs,
    nextAttackAt: 0
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
      attackCooldownMs: ELITE_MONSTER_ATTACK_COOLDOWN_MS
    };
  }

  return {
    maxHp: NORMAL_MONSTER_MAX_HP,
    aggroRange: NORMAL_MONSTER_AGGRO_RANGE,
    leashRange: NORMAL_MONSTER_LEASH_RANGE,
    attackRange: NORMAL_MONSTER_ATTACK_RANGE,
    attackDamage: NORMAL_MONSTER_ATTACK_DAMAGE,
    moveSpeed: NORMAL_MONSTER_MOVE_SPEED,
    attackCooldownMs: NORMAL_MONSTER_ATTACK_COOLDOWN_MS
  };
}

function resolveTargetPlayer(room: RuntimeRoom, monster: RuntimeMonster): RuntimePlayer | undefined {
  const currentTarget = monster.targetPlayerId ? room.players.get(monster.targetPlayerId) : undefined;
  if (currentTarget?.state?.isAlive) {
    const distanceFromSpawn = distanceBetween(
      monster.spawnX,
      monster.spawnY,
      currentTarget.state.x,
      currentTarget.state.y
    );
    if (distanceFromSpawn <= monster.leashRange) {
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

function applySkillDamageToMonsters(
  room: RuntimeRoom,
  player: RuntimePlayer,
  targets: RuntimeMonster[],
  damage: number
): PlayerSkillOutcome {
  const combatEvents: CombatEventPayload[] = [];
  const spawnedDrops: DropState[] = [];

  for (const monster of targets) {
    monster.targetPlayerId = player.id;
    monster.hp = Math.max(0, monster.hp - damage);
    monster.isAlive = monster.hp > 0;
    if (!monster.isAlive) {
      monster.targetPlayerId = undefined;
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
      targetHp: monster.hp,
      targetAlive: monster.isAlive
    });
  }

  return {
    monsters: listMonsterStates(room),
    drops: listWorldDrops(room),
    combatEvents,
    spawnedDrops
  };
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

function getAngleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dot = clamp((a.x * b.x) + (a.y * b.y), -1, 1);
  return (Math.acos(dot) * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

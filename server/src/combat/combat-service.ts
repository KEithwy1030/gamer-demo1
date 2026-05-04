import type {
  AttackRequestPayload,
  CombatEventPayload,
  SkillCastPayload,
  StatusEffectType
} from "@gamer/shared";
import type { WeaponType } from "@gamer/shared";
import { WEAPON_DEFINITIONS } from "@gamer/shared";
import {
  ATTACK_CONE_BLADE_DEG,
  ATTACK_CONE_SPEAR_DEG,
  ATTACK_CONE_SWORD_DEG,
  ATTACK_RANGE_BUFFER,
  DODGE_DISTANCE,
  DODGE_INVULNERABLE_MS,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH,
  PLAYER_HIT_RADIUS
} from "../internal-constants.js";
import {
  addTimedModifier,
  consumePendingBasicAttack,
  drainPendingCombatEvents,
  ensureCombatState,
  getBasicAttackBonusDamage,
  getLastDamageSourceId,
  scaleOutgoingDamage,
  setPendingBasicAttack,
  syncPlayerCombatState
} from "./player-effects.js";
import type {
  RuntimePlayer,
  RuntimeRoom
} from "../types.js";

export interface CombatResolution {
  combatEvents: CombatEventPayload[];
  deaths: PlayerDeathPayload[];
}

export interface PlayerDeathPayload {
  playerId: string;
  killerId: string;
  roomCode: string;
  timestamp: number;
}

const SKILL_COOLDOWN_MS = 4000;
const SKILL_DAMAGE = {
  swordDashSlash: 18,
  bladeSweep: 22,
  spearHeavyThrust: 24
} as const;
const SKILL_COOLDOWNS_MS: Partial<Record<SkillCastPayload["skillId"], number>> = {
  common_dodge: 4000,
  sword_dashSlash: 6000,
  sword_bladeFlurry: 10000,
  sword_shadowStep: 12000,
  blade_sweep: 7000,
  blade_guard: 12000,
  blade_overpower: 10000,
  spear_heavyThrust: 8000,
  spear_warCry: 12000,
  spear_draggingStrike: 9000
};

export function resolvePlayerAttack(
  room: RuntimeRoom,
  attackerId: string,
  payload: AttackRequestPayload
): CombatResolution {
  void payload.attackId;

  const attacker = getActivePlayer(room, attackerId);
  const now = Date.now();
  const combatState = ensureCombatState(attacker);
  syncPlayerCombatState(attacker, now);
  const attackerState = attacker.state!;
  const weapon = getWeaponDefinition(attackerState.weaponType);
  const baseInterval = Math.round(1000 / weapon.attacksPerSecond);
  const cooldownMs = Math.round(baseInterval / Math.max(1 + attackerState.attackSpeed, 0.1));

  if (combatState.lastAttackAt && now - combatState.lastAttackAt < cooldownMs) {
    throw new Error("Attack is on cooldown.");
  }

  combatState.lastAttackAt = now;

  const target = selectAttackTarget(room, attacker, weapon.type, weapon.range);
  if (!target?.state) {
    return emptyResolution();
  }

  const pendingBasicAttack = consumePendingBasicAttack(attacker);
  const basicAttackBonusDamage = getBasicAttackBonusDamage(attacker, now);
  const onHitEffect = buildBasicAttackHitEffect(attacker, pendingBasicAttack, now);
  const attackPower = scaleOutgoingDamage(
    attacker,
    weapon.attackPower + attackerState.attackPower + basicAttackBonusDamage + (pendingBasicAttack?.bonusDamage ?? 0),
    now
  );

  return applyDamage(
    room,
    attacker,
    target,
    attackPower,
    now,
    onHitEffect
  );
}

export function resolvePlayerSkillCast(
  room: RuntimeRoom,
  casterId: string,
  payload: SkillCastPayload
): CombatResolution {
  const caster = getActivePlayer(room, casterId);
  const combatState = ensureCombatState(caster);
  const now = Date.now();
  syncPlayerCombatState(caster, now);
  const attackPowerBonus = caster.state!.attackPower;
  const lastCastAt = combatState.lastCastAtBySkillId[payload.skillId];

  switch (payload.skillId) {
    case "common_dodge": {
      if (lastCastAt && now - lastCastAt < SKILL_COOLDOWN_MS) {
        throw new Error("Dodge is on cooldown.");
      }

      combatState.lastCastAtBySkillId[payload.skillId] = now;
      combatState.invulnerableUntil = now + DODGE_INVULNERABLE_MS;
      movePlayerByDirection(caster.state!, DODGE_DISTANCE);
      return emptyResolution();
    }
    case "sword_dashSlash": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      const targets = selectDashSlashTargets(room, caster, 150);
      movePlayerByDirection(caster.state!, 150);
      return applyDamageToTargets(
        room,
        caster,
        targets,
        scaleOutgoingDamage(caster, SKILL_DAMAGE.swordDashSlash + attackPowerBonus, now),
        now,
        {
          sourceId: payload.skillId,
          damageSourceId: caster.id,
          slowMultiplier: 0.2,
          slowDurationMs: 1500
        }
      );
    }
    case "blade_sweep": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      const targets = selectAttackTargets(room, caster, "blade", 148, 170);
      movePlayerByDirection(caster.state!, -110);
      return applyDamageToTargets(room, caster, targets, scaleOutgoingDamage(caster, SKILL_DAMAGE.bladeSweep + attackPowerBonus, now), now);
    }
    case "blade_guard": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        type: "damageReduction",
        expiresAt: now + 2000,
        magnitude: 0.4,
        damageReductionBonus: 0.4
      }, now);
      return emptyResolution();
    }
    case "blade_overpower": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        type: "attackBoost",
        expiresAt: now + 4000,
        magnitude: 0.25,
        attackDamageMultiplier: 0.25
      }, now);
      return emptyResolution();
    }
    case "spear_heavyThrust": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      const target = selectAttackTarget(room, caster, "spear", 180, 50);
      return target
        ? applyDamage(
          room,
          caster,
          target,
          Math.max(1, Math.round(scaleOutgoingDamage(caster, SKILL_DAMAGE.spearHeavyThrust + attackPowerBonus, now) * 1.5)),
          now,
          undefined,
          true
        )
        : emptyResolution();
    }
    case "spear_warCry": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        type: "damageReduction",
        expiresAt: now + 3000,
        magnitude: 0.25,
        damageReductionBonus: 0.25
      }, now);
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        type: "moveSpeedBoost",
        expiresAt: now + 3000,
        magnitude: 0.20,
        moveSpeedMultiplier: 0.20
      }, now);
      return emptyResolution();
    }
    case "spear_draggingStrike": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      setPendingBasicAttack(caster, {
        sourceId: payload.skillId,
        bonusDamage: 8,
        slowMultiplier: 0.25,
        slowDurationMs: 2000
      });
      return emptyResolution();
    }
    case "sword_bladeFlurry": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      addTimedModifier(caster, {
        sourceId: `${payload.skillId}:speed`,
        type: "attackSpeedBoost",
        expiresAt: now + 4000,
        magnitude: 0.5,
        attackSpeedMultiplier: 0.5
      }, now);
      addTimedModifier(caster, {
        sourceId: `${payload.skillId}:damage`,
        type: "attackBoost",
        expiresAt: now + 4000,
        magnitude: 5,
        basicAttackBonusDamage: 5
      }, now);
      return emptyResolution();
    }
    case "sword_shadowStep": {
      requireSkillCooldown(combatState, payload.skillId, now, getSkillCooldownMs(payload.skillId));
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        type: "moveSpeedBoost",
        expiresAt: now + 3000,
        magnitude: 0.25,
        moveSpeedMultiplier: 0.25,
        dodgeRateBonus: 0.15
      }, now);
      return emptyResolution();
    }
    default:
      throw new Error("Unknown skill.");
  }
}

function applyDamage(
  room: RuntimeRoom,
  attacker: RuntimePlayer,
  target: RuntimePlayer,
  amount: number,
  timestamp: number,
  onHitEffect?: PlayerHitEffect,
  isCritical = false
): CombatResolution {
  return applyDamageToTargets(room, attacker, [target], amount, timestamp, onHitEffect, isCritical);
}

function applyDamageToTargets(
  room: RuntimeRoom,
  attacker: RuntimePlayer,
  targets: RuntimePlayer[],
  amount: number,
  timestamp: number,
  onHitEffect?: PlayerHitEffect,
  isCritical = false
): CombatResolution {
  if (!attacker.state) {
    throw new Error("Attacker must have active state.");
  }

  const combatEvents: CombatEventPayload[] = [];
  const deaths: PlayerDeathPayload[] = [];

  for (const target of targets) {
    if (!target.state || !target.state.isAlive) {
      continue;
    }

    syncPlayerCombatState(target, timestamp);
    const targetCombatState = ensureCombatState(target);
    if (targetCombatState.invulnerableUntil && targetCombatState.invulnerableUntil > timestamp) {
      continue;
    }

    if (target.state.dodgeRate > 0 && Math.random() < target.state.dodgeRate) {
      combatEvents.push({
        attackerId: attacker.id,
        targetId: target.id,
        amount: 0,
        isCritical,
        statusApplied: undefined,
        targetHp: target.state.hp,
        targetAlive: true
      });
      continue;
    }

    const mitigatedAmount = Math.max(1, Math.round(amount * (1 - target.state.damageReduction)));
    target.state.hp = Math.max(0, target.state.hp - mitigatedAmount);
    const targetAlive = target.state.hp > 0;
    target.state.isAlive = targetAlive;
    const statusApplied = applyOnHitEffect(target, onHitEffect, timestamp);

    combatEvents.push({
      attackerId: attacker.id,
      targetId: target.id,
      amount: mitigatedAmount,
      isCritical,
      statusApplied,
      targetHp: target.state.hp,
      targetAlive
    });

    if (!targetAlive) {
      const attackerCombatState = ensureCombatState(attacker);
      attackerCombatState.killsPlayers = (attackerCombatState.killsPlayers ?? 0) + 1;
      deaths.push({
        playerId: target.id,
        killerId: attacker.id,
        roomCode: room.code,
        timestamp
      });
    }
  }

  return { combatEvents, deaths };
}

function getActivePlayer(room: RuntimeRoom, playerId: string): RuntimePlayer {
  const player = room.players.get(playerId);
  if (!player?.state) {
    throw new Error("Player is not active in the current match.");
  }

  if (!player.state.isAlive) {
    throw new Error("Player is dead.");
  }

  return player;
}

function getWeaponDefinition(weaponType: WeaponType) {
  const definition = WEAPON_DEFINITIONS[weaponType];
  if (!definition) {
    throw new Error(`Unknown weapon type: ${weaponType}`);
  }

  return definition;
}

function selectAttackTarget(
  room: RuntimeRoom,
  attacker: RuntimePlayer,
  weaponType: WeaponType,
  weaponRange: number,
  coneOverrideDeg?: number
): RuntimePlayer | undefined {
  return selectAttackTargets(room, attacker, weaponType, weaponRange, coneOverrideDeg)[0];
}

function selectAttackTargets(
  room: RuntimeRoom,
  attacker: RuntimePlayer,
  weaponType: WeaponType,
  weaponRange: number,
  coneOverrideDeg?: number
): RuntimePlayer[] {
  if (!attacker.state) {
    return [];
  }

  const attackRange = weaponRange + ATTACK_RANGE_BUFFER + PLAYER_HIT_RADIUS;
  const facing = normalizeDirection(attacker.state.direction);
  const maxAngleDeg = (coneOverrideDeg ?? getAttackConeDegrees(weaponType)) / 2;

  return [...room.players.values()]
    .filter((target) => (
      target.id !== attacker.id
      && target.state?.isAlive
      && target.squadId !== attacker.squadId
    ))
    .map((target) => {
      const dx = target.state!.x - attacker.state!.x;
      const dy = target.state!.y - attacker.state!.y;
      const distance = Math.hypot(dx, dy);
      const angleDeg = getAngleBetween(facing, normalizeDirection({ x: dx, y: dy }));
      return { target, distance, angleDeg };
    })
    .filter(({ distance, angleDeg }) => distance <= attackRange && angleDeg <= maxAngleDeg)
    .sort((a, b) => a.distance - b.distance)
    .map(({ target }) => target);
}

function selectDashSlashTargets(
  room: RuntimeRoom,
  attacker: RuntimePlayer,
  dashDistance: number
): RuntimePlayer[] {
  if (!attacker.state) return [];
  const facing = getFacingOrFallback(attacker.state.direction);
  const start = { x: attacker.state.x, y: attacker.state.y };
  const end = {
    x: attacker.state.x + facing.x * dashDistance,
    y: attacker.state.y + facing.y * dashDistance
  };

  return [...room.players.values()]
    .filter((target) => (
      target.id !== attacker.id
      && target.state?.isAlive
      && target.squadId !== attacker.squadId
    ))
    .map((target) => {
      const distance = distancePointToSegment(target.state!.x, target.state!.y, start.x, start.y, end.x, end.y);
      const directDistance = Math.hypot(target.state!.x - start.x, target.state!.y - start.y);
      return { target, distance, directDistance };
    })
    .filter(({ distance, directDistance }) => distance <= 72 || directDistance <= 96)
    .sort((a, b) => a.directDistance - b.directDistance)
    .map(({ target }) => target);
}


function movePlayerByDirection(
  state: {
    x: number;
    y: number;
    direction: { x: number; y: number };
  },
  distance: number
): void {
  const direction = normalizeDirection(state.direction);
  const fallbackDirection = direction.x === 0 && direction.y === 0
    ? { x: 0, y: 1 }
    : direction;

  state.x = clamp(
    Math.round(state.x + fallbackDirection.x * distance),
    PLAYER_HIT_RADIUS,
    MATCH_MAP_WIDTH - PLAYER_HIT_RADIUS
  );
  state.y = clamp(
    Math.round(state.y + fallbackDirection.y * distance),
    PLAYER_HIT_RADIUS,
    MATCH_MAP_HEIGHT - PLAYER_HIT_RADIUS
  );
}

function getAttackConeDegrees(weaponType: WeaponType): number {
  switch (weaponType) {
    case "sword":
      return ATTACK_CONE_SWORD_DEG;
    case "blade":
      return ATTACK_CONE_BLADE_DEG;
    case "spear":
      return ATTACK_CONE_SPEAR_DEG;
  }
}

function getAngleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dot = a.x * b.x + a.y * b.y;
  const clampedDot = clamp(dot, -1, 1);
  return (Math.acos(clampedDot) * 180) / Math.PI;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyResolution(): CombatResolution {
  return {
    combatEvents: [],
    deaths: []
  };
}

interface PlayerHitEffect {
  sourceId: string;
  damageSourceId?: string;
  slowMultiplier?: number;
  slowDurationMs?: number;
  bleedDurationMs?: number;
  bleedDamagePerTick?: number;
  bleedTickIntervalMs?: number;
}

function applyOnHitEffect(
  target: RuntimePlayer,
  effect: PlayerHitEffect | undefined,
  now: number
): StatusEffectType[] | undefined {
  if (!effect || !target.state?.isAlive) {
    return undefined;
  }

  const applied: StatusEffectType[] = [];
  if (effect.slowMultiplier && effect.slowDurationMs) {
    addTimedModifier(target, {
      sourceId: effect.sourceId,
      type: "slow",
      expiresAt: now + effect.slowDurationMs,
      magnitude: effect.slowMultiplier,
      moveSpeedMultiplier: -effect.slowMultiplier
    }, now);
    applied.push("slow");
  }

  if (effect.bleedDurationMs && effect.bleedDamagePerTick && effect.bleedTickIntervalMs) {
    addTimedModifier(target, {
      sourceId: effect.sourceId,
      type: "bleed",
      expiresAt: now + effect.bleedDurationMs,
      magnitude: effect.bleedDamagePerTick,
      damageSourceId: effect.damageSourceId,
      bleedDamagePerTick: effect.bleedDamagePerTick,
      bleedTickIntervalMs: effect.bleedTickIntervalMs
    }, now);
    applied.push("bleed");
  }

  return applied.length > 0 ? applied : undefined;
}

function requireSkillCooldown(
  combatState: NonNullable<RuntimePlayer["combat"]>,
  skillId: SkillCastPayload["skillId"],
  now: number,
  cooldownMs: number
): void {
  const lastCastAt = combatState.lastCastAtBySkillId[skillId];
  if (lastCastAt && now - lastCastAt < cooldownMs) {
    throw new Error("Skill is on cooldown.");
  }
  combatState.lastCastAtBySkillId[skillId] = now;
}

export function tickPlayerCombatEffects(
  room: RuntimeRoom,
  now = Date.now()
): { combatEvents: CombatEventPayload[]; deaths: PlayerDeathPayload[] } {
  const combatEvents: CombatEventPayload[] = [];
  const deaths: PlayerDeathPayload[] = [];
  for (const player of room.players.values()) {
    const wasAlive = player.state?.isAlive === true;
    syncPlayerCombatState(player, now);
    combatEvents.push(...drainPendingCombatEvents(player));
    if (wasAlive && player.state && !player.state.isAlive) {
      deaths.push({
        playerId: player.id,
        killerId: getLastDamageSourceId(player) ?? "environment",
        roomCode: room.code,
        timestamp: now
      });
    }
  }
  return { combatEvents, deaths };
}

function getSkillCooldownMs(skillId: SkillCastPayload["skillId"]): number {
  return SKILL_COOLDOWNS_MS[skillId] ?? SKILL_COOLDOWN_MS;
}

function buildBasicAttackHitEffect(
  attacker: RuntimePlayer,
  pendingBasicAttack: ReturnType<typeof consumePendingBasicAttack> | undefined,
  now: number
): PlayerHitEffect | undefined {
  const hasBleed = getEquippedWeaponAffixTotal(attacker, "bleed") > 0;
  const hasSlow = Boolean(pendingBasicAttack?.slowMultiplier && pendingBasicAttack.slowDurationMs);
  if (!hasBleed && !hasSlow) {
    return undefined;
  }

  return {
    sourceId: hasBleed ? "weapon_bleed" : pendingBasicAttack?.sourceId ?? "basic_attack",
    damageSourceId: attacker.id,
    slowMultiplier: pendingBasicAttack?.slowMultiplier,
    slowDurationMs: pendingBasicAttack?.slowDurationMs,
    bleedDurationMs: hasBleed ? 4000 : undefined,
    bleedDamagePerTick: hasBleed ? 2 : undefined,
    bleedTickIntervalMs: hasBleed ? 500 : undefined
  };
}

function getEquippedWeaponAffixTotal(attacker: RuntimePlayer, key: string): number {
  return attacker.inventory?.equipment.weapon?.affixes?.reduce((sum, affix) => (
    affix.key === key ? sum + affix.value : sum
  ), 0) ?? 0;
}

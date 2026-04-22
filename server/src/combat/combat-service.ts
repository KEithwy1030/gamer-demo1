import { WEAPON_DEFINITIONS } from "../../../shared/dist/data/weapons.js";
import type {
  AttackRequestPayload,
  CombatEventPayload,
  SkillCastPayload,
  StatusEffectType
} from "../../../shared/dist/types/combat.js";
import type { WeaponType } from "../../../shared/dist/types/game.js";
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
  ensureCombatState,
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

const SKILL_COOLDOWN_MS = 3000;

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
  const attackPower = scaleOutgoingDamage(
    attacker,
    weapon.attackPower + attackerState.attackPower + (pendingBasicAttack?.bonusDamage ?? 0),
    now
  );

  return applyDamage(
    room,
    attacker,
    target,
    attackPower,
    now,
    pendingBasicAttack?.slowMultiplier && pendingBasicAttack.slowDurationMs
      ? {
        sourceId: pendingBasicAttack.sourceId,
        slowMultiplier: pendingBasicAttack.slowMultiplier,
        slowDurationMs: pendingBasicAttack.slowDurationMs
      }
      : undefined
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
      requireSkillCooldown(combatState, payload.skillId, now, 4000);
      movePlayerByDirection(caster.state!, 150);
      const target = selectAttackTarget(room, caster, "sword", 150);
      return target
        ? applyDamage(room, caster, target, scaleOutgoingDamage(caster, 45 + attackPowerBonus, now), now)
        : emptyResolution();
    }
    case "blade_sweep": {
      requireSkillCooldown(combatState, payload.skillId, now, 4000);
      movePlayerByDirection(caster.state!, -110);
      const targets = selectAttackTargets(room, caster, "blade", 110, 110);
      return applyDamageToTargets(room, caster, targets, scaleOutgoingDamage(caster, 55 + attackPowerBonus, now), now);
    }
    case "blade_guard": {
      requireSkillCooldown(combatState, payload.skillId, now, 5000);
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        expiresAt: now + 2000,
        damageReductionBonus: 0.4
      }, now);
      return emptyResolution();
    }
    case "blade_overpower": {
      requireSkillCooldown(combatState, payload.skillId, now, 4000);
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        expiresAt: now + 4000,
        attackDamageMultiplier: 0.60
      }, now);
      return emptyResolution();
    }
    case "spear_heavyThrust": {
      requireSkillCooldown(combatState, payload.skillId, now, 5000);
      const target = selectAttackTarget(room, caster, "spear", 180, 50);
      return target
        ? applyDamage(
          room,
          caster,
          target,
          Math.max(1, Math.round(scaleOutgoingDamage(caster, 75 + attackPowerBonus, now) * 1.8)),
          now,
          undefined,
          true
        )
        : emptyResolution();
    }
    case "spear_warCry": {
      requireSkillCooldown(combatState, payload.skillId, now, 6000);
      addTimedModifier(caster, {
        sourceId: payload.skillId,
        expiresAt: now + 3000,
        damageReductionBonus: 0.25,
        moveSpeedMultiplier: 0.20
      }, now);
      return emptyResolution();
    }
    case "spear_draggingStrike": {
      requireSkillCooldown(combatState, payload.skillId, now, 4000);
      setPendingBasicAttack(caster, {
        sourceId: payload.skillId,
        bonusDamage: 50,
        slowMultiplier: 0.40,
        slowDurationMs: 2000
      });
      return emptyResolution();
    }
    case "sword_bladeFlurry":
    case "sword_shadowStep":
      throw new Error(`Skill ${payload.skillId} is not implemented yet.`);
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
    .filter((target) => target.id !== attacker.id && target.state?.isAlive)
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
  slowMultiplier?: number;
  slowDurationMs?: number;
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
      expiresAt: now + effect.slowDurationMs,
      moveSpeedMultiplier: -effect.slowMultiplier
    }, now);
    applied.push("slow");
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

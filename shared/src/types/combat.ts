import type { Vector2, WeaponType } from "./game";

export type StatusEffectType =
  | "slow"
  | "bleed"
  | "damageReduction"
  | "attackBoost"
  | "attackSpeedBoost"
  | "moveSpeedBoost";

export type SkillId =
  | "sword_dashSlash"
  | "sword_bladeFlurry"
  | "sword_shadowStep"
  | "blade_sweep"
  | "blade_guard"
  | "blade_overpower"
  | "spear_heavyThrust"
  | "spear_warCry"
  | "spear_draggingStrike"
  | "common_dodge";

export interface StatusEffectState {
  type: StatusEffectType;
  sourceId: string;
  expiresAt: number;
  magnitude: number;
}

export interface CombatEventPayload {
  attackerId: string;
  targetId: string;
  amount: number;
  isCritical?: boolean;
  statusApplied?: StatusEffectType[];
  targetHp: number;
  targetAlive: boolean;
}

export interface AttackRequestPayload {
  attackId: string;
}

export interface AttackConfirmedPayload {
  playerId: string;
  attackId: string;
  weaponType: WeaponType;
  x: number;
  y: number;
  direction: Vector2;
  targetId?: string;
}

export interface SkillCastPayload {
  skillId: SkillId;
}

export interface WeaponDefinition {
  type: WeaponType;
  name: string;
  attackPower: number;
  attacksPerSecond: number;
  range: number;
}

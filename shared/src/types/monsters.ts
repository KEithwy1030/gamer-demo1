import type { Vector2 } from "./game.js";

export type MonsterType = "basic" | "normal" | "elite" | "boss" | "skirmisher" | "brute" | "archer";
export type EliteMonsterRole = "sentinel" | "hunter" | "bruiser";
export type MonsterArchetypeState = "lunging" | "retreating";

export type MonsterBehaviorPhase = "idle" | "hunt" | "windup" | "charge" | "recover";
export type MonsterSkillState = "smash" | "charge" | "chargedStrike";

export interface MonsterTelegraphState {
  aimDirection?: Vector2;
  chargeTarget?: Vector2;
  smashRadius?: number;
  recoverAnchor?: Vector2;
}

export interface MonsterState {
  id: string;
  type: MonsterType;
  eliteRole?: EliteMonsterRole;
  name?: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  targetPlayerId?: string;
  isAlive: boolean;
  deadAt?: number;
  behaviorPhase?: MonsterBehaviorPhase;
  phaseEndsAt?: number;
  skillState?: MonsterSkillState;
  skillEndsAt?: number;
  archetypeState?: MonsterArchetypeState;
  windingUpAttackUntil?: number;
  windingUpSlamUntil?: number;
  berserk?: boolean;
  isEnraged?: boolean;
  lastAttackAt?: number;
  lastDamagedAt?: number;
  telegraph?: MonsterTelegraphState;
}

export interface MonsterKilledPayload {
  monsterId: string;
  tier: MonsterType;
  x: number;
  y: number;
  killerPlayerId: string;
  killedAt: number;
}

export interface MonsterSpawnDefinition {
  id: string;
  type: MonsterType;
  x: number;
  y: number;
}

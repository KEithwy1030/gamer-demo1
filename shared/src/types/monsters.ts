import type { Vector2 } from "./game.js";

export type MonsterType = "normal" | "elite" | "boss";

export type MonsterBehaviorPhase = "idle" | "hunt" | "windup" | "charge" | "recover";
export type MonsterSkillState = "smash" | "charge";

export interface MonsterTelegraphState {
  aimDirection?: Vector2;
  chargeTarget?: Vector2;
  smashRadius?: number;
  recoverAnchor?: Vector2;
}

export interface MonsterState {
  id: string;
  type: MonsterType;
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
  isEnraged?: boolean;
  lastAttackAt?: number;
  lastDamagedAt?: number;
  telegraph?: MonsterTelegraphState;
}

export interface MonsterSpawnDefinition {
  id: string;
  type: MonsterType;
  x: number;
  y: number;
}

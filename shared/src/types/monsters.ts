export type MonsterType = "normal" | "elite" | "boss";

export type MonsterBehaviorPhase = "idle" | "hunt" | "windup" | "charge" | "recover";
export type MonsterSkillState = "smash" | "charge";

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
  skillState?: MonsterSkillState;
  skillEndsAt?: number;
  isEnraged?: boolean;
}

export interface MonsterSpawnDefinition {
  id: string;
  type: MonsterType;
  x: number;
  y: number;
}

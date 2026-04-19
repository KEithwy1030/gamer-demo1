export type MonsterType = "normal" | "elite";

export interface MonsterState {
  id: string;
  type: MonsterType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  targetPlayerId?: string;
  isAlive: boolean;
}

export interface MonsterSpawnDefinition {
  id: string;
  type: MonsterType;
  x: number;
  y: number;
}

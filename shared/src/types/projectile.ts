export type MonsterProjectileType = "arrow";

export interface MonsterProjectileSpawn {
  id: string;
  monsterId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
  damage: number;
  type: MonsterProjectileType;
}

export interface MonsterProjectileHit {
  id: string;
  hitPlayerId: string | null;
  x: number;
  y: number;
}

export interface MonsterProjectileDespawn {
  id: string;
  reason: "timeout" | "hit" | "blocked";
}

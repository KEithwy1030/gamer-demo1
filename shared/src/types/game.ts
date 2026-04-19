export interface Vector2 {
  x: number;
  y: number;
}

export type WeaponType = "sword" | "blade" | "spear";

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: Vector2;
  hp: number;
  maxHp: number;
  weaponType: WeaponType;
  isAlive: boolean;
  moveSpeed: number;
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  damageReduction: number;
  killsPlayers: number;
  killsMonsters: number;
}

export interface MatchStartedPayload {
  room: RoomRuntimeSnapshot;
  selfPlayerId: string;
}

export interface RoomRuntimeSnapshot {
  code: string;
  startedAt: number;
  width: number;
  height: number;
  players: PlayerState[];
}

export interface PlayerInputMovePayload {
  direction: Vector2;
}

export interface MatchTimerPayload {
  elapsedMs: number;
  remainingMs: number;
}

export interface SettlementPayload {
  result: "success" | "failure";
  reason?: "killed" | "timeout" | "extracted";
  survivedSeconds: number;
  playerKills: number;
  monsterKills: number;
  extractedGold: number;
  extractedTreasureValue: number;
  extractedItems: string[];
}

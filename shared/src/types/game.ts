import type { StatusEffectState } from "./combat";
import type { ItemCategory, ItemRarity } from "./inventory";

export interface Vector2 {
  x: number;
  y: number;
}

export type WeaponType = "sword" | "blade" | "spear";
export type SquadId = "player" | "bot_alpha" | "bot_beta" | "bot_gamma";
export type SquadType = "human" | "bot";
export type BotDifficulty = "easy" | "normal" | "hard";

export interface MatchLayoutSpawnZone {
  squadId: SquadId;
  anchorX: number;
  anchorY: number;
  facing: Vector2;
  safeRadius: number;
  deploymentLabel: string;
}

export interface MatchLayoutExtractZone {
  zoneId: string;
  x: number;
  y: number;
  radius: number;
  openAtSec: number;
  channelDurationMs: number;
}

export interface MatchLayoutChestZone {
  chestId: string;
  x: number;
  y: number;
  lane: "starter" | "contested";
  squadId?: SquadId;
}

export interface MatchLayoutSafeZone {
  squadId: SquadId;
  x: number;
  y: number;
  radius: number;
}

export interface MatchLayoutRiverHazard {
  hazardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  damagePerTick: number;
  tickIntervalMs: number;
}

export interface MatchLayoutSafeCrossing {
  crossingId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface MatchLayoutObstacleZone {
  obstacleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "ruin" | "barricade" | "wreckage" | "wall";
}

export interface MatchLayoutLandmark {
  landmarkId: string;
  x: number;
  y: number;
  label: string;
  kind: "spawn" | "resource" | "crossing" | "extract" | "danger";
}

export interface MatchLayout {
  templateId: "A" | "B" | "C";
  squadSpawns: MatchLayoutSpawnZone[];
  extractZones: MatchLayoutExtractZone[];
  chestZones: MatchLayoutChestZone[];
  safeZones: MatchLayoutSafeZone[];
  riverHazards: MatchLayoutRiverHazard[];
  safeCrossings: MatchLayoutSafeCrossing[];
  obstacleZones: MatchLayoutObstacleZone[];
  landmarks: MatchLayoutLandmark[];
}

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
  squadId: SquadId;
  squadType: SquadType;
  isBot: boolean;
  isLocalPlayer?: boolean;
  moveSpeed: number;
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  dodgeRate: number;
  damageReduction: number;
  statusEffects?: StatusEffectState[];
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
  layout: MatchLayout;
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
  reason?: "killed" | "timeout" | "extracted" | "corpseFog" | "riverHazard";
  survivedSeconds: number;
  playerKills: number;
  monsterKills: number;
  extractedGold: number;
  extractedTreasureValue: number;
  extractedItems: string[];
  extractedItemDetails?: SettlementItemDetail[];
  retainedItems: string[];
  retainedItemDetails?: SettlementItemDetail[];
  lostItems: string[];
  lostItemDetails?: SettlementItemDetail[];
  loadoutLost: boolean;
  profileGoldDelta: number;
}

export interface SettlementItemDetail {
  instanceId: string;
  definitionId: string;
  name: string;
  kind: ItemCategory;
  rarity?: ItemRarity;
  goldValue: number;
  treasureValue: number;
}

export interface ExtractCarrierState {
  holderPlayerId: string | null;
  holderSquadId: SquadId | null;
}

export interface ExtractSquadMemberState {
  playerId: string;
  squadId: SquadId;
  name: string;
  isAlive: boolean;
  isInsideZone: boolean;
  isExtracting: boolean;
  isSettled: boolean;
}

export interface ExtractSquadStatus {
  activeSquadId: SquadId | null;
  activeZoneId: string | null;
  members: ExtractSquadMemberState[];
}

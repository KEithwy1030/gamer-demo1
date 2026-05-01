import type {
  BotDifficulty,
  LobbyPlayer,
  InventorySnapshotPayload,
  MatchLayout,
  MatchLayoutExtractZone,
  MatchStartedPayload,
  PlayerState,
  RoomStartPayload,
  RoomSummary,
  SettlementPayload,
  SquadId,
  SquadType,
  Vector2,
  WeaponType
} from "@gamer/shared";
import type { Affix, ItemRarity, MonsterState, MonsterType, SkillId } from "@gamer/shared";
import type { Socket } from "socket.io";

export interface SocketSession {
  socketId: string;
  playerId: string;
  playerName: string;
  roomCode?: string;
}

export type InventoryItemKind = "weapon" | "equipment" | "treasure" | "currency" | "consumable";
export type EquipmentSlot = "weapon" | "head" | "chest" | "hands" | "shoes";

export interface ItemStatModifiers {
  maxHp?: number;
  attackPower?: number;
  attackSpeed?: number;
  critRate?: number;
  critDamage?: number;
  moveSpeed?: number;
  damageReduction?: number;
  hpRegen?: number;
  dodgeRate?: number;
}

export interface InventoryItem {
  instanceId: string;
  templateId: string;
  name: string;
  rarity?: ItemRarity;
  kind: InventoryItemKind;
  width: number;
  height: number;
  equipmentSlot?: EquipmentSlot;
  weaponType?: PlayerState["weaponType"];
  goldValue: number;
  treasureValue: number;
  healAmount?: number;
  modifiers?: ItemStatModifiers;
  affixes: Affix[];
}

export interface InventoryEntry {
  item: InventoryItem;
  x: number;
  y: number;
}

export interface InventoryState {
  width: number;
  height: number;
  items: InventoryEntry[];
  equipment: Partial<Record<EquipmentSlot, InventoryItem>>;
}

export interface DropState {
  id: string;
  item: InventoryItem;
  x: number;
  y: number;
  source: "spawn" | "manual-drop" | "player-death";
  ownerPlayerId?: string;
  createdAt: number;
}

export interface Chest {
  id: string;
  x: number;
  y: number;
  isOpen: boolean;
  loot: InventoryItem[];
}

export interface PlayerOpenChestPayload {
  chestId: string;
}

export interface ChestOpenedPayload {
  chestId: string;
  playerId: string;
  loot: InventoryItem[];
}

export interface PlayerPickupPayload {
  dropId: string;
}

export interface PlayerEquipItemPayload {
  itemInstanceId: string;
}

export interface PlayerUnequipItemPayload {
  itemInstanceId: string;
}

export interface PlayerDropItemPayload {
  itemInstanceId: string;
}

export interface PlayerUseItemPayload {
  itemInstanceId: string;
}

export interface InventoryUpdatePayload {
  playerId: string;
  inventory: InventoryState;
}

export interface LootPickedPayload {
  roomCode: string;
  playerId: string;
  dropId: string;
  item: InventoryItem;
}

export interface RuntimeCombatState {
  lastAttackAt?: number;
  lastCastAtBySkillId: Partial<Record<SkillId, number>>;
  invulnerableUntil?: number;
  killsPlayers?: number;
  activeModifiers: RuntimeTimedCombatModifier[];
  pendingBasicAttack?: PendingBasicAttackModifier;
}

export interface RuntimeTimedCombatModifier {
  sourceId: string;
  expiresAt: number;
  attackDamageMultiplier?: number;
  damageReductionBonus?: number;
  moveSpeedMultiplier?: number;
}

export interface PendingBasicAttackModifier {
  sourceId: string;
  bonusDamage: number;
  slowMultiplier?: number;
  slowDurationMs?: number;
}

export interface RuntimePlayerBaseStats {
  maxHp: number;
  weaponType: WeaponType;
  moveSpeed: number;
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  damageReduction: number;
}

export interface RuntimePlayerExtractState {
  startedAt?: number;
  completesAt?: number;
  lastProgressBroadcastAt?: number;
  settledAt?: number;
  settlement?: SettlementPayload;
  zoneId?: string;
}

export interface RuntimeRoomExtractZone extends MatchLayoutExtractZone {
  isOpen: boolean;
  openedAt?: number;
}

export interface RuntimeRoomExtractState {
  zones: RuntimeRoomExtractZone[];
  matchEndedAt?: number;
}

export interface ExtractOpenedPayload {
  roomCode: string;
  zones: Array<{
    zoneId: string;
    x: number;
    y: number;
    radius: number;
    channelDurationMs: number;
    openAtSec: number;
    isOpen: boolean;
  }>;
}

export interface ExtractProgressPayload {
  roomCode: string;
  playerId: string;
  zoneId: string;
  status: "started" | "progress" | "interrupted";
  remainingMs: number;
  durationMs: number;
  reason?: "damaged" | "left_zone" | "dead" | "timeout";
}

export interface ExtractSuccessPayload {
  roomCode: string;
  playerId: string;
  zoneId: string;
  extractedAt: number;
  settlement: SettlementPayload;
}

export interface MatchSettlementEnvelope {
  roomCode: string;
  playerId: string;
  settlement: SettlementPayload;
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

export interface ServerPlayerState {
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
  squadId: SquadId;
  squadType: SquadType;
  isBot: boolean;
  isLocalPlayer?: boolean;
}

export interface RuntimePlayer extends LobbyPlayer {
  socketId: string;
  joinedAt: number;
  squadId: SquadId;
  squadType: SquadType;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
  botGoal?: "patrol" | "loot" | "hunt" | "retreat" | "extract";
  botNextDecisionAt?: number;
  botTargetPlayerId?: string;
  botTargetDropId?: string;
  botPatrolPoint?: Vector2;
  botHomeAnchor?: Vector2;
  botOpeningStage?: "staging" | "starter" | "contested";
  botOpeningReleasedAt?: number;
  state?: ServerPlayerState;
  baseStats?: RuntimePlayerBaseStats;
  combat?: RuntimeCombatState;
  extract?: RuntimePlayerExtractState;
  inventory?: InventoryState;
  moveInput?: Vector2;
  deathLootDropped?: boolean;
  attackCooldownEndsAt?: number;
  lastRiverDamageAt?: number;
  pendingLoadout?: InventorySnapshotPayload;
}

export interface RuntimeMonster extends MonsterState {
  spawnId: string;
  spawnX: number;
  spawnY: number;
  aggroRange: number;
  leashRange: number;
  attackRange: number;
  attackDamage: number;
  moveSpeed: number;
  attackCooldownMs: number;
  nextAttackAt: number;
  deadAt?: number;
  respawnAt?: number;
}

export interface MonsterRespawnEntry {
  spawnId: string;
  respawnAt: number;
}

export interface RuntimeRoom {
  code: string;
  hostPlayerId: string;
  botDifficulty: BotDifficulty;
  capacity: number;
  status: RoomSummary["status"];
  createdAt: number;
  startedAt?: number;
  players: Map<string, RuntimePlayer>;
  playerSyncInterval?: NodeJS.Timeout;
  matchTimerInterval?: NodeJS.Timeout;
  monsterSyncInterval?: NodeJS.Timeout;
  monsters?: Map<string, RuntimeMonster>;
  monsterSpawnDefinitions?: Array<{ id: string; type: MonsterType; x: number; y: number }>;
  pendingMonsterRespawns?: MonsterRespawnEntry[];
  drops?: Map<string, DropState>;
  chests?: Map<string, Chest>;
  extract?: RuntimeRoomExtractState;
  matchLayout?: MatchLayout;
}

export interface RoomStateEnvelope extends RoomSummary {}

export interface RuntimeContext {
  room: RuntimeRoom;
  roomState: RoomStateEnvelope;
}

export interface MatchStartContext extends RuntimeContext {
  matchPayloadByPlayerId: Map<string, MatchStartedPayload>;
}

export interface SocketDataShape {
  session: SocketSession;
}

export type GameSocket = Socket<any, any, any, SocketDataShape>;

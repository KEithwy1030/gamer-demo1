import type { MusicMode } from "../types/audio.js";
import type { SkillId, StatusEffectType } from "../types/combat.js";
import type { RoomRuntimeSnapshot, SettlementPayload, Vector2 } from "../types/game.js";
import type {
  EquipmentSlot,
  EquipmentState,
  InventoryItemInstance,
  InventoryState,
  WorldDrop
} from "../types/inventory.js";
import type { MonsterProjectileType } from "../types/projectile.js";
import type { SpawnPhase } from "../types/spawn.js";
import type { MonsterType } from "../types/monsters.js";
import type { ProfileSnapshot } from "../types/profile.js";

export type DomainDamageType = "hit" | "bleed" | "environment" | string;
export type PlayerDeathReason = "killed" | "timeout" | "extracted" | "corpseFog" | "riverHazard" | string;
export type EnvironmentDamageSource = "fog" | "river" | string;
export type FogPhase = "spreading" | "backlash" | "intensifying" | string;

export interface PlayerStatSnapshot {
  maxHp: number;
  attackPower: number;
  attackSpeed: number;
  critRate: number;
  dodgeRate: number;
  damageReduction: number;
  moveSpeed: number;
}

export interface RoomCreatedEvent {
  type: "RoomCreated";
  payload: {
    roomCode: string;
    capacity: number;
    hostPlayerId: string;
  };
}

export interface PlayerJoinedRoomEvent {
  type: "PlayerJoinedRoom";
  payload: {
    playerId: string;
    roomCode: string;
  };
}

export interface PlayerLeftRoomEvent {
  type: "PlayerLeftRoom";
  payload: {
    playerId: string;
    roomCode: string;
    reason: string;
  };
}

export interface SpawnZoneSelectedEvent {
  type: "SpawnZoneSelected";
  payload: {
    playerId: string;
    spawnZoneId: string;
  };
}

export interface MatchStartedEvent {
  type: "MatchStarted";
  payload: {
    room: RoomRuntimeSnapshot;
  };
}

export interface PhaseStartedEvent {
  type: "PhaseStarted";
  payload: {
    phase: SpawnPhase;
    atRunSeconds: number;
  };
}

export interface MatchSettledEvent {
  type: "MatchSettled";
  payload: {
    playerId: string;
    settlement: SettlementPayload;
  };
}

export interface MonsterSpawnedEvent {
  type: "MonsterSpawned";
  payload: {
    monsterId: string;
    monsterType: MonsterType;
    position: Vector2;
  };
}

export interface MonsterWindupStartedEvent {
  type: "MonsterWindupStarted";
  payload: {
    monsterId: string;
    windupType: string;
    targetId?: string;
    targetPosition?: Vector2;
  };
}

export interface MonsterAttackedEvent {
  type: "MonsterAttacked";
  payload: {
    monsterId: string;
    attackId: string;
    targetId?: string;
  };
}

export interface MonsterEnragedStartedEvent {
  type: "MonsterEnragedStarted";
  payload: {
    monsterId: string;
  };
}

export interface MonsterKilledEvent {
  type: "MonsterKilled";
  payload: {
    monsterId: string;
    monsterType: MonsterType;
    position: Vector2;
    killerPlayerId: string;
    killedAt: number;
  };
}

export interface MonsterDamagedEvent {
  type: "MonsterDamaged";
  payload: {
    monsterId: string;
    monsterType: MonsterType;
    attackerPlayerId: string;
    amount: number;
    isCritical?: boolean;
    position: Vector2;
    remainingHp: number;
    monsterAlive: boolean;
  };
}

export interface MonsterProjectileSpawnedEvent {
  type: "MonsterProjectileSpawned";
  payload: {
    projectileId: string;
    monsterId: string;
    origin: Vector2;
    direction: Vector2;
    damage: number;
    projectileType?: MonsterProjectileType | string;
    ttlMs?: number;
  };
}

export interface MonsterProjectileHitEvent {
  type: "MonsterProjectileHit";
  payload: {
    projectileId: string;
    hitPlayerId: string;
    position: Vector2;
  };
}

export interface MonsterProjectileDespawnedEvent {
  type: "MonsterProjectileDespawned";
  payload: {
    projectileId: string;
    reason: "timeout" | "hit" | "blocked" | string;
  };
}

export interface PlayerAttackedEvent {
  type: "PlayerAttacked";
  payload: {
    playerId: string;
    attackId: string;
    targetId?: string;
  };
}

export interface PlayerSkillCastEvent {
  type: "PlayerSkillCast";
  payload: {
    playerId: string;
    skillId: SkillId | string;
    direction: Vector2;
  };
}

export interface PlayerDodgedEvent {
  type: "PlayerDodged";
  payload: {
    playerId: string;
    direction: Vector2;
    invulnerableMs: number;
  };
}

export interface PlayerDamagedEvent {
  type: "PlayerDamaged";
  payload: {
    attackerId: string;
    targetId: string;
    amount: number;
    critMultiplier?: number;
    damageType?: DomainDamageType;
    interruptsExtract?: boolean;
  };
}

export interface PlayerCriticalHitEvent {
  type: "PlayerCriticalHit";
  payload: {
    attackerId: string;
    targetId: string;
    critMultiplier: number;
  };
}

export interface PlayerDiedEvent {
  type: "PlayerDied";
  payload: {
    playerId: string;
    killerId?: string;
    reason: PlayerDeathReason;
  };
}

export interface SlayerSkillChargingEvent {
  type: "SlayerSkillCharging";
  payload: {
    playerId: string;
    chargeMs: number;
    position: Vector2;
  };
}

export interface SlayerSkillTriggeredEvent {
  type: "SlayerSkillTriggered";
  payload: {
    playerId: string;
    targetId: string;
    didCrit: boolean;
  };
}

export interface BleedStackedToLethalEvent {
  type: "BleedStackedToLethal";
  payload: {
    playerId: string;
    sourceId: string;
  };
}

export interface EnvironmentKillRegisteredEvent {
  type: "EnvironmentKillRegistered";
  payload: {
    playerId: string;
    environmentKillType: EnvironmentDamageSource;
  };
}

export interface StatusEffectAppliedEvent {
  type: "StatusEffectApplied";
  payload: {
    targetPlayerId: string;
    statusType: StatusEffectType | string;
    sourceId: string;
    durationMs: number;
    magnitude: number;
  };
}

export interface StatusEffectExpiredEvent {
  type: "StatusEffectExpired";
  payload: {
    targetPlayerId: string;
    statusType: StatusEffectType | string;
  };
}

export interface ChestRummageStartedEvent {
  type: "ChestRummageStarted";
  payload: {
    chestId: string;
    playerId: string;
    qualityTier: string;
    noiseRadius: number;
  };
}

export interface ChestRummageTickedEvent {
  type: "ChestRummageTicked";
  payload: {
    chestId: string;
    droppedItemCount: number;
    remainingItemCount: number;
  };
}

export interface ChestRummageInterruptedEvent {
  type: "ChestRummageInterrupted";
  payload: {
    chestId: string;
    playerId: string;
    reason: string;
  };
}

export interface ChestOpenedEvent {
  type: "ChestOpened";
  payload: {
    chestId: string;
    playerId: string;
    drops: WorldDrop[];
  };
}

export interface LootSpawnedEvent {
  type: "LootSpawned";
  payload: {
    dropId: string;
    item: InventoryItemInstance;
    position: Vector2;
    source: string;
  };
}

export interface LootPickedUpEvent {
  type: "LootPickedUp";
  payload: {
    playerId: string;
    dropId: string;
    item: InventoryItemInstance;
  };
}

export interface ItemEquippedEvent {
  type: "ItemEquipped";
  payload: {
    playerId: string;
    item: InventoryItemInstance;
    slot: EquipmentSlot;
  };
}

export interface ItemSecuredEvent {
  type: "ItemSecured";
  payload: {
    playerId: string;
    item: InventoryItemInstance;
  };
}

export interface ItemUnequippedEvent {
  type: "ItemUnequipped";
  payload: {
    playerId: string;
    item: InventoryItemInstance;
    slot: EquipmentSlot;
  };
}

export interface ItemUsedEvent {
  type: "ItemUsed";
  payload: {
    playerId: string;
    itemId: string;
    effect: string;
  };
}

export interface ItemDroppedEvent {
  type: "ItemDropped";
  payload: {
    playerId: string;
    item: InventoryItemInstance;
    position?: Vector2;
  };
}

export interface InventoryChangedEvent {
  type: "InventoryChanged";
  payload: {
    playerId: string;
    inventory: InventoryState;
    equipment?: EquipmentState;
  };
}

export interface PlayerStatsRecomputedEvent {
  type: "PlayerStatsRecomputed";
  payload: {
    playerId: string;
    stats: PlayerStatSnapshot;
  };
}

export interface SpecialEquipmentSlotsLockedEvent {
  type: "SpecialEquipmentSlotsLocked";
  payload: {
    playerId: string;
    lockedSlots: EquipmentSlot[];
  };
}

export interface ItemDepositedInSafeEvent {
  type: "ItemDepositedInSafe";
  payload: {
    playerId: string;
    item: InventoryItemInstance;
  };
}

export interface ItemWithdrawnFromSafeEvent {
  type: "ItemWithdrawnFromSafe";
  payload: {
    playerId: string;
    item: InventoryItemInstance;
  };
}

export interface BackpackCapacityUpgradedEvent {
  type: "BackpackCapacityUpgraded";
  payload: {
    playerId: string;
    newCapacity: number;
  };
}

export interface BeaconLitEvent {
  type: "BeaconLit";
  payload: {
    extractZoneId: string;
    playerId: string;
    position: Vector2;
  };
}

export interface ExtractOpenedEvent {
  type: "ExtractOpened";
  payload: {
    zoneIds: string[];
    pressure: string;
  };
}

export interface ExtractChannelStartedEvent {
  type: "ExtractChannelStarted";
  payload: {
    playerId: string;
    zoneId: string;
    channelDurationMs: number;
  };
}

export interface ExtractChannelTickedEvent {
  type: "ExtractChannelTicked";
  payload: {
    playerId: string;
    remainingMs: number;
  };
}

export interface ExtractChannelInterruptedEvent {
  type: "ExtractChannelInterrupted";
  payload: {
    playerId: string;
    reason: string;
  };
}

export interface ExtractSucceededEvent {
  type: "ExtractSucceeded";
  payload: {
    playerId: string;
    zoneId: string;
    settlement: SettlementPayload;
  };
}

export interface EnvironmentDamageDealtEvent {
  type: "EnvironmentDamageDealt";
  payload: {
    targetPlayerId: string;
    source: EnvironmentDamageSource;
    amount: number;
  };
}

export interface FogPhaseChangedEvent {
  type: "FogPhaseChanged";
  payload: {
    phase: FogPhase;
    visionPercent: number;
  };
}

export interface SpectateStartedEvent {
  type: "SpectateStarted";
  payload: {
    playerId: string;
    targetPlayerId: string;
  };
}

export interface SpectateTargetChangedEvent {
  type: "SpectateTargetChanged";
  payload: {
    playerId: string;
    targetPlayerId: string;
  };
}

export interface SpectateExitedEvent {
  type: "SpectateExited";
  payload: {
    playerId: string;
  };
}

export interface MusicModeChangedEvent {
  type: "MusicModeChanged";
  payload: {
    mode: MusicMode;
  };
}

export interface ProfileLoadedEvent {
  type: "ProfileLoaded";
  payload: {
    playerId: string;
    profile: ProfileSnapshot;
  };
}

export interface ProfileSavedEvent {
  type: "ProfileSaved";
  payload: {
    playerId: string;
  };
}

export type DomainEvent =
  | RoomCreatedEvent
  | PlayerJoinedRoomEvent
  | PlayerLeftRoomEvent
  | SpawnZoneSelectedEvent
  | MatchStartedEvent
  | PhaseStartedEvent
  | MatchSettledEvent
  | MonsterSpawnedEvent
  | MonsterWindupStartedEvent
  | MonsterAttackedEvent
  | MonsterEnragedStartedEvent
  | MonsterKilledEvent
  | MonsterDamagedEvent
  | MonsterProjectileSpawnedEvent
  | MonsterProjectileHitEvent
  | MonsterProjectileDespawnedEvent
  | PlayerAttackedEvent
  | PlayerSkillCastEvent
  | PlayerDodgedEvent
  | PlayerDamagedEvent
  | PlayerCriticalHitEvent
  | PlayerDiedEvent
  | SlayerSkillChargingEvent
  | SlayerSkillTriggeredEvent
  | BleedStackedToLethalEvent
  | EnvironmentKillRegisteredEvent
  | StatusEffectAppliedEvent
  | StatusEffectExpiredEvent
  | ChestRummageStartedEvent
  | ChestRummageTickedEvent
  | ChestRummageInterruptedEvent
  | ChestOpenedEvent
  | LootSpawnedEvent
  | LootPickedUpEvent
  | ItemSecuredEvent
  | ItemEquippedEvent
  | ItemUnequippedEvent
  | ItemUsedEvent
  | ItemDroppedEvent
  | InventoryChangedEvent
  | PlayerStatsRecomputedEvent
  | SpecialEquipmentSlotsLockedEvent
  | ItemDepositedInSafeEvent
  | ItemWithdrawnFromSafeEvent
  | BackpackCapacityUpgradedEvent
  | BeaconLitEvent
  | ExtractOpenedEvent
  | ExtractChannelStartedEvent
  | ExtractChannelTickedEvent
  | ExtractChannelInterruptedEvent
  | ExtractSucceededEvent
  | EnvironmentDamageDealtEvent
  | FogPhaseChangedEvent
  | SpectateStartedEvent
  | SpectateTargetChangedEvent
  | SpectateExitedEvent
  | MusicModeChangedEvent
  | ProfileLoadedEvent
  | ProfileSavedEvent;

export type DomainEventByType = {
  [E in DomainEvent as E["type"]]: E;
};

export const DOMAIN_EVENT_TYPES = [
  "RoomCreated",
  "PlayerJoinedRoom",
  "PlayerLeftRoom",
  "SpawnZoneSelected",
  "MatchStarted",
  "PhaseStarted",
  "MatchSettled",
  "MonsterSpawned",
  "MonsterWindupStarted",
  "MonsterAttacked",
  "MonsterEnragedStarted",
  "MonsterKilled",
  "MonsterDamaged",
  "MonsterProjectileSpawned",
  "MonsterProjectileHit",
  "MonsterProjectileDespawned",
  "PlayerAttacked",
  "PlayerSkillCast",
  "PlayerDodged",
  "PlayerDamaged",
  "PlayerCriticalHit",
  "PlayerDied",
  "SlayerSkillCharging",
  "SlayerSkillTriggered",
  "BleedStackedToLethal",
  "EnvironmentKillRegistered",
  "StatusEffectApplied",
  "StatusEffectExpired",
  "ChestRummageStarted",
  "ChestRummageTicked",
  "ChestRummageInterrupted",
  "ChestOpened",
  "LootSpawned",
  "LootPickedUp",
  "ItemSecured",
  "ItemEquipped",
  "ItemUnequipped",
  "ItemUsed",
  "ItemDropped",
  "InventoryChanged",
  "PlayerStatsRecomputed",
  "SpecialEquipmentSlotsLocked",
  "ItemDepositedInSafe",
  "ItemWithdrawnFromSafe",
  "BackpackCapacityUpgraded",
  "BeaconLit",
  "ExtractOpened",
  "ExtractChannelStarted",
  "ExtractChannelTicked",
  "ExtractChannelInterrupted",
  "ExtractSucceeded",
  "EnvironmentDamageDealt",
  "FogPhaseChanged",
  "SpectateStarted",
  "SpectateTargetChanged",
  "SpectateExited",
  "MusicModeChanged",
  "ProfileLoaded",
  "ProfileSaved"
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

import crypto from "node:crypto";
import { findFirstFitRect } from "@gamer/shared";
import type { ChestQualityTier, ItemCategory, ItemRarity, WorldDrop } from "@gamer/shared";
import { emitDomain } from "../event-bus/index.js";
import { buildInventoryItem, ensureDropState } from "../loot/loot-manager.js";
import type {
  Chest,
  ChestOpenedPayload,
  ChestProgressPayload,
  DropState,
  InventoryItem,
  InventoryState,
  RuntimeRoom
} from "../types.js";

interface ChestLootEntry {
  rarity?: ItemRarity;
  templates: readonly string[];
  weight: number;
}

const COMMON_EQUIPMENT_TEMPLATES = [
  "weapon_sword_basic",
  "weapon_blade_basic",
  "weapon_spear_basic",
  "armor_head_common",
  "armor_chest_common",
  "armor_hands_common",
  "armor_feet_common",
  "trail_greaves"
] as const;

const UNCOMMON_EQUIPMENT_TEMPLATES = [
  "hunter_cowl",
  "runner_boots",
  "scavenger_coat"
] as const;

const RARE_EQUIPMENT_TEMPLATES = [
  "duelist_blade"
] as const;

const EPIC_EQUIPMENT_TEMPLATES = [
  "warlord_cuirass"
] as const;

const CONSUMABLE_TEMPLATES = [
  "health_potion",
  "coagulant_bandage",
  "rust_stimulant",
  "miasma_tonic"
] as const;

const COIN_TEMPLATES = [
  "gold_pouch"
] as const;

const NORMAL_CHEST_LOOT_TABLE: ChestLootEntry[] = [
  { rarity: "common", templates: COMMON_EQUIPMENT_TEMPLATES, weight: 40 },
  { rarity: "uncommon", templates: UNCOMMON_EQUIPMENT_TEMPLATES, weight: 25 },
  { rarity: "rare", templates: RARE_EQUIPMENT_TEMPLATES, weight: 12 },
  { rarity: "epic", templates: EPIC_EQUIPMENT_TEMPLATES, weight: 3 },
  { templates: CONSUMABLE_TEMPLATES, weight: 16 },
  { templates: COIN_TEMPLATES, weight: 4 }
] as const;

const RICH_CHEST_LOOT_TABLE: ChestLootEntry[] = [
  { rarity: "common", templates: COMMON_EQUIPMENT_TEMPLATES, weight: 24 },
  { rarity: "uncommon", templates: UNCOMMON_EQUIPMENT_TEMPLATES, weight: 24 },
  { rarity: "rare", templates: RARE_EQUIPMENT_TEMPLATES, weight: 20 },
  { rarity: "epic", templates: EPIC_EQUIPMENT_TEMPLATES, weight: 12 },
  { templates: CONSUMABLE_TEMPLATES, weight: 16 },
  { templates: COIN_TEMPLATES, weight: 4 }
] as const;

const RICH_NON_WHITE_GUARANTEE_TABLE: ChestLootEntry[] = [
  { rarity: "uncommon", templates: UNCOMMON_EQUIPMENT_TEMPLATES, weight: 24 },
  { rarity: "rare", templates: RARE_EQUIPMENT_TEMPLATES, weight: 20 },
  { rarity: "epic", templates: EPIC_EQUIPMENT_TEMPLATES, weight: 12 }
] as const;

const NORMAL_MIN_LOOT = 3;
const NORMAL_MAX_LOOT = 5;
const RICH_MIN_LOOT = 3;
const RICH_MAX_LOOT = 5;
export const CHEST_OPEN_DURATION_MS = 1_200;
const CHEST_INTERACT_RANGE = 60;
const CHEST_NOISE_RADIUS = 720;
const CONTESTED_CHEST_NOISE_TTL_MS = 18_000;

function pickChestLootItem(table: readonly ChestLootEntry[]): InventoryItem | undefined {
  const entry = pickWeighted([...table]);
  const templateId = entry.templates[Math.floor(Math.random() * entry.templates.length)];
  if (!templateId) {
    return undefined;
  }

  return buildInventoryItem(templateId, "normal", {
    forceRarity: entry.rarity
  });
}

function generateStarterChestLoot(): InventoryItem[] {
  const count = NORMAL_MIN_LOOT + Math.floor(Math.random() * (NORMAL_MAX_LOOT - NORMAL_MIN_LOOT + 1));
  const loot: InventoryItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const item = pickChestLootItem(NORMAL_CHEST_LOOT_TABLE);
    if (item) {
      loot.push(item);
    }
  }

  return loot;
}

function generateContestedChestLoot(): InventoryItem[] {
  const count = RICH_MIN_LOOT + Math.floor(Math.random() * (RICH_MAX_LOOT - RICH_MIN_LOOT + 1));
  const guaranteedNonWhite = pickChestLootItem(RICH_NON_WHITE_GUARANTEE_TABLE);
  const loot: InventoryItem[] = guaranteedNonWhite ? [guaranteedNonWhite] : [];

  while (loot.length < count) {
    const item = pickChestLootItem(RICH_CHEST_LOOT_TABLE);
    if (item) {
      loot.push(item);
    }
  }

  return loot;
}

function resolveChestQualityTier(chest: { qualityTier?: ChestQualityTier; lane?: string }): ChestQualityTier {
  if (chest.qualityTier === "rich") {
    return "rich";
  }

  return chest.lane === "contested" ? "rich" : "normal";
}

export function spawnChests(room: RuntimeRoom): void {
  room.chests = new Map<string, Chest>();

  const zones = room.matchLayout?.chestZones ?? [];
  for (const zone of zones) {
    const qualityTier = resolveChestQualityTier(zone);
    const loot = qualityTier === "rich" ? generateContestedChestLoot() : generateStarterChestLoot();
    const chest: Chest = {
      id: zone.chestId || `chest_${crypto.randomUUID()}`,
      x: zone.x,
      y: zone.y,
      kind: "abandoned_crate",
      lane: "abandoned",
      qualityTier,
      state: "idle",
      isOpen: false,
      noiseRadius: CHEST_NOISE_RADIUS,
      totalItems: loot.length,
      itemsDispensed: 0,
      rummageIntervalMs: CHEST_OPEN_DURATION_MS,
      loot
    };
    room.chests.set(chest.id, chest);
  }
}

export function listChests(room: RuntimeRoom): Array<Chest & { chestId: string }> {
  return [...(room.chests?.values() ?? [])].map((chest) => ({
    ...chest,
    chestId: chest.id,
    loot: chest.loot.map(cloneItem)
  }));
}

export function openChest(
  room: RuntimeRoom,
  playerId: string,
  chestId: string,
  playerX: number,
  playerY: number
): { chest: Chest; loot: InventoryItem[]; spawnedDrops: DropState[]; aggroedMonsterIds: string[] } {
  const chest = room.chests?.get(chestId);
  if (!chest) {
    throw new Error("Chest not found.");
  }

  const player = room.players.get(playerId);
  if (!player?.state) {
    throw new Error("Player is not active in the current match.");
  }

  if (!player.state.isAlive) {
    throw new Error("Dead players cannot open chests.");
  }

  if (chest.state !== "idle" || chest.isOpen) {
    throw new Error("Chest is already unavailable.");
  }

  const distance = Math.hypot(playerX - chest.x, playerY - chest.y);
  if (distance > CHEST_INTERACT_RANGE) {
    throw new Error("Too far from the chest.");
  }

  startChestOpening(room, playerId, chestId);
  return {
    chest,
    loot: chest.loot.map(cloneItem),
    spawnedDrops: [],
    aggroedMonsterIds: []
  };
}

export function startChestOpening(
  room: RuntimeRoom,
  playerId: string,
  chestId: string,
  now = Date.now()
): ChestProgressPayload {
  const chest = room.chests?.get(chestId);
  if (!chest) {
    throw new Error("Chest not found.");
  }

  const player = room.players.get(playerId);
  if (!player?.state) {
    throw new Error("Player is not active in the current match.");
  }

  if (!player.state.isAlive) {
    throw new Error("Dead players cannot open chests.");
  }

  if (chest.state !== "idle" || chest.isOpen) {
    throw new Error("Chest is already unavailable.");
  }

  if (player.openingChest) {
    throw new Error("Already opening a chest.");
  }

  const distance = Math.hypot(player.state.x - chest.x, player.state.y - chest.y);
  if (distance > CHEST_INTERACT_RANGE) {
    throw new Error("Too far from the chest.");
  }

  player.openingChest = {
    chestId,
    startedAt: now,
    nextDispenseAt: now + chest.rummageIntervalMs
  };
  chest.state = "rummaging";
  chest.rummagerId = playerId;
  emitDomain(room, {
    type: "ChestRummageStarted",
    payload: {
      chestId: chest.id,
      playerId,
      qualityTier: chest.qualityTier,
      noiseRadius: chest.noiseRadius
    }
  });

  return buildChestProgressPayload({
    chest,
    playerId,
    status: "started",
    remainingMs: chest.rummageIntervalMs,
    durationMs: chest.rummageIntervalMs
  });
}

export function interruptChestOpening(
  room: RuntimeRoom,
  playerId: string
): ChestProgressPayload | undefined {
  const player = room.players.get(playerId);
  if (!player?.openingChest) {
    return undefined;
  }

  const opening = player.openingChest;
  const chest = room.chests?.get(opening.chestId);
  player.openingChest = undefined;
  if (chest && chest.state === "rummaging") {
    finalizeInterruptedChest(chest);
    clearRecordedChestNoise(room, chest.id);
  }
  return buildChestProgressPayload({
    chest,
    chestId: opening.chestId,
    playerId,
    status: "interrupted",
    remainingMs: 0,
    durationMs: chest?.rummageIntervalMs ?? CHEST_OPEN_DURATION_MS
  });
}

export function tickChestOpenings(
  room: RuntimeRoom,
  now = Date.now()
): {
  openedEvents: ChestOpenedPayload[];
  interruptedPlayerIds: string[];
  progressEvents: ChestProgressPayload[];
  inventoryUpdatedPlayerIds: string[];
  dropsChanged: boolean;
} {
  const openedEvents: ChestOpenedPayload[] = [];
  const interruptedPlayerIds: string[] = [];
  const progressEvents: ChestProgressPayload[] = [];
  const inventoryUpdatedPlayerIds = new Set<string>();
  let dropsChanged = false;

  for (const player of room.players.values()) {
    const opening = player.openingChest;
    if (!opening) {
      continue;
    }

    const chest = room.chests?.get(opening.chestId);
    const state = player.state;
    if (!chest || chest.state !== "rummaging" || chest.rummagerId !== player.id || !state?.isAlive) {
      player.openingChest = undefined;
      if (chest && chest.state === "rummaging") {
        finalizeInterruptedChest(chest);
        clearRecordedChestNoise(room, chest.id);
      }
      interruptedPlayerIds.push(player.id);
      progressEvents.push(buildChestProgressPayload({
        chest,
        chestId: opening.chestId,
        playerId: player.id,
        status: "interrupted",
        remainingMs: 0,
        durationMs: chest?.rummageIntervalMs ?? CHEST_OPEN_DURATION_MS
      }));
      continue;
    }

    const chestDistance = Math.hypot(state.x - chest.x, state.y - chest.y);
    if (chestDistance > CHEST_INTERACT_RANGE) {
      player.openingChest = undefined;
      finalizeInterruptedChest(chest);
      clearRecordedChestNoise(room, chest.id);
      interruptedPlayerIds.push(player.id);
      progressEvents.push(buildChestProgressPayload({
        chest,
        playerId: player.id,
        status: "interrupted",
        remainingMs: 0,
        durationMs: chest.rummageIntervalMs
      }));
      continue;
    }

    if (now < opening.nextDispenseAt) {
      progressEvents.push(buildChestProgressPayload({
        chest,
        playerId: player.id,
        status: now - opening.startedAt < 100 ? "started" : "progress",
        remainingMs: opening.nextDispenseAt - now,
        durationMs: chest.rummageIntervalMs
      }));
      continue;
    }

    while (player.openingChest && now >= opening.nextDispenseAt && chest.state === "rummaging") {
      const nextItem = chest.loot.shift();
      if (!nextItem) {
        finalizeEmptyChest(chest);
        clearRecordedChestNoise(room, chest.id);
        player.openingChest = undefined;
        progressEvents.push(buildChestProgressPayload({
          chest,
          playerId: player.id,
          status: "completed",
          remainingMs: 0,
          durationMs: chest.rummageIntervalMs
        }));
        break;
      }

      const dispensedItem = cloneItem(nextItem);
      const addedToInventory = tryAddItemToInventory(player.inventory, dispensedItem);
      if (addedToInventory) {
        inventoryUpdatedPlayerIds.add(player.id);
      } else {
        spawnChestDrops(room, chest, [dispensedItem]);
        dropsChanged = true;
      }

      chest.itemsDispensed += 1;
      opening.nextDispenseAt += chest.rummageIntervalMs;
      const aggroedMonsterIds = alertMonstersToChestNoise(room, player.id, chest);
      recordContestedChestNoise(room, player.id, chest, aggroedMonsterIds, now);
      const completed = chest.itemsDispensed >= chest.totalItems || chest.loot.length === 0;
      if (completed) {
        finalizeEmptyChest(chest);
        clearRecordedChestNoise(room, chest.id);
        player.openingChest = undefined;
      }

      const openedPayload = buildChestOpenedPayload(chest, player.id, dispensedItem, aggroedMonsterIds);
      openedEvents.push(openedPayload);
      emitDomain(room, {
        type: "ChestOpened",
        payload: {
          chestId: chest.id,
          playerId: player.id,
          drops: openedPayload.loot.map((item) => toWorldDrop(chest, item))
        }
      });
      progressEvents.push(buildChestProgressPayload({
        chest,
        playerId: player.id,
        status: completed ? "completed" : "dispensed",
        remainingMs: completed ? 0 : Math.max(0, opening.nextDispenseAt - now),
        durationMs: chest.rummageIntervalMs,
        dispensedItem,
        aggroedMonsterIds
      }));
    }
  }

  return {
    openedEvents,
    interruptedPlayerIds,
    progressEvents,
    inventoryUpdatedPlayerIds: [...inventoryUpdatedPlayerIds],
    dropsChanged
  };
}

function toWorldDrop(chest: Chest, item: InventoryItem): WorldDrop {
  return {
    id: item.instanceId,
    item: {
      instanceId: item.instanceId,
      definitionId: item.templateId,
      kind: toSharedItemCategory(item.kind),
      rarity: item.rarity,
      name: item.name,
      goldValue: item.goldValue,
      treasureValue: item.treasureValue,
      tags: item.tags,
      healAmount: item.healAmount,
      consumableEffects: item.consumableEffects,
      affixes: item.affixes,
      modifiers: item.modifiers
    },
    definitionId: item.templateId,
    x: Math.round(chest.x),
    y: Math.round(chest.y)
  };
}

function toSharedItemCategory(kind: InventoryItem["kind"]): ItemCategory {
  if (kind === "equipment") return "armor";
  if (kind === "currency") return "gold";
  return kind;
}

function spawnChestDrops(room: RuntimeRoom, chest: Chest, loot: InventoryItem[]): DropState[] {
  const dropState = ensureDropState(room);
  const drops: DropState[] = [];

  loot.forEach((item, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(loot.length, 1);
    const radius = 34 + (index % 2) * 18;
    const drop: DropState = {
      id: `drop_${crypto.randomUUID()}`,
      item: cloneItem(item),
      x: Math.round(chest.x + Math.cos(angle) * radius),
      y: Math.round(chest.y + Math.sin(angle) * radius),
      source: "spawn",
      createdAt: Date.now()
    };

    dropState.set(drop.id, drop);
    drops.push(drop);
  });

  return drops;
}

function alertMonstersToChestNoise(room: RuntimeRoom, playerId: string, chest: Chest): string[] {
  const aggroedMonsterIds: string[] = [];
  for (const monster of room.monsters?.values() ?? []) {
    if (!monster.isAlive) {
      continue;
    }

    const distance = Math.hypot(monster.x - chest.x, monster.y - chest.y);
    if (distance > CHEST_NOISE_RADIUS) {
      continue;
    }

    monster.targetPlayerId = playerId;
    monster.lastAggroAt = Date.now();
    monster.idleUntil = undefined;
    monster.returningUntil = undefined;
    aggroedMonsterIds.push(monster.id);
  }

  return aggroedMonsterIds;
}

function recordContestedChestNoise(
  room: RuntimeRoom,
  playerId: string,
  chest: Chest,
  aggroedMonsterIds: string[],
  now: number
): void {
  room.contestedChestNoise = {
    chestId: chest.id,
    playerId,
    x: chest.x,
    y: chest.y,
    createdAt: now,
    expiresAt: now + Math.min(CONTESTED_CHEST_NOISE_TTL_MS, chest.rummageIntervalMs),
    aggroedMonsterIds
  };
}

function clearRecordedChestNoise(room: RuntimeRoom, chestId: string): void {
  if (room.contestedChestNoise?.chestId === chestId) {
    room.contestedChestNoise = undefined;
  }
}

function finalizeEmptyChest(chest: Chest): void {
  chest.state = "empty";
  chest.isOpen = true;
  chest.rummagerId = undefined;
}

function finalizeInterruptedChest(chest: Chest): void {
  chest.state = "interrupted";
  chest.isOpen = true;
  chest.rummagerId = undefined;
  chest.loot = [];
}

function buildChestOpenedPayload(
  chest: Chest,
  playerId: string,
  dispensedItem?: InventoryItem,
  aggroedMonsterIds?: string[]
): ChestOpenedPayload {
  return {
    chestId: chest.id,
    playerId,
    lane: chest.lane,
    kind: chest.kind,
    qualityTier: chest.qualityTier,
    state: chest.state,
    noiseRadius: chest.noiseRadius,
    rummagerId: chest.rummagerId,
    totalItems: chest.totalItems,
    itemsDispensed: chest.itemsDispensed,
    rummageIntervalMs: chest.rummageIntervalMs,
    aggroedMonsterIds,
    dispensedItem: dispensedItem ? cloneItem(dispensedItem) : undefined,
    loot: dispensedItem ? [cloneItem(dispensedItem)] : []
  };
}

function buildChestProgressPayload(options: {
  chest?: Chest;
  chestId?: string;
  playerId: string;
  status: ChestProgressPayload["status"];
  remainingMs: number;
  durationMs: number;
  dispensedItem?: InventoryItem;
  aggroedMonsterIds?: string[];
}): ChestProgressPayload {
  return {
    chestId: options.chest?.id ?? options.chestId ?? "unknown",
    playerId: options.playerId,
    lane: options.chest?.lane,
    kind: options.chest?.kind,
    qualityTier: options.chest?.qualityTier,
    noiseRadius: options.chest?.noiseRadius,
    rummagerId: options.chest?.rummagerId,
    totalItems: options.chest?.totalItems ?? 0,
    itemsDispensed: options.chest?.itemsDispensed ?? 0,
    rummageIntervalMs: options.chest?.rummageIntervalMs ?? CHEST_OPEN_DURATION_MS,
    state: options.chest?.state ?? "interrupted",
    status: options.status,
    remainingMs: options.remainingMs,
    durationMs: options.durationMs,
    aggroedMonsterIds: options.aggroedMonsterIds,
    dispensedItem: options.dispensedItem ? cloneItem(options.dispensedItem) : undefined
  };
}

function tryAddItemToInventory(inventory: InventoryState | undefined, item: InventoryItem): boolean {
  if (!inventory) {
    return false;
  }

  const placement = findFirstFitRect(inventory, getInventoryRects(inventory), {
    width: item.width,
    height: item.height
  });
  if (!placement) {
    return false;
  }

  inventory.items.push({
    item: cloneItem(item),
    x: placement.x,
    y: placement.y
  });
  return true;
}

function getInventoryRects(inventory: InventoryState): Array<{ x: number; y: number; width: number; height: number }> {
  return inventory.items.map((entry) => ({
    x: entry.x,
    y: entry.y,
    width: entry.item.width,
    height: entry.item.height
  }));
}

function cloneItem(item: InventoryItem): InventoryItem {
  return {
    ...item,
    tags: item.tags ? [...item.tags] : undefined,
    consumableEffects: item.consumableEffects?.map((effect) => ({ ...effect })),
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
  };
}

function pickWeighted<T extends { weight: number }>(entries: T[]): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }

  return entries[entries.length - 1];
}

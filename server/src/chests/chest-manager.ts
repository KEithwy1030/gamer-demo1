import crypto from "node:crypto";
import { findFirstFitRect } from "@gamer/shared";
import type { ChestQualityTier } from "@gamer/shared";
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

const STARTER_LOOT_TEMPLATES = [
  "hunter_cowl",
  "runner_boots",
  "armor_hands_common",
  "armor_feet_common",
  "weapon_sword_basic",
  "weapon_blade_basic",
  "health_potion",
  "coagulant_bandage",
  "rust_stimulant",
  "treasure_small_idol"
] as const;

const NORMAL_MIN_LOOT = 3;
const NORMAL_MAX_LOOT = 5;
const RICH_MIN_LOOT = 3;
const RICH_MAX_LOOT = 5;
export const CHEST_OPEN_DURATION_MS = 1_200;
const CHEST_INTERACT_RANGE = 60;
const CHEST_NOISE_RADIUS = 720;
const CONTESTED_CHEST_NOISE_TTL_MS = 18_000;

function pickStarterLootItem(): InventoryItem | undefined {
  const templateId = STARTER_LOOT_TEMPLATES[Math.floor(Math.random() * STARTER_LOOT_TEMPLATES.length)];
  return buildInventoryItem(templateId, "normal");
}

function pickContestedLootItem(): InventoryItem | undefined {
  const templateId = pickWeighted([
    { templateId: "treasure_cursed_reliquary", weight: 10 },
    { templateId: "duelist_blade", weight: 15 },
    { templateId: "warlord_cuirass", weight: 12 },
    { templateId: "runner_boots", weight: 13 },
    { templateId: "hunter_cowl", weight: 13 },
    { templateId: "treasure_large_statue", weight: 10 },
    { templateId: "treasure_medium_tablet", weight: 10 },
    { templateId: "weapon_spear_basic", weight: 8 },
    { templateId: "miasma_tonic", weight: 7 },
    { templateId: "rust_stimulant", weight: 6 },
    { templateId: "coagulant_bandage", weight: 6 },
    { templateId: "weapon_blade_basic", weight: 5 },
    { templateId: "weapon_sword_basic", weight: 4 }
  ]).templateId;
  return buildInventoryItem(templateId, "elite");
}

function generateStarterChestLoot(): InventoryItem[] {
  const count = NORMAL_MIN_LOOT + Math.floor(Math.random() * (NORMAL_MAX_LOOT - NORMAL_MIN_LOOT + 1));
  const loot: InventoryItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const item = pickStarterLootItem();
    if (item) {
      loot.push(item);
    }
  }

  return loot;
}

function generateContestedChestLoot(): InventoryItem[] {
  const count = RICH_MIN_LOOT + Math.floor(Math.random() * (RICH_MAX_LOOT - RICH_MIN_LOOT + 1));
  const guaranteedTreasure = buildInventoryItem("treasure_cursed_reliquary", "elite");
  const loot: InventoryItem[] = guaranteedTreasure ? [guaranteedTreasure] : [];

  while (loot.length < count) {
    const item = pickContestedLootItem();
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
      noiseRadius: qualityTier === "rich" ? CHEST_NOISE_RADIUS : 0,
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
      const completed = chest.itemsDispensed >= chest.totalItems || chest.loot.length === 0;
      if (completed) {
        finalizeEmptyChest(chest);
        player.openingChest = undefined;
      }

      openedEvents.push(buildChestOpenedPayload(chest, player.id, dispensedItem));
      progressEvents.push(buildChestProgressPayload({
        chest,
        playerId: player.id,
        status: completed ? "completed" : "dispensed",
        remainingMs: completed ? 0 : Math.max(0, opening.nextDispenseAt - now),
        durationMs: chest.rummageIntervalMs,
        dispensedItem
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
  if (chest.qualityTier !== "rich") {
    return [];
  }

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

function recordContestedChestNoise(room: RuntimeRoom, playerId: string, chest: Chest, aggroedMonsterIds: string[]): void {
  if (chest.qualityTier !== "rich") {
    return;
  }

  const now = Date.now();
  room.contestedChestNoise = {
    chestId: chest.id,
    playerId,
    x: chest.x,
    y: chest.y,
    createdAt: now,
    expiresAt: now + CONTESTED_CHEST_NOISE_TTL_MS,
    aggroedMonsterIds
  };
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

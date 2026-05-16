import crypto from "node:crypto";
import { buildInventoryItem, ensureDropState } from "../loot/loot-manager.js";
import type { Chest, ChestOpenedPayload, ChestProgressPayload, DropState, InventoryItem, RuntimeRoom } from "../types.js";

const STARTER_LOOT_TEMPLATES = [
  "armor_hands_common",
  "armor_feet_common",
  "weapon_sword_basic",
  "weapon_blade_basic",
  "health_potion",
  "treasure_small_idol"
] as const;

const STARTER_MIN_LOOT = 2;
const STARTER_MAX_LOOT = 3;
const CONTESTED_MIN_LOOT = 3;
const CONTESTED_MAX_LOOT = 5;
export const CHEST_OPEN_DURATION_MS = 2_000;
const CHEST_INTERACT_RANGE = 80;
const CHEST_OPEN_MOVE_TOLERANCE = 28;
const CHEST_NOISE_RADIUS = 720;

function pickStarterLootItem(): InventoryItem | undefined {
  const templateId = STARTER_LOOT_TEMPLATES[Math.floor(Math.random() * STARTER_LOOT_TEMPLATES.length)];
  return buildInventoryItem(templateId, "normal");
}

function pickContestedLootItem(): InventoryItem | undefined {
  const templateId = pickWeighted([
    { templateId: "treasure_small_idol", weight: 12 },
    { templateId: "treasure_medium_tablet", weight: 26 },
    { templateId: "treasure_large_statue", weight: 14 },
    { templateId: "armor_head_common", weight: 13 },
    { templateId: "armor_chest_common", weight: 13 },
    { templateId: "weapon_spear_basic", weight: 10 },
    { templateId: "weapon_blade_basic", weight: 6 },
    { templateId: "weapon_sword_basic", weight: 6 }
  ]).templateId;
  return buildInventoryItem(templateId, "elite");
}

function generateStarterChestLoot(): InventoryItem[] {
  const count = STARTER_MIN_LOOT + Math.floor(Math.random() * (STARTER_MAX_LOOT - STARTER_MIN_LOOT + 1));
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
  const count = CONTESTED_MIN_LOOT + Math.floor(Math.random() * (CONTESTED_MAX_LOOT - CONTESTED_MIN_LOOT + 1));
  const guaranteedTreasure = buildInventoryItem(Math.random() < 0.65 ? "treasure_medium_tablet" : "treasure_large_statue", "elite");
  const loot: InventoryItem[] = guaranteedTreasure ? [guaranteedTreasure] : [];

  while (loot.length < count) {
    const item = pickContestedLootItem();
    if (item) {
      loot.push(item);
    }
  }

  return loot;
}

export function spawnChests(room: RuntimeRoom): void {
  room.chests = new Map<string, Chest>();

  const zones = room.matchLayout?.chestZones ?? [];
  for (const zone of zones) {
    const chest: Chest = {
      id: zone.chestId || `chest_${crypto.randomUUID()}`,
      x: zone.x,
      y: zone.y,
      isOpen: false,
      loot: zone.lane === "contested" ? generateContestedChestLoot() : generateStarterChestLoot()
    };
    room.chests.set(chest.id, chest);
  }
}

export function listChests(room: RuntimeRoom): Chest[] {
  return [...(room.chests?.values() ?? [])].map((chest) => ({
    ...chest,
    loot: chest.loot.map((item) => ({
      ...item,
      modifiers: item.modifiers ? { ...item.modifiers } : undefined,
      affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
    }))
  }));
}

export function openChest(
  room: RuntimeRoom,
  playerId: string,
  chestId: string,
  playerX: number,
  playerY: number
): { chest: Chest; loot: InventoryItem[]; spawnedDrops: DropState[] } {
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

  if (chest.isOpen) {
    throw new Error("Chest is already open.");
  }

  const distance = Math.hypot(playerX - chest.x, playerY - chest.y);
  if (distance > CHEST_INTERACT_RANGE) {
    throw new Error("Too far from the chest.");
  }

  chest.isOpen = true;
  const loot = chest.loot.map((item) => ({
    ...item,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
  }));
  const spawnedDrops = spawnChestDrops(room, chest, loot);
  alertMonstersToChestNoise(room, playerId, chest);

  return { chest, loot, spawnedDrops };
}

export function startChestOpening(
  room: RuntimeRoom,
  playerId: string,
  chestId: string,
  now = Date.now()
): void {
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

  if (chest.isOpen) {
    throw new Error("Chest is already open.");
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
    completesAt: now + CHEST_OPEN_DURATION_MS,
    startX: player.state.x,
    startY: player.state.y
  };
}

export function interruptChestOpening(room: RuntimeRoom, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player?.openingChest) {
    return false;
  }

  player.openingChest = undefined;
  return true;
}

export function tickChestOpenings(
  room: RuntimeRoom,
  now = Date.now()
): { openedEvents: ChestOpenedPayload[]; interruptedPlayerIds: string[]; progressEvents: ChestProgressPayload[] } {
  const openedEvents: ChestOpenedPayload[] = [];
  const interruptedPlayerIds: string[] = [];
  const progressEvents: ChestProgressPayload[] = [];

  for (const player of room.players.values()) {
    const opening = player.openingChest;
    if (!opening) {
      continue;
    }

    const chest = room.chests?.get(opening.chestId);
    const state = player.state;
    if (!chest || chest.isOpen || !state?.isAlive) {
      player.openingChest = undefined;
      interruptedPlayerIds.push(player.id);
      progressEvents.push({
        chestId: opening.chestId,
        playerId: player.id,
        status: "interrupted",
        remainingMs: 0,
        durationMs: CHEST_OPEN_DURATION_MS
      });
      continue;
    }

    const moved = Math.hypot(state.x - opening.startX, state.y - opening.startY);
    const chestDistance = Math.hypot(state.x - chest.x, state.y - chest.y);
    if (moved > CHEST_OPEN_MOVE_TOLERANCE || chestDistance > CHEST_INTERACT_RANGE) {
      player.openingChest = undefined;
      interruptedPlayerIds.push(player.id);
      progressEvents.push({
        chestId: opening.chestId,
        playerId: player.id,
        status: "interrupted",
        remainingMs: 0,
        durationMs: CHEST_OPEN_DURATION_MS
      });
      continue;
    }

    if (now < opening.completesAt) {
      progressEvents.push({
        chestId: opening.chestId,
        playerId: player.id,
        status: now - opening.startedAt < 100 ? "started" : "progress",
        remainingMs: opening.completesAt - now,
        durationMs: CHEST_OPEN_DURATION_MS
      });
      continue;
    }

    const { loot } = openChest(room, player.id, opening.chestId, state.x, state.y);
    player.openingChest = undefined;
    openedEvents.push({
      chestId: opening.chestId,
      playerId: player.id,
      loot
    });
  }

  return { openedEvents, interruptedPlayerIds, progressEvents };
}

function spawnChestDrops(room: RuntimeRoom, chest: Chest, loot: InventoryItem[]): DropState[] {
  const dropState = ensureDropState(room);
  const drops: DropState[] = [];

  loot.forEach((item, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(loot.length, 1);
    const radius = 34 + (index % 2) * 18;
    const drop: DropState = {
      id: `drop_${crypto.randomUUID()}`,
      item: {
        ...item,
        modifiers: item.modifiers ? { ...item.modifiers } : undefined,
        affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
      },
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

function alertMonstersToChestNoise(room: RuntimeRoom, playerId: string, chest: Chest): void {
  const layoutChest = room.matchLayout?.chestZones.find((entry) => entry.chestId === chest.id);
  if (layoutChest?.lane !== "contested") {
    return;
  }

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
  }
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

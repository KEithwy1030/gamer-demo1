import crypto from "node:crypto";
import { buildInventoryItem, ensureDropState } from "../loot/loot-manager.js";
import type { Chest, DropState, InventoryItem, RuntimeRoom } from "../types.js";

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
  if (distance > 80) {
    throw new Error("Too far from the chest.");
  }

  chest.isOpen = true;
  const loot = chest.loot.map((item) => ({
    ...item,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
  }));
  const spawnedDrops = spawnChestDrops(room, chest, loot);

  return { chest, loot, spawnedDrops };
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

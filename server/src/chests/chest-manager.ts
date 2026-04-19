import crypto from "node:crypto";
import { buildInventoryItem } from "../loot/loot-manager.js";
import { MATCH_MAP_HEIGHT, MATCH_MAP_WIDTH } from "../internal-constants.js";
import type { Chest, InventoryItem, RuntimeRoom } from "../types.js";

const CHEST_SPAWN_LAYOUTS: Array<{ xRatio: number; yRatio: number }> = [
  { xRatio: 0.08, yRatio: 0.08 },
  { xRatio: 0.92, yRatio: 0.08 },
  { xRatio: 0.08, yRatio: 0.92 },
  { xRatio: 0.92, yRatio: 0.92 },
  { xRatio: 0.5, yRatio: 0.08 },
  { xRatio: 0.5, yRatio: 0.92 },
  { xRatio: 0.08, yRatio: 0.5 },
  { xRatio: 0.92, yRatio: 0.5 },
  { xRatio: 0.24, yRatio: 0.24 },
  { xRatio: 0.76, yRatio: 0.76 }
];

const CHEST_SPAWN_POSITIONS: Array<{ x: number; y: number }> = CHEST_SPAWN_LAYOUTS.map((position) => ({
  x: Math.round(MATCH_MAP_WIDTH * position.xRatio),
  y: Math.round(MATCH_MAP_HEIGHT * position.yRatio)
}));

const CHEST_LOOT_TEMPLATES = [
  "armor_hands_common",
  "armor_feet_common",
  "armor_head_common",
  "armor_chest_common",
  "weapon_sword_basic",
  "weapon_blade_basic",
  "weapon_spear_basic"
] as const;

const MIN_LOOT = 2;
const MAX_LOOT = 4;

function pickLootItem(): InventoryItem | undefined {
  const templateId = CHEST_LOOT_TEMPLATES[
    Math.floor(Math.random() * CHEST_LOOT_TEMPLATES.length)
  ];
  return buildInventoryItem(templateId);
}

function generateChestLoot(): InventoryItem[] {
  const count = MIN_LOOT + Math.floor(Math.random() * (MAX_LOOT - MIN_LOOT + 1));
  const loot: InventoryItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const item = pickLootItem();
    if (item) {
      loot.push(item);
    }
  }

  return loot;
}

export function spawnChests(room: RuntimeRoom): void {
  room.chests = new Map<string, Chest>();

  for (const position of CHEST_SPAWN_POSITIONS) {
    const chest: Chest = {
      id: `chest_${crypto.randomUUID()}`,
      x: position.x,
      y: position.y,
      isOpen: false,
      loot: generateChestLoot()
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
): { chest: Chest; loot: InventoryItem[] } {
  const chest = room.chests?.get(chestId);
  if (!chest) {
    throw new Error("Chest not found.");
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

  return { chest, loot };
}

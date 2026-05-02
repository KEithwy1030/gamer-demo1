import crypto from "node:crypto";
import type {
  Affix,
  AffixKey,
  EquipmentSlot as SharedEquipmentSlot,
  ItemCategory,
  ItemRarity
} from "@gamer/shared";
import type { MonsterType } from "@gamer/shared";
import { ITEM_DEFINITIONS } from "@gamer/shared";
import type { DropState, EquipmentSlot, InventoryItem, RuntimeMonster, RuntimeRoom } from "../types.js";

interface WeightedDefinition {
  definitionId: string;
  weight: number;
}

interface QualityWeight {
  rarity: ItemRarity;
  weight: number;
}

const NORMAL_DROP_RATE = 0.5;
const NORMAL_DROP_TABLE: WeightedDefinition[] = [
  { definitionId: "treasure_small_idol", weight: 17 },
  { definitionId: "armor_hands_common", weight: 17 },
  { definitionId: "armor_feet_common", weight: 17 },
  { definitionId: "weapon_sword_basic", weight: 17 },
  { definitionId: "weapon_blade_basic", weight: 17 },
  { definitionId: "health_potion", weight: 15 }
];

const ELITE_DROP_TABLE: WeightedDefinition[] = [
  { definitionId: "treasure_medium_tablet", weight: 15 },
  { definitionId: "treasure_large_statue", weight: 15 },
  { definitionId: "armor_head_common", weight: 15 },
  { definitionId: "armor_chest_common", weight: 15 },
  { definitionId: "weapon_spear_basic", weight: 15 },
  { definitionId: "health_potion", weight: 25 }
];

const NORMAL_QUALITY_WEIGHTS: QualityWeight[] = [
  { rarity: "common", weight: 60 },
  { rarity: "uncommon", weight: 25 },
  { rarity: "rare", weight: 12 },
  { rarity: "epic", weight: 3 }
];

const ELITE_QUALITY_WEIGHTS: QualityWeight[] = [
  { rarity: "common", weight: 30 },
  { rarity: "uncommon", weight: 35 },
  { rarity: "rare", weight: 25 },
  { rarity: "epic", weight: 10 }
];

const AFFIX_COUNT_BY_RARITY: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3
};

const AFFIX_POOLS_BY_SLOT: Record<EquipmentSlot, AffixKey[]> = {
  weapon: ["attackPower", "attackSpeed", "critRate", "critDamage", "slow", "bleed"],
  head: ["maxHp", "hpRegen", "antiCrit", "slowResist"],
  chest: ["maxHp", "damageReduction", "hpRegen", "antiCrit"],
  hands: ["attackPower", "attackSpeed", "critRate", "dodgeRate"],
  shoes: ["moveSpeed", "dodgeRate", "slowResist", "maxHp"]
};

export function ensureDropState(room: RuntimeRoom): Map<string, DropState> {
  if (!room.drops) {
    room.drops = new Map();
  }

  return room.drops;
}

export function createDropsForMonster(room: RuntimeRoom, monster: RuntimeMonster): DropState[] {
  const dropState = ensureDropState(room);
  const definitionIds = pickDropDefinitions(monster.type);
  const drops: DropState[] = [];

  definitionIds.forEach((definitionId, index) => {
    const item = buildInventoryItem(definitionId, monster.type);
    if (!item) {
      return;
    }

    const angle = (Math.PI * 2 * index) / Math.max(definitionIds.length, 1);
    const drop: DropState = {
      id: `drop_${crypto.randomUUID()}`,
      item,
      x: Math.round(monster.x + Math.cos(angle) * 28),
      y: Math.round(monster.y + Math.sin(angle) * 28),
      source: "spawn",
      createdAt: Date.now()
    };

    dropState.set(drop.id, drop);
    drops.push(drop);
  });

  return drops;
}

export function listWorldDrops(room: RuntimeRoom): DropState[] {
  return [...ensureDropState(room).values()].map((drop) => ({
    ...drop,
    item: {
      ...drop.item,
      modifiers: drop.item.modifiers ? { ...drop.item.modifiers } : undefined,
      affixes: drop.item.affixes.map((affix) => ({ ...affix }))
    }
  }));
}

function pickDropDefinitions(monsterType: MonsterType): string[] {
  if (monsterType === "normal" && Math.random() > NORMAL_DROP_RATE) {
    return [];
  }

  const table = monsterType === "elite" ? ELITE_DROP_TABLE : NORMAL_DROP_TABLE;
  const dropCount = monsterType === "elite" ? 2 : 1;
  const results: string[] = [];

  for (let index = 0; index < dropCount; index += 1) {
    results.push(pickWeighted(table).definitionId);
  }

  return results;
}

export function buildInventoryItem(
  definitionId: string,
  sourceMonsterType: MonsterType = "normal"
): InventoryItem | undefined {
  const definition = ITEM_DEFINITIONS[definitionId];
  if (!definition) {
    return undefined;
  }

  const equipmentSlot = toEquipmentSlot(definitionId, definition.slot, definition.armorType);
  const rarity = shouldRollQuality(definition.category, equipmentSlot)
    ? rollItemRarity(sourceMonsterType)
    : definition.rarity;

  return {
    instanceId: crypto.randomUUID(),
    templateId: definition.id,
    name: definition.name,
    rarity,
    kind: toInventoryKind(definition.category),
    width: definition.size.width,
    height: definition.size.height,
    equipmentSlot,
    weaponType: definition.weaponType,
    goldValue: definition.goldAmount ?? 0,
    treasureValue: definition.treasureValue ?? 0,
    healAmount: definition.healAmount,
    modifiers: definition.stats
      ? {
          maxHp: definition.stats.maxHpBonus,
          attackPower: definition.stats.attackPower,
          attackSpeed: definition.stats.attackSpeedBonus,
          critRate: definition.stats.critRate,
          critDamage: definition.stats.critDamage,
          moveSpeed: definition.stats.moveSpeedBonus,
          damageReduction: definition.stats.damageReduction,
          hpRegen: definition.stats.hpRegen,
          dodgeRate: definition.stats.dodgeRate
        }
      : undefined,
    affixes: rollAffixes(equipmentSlot, rarity)
  };
}

function shouldRollQuality(category: ItemCategory, equipmentSlot: EquipmentSlot | undefined): boolean {
  return category === "weapon" || (category === "armor" && equipmentSlot != null);
}

function rollItemRarity(monsterType: MonsterType): ItemRarity {
  const weights = monsterType === "elite" ? ELITE_QUALITY_WEIGHTS : NORMAL_QUALITY_WEIGHTS;
  return pickWeighted(weights).rarity;
}

function toInventoryKind(category: ItemCategory): InventoryItem["kind"] {
  if (category === "weapon") {
    return "weapon";
  }

  if (category === "armor") {
    return "equipment";
  }

  if (category === "gold") {
    return "currency";
  }

  if (category === "consumable") {
    return "consumable";
  }

  return "treasure";
}

function toEquipmentSlot(
  definitionId: string,
  slot?: SharedEquipmentSlot,
  armorType?: SharedEquipmentSlot
): EquipmentSlot | undefined {
  if (slot === "weapon" || slot === "head" || slot === "chest" || slot === "hands" || slot === "shoes") {
    return slot;
  }

  if (armorType === "head" || armorType === "chest" || armorType === "hands" || armorType === "shoes") {
    return armorType;
  }

  if (definitionId.includes("armor_hands")) {
    return "hands";
  }

  if (definitionId.includes("armor_feet")) {
    return "shoes";
  }

  return undefined;
}

function rollAffixes(slot: EquipmentSlot | undefined, rarity: ItemRarity): Affix[] {
  if (!slot) {
    return [];
  }

  const count = AFFIX_COUNT_BY_RARITY[rarity] ?? 0;
  const pool = AFFIX_POOLS_BY_SLOT[slot].filter((key) => key !== "bleed");
  const affixes: Affix[] = [];

  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const pickIndex = Math.floor(Math.random() * pool.length);
    const [key] = pool.splice(pickIndex, 1);
    affixes.push({
      key,
      value: rollAffixValue(key)
    });
  }

  if (slot === "weapon" && Math.random() < 0.10) {
    affixes.push({
      key: "bleed",
      value: rollAffixValue("bleed")
    });
  }

  return affixes;
}

function rollAffixValue(key: AffixKey): number {
  switch (key) {
    case "attackPower":
      return rollInt(1, 5);
    case "attackSpeed":
      return rollFixed(0.02, 0.08);
    case "critRate":
      return rollFixed(0.02, 0.08);
    case "critDamage":
      return rollFixed(0.1, 0.35);
    case "slow":
      return rollFixed(0.08, 0.18);
    case "bleed":
      return rollInt(1, 4);
    case "maxHp":
      return rollInt(5, 20);
    case "damageReduction":
      return rollFixed(0.02, 0.06);
    case "hpRegen":
      return rollFixed(0.5, 2);
    case "dodgeRate":
      return rollFixed(0.02, 0.06);
    case "moveSpeed":
      return rollInt(10, 30);
    case "slowResist":
      return rollFixed(0.08, 0.2);
    case "antiCrit":
      return rollFixed(0.05, 0.15);
  }
}

function rollInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollFixed(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
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

import type { ItemDefinition } from "../types/inventory";

export const INVENTORY_WIDTH = 10;
export const INVENTORY_HEIGHT = 6;

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  weapon_sword_basic: {
    id: "weapon_sword_basic",
    name: "Rust Sword",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "sword",
    stats: { attackPower: 2 }
  },
  weapon_blade_basic: {
    id: "weapon_blade_basic",
    name: "Raider Blade",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "blade",
    stats: { attackPower: 3 }
  },
  weapon_spear_basic: {
    id: "weapon_spear_basic",
    name: "Old Spear",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 4 },
    slot: "weapon",
    weaponType: "spear",
    stats: { attackPower: 4 }
  },
  armor_head_common: {
    id: "armor_head_common",
    name: "Scout Hood",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "head",
    armorType: "head",
    stats: { maxHpBonus: 6 }
  },
  armor_chest_common: {
    id: "armor_chest_common",
    name: "Patch Chestpiece",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    stats: { maxHpBonus: 12, damageReduction: 0.04 }
  },
  armor_hands_common: {
    id: "armor_hands_common",
    name: "Grip Gloves",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "hands",
    armorType: "hands",
    stats: { attackSpeedBonus: 0.08 }
  },
  armor_feet_common: {
    id: "armor_feet_common",
    name: "Road Boots",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "shoes",
    armorType: "shoes",
    stats: { moveSpeedBonus: 18 }
  },
  treasure_small_idol: {
    id: "treasure_small_idol",
    name: "Small Idol",
    category: "treasure",
    rarity: "common",
    size: { width: 1, height: 1 },
    treasureSize: "small",
    treasureValue: 40
  },
  treasure_medium_tablet: {
    id: "treasure_medium_tablet",
    name: "Stone Tablet",
    category: "treasure",
    rarity: "rare",
    size: { width: 1, height: 2 },
    treasureSize: "medium",
    treasureValue: 100
  },
  treasure_large_statue: {
    id: "treasure_large_statue",
    name: "Broken Statue",
    category: "treasure",
    rarity: "epic",
    size: { width: 2, height: 2 },
    treasureSize: "large",
    treasureValue: 220
  },
  health_potion: {
    id: "health_potion",
    name: "回血药",
    category: "consumable",
    rarity: "common",
    size: { width: 1, height: 1 },
    healAmount: 30
  }
};

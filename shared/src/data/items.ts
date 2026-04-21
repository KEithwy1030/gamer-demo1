import type { ItemDefinition } from "../types/inventory";

export const INVENTORY_WIDTH = 10;
export const INVENTORY_HEIGHT = 6;

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  weapon_sword_basic: {
    id: "weapon_sword_basic",
    name: "锈蚀长剑",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "sword",
    stats: { attackPower: 2 }
  },
  weapon_blade_basic: {
    id: "weapon_blade_basic",
    name: "突袭弯刃",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "blade",
    stats: { attackPower: 3 }
  },
  weapon_spear_basic: {
    id: "weapon_spear_basic",
    name: "旧猎矛",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 4 },
    slot: "weapon",
    weaponType: "spear",
    stats: { attackPower: 4 }
  },
  armor_head_common: {
    id: "armor_head_common",
    name: "斥候兜帽",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "head",
    armorType: "head",
    stats: { maxHpBonus: 6 }
  },
  armor_chest_common: {
    id: "armor_chest_common",
    name: "拼接胸甲",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    stats: { maxHpBonus: 12, damageReduction: 0.04 }
  },
  armor_hands_common: {
    id: "armor_hands_common",
    name: "握柄手套",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "hands",
    armorType: "hands",
    stats: { attackSpeedBonus: 0.08 }
  },
  armor_feet_common: {
    id: "armor_feet_common",
    name: "旅者短靴",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "shoes",
    armorType: "shoes",
    stats: { moveSpeedBonus: 18 }
  },
  treasure_small_idol: {
    id: "treasure_small_idol",
    name: "小型偶像",
    category: "treasure",
    rarity: "common",
    size: { width: 1, height: 1 },
    treasureSize: "small",
    treasureValue: 40
  },
  treasure_medium_tablet: {
    id: "treasure_medium_tablet",
    name: "石刻碑板",
    category: "treasure",
    rarity: "rare",
    size: { width: 1, height: 2 },
    treasureSize: "medium",
    treasureValue: 100
  },
  treasure_large_statue: {
    id: "treasure_large_statue",
    name: "残破雕像",
    category: "treasure",
    rarity: "epic",
    size: { width: 2, height: 2 },
    treasureSize: "large",
    treasureValue: 220
  },
  health_potion: {
    id: "health_potion",
    name: "回血药剂",
    category: "consumable",
    rarity: "common",
    size: { width: 1, height: 1 },
    healAmount: 30
  }
};

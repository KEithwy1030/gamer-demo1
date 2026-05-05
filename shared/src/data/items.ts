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
    goldAmount: 14,
    stats: { attackPower: 2 }
  },
  starter_sword: {
    id: "starter_sword",
    name: "制式长剑",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "sword",
    goldAmount: 12
  },
  "iron-sword": {
    id: "iron-sword",
    name: "制式长剑",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "sword",
    goldAmount: 12
  },
  weapon_blade_basic: {
    id: "weapon_blade_basic",
    name: "突袭弯刃",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "blade",
    goldAmount: 18,
    stats: { attackPower: 3 }
  },
  raider_blade: {
    id: "raider_blade",
    name: "突袭弯刃",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "blade",
    goldAmount: 18,
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
    goldAmount: 20,
    stats: { attackPower: 4 }
  },
  hunter_spear: {
    id: "hunter_spear",
    name: "猎人长矛",
    category: "weapon",
    rarity: "common",
    size: { width: 1, height: 4 },
    slot: "weapon",
    weaponType: "spear",
    goldAmount: 20,
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
    goldAmount: 10,
    stats: { maxHpBonus: 6 }
  },
  leather_hood: {
    id: "leather_hood",
    name: "皮质兜帽",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "head",
    armorType: "head",
    goldAmount: 10,
    stats: { maxHpBonus: 10 }
  },
  armor_chest_common: {
    id: "armor_chest_common",
    name: "拼接胸甲",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    goldAmount: 18,
    stats: { maxHpBonus: 12, damageReduction: 0.04 }
  },
  scavenger_coat: {
    id: "scavenger_coat",
    name: "拾荒者外衣",
    category: "armor",
    rarity: "uncommon",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    goldAmount: 22,
    stats: { maxHpBonus: 25 }
  },
  armor_hands_common: {
    id: "armor_hands_common",
    name: "握柄手套",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "hands",
    armorType: "hands",
    goldAmount: 12,
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
    goldAmount: 14,
    stats: { moveSpeedBonus: 18 }
  },
  trail_greaves: {
    id: "trail_greaves",
    name: "径行胫甲",
    category: "armor",
    rarity: "common",
    size: { width: 2, height: 2 },
    slot: "shoes",
    armorType: "shoes",
    goldAmount: 14,
    stats: { maxHpBonus: 15, moveSpeedBonus: 12 }
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
  jade_idol: {
    id: "jade_idol",
    name: "古玉偶像",
    category: "treasure",
    rarity: "rare",
    size: { width: 1, height: 2 },
    goldAmount: 8,
    treasureSize: "medium",
    treasureValue: 80
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
  gold_pouch: {
    id: "gold_pouch",
    name: "金币袋",
    category: "gold",
    rarity: "common",
    size: { width: 1, height: 1 },
    goldAmount: 40
  },
  health_potion: {
    id: "health_potion",
    name: "回血药剂",
    category: "consumable",
    rarity: "common",
    size: { width: 1, height: 1 },
    healAmount: 30
  },
  extract_torch: {
    id: "extract_torch",
    name: "归营火种",
    category: "quest",
    rarity: "common",
    size: { width: 1, height: 3 },
    tags: ["extract_key", "non_extractable"]
  }
};

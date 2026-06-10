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
  hunter_cowl: {
    id: "hunter_cowl",
    name: "缇夜猎屏",
    category: "armor",
    rarity: "uncommon",
    size: { width: 2, height: 2 },
    slot: "head",
    armorType: "head",
    goldAmount: 24,
    stats: { maxHpBonus: 8, dodgeRate: 0.03 }
  },
  runner_boots: {
    id: "runner_boots",
    name: "步境蹈靴",
    category: "armor",
    rarity: "uncommon",
    size: { width: 2, height: 2 },
    slot: "shoes",
    armorType: "shoes",
    goldAmount: 28,
    stats: { moveSpeedBonus: 26, dodgeRate: 0.04 }
  },
  duelist_blade: {
    id: "duelist_blade",
    name: "双刃绿刀",
    category: "weapon",
    rarity: "rare",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "blade",
    goldAmount: 72,
    stats: { attackPower: 6, attackSpeedBonus: 0.12, critRate: 0.05 }
  },
  warlord_cuirass: {
    id: "warlord_cuirass",
    name: "战主钉胸甲",
    category: "armor",
    rarity: "epic",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    goldAmount: 120,
    stats: { maxHpBonus: 32, damageReduction: 0.08, hpRegen: 1 }
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
  treasure_cursed_reliquary: {
    id: "treasure_cursed_reliquary",
    name: "咒缚遗钉",
    category: "treasure",
    rarity: "epic",
    size: { width: 2, height: 2 },
    treasureSize: "large",
    treasureValue: 360
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
  coagulant_bandage: {
    id: "coagulant_bandage",
    name: "Coagulant Bandage",
    category: "consumable",
    rarity: "common",
    size: { width: 1, height: 1 },
    healAmount: 10,
    consumableEffects: [
      { kind: "cleanse", statusTypes: ["bleed"] }
    ]
  },
  rust_stimulant: {
    id: "rust_stimulant",
    name: "Rust Stimulant",
    category: "consumable",
    rarity: "uncommon",
    size: { width: 1, height: 1 },
    consumableEffects: [
      { kind: "timedModifier", type: "moveSpeedBoost", durationMs: 6000, magnitude: 0.22, moveSpeedMultiplier: 0.22 }
    ]
  },
  miasma_tonic: {
    id: "miasma_tonic",
    name: "Miasma Tonic",
    category: "consumable",
    rarity: "uncommon",
    size: { width: 1, height: 2 },
    consumableEffects: [
      { kind: "timedModifier", type: "damageReduction", durationMs: 7000, magnitude: 0.35, damageReductionBonus: 0.35 }
    ]
  },
  extract_torch: {
    id: "extract_torch",
    name: "归营火种",
    category: "quest",
    rarity: "common",
    size: { width: 1, height: 3 },
    tags: ["extract_key", "non_extractable"]
  },
  soldier_warblade: {
    id: "soldier_warblade",
    name: "军阵阔剑",
    category: "weapon",
    rarity: "uncommon",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "sword",
    goldAmount: 26,
    stats: { attackPower: 4, maxHpBonus: 6 }
  },
  executioner_greatsword: {
    id: "executioner_greatsword",
    name: "处刑大剑",
    category: "weapon",
    rarity: "epic",
    size: { width: 1, height: 4 },
    slot: "weapon",
    weaponType: "sword",
    goldAmount: 130,
    stats: { attackPower: 7, critDamage: 0.3 }
  },
  nightfang_dagger: {
    id: "nightfang_dagger",
    name: "夜牙短刃",
    category: "weapon",
    rarity: "uncommon",
    size: { width: 1, height: 2 },
    slot: "weapon",
    weaponType: "blade",
    goldAmount: 28,
    stats: { attackPower: 4, critRate: 0.04, attackSpeedBonus: 0.06 }
  },
  bloodletter_falx: {
    id: "bloodletter_falx",
    name: "放血弯钩",
    category: "weapon",
    rarity: "epic",
    size: { width: 1, height: 3 },
    slot: "weapon",
    weaponType: "blade",
    goldAmount: 135,
    stats: { attackPower: 6, critRate: 0.08, critDamage: 0.25 }
  },
  serpent_pike: {
    id: "serpent_pike",
    name: "蛇形骑矛",
    category: "weapon",
    rarity: "rare",
    size: { width: 1, height: 4 },
    slot: "weapon",
    weaponType: "spear",
    goldAmount: 78,
    stats: { attackPower: 6, moveSpeedBonus: 8 }
  },
  gravewarden_halberd: {
    id: "gravewarden_halberd",
    name: "守墓者长戟",
    category: "weapon",
    rarity: "epic",
    size: { width: 1, height: 4 },
    slot: "weapon",
    weaponType: "spear",
    goldAmount: 140,
    stats: { attackPower: 7, maxHpBonus: 10, damageReduction: 0.03 }
  },
  iron_barbute: {
    id: "iron_barbute",
    name: "铸铁筒盔",
    category: "armor",
    rarity: "rare",
    size: { width: 2, height: 2 },
    slot: "head",
    armorType: "head",
    goldAmount: 62,
    stats: { maxHpBonus: 14, damageReduction: 0.03 }
  },
  plague_doctor_mask: {
    id: "plague_doctor_mask",
    name: "疫医鸟喙面具",
    category: "armor",
    rarity: "epic",
    size: { width: 2, height: 2 },
    slot: "head",
    armorType: "head",
    goldAmount: 125,
    stats: { maxHpBonus: 12, hpRegen: 1, dodgeRate: 0.03 }
  },
  ghoul_hide_wrap: {
    id: "ghoul_hide_wrap",
    name: "食尸鬼皮裹甲",
    category: "armor",
    rarity: "uncommon",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    goldAmount: 30,
    stats: { maxHpBonus: 18, hpRegen: 1 }
  },
  brigandine_vest: {
    id: "brigandine_vest",
    name: "暗扣布面甲",
    category: "armor",
    rarity: "rare",
    size: { width: 2, height: 3 },
    slot: "chest",
    armorType: "chest",
    goldAmount: 80,
    stats: { maxHpBonus: 22, damageReduction: 0.06 }
  },
  bracers_of_haste: {
    id: "bracers_of_haste",
    name: "疾手缚腕",
    category: "armor",
    rarity: "rare",
    size: { width: 2, height: 2 },
    slot: "hands",
    armorType: "hands",
    goldAmount: 66,
    stats: { attackSpeedBonus: 0.14, critRate: 0.04 }
  },
  assassin_tabi: {
    id: "assassin_tabi",
    name: "无声足袋",
    category: "armor",
    rarity: "rare",
    size: { width: 2, height: 2 },
    slot: "shoes",
    armorType: "shoes",
    goldAmount: 70,
    stats: { moveSpeedBonus: 30, dodgeRate: 0.05 }
  },
  bulwark_sabatons: {
    id: "bulwark_sabatons",
    name: "壁垒铁靴",
    category: "armor",
    rarity: "epic",
    size: { width: 2, height: 2 },
    slot: "shoes",
    armorType: "shoes",
    goldAmount: 118,
    stats: { maxHpBonus: 20, moveSpeedBonus: 10, damageReduction: 0.04 }
  },
  silver_candelabrum: {
    id: "silver_candelabrum",
    name: "银烛台",
    category: "treasure",
    rarity: "uncommon",
    size: { width: 1, height: 2 },
    treasureSize: "medium",
    treasureValue: 60
  },
  bishops_signet: {
    id: "bishops_signet",
    name: "主教印戒",
    category: "treasure",
    rarity: "rare",
    size: { width: 1, height: 1 },
    treasureSize: "small",
    treasureValue: 70
  },
  ancient_coin_hoard: {
    id: "ancient_coin_hoard",
    name: "古币堆",
    category: "treasure",
    rarity: "rare",
    size: { width: 2, height: 1 },
    treasureSize: "medium",
    treasureValue: 95
  },
  gilded_reliquary: {
    id: "gilded_reliquary",
    name: "鎏金圣髑匣",
    category: "treasure",
    rarity: "epic",
    size: { width: 2, height: 2 },
    treasureSize: "large",
    treasureValue: 280
  },
  crown_of_the_fallen: {
    id: "crown_of_the_fallen",
    name: "陨落者王冠",
    category: "treasure",
    rarity: "epic",
    size: { width: 2, height: 2 },
    treasureSize: "large",
    treasureValue: 310
  },
  field_ration: {
    id: "field_ration",
    name: "行军干粮",
    category: "consumable",
    rarity: "common",
    size: { width: 1, height: 1 },
    goldAmount: 4,
    healAmount: 15
  },
  army_medkit: {
    id: "army_medkit",
    name: "军用医疗包",
    category: "consumable",
    rarity: "rare",
    size: { width: 1, height: 2 },
    goldAmount: 26,
    healAmount: 65
  },
  berserk_draught: {
    id: "berserk_draught",
    name: "蛮勇药剂",
    category: "consumable",
    rarity: "uncommon",
    size: { width: 1, height: 1 },
    goldAmount: 16,
    consumableEffects: [
      { kind: "timedModifier", type: "attackBoost", durationMs: 6000, magnitude: 0.2, attackDamageMultiplier: 0.2 }
    ]
  }
};

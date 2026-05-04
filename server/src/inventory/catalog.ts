import type {
  EquipmentSlot,
  InventoryItem,
  InventoryItemKind,
  ItemStatModifiers
} from "../types.js";
import type { ItemRarity } from "@gamer/shared";

interface ItemTemplate {
  templateId: string;
  name: string;
  kind: InventoryItemKind;
  rarity: ItemRarity;
  width: number;
  height: number;
  equipmentSlot?: EquipmentSlot;
  weaponType?: InventoryItem["weaponType"];
  goldValue: number;
  treasureValue: number;
  healAmount?: number;
  modifiers?: ItemStatModifiers;
}

const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  starter_sword: {
    templateId: "starter_sword",
    name: "Starter Sword",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "sword",
    goldValue: 12,
    treasureValue: 0
  },
  "iron-sword": {
    templateId: "iron-sword",
    name: "Starter Sword",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "sword",
    goldValue: 12,
    treasureValue: 0
  },
  weapon_sword_basic: {
    templateId: "weapon_sword_basic",
    name: "Rust Sword",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "sword",
    goldValue: 14,
    treasureValue: 0
  },
  raider_blade: {
    templateId: "raider_blade",
    name: "Raider Blade",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "blade",
    goldValue: 18,
    treasureValue: 0
  },
  weapon_blade_basic: {
    templateId: "weapon_blade_basic",
    name: "Raider Blade",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "blade",
    goldValue: 18,
    treasureValue: 0
  },
  hunter_spear: {
    templateId: "hunter_spear",
    name: "Hunter Spear",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 4,
    equipmentSlot: "weapon",
    weaponType: "spear",
    goldValue: 20,
    treasureValue: 0
  },
  weapon_spear_basic: {
    templateId: "weapon_spear_basic",
    name: "Old Spear",
    kind: "weapon",
    rarity: "common",
    width: 1,
    height: 4,
    equipmentSlot: "weapon",
    weaponType: "spear",
    goldValue: 20,
    treasureValue: 0
  },
  leather_hood: {
    templateId: "leather_hood",
    name: "Leather Hood",
    kind: "equipment",
    rarity: "common",
    width: 2,
    height: 2,
    equipmentSlot: "head",
    goldValue: 10,
    treasureValue: 0,
    modifiers: { maxHp: 10 }
  },
  armor_head_common: {
    templateId: "armor_head_common",
    name: "Scout Hood",
    kind: "equipment",
    rarity: "common",
    width: 2,
    height: 2,
    equipmentSlot: "head",
    goldValue: 10,
    treasureValue: 0,
    modifiers: { maxHp: 6 }
  },
  scavenger_coat: {
    templateId: "scavenger_coat",
    name: "Scavenger Coat",
    kind: "equipment",
    rarity: "uncommon",
    width: 2,
    height: 3,
    equipmentSlot: "chest",
    goldValue: 22,
    treasureValue: 0,
    modifiers: { maxHp: 25 }
  },
  armor_chest_common: {
    templateId: "armor_chest_common",
    name: "Patch Chestpiece",
    kind: "equipment",
    rarity: "common",
    width: 2,
    height: 3,
    equipmentSlot: "chest",
    goldValue: 18,
    treasureValue: 0,
    modifiers: { maxHp: 12, damageReduction: 0.04 }
  },
  armor_hands_common: {
    templateId: "armor_hands_common",
    name: "Grip Gloves",
    kind: "equipment",
    rarity: "common",
    width: 2,
    height: 2,
    equipmentSlot: "hands",
    goldValue: 12,
    treasureValue: 0,
    modifiers: { attackSpeed: 0.08 }
  },
  trail_greaves: {
    templateId: "trail_greaves",
    name: "Trail Greaves",
    kind: "equipment",
    rarity: "common",
    width: 2,
    height: 2,
    equipmentSlot: "shoes",
    goldValue: 14,
    treasureValue: 0,
    modifiers: { maxHp: 15, moveSpeed: 12 }
  },
  armor_feet_common: {
    templateId: "armor_feet_common",
    name: "Road Boots",
    kind: "equipment",
    rarity: "common",
    width: 2,
    height: 2,
    equipmentSlot: "shoes",
    goldValue: 14,
    treasureValue: 0,
    modifiers: { moveSpeed: 18 }
  },
  jade_idol: {
    templateId: "jade_idol",
    name: "Jade Idol",
    kind: "treasure",
    rarity: "rare",
    width: 1,
    height: 2,
    goldValue: 8,
    treasureValue: 80
  },
  treasure_small_idol: {
    templateId: "treasure_small_idol",
    name: "Small Idol",
    kind: "treasure",
    rarity: "common",
    width: 1,
    height: 1,
    goldValue: 0,
    treasureValue: 40
  },
  treasure_medium_tablet: {
    templateId: "treasure_medium_tablet",
    name: "Stone Tablet",
    kind: "treasure",
    rarity: "rare",
    width: 1,
    height: 2,
    goldValue: 0,
    treasureValue: 100
  },
  treasure_large_statue: {
    templateId: "treasure_large_statue",
    name: "Broken Statue",
    kind: "treasure",
    rarity: "epic",
    width: 2,
    height: 2,
    goldValue: 0,
    treasureValue: 220
  },
  gold_pouch: {
    templateId: "gold_pouch",
    name: "Gold Pouch",
    kind: "currency",
    rarity: "common",
    width: 1,
    height: 1,
    goldValue: 40,
    treasureValue: 0
  },
  health_potion: {
    templateId: "health_potion",
    name: "Health Potion",
    kind: "consumable",
    rarity: "common",
    width: 1,
    height: 1,
    goldValue: 0,
    treasureValue: 0,
    healAmount: 30
  }
};

export function getItemTemplate(templateId: string): ItemTemplate {
  const template = ITEM_TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown inventory template: ${templateId}`);
  }

  return template;
}

export function listSeedDropTemplateIds(): string[] {
  return [
    "raider_blade",
    "hunter_spear",
    "leather_hood",
    "scavenger_coat",
    "trail_greaves",
    "jade_idol",
    "gold_pouch",
    "gold_pouch"
  ];
}

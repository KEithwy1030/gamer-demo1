import type {
  EquipmentSlot,
  InventoryItem,
  InventoryItemKind,
  ItemStatModifiers
} from "../types.js";
import type { ItemRarity } from "../../../shared/dist/types/inventory.js";

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
    width: 2,
    height: 3,
    equipmentSlot: "weapon",
    weaponType: "sword",
    goldValue: 12,
    treasureValue: 0
  },
  raider_blade: {
    templateId: "raider_blade",
    name: "Raider Blade",
    kind: "weapon",
    rarity: "common",
    width: 2,
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
    name: "回血药",
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

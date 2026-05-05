import { ITEM_DEFINITIONS } from "@gamer/shared";
import type {
  EquipmentSlot,
  InventoryItem,
  InventoryItemKind,
  ItemStatModifiers
} from "../types.js";
import type { ItemDefinition, ItemRarity } from "@gamer/shared";

interface ItemTemplate {
  templateId: string;
  name: string;
  kind: InventoryItemKind;
  rarity: ItemRarity;
  tags?: Array<"extract_key" | "non_extractable">;
  width: number;
  height: number;
  equipmentSlot?: EquipmentSlot;
  weaponType?: InventoryItem["weaponType"];
  goldValue: number;
  treasureValue: number;
  healAmount?: number;
  modifiers?: ItemStatModifiers;
}

const SEED_DROP_TEMPLATE_IDS = [
  "raider_blade",
  "hunter_spear",
  "leather_hood",
  "scavenger_coat",
  "trail_greaves",
  "jade_idol",
  "gold_pouch",
  "gold_pouch"
] as const;

export function getItemTemplate(templateId: string): ItemTemplate {
  const definition = ITEM_DEFINITIONS[templateId];
  if (!definition) {
    throw new Error(`Unknown inventory template: ${templateId}`);
  }

  return definitionToTemplate(definition);
}

export function listSeedDropTemplateIds(): string[] {
  return [...SEED_DROP_TEMPLATE_IDS];
}

function definitionToTemplate(definition: ItemDefinition): ItemTemplate {
  return {
    templateId: definition.id,
    name: definition.name,
    kind: toRuntimeKind(definition.category),
    rarity: definition.rarity,
    tags: definition.tags ? [...definition.tags] : undefined,
    width: definition.size.width,
    height: definition.size.height,
    equipmentSlot: definition.slot,
    weaponType: definition.weaponType,
    goldValue: definition.goldAmount ?? 0,
    treasureValue: definition.treasureValue ?? 0,
    healAmount: definition.healAmount,
    modifiers: definition.stats ? toRuntimeModifiers(definition.stats) : undefined
  };
}

function toRuntimeKind(category: ItemDefinition["category"]): InventoryItemKind {
  if (category === "armor") return "equipment";
  if (category === "gold") return "currency";
  if (category === "quest") return "quest";
  return category;
}

function toRuntimeModifiers(stats: NonNullable<ItemDefinition["stats"]>): ItemStatModifiers {
  const modifiers: ItemStatModifiers = {};
  if (stats.maxHpBonus != null) modifiers.maxHp = stats.maxHpBonus;
  if (stats.attackPower != null) modifiers.attackPower = stats.attackPower;
  if (stats.attackSpeedBonus != null) modifiers.attackSpeed = stats.attackSpeedBonus;
  if (stats.critRate != null) modifiers.critRate = stats.critRate;
  if (stats.critDamage != null) modifiers.critDamage = stats.critDamage;
  if (stats.moveSpeedBonus != null) modifiers.moveSpeed = stats.moveSpeedBonus;
  if (stats.damageReduction != null) modifiers.damageReduction = stats.damageReduction;
  if (stats.hpRegen != null) modifiers.hpRegen = stats.hpRegen;
  if (stats.dodgeRate != null) modifiers.dodgeRate = stats.dodgeRate;
  return modifiers;
}

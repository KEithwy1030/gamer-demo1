import type { WeaponType } from "./game";

export type EquipmentSlot = "weapon" | "head" | "chest" | "hands" | "shoes";
export type ItemRarity = "common" | "uncommon" | "rare" | "epic";
export type ItemCategory = "weapon" | "armor" | "gold" | "treasure" | "consumable";
export type ArmorType = Exclude<EquipmentSlot, "weapon">;
export type TreasureSize = "small" | "medium" | "large";
export type AffixKey =
  | "attackPower"
  | "attackSpeed"
  | "critRate"
  | "critDamage"
  | "slow"
  | "bleed"
  | "maxHp"
  | "damageReduction"
  | "hpRegen"
  | "dodgeRate"
  | "moveSpeed"
  | "slowResist"
  | "antiCrit";

export interface GridSize {
  width: number;
  height: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  size: GridSize;
  slot?: EquipmentSlot;
  weaponType?: WeaponType;
  armorType?: ArmorType;
  goldAmount?: number;
  treasureSize?: TreasureSize;
  treasureValue?: number;
  healAmount?: number;
  stats?: Partial<{
    attackPower: number;
    attackSpeedBonus: number;
    maxHpBonus: number;
    moveSpeedBonus: number;
    damageReduction: number;
    critRate: number;
    critDamage: number;
    hpRegen: number;
    dodgeRate: number;
  }>;
}

export interface Affix {
  key: AffixKey;
  value: number;
}

export interface InventoryItemInstance {
  instanceId: string;
  definitionId: string;
  kind?: ItemCategory;
  rarity?: ItemRarity;
  name?: string;
  width?: number;
  height?: number;
  equipmentSlot?: EquipmentSlot;
  weaponType?: WeaponType;
  goldValue?: number;
  treasureValue?: number;
  healAmount?: number;
  affixes?: Affix[];
  modifiers?: Partial<{
    attackPower: number;
    attackSpeed: number;
    maxHp: number;
    moveSpeed: number;
    damageReduction: number;
    critRate: number;
    critDamage: number;
    hpRegen: number;
    dodgeRate: number;
  }>;
}

export interface InventoryPlacedItem extends InventoryItemInstance {
  x: number;
  y: number;
}

export interface InventoryState {
  width: number;
  height: number;
  items: InventoryPlacedItem[];
}

export interface PagedInventoryState {
  width: number;
  height: number;
  pages: InventoryState[];
}

export interface EquipmentState {
  weapon?: InventoryItemInstance;
  head?: InventoryItemInstance;
  chest?: InventoryItemInstance;
  hands?: InventoryItemInstance;
  shoes?: InventoryItemInstance;
}

export interface PickupRequestPayload {
  dropId: string;
}

export interface EquipItemPayload {
  itemInstanceId: string;
}

export interface UnequipItemPayload {
  itemInstanceId: string;
}

export interface MoveInventoryItemPayload {
  itemInstanceId: string;
  targetArea: "grid" | "equipment" | "stash" | "discard";
  x?: number;
  y?: number;
  slot?: EquipmentSlot;
  pageIndex?: number;
}

export interface DropItemPayload {
  itemInstanceId: string;
}

export interface InventorySnapshotPayload {
  inventory: InventoryState;
  equipment: EquipmentState;
}

export interface PendingReturnPayload {
  items: InventoryItemInstance[];
}

export interface WorldDrop {
  id: string;
  item: InventoryItemInstance;
  definitionId: string;
  x: number;
  y: number;
}

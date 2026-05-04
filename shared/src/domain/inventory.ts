import { ITEM_DEFINITIONS } from "../data/items.js";
import type { EquipmentSlot, GridSize, InventoryItemInstance } from "../types/inventory.js";

export interface GridBounds {
  width: number;
  height: number;
}

export interface GridRect extends GridSize {
  x: number;
  y: number;
}

export function normalizeEquipmentSlot(value: unknown): EquipmentSlot | undefined {
  return value === "weapon" || value === "head" || value === "chest" || value === "hands" || value === "shoes"
    ? value
    : undefined;
}

export function resolveItemSize(item: Pick<InventoryItemInstance, "definitionId"> & Partial<GridSize>): GridSize {
  const definition = ITEM_DEFINITIONS[item.definitionId];
  return {
    width: Math.max(1, Math.floor(item.width ?? definition?.size.width ?? 1)),
    height: Math.max(1, Math.floor(item.height ?? definition?.size.height ?? 1))
  };
}

export function resolveEquipmentSlot(item: Pick<InventoryItemInstance, "definitionId"> & { equipmentSlot?: unknown; slot?: unknown }): EquipmentSlot | undefined {
  return normalizeEquipmentSlot(item.equipmentSlot)
    ?? normalizeEquipmentSlot(item.slot)
    ?? normalizeEquipmentSlot(ITEM_DEFINITIONS[item.definitionId]?.slot)
    ?? normalizeEquipmentSlot(ITEM_DEFINITIONS[item.definitionId]?.armorType);
}

export function rectanglesOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function canPlaceRect(grid: GridBounds, existingRects: readonly GridRect[], rect: GridRect): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > grid.width || rect.y + rect.height > grid.height) {
    return false;
  }

  return !existingRects.some((entry) => rectanglesOverlap(rect, entry));
}

export function findFirstFitRect(
  grid: GridBounds,
  existingRects: readonly GridRect[],
  size: GridSize
): { x: number; y: number } | undefined {
  const width = Math.max(1, Math.floor(size.width));
  const height = Math.max(1, Math.floor(size.height));
  for (let y = 0; y <= grid.height - height; y += 1) {
    for (let x = 0; x <= grid.width - width; x += 1) {
      if (canPlaceRect(grid, existingRects, { x, y, width, height })) {
        return { x, y };
      }
    }
  }

  return undefined;
}

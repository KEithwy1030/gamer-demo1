import crypto from "node:crypto";
import type {
  DropState,
  EquipmentSlot,
  InventoryEntry,
  InventoryItem,
  InventoryState,
  InventoryUpdatePayload,
  LootPickedPayload,
  PlayerMoveInventoryItemPayload,
  RuntimePlayer,
  RuntimeRoom
} from "../types.js";
import {
  DEFAULT_WEAPON_TYPE,
  LOADOUT_INVENTORY_HEIGHT,
  LOADOUT_INVENTORY_WIDTH,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH,
  PLAYER_BASE_HP,
  PLAYER_BASE_MOVE_SPEED
} from "../internal-constants.js";
import { setPlayerBaseStats } from "../combat/player-effects.js";
import { getItemTemplate, listSeedDropTemplateIds } from "./catalog.js";

const PICKUP_RADIUS_PX = 140;
const DROP_SPREAD_PX = 48;
const DEATH_DROP_SPREAD_PX = 84;

interface MutationResult {
  inventoryUpdate: InventoryUpdatePayload;
  drops: DropState[];
  lootPicked?: LootPickedPayload;
}

export class InventoryService {
  initializeRoom(room: RuntimeRoom): void {
    room.drops ??= new Map<string, DropState>();

    for (const player of room.players.values()) {
      this.ensurePlayerInitialized(player);
      this.applyEquipmentStats(player);
    }

    if (room.drops.size > 0) {
      return;
    }

    const playerList = [...room.players.values()];
    const seedTemplates = listSeedDropTemplateIds();

    seedTemplates.forEach((templateId, index) => {
      const anchor = playerList[index % Math.max(playerList.length, 1)];
      const angle = (Math.PI * 2 * index) / seedTemplates.length;
      const distance = 80 + (index % 3) * 36;
      const baseX = anchor?.state?.x ?? MATCH_MAP_WIDTH / 2;
      const baseY = anchor?.state?.y ?? MATCH_MAP_HEIGHT / 2;

      this.spawnDrop(room, {
        item: this.createItem(templateId),
        x: clamp(baseX + Math.cos(angle) * distance, 24, MATCH_MAP_WIDTH - 24),
        y: clamp(baseY + Math.sin(angle) * distance, 24, MATCH_MAP_HEIGHT - 24),
        source: "spawn"
      });
    });
  }

  initializePlayer(player: RuntimePlayer, persistedInventory?: InventoryState): void {
    player.inventory = persistedInventory
      ? cloneInventory(persistedInventory)
      : createEmptyInventory();

    if (!player.inventory.equipment.weapon) {
      player.inventory.equipment.weapon = this.createItem("starter_sword");
    }

    player.deathLootDropped = false;
    this.applyEquipmentStats(player);
  }

  ensurePlayerInitialized(player: RuntimePlayer): void {
    if (!player.inventory) {
      this.initializePlayer(player);
    }
  }

  pickup(room: RuntimeRoom, playerId: string, dropId: string): MutationResult {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);
    const drop = room.drops?.get(dropId);

    if (!drop) {
      throw new Error("Drop not found.");
    }

    this.assertAlive(player);
    this.assertPickupRange(player, drop);

    const placement = findFirstFit(inventory, drop.item);
    if (!placement) {
      throw new Error("Inventory is full.");
    }

    inventory.items.push({
      item: cloneItem(drop.item),
      x: placement.x,
      y: placement.y
    });
    room.drops?.delete(dropId);

    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room),
      lootPicked: {
        roomCode: room.code,
        playerId,
        dropId,
        item: cloneItem(drop.item)
      }
    };
  }

  equip(room: RuntimeRoom, playerId: string, itemInstanceId: string): MutationResult {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);
    this.assertAlive(player);

    const entryIndex = inventory.items.findIndex((entry) => entry.item.instanceId === itemInstanceId);
    if (entryIndex < 0) {
      throw new Error("Item is not in the backpack.");
    }

    const [entry] = inventory.items.splice(entryIndex, 1);
    const slot = entry.item.equipmentSlot;
    if (!slot) {
      inventory.items.splice(entryIndex, 0, entry);
      throw new Error("Item cannot be equipped.");
    }

    const previousEquipped = inventory.equipment[slot];
    if (previousEquipped) {
      const placement = findFirstFit(inventory, previousEquipped);
      if (!placement) {
        inventory.items.splice(entryIndex, 0, entry);
        throw new Error("Need free backpack space to swap equipment.");
      }

      inventory.items.push({
        item: cloneItem(previousEquipped),
        x: placement.x,
        y: placement.y
      });
    }

    inventory.equipment[slot] = cloneItem(entry.item);
    this.applyEquipmentStats(player);

    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room)
    };
  }

  unequip(room: RuntimeRoom, playerId: string, itemInstanceId: string): MutationResult {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);
    this.assertAlive(player);

    let foundSlot: EquipmentSlot | undefined;
    for (const [slot, item] of Object.entries(inventory.equipment)) {
      if (item?.instanceId === itemInstanceId) {
        foundSlot = slot as EquipmentSlot;
        break;
      }
    }

    if (!foundSlot) {
      throw new Error("Item is not equipped.");
    }

    const itemToUnequip = inventory.equipment[foundSlot]!;
    const placement = findFirstFit(inventory, itemToUnequip);
    if (!placement) {
      throw new Error("Inventory is full.");
    }

    delete inventory.equipment[foundSlot];
    inventory.items.push({
      item: cloneItem(itemToUnequip),
      x: placement.x,
      y: placement.y
    });

    this.applyEquipmentStats(player);

    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room)
    };
  }

  dropItem(room: RuntimeRoom, playerId: string, itemInstanceId: string): MutationResult {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);
    this.assertAlive(player);

    const removed = removeInventoryItem(inventory, itemInstanceId);
    if (!removed) {
      throw new Error("Item not found in inventory or equipment.");
    }

    const offset = buildSpreadOffset(DROP_SPREAD_PX);
    this.spawnDrop(room, {
      item: removed.item,
      x: clamp((player.state?.x ?? MATCH_MAP_WIDTH / 2) + offset.x, 24, MATCH_MAP_WIDTH - 24),
      y: clamp((player.state?.y ?? MATCH_MAP_HEIGHT / 2) + offset.y, 24, MATCH_MAP_HEIGHT - 24),
      source: "manual-drop",
      ownerPlayerId: player.id
    });
    this.applyEquipmentStats(player);

    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room)
    };
  }

  moveItem(room: RuntimeRoom, playerId: string, payload: PlayerMoveInventoryItemPayload): MutationResult {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);
    this.assertAlive(player);

    const source = removeInventorySource(inventory, payload.itemInstanceId);
    if (!source) {
      throw new Error("Item not found in inventory.");
    }

    if (payload.targetArea === "equipment") {
      const slot = payload.slot ?? source.item.equipmentSlot;
      if (!slot || source.item.equipmentSlot !== slot) {
        restoreInventorySource(inventory, source);
        throw new Error("Item cannot be equipped in the selected slot.");
      }

      const previousEquipped = inventory.equipment[slot];
      if (previousEquipped && source.area === "grid") {
        const swapPlacement = findFirstFitAtOrAnywhere(
          inventory,
          previousEquipped,
          source.entry?.x,
          source.entry?.y
        );
        if (!swapPlacement) {
          restoreInventorySource(inventory, source);
          throw new Error("Need free backpack space to swap equipment.");
        }

        inventory.items.push({
          item: cloneItem(previousEquipped),
          x: swapPlacement.x,
          y: swapPlacement.y
        });
      } else if (previousEquipped && source.area === "equipment") {
        restoreInventorySource(inventory, source);
        throw new Error("Target slot is occupied.");
      }

      inventory.equipment[slot] = cloneItem(source.item);
    } else {
      const hasExplicitTarget = Number.isInteger(payload.x) && Number.isInteger(payload.y);
      const placement = hasExplicitTarget
        ? findExactFit(inventory, source.item, payload.x!, payload.y!)
        : findFirstFitAtOrAnywhere(inventory, source.item, source.entry?.x, source.entry?.y);
      if (!placement) {
        restoreInventorySource(inventory, source);
        throw new Error("Target position is blocked.");
      }

      inventory.items.push({
        item: cloneItem(source.item),
        x: placement.x,
        y: placement.y
      });
    }

    this.applyEquipmentStats(player);
    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room)
    };
  }

  useItem(room: RuntimeRoom, playerId: string, itemInstanceId: string): MutationResult {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);
    this.assertAlive(player);

    const entryIndex = inventory.items.findIndex((entry) => entry.item.instanceId === itemInstanceId);
    if (entryIndex < 0) {
      throw new Error("Consumable is not in the backpack.");
    }

    const [entry] = inventory.items.splice(entryIndex, 1);
    if (entry.item.kind !== "consumable" || !entry.item.healAmount) {
      inventory.items.splice(entryIndex, 0, entry);
      throw new Error("Item cannot be used.");
    }

    if (!player.state) {
      throw new Error("Player is not active in the match.");
    }

    player.state.hp = Math.min(player.state.maxHp, player.state.hp + entry.item.healAmount);

    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room)
    };
  }

  handleDeath(room: RuntimeRoom, playerId: string): MutationResult | undefined {
    const player = this.getPlayer(room, playerId);
    if (player.deathLootDropped) {
      return undefined;
    }

    const inventory = this.getInventory(player);
    const items = collectAllItems(inventory);
    player.deathLootDropped = true;

    if (items.length === 0) {
      return {
        inventoryUpdate: this.buildInventoryUpdate(player),
        drops: this.listDrops(room)
      };
    }

    items.forEach((item, index) => {
      const angle = (Math.PI * 2 * index) / items.length;
      const distance = 28 + (index % 4) * Math.max(18, Math.floor(DEATH_DROP_SPREAD_PX / 4));
      this.spawnDrop(room, {
        item,
        x: clamp((player.state?.x ?? MATCH_MAP_WIDTH / 2) + Math.cos(angle) * distance, 24, MATCH_MAP_WIDTH - 24),
        y: clamp((player.state?.y ?? MATCH_MAP_HEIGHT / 2) + Math.sin(angle) * distance, 24, MATCH_MAP_HEIGHT - 24),
        source: "player-death",
        ownerPlayerId: player.id
      });
    });

    this.applyEquipmentStats(player);

    return {
      inventoryUpdate: this.buildInventoryUpdate(player),
      drops: this.listDrops(room)
    };
  }

  addItemsToInventory(room: RuntimeRoom, playerId: string, items: InventoryItem[]): InventoryUpdatePayload {
    const player = this.getPlayer(room, playerId);
    const inventory = this.getInventory(player);

    for (const item of items) {
      const placement = findFirstFit(inventory, item);
      if (placement) {
        inventory.items.push({
          item: cloneItem(item),
          x: placement.x,
          y: placement.y
        });
      }
    }

    return this.buildInventoryUpdate(player);
  }

  listDrops(room: RuntimeRoom): DropState[] {
    return [...(room.drops?.values() ?? [])].map(cloneDrop);
  }

  buildInventoryUpdate(player: RuntimePlayer): InventoryUpdatePayload {
    return {
      playerId: player.id,
      inventory: cloneInventory(this.getInventory(player))
    };
  }

  private getPlayer(room: RuntimeRoom, playerId: string): RuntimePlayer {
    const player = room.players.get(playerId);
    if (!player) {
      throw new Error("Player not found in room.");
    }

    this.ensurePlayerInitialized(player);
    return player;
  }

  private getInventory(player: RuntimePlayer): InventoryState {
    const inventory = player.inventory;
    if (!inventory) {
      throw new Error("Inventory not initialized.");
    }

    return inventory;
  }

  private assertAlive(player: RuntimePlayer): void {
    if (player.state && !player.state.isAlive) {
      throw new Error("Dead players cannot change inventory.");
    }
  }

  private assertPickupRange(player: RuntimePlayer, drop: DropState): void {
    const position = player.state;
    if (!position) {
      throw new Error("Player is not active in the match.");
    }

    const distance = Math.hypot(position.x - drop.x, position.y - drop.y);
    if (distance > PICKUP_RADIUS_PX) {
      throw new Error("Drop is out of pickup range.");
    }
  }

  private createItem(templateId: string): InventoryItem {
    const template = getItemTemplate(templateId);
    return {
      instanceId: crypto.randomUUID(),
      templateId: template.templateId,
      name: template.name,
      kind: template.kind,
      rarity: template.rarity,
      width: template.width,
      height: template.height,
      equipmentSlot: template.equipmentSlot,
      weaponType: template.weaponType,
      goldValue: template.goldValue,
      treasureValue: template.treasureValue,
      healAmount: template.healAmount,
      modifiers: template.modifiers ? { ...template.modifiers } : undefined,
      affixes: []
    };
  }

  private spawnDrop(
    room: RuntimeRoom,
    drop: Omit<DropState, "id" | "createdAt">
  ): DropState {
    room.drops ??= new Map<string, DropState>();

    const created: DropState = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      item: cloneItem(drop.item),
      x: Math.round(drop.x),
      y: Math.round(drop.y),
      source: drop.source,
      ownerPlayerId: drop.ownerPlayerId
    };

    room.drops.set(created.id, created);
    return created;
  }

  private applyEquipmentStats(player: RuntimePlayer): void {
    const inventory = this.getInventory(player);
    const position = player.state;
    if (!position) {
      return;
    }

    let maxHpBonus = 0;
    let attackPowerBonus = 0;
    let attackSpeedBonus = 0;
    let critRateBonus = 0;
    let damageReductionBonus = 0;
    let moveSpeedBonus = 0;
    const equippedWeapon = inventory.equipment.weapon;

    for (const item of Object.values(inventory.equipment)) {
      if (!item) {
        continue;
      }

      maxHpBonus += getItemStatTotal(item, "maxHp");
      attackPowerBonus += getItemStatTotal(item, "attackPower");
      attackSpeedBonus += getItemStatTotal(item, "attackSpeed");
      critRateBonus += getItemStatTotal(item, "critRate");
      damageReductionBonus += getItemStatTotal(item, "damageReduction");
      moveSpeedBonus += getItemStatTotal(item, "moveSpeed");
    }

    position.maxHp = PLAYER_BASE_HP + maxHpBonus;
    setPlayerBaseStats(player, {
      maxHp: PLAYER_BASE_HP + maxHpBonus,
      weaponType: equippedWeapon?.weaponType ?? DEFAULT_WEAPON_TYPE,
      attackPower: attackPowerBonus,
      attackSpeed: attackSpeedBonus,
      critRate: critRateBonus,
      damageReduction: damageReductionBonus,
      moveSpeed: PLAYER_BASE_MOVE_SPEED + moveSpeedBonus
    });
  }
}

function getItemStatTotal(
  item: InventoryItem,
  statKey: "maxHp" | "attackPower" | "attackSpeed" | "critRate" | "damageReduction" | "moveSpeed"
): number {
  const modifierValue = item.modifiers?.[statKey] ?? 0;
  const affixValue = (item.affixes ?? []).reduce((sum, affix) => (
    affix.key === statKey ? sum + affix.value : sum
  ), 0);

  return modifierValue + affixValue;
}

function collectAllItems(inventory: InventoryState): InventoryItem[] {
  const collected = inventory.items.map((entry) => cloneItem(entry.item));
  inventory.items = [];

  for (const slot of Object.keys(inventory.equipment) as Array<keyof InventoryState["equipment"]>) {
    const item = inventory.equipment[slot];
    if (item) {
      collected.push(cloneItem(item));
      delete inventory.equipment[slot];
    }
  }

  return collected;
}

function removeInventoryItem(inventory: InventoryState, itemInstanceId: string): InventoryEntry | { item: InventoryItem } | undefined {
  const entryIndex = inventory.items.findIndex((entry) => entry.item.instanceId === itemInstanceId);
  if (entryIndex >= 0) {
    const [entry] = inventory.items.splice(entryIndex, 1);
    return entry;
  }

  for (const slot of Object.keys(inventory.equipment) as Array<keyof InventoryState["equipment"]>) {
    const item = inventory.equipment[slot];
    if (item?.instanceId === itemInstanceId) {
      delete inventory.equipment[slot];
      return { item: cloneItem(item) };
    }
  }

  return undefined;
}

function findFirstFit(inventory: InventoryState, item: InventoryItem): { x: number; y: number } | undefined {
  for (let y = 0; y <= inventory.height - item.height; y += 1) {
    for (let x = 0; x <= inventory.width - item.width; x += 1) {
      if (canPlaceItem(inventory, item, x, y)) {
        return { x, y };
      }
    }
  }

  return undefined;
}

function findFirstFitAtOrAnywhere(
  inventory: InventoryState,
  item: InventoryItem,
  preferredX?: number,
  preferredY?: number
): { x: number; y: number } | undefined {
  if (
    Number.isInteger(preferredX) &&
    Number.isInteger(preferredY) &&
    canPlaceItem(inventory, item, preferredX!, preferredY!)
  ) {
    return { x: preferredX!, y: preferredY! };
  }

  return findFirstFit(inventory, item);
}

function findExactFit(
  inventory: InventoryState,
  item: InventoryItem,
  x: number,
  y: number
): { x: number; y: number } | undefined {
  if (!canPlaceItem(inventory, item, x, y)) {
    return undefined;
  }

  return { x, y };
}

function canPlaceItem(inventory: InventoryState, item: InventoryItem, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x + item.width > inventory.width || y + item.height > inventory.height) {
    return false;
  }

  for (const entry of inventory.items) {
    if (rectanglesOverlap(x, y, item.width, item.height, entry.x, entry.y, entry.item.width, entry.item.height)) {
      return false;
    }
  }

  return true;
}

function rectanglesOverlap(
  x1: number,
  y1: number,
  width1: number,
  height1: number,
  x2: number,
  y2: number,
  width2: number,
  height2: number
): boolean {
  return x1 < x2 + width2 && x1 + width1 > x2 && y1 < y2 + height2 && y1 + height1 > y2;
}

function buildSpreadOffset(radius: number): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * radius;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance
  };
}

function cloneItem(item: InventoryItem): InventoryItem {
  return {
    ...item,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
  };
}

function cloneInventory(inventory: InventoryState): InventoryState {
  const equipment = Object.fromEntries(
    Object.entries(inventory.equipment).map(([slot, item]) => [slot, item ? cloneItem(item) : item])
  ) as InventoryState["equipment"];

  return {
    width: inventory.width,
    height: inventory.height,
    items: inventory.items.map((entry) => ({
      item: cloneItem(entry.item),
      x: entry.x,
      y: entry.y
    })),
    equipment
  };
}

function removeInventorySource(
  inventory: InventoryState,
  itemInstanceId: string
): { area: "grid" | "equipment"; item: InventoryItem; entry?: InventoryEntry } | undefined {
  const entryIndex = inventory.items.findIndex((entry) => entry.item.instanceId === itemInstanceId);
  if (entryIndex >= 0) {
    const [entry] = inventory.items.splice(entryIndex, 1);
    return {
      area: "grid",
      item: cloneItem(entry.item),
      entry
    };
  }

  for (const slot of Object.keys(inventory.equipment) as Array<keyof InventoryState["equipment"]>) {
    const item = inventory.equipment[slot];
    if (item?.instanceId === itemInstanceId) {
      delete inventory.equipment[slot];
      return {
        area: "equipment",
        item: cloneItem(item)
      };
    }
  }

  return undefined;
}

function restoreInventorySource(
  inventory: InventoryState,
  source: { area: "grid" | "equipment"; item: InventoryItem; entry?: InventoryEntry }
): void {
  if (source.area === "grid" && source.entry) {
    inventory.items.push({
      item: cloneItem(source.item),
      x: source.entry.x,
      y: source.entry.y
    });
    return;
  }

  if (source.item.equipmentSlot) {
    inventory.equipment[source.item.equipmentSlot] = cloneItem(source.item);
  }
}

export function createEmptyInventory(
  width = LOADOUT_INVENTORY_WIDTH,
  height = LOADOUT_INVENTORY_HEIGHT
): InventoryState {
  return {
    width,
    height,
    items: [],
    equipment: {}
  };
}

export function cloneInventoryState(inventory: InventoryState): InventoryState {
  return cloneInventory(inventory);
}

export function summarizeInventory(inventory: InventoryState): {
  gold: number;
  treasureValue: number;
  totalItemCount: number;
} {
  const items = [
    ...inventory.items.map((entry) => entry.item),
    ...Object.values(inventory.equipment).filter((item): item is InventoryItem => Boolean(item))
  ];

  return {
    gold: items.reduce((sum, item) => sum + item.goldValue, 0),
    treasureValue: items.reduce((sum, item) => sum + item.treasureValue, 0),
    totalItemCount: items.length
  };
}

function cloneDrop(drop: DropState): DropState {
  return {
    ...drop,
    item: cloneItem(drop.item)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

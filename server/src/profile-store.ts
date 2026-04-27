import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { EquipmentState, InventoryState as SharedInventoryState, PagedInventoryState, PendingReturnPayload } from "../../shared/dist/types/inventory.js";
import type { PlayerProfilePayload } from "../../shared/dist/types/lobby.js";
import type { SettlementPayload } from "../../shared/dist/types/game.js";
import { LOADOUT_INVENTORY_HEIGHT, LOADOUT_INVENTORY_WIDTH, STASH_PAGE_COUNT, STASH_PAGE_HEIGHT, STASH_PAGE_WIDTH } from "./internal-constants.js";
import { cloneInventoryState, createEmptyInventory } from "./inventory/service.js";
import type {
  InventoryEntry,
  InventoryItem,
  InventoryState,
  PersistedPlayerProfile,
  PlayerMoveInventoryItemPayload,
  ProfileStore,
  RuntimeRoom,
  StashState
} from "./types.js";

interface PersistedProfileRow {
  profile_id: string;
  player_name: string;
  inventory_json: string;
  last_settlement_json: string | null;
}

interface StoredProfileState {
  loadout?: InventoryState;
  stash?: StashState;
  pendingReturn?: InventoryItem[];
}

interface ProfileSourceDescriptor {
  area: "loadout-grid" | "loadout-equipment" | "stash" | "pending-return";
  item: InventoryItem;
  entry?: InventoryEntry;
  slot?: keyof InventoryState["equipment"];
  pageIndex?: number;
}

export class SqliteProfileStore implements ProfileStore {
  private readonly db: DatabaseSync;

  constructor(private readonly databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        profile_id TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        inventory_json TEXT NOT NULL,
        last_settlement_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  }

  ensureProfile(profileId: string, playerName: string): PersistedPlayerProfile {
    const existing = this.readProfile(profileId);
    if (existing) {
      if (playerName.trim()) {
        existing.playerName = playerName.trim();
        this.writeProfile(existing);
      }
      return existing;
    }

    const created = createDefaultProfile(profileId, playerName);
    this.writeProfile(created);
    return created;
  }

  updatePlayerName(profileId: string, playerName: string): PersistedPlayerProfile {
    const profile = this.ensureProfile(profileId, playerName);
    if (playerName.trim()) {
      profile.playerName = playerName.trim();
      this.writeProfile(profile);
    }
    return profile;
  }

  getProfile(profileId: string): PersistedPlayerProfile | undefined {
    return this.readProfile(profileId);
  }

  equipItem(profileId: string, playerName: string, itemInstanceId: string): PersistedPlayerProfile {
    return this.moveItem(profileId, playerName, {
      itemInstanceId,
      targetArea: "equipment"
    });
  }

  unequipItem(profileId: string, playerName: string, itemInstanceId: string): PersistedPlayerProfile {
    return this.moveItem(profileId, playerName, {
      itemInstanceId,
      targetArea: "grid"
    });
  }

  moveItem(profileId: string, playerName: string, payload: PlayerMoveInventoryItemPayload): PersistedPlayerProfile {
    const profile = this.ensureProfile(profileId, playerName);
    profile.playerName = playerName.trim() || profile.playerName;

    const loadout = cloneInventoryState(profile.loadout);
    const stash = cloneStashState(profile.stash);
    const pendingReturn = clonePendingReturn(profile.pendingReturn);
    const source = removeProfileSource(loadout, stash, pendingReturn, payload.itemInstanceId);
    if (!source) {
      throw new Error("Item not found in profile storage.");
    }

    try {
      switch (payload.targetArea) {
        case "equipment":
          placeIntoLoadoutEquipment(loadout, source, payload.slot);
          break;
        case "grid":
          placeIntoLoadoutGrid(loadout, source, payload.x, payload.y);
          break;
        case "stash":
          placeIntoStash(stash, source, payload.pageIndex, payload.x, payload.y);
          break;
        case "discard":
          break;
        default:
          throw new Error("Unsupported profile move target.");
      }
    } catch (error) {
      restoreProfileSource(loadout, stash, pendingReturn, source);
      throw error;
    }

    profile.loadout = loadout;
    profile.stash = stash;
    profile.pendingReturn = pendingReturn;
    this.writeProfile(profile);
    return profile;
  }

  saveSettlement(room: RuntimeRoom, playerId: string, settlement: SettlementPayload): PersistedPlayerProfile | undefined {
    const player = room.players.get(playerId);
    if (!player) {
      return undefined;
    }

    const profile = this.ensureProfile(player.profileId, player.name);
    profile.playerName = player.name;
    profile.lastSettlement = { ...settlement };

    if (settlement.result === "success" && player.inventory) {
      const { loadout, lootItems } = splitExtractedInventory(player.inventory, player.startingLoadoutItemIds ?? []);
      const stash = cloneStashState(profile.stash);
      const pendingReturn: InventoryItem[] = [];

      for (const item of lootItems) {
        if (!placeItemIntoFirstStashFit(stash, item)) {
          pendingReturn.push(cloneInventoryItem(item));
        }
      }

      profile.loadout = loadout;
      profile.stash = stash;
      profile.pendingReturn = pendingReturn;
    } else {
      profile.loadout = createEmptyInventory();
      profile.pendingReturn = [];
    }

    this.writeProfile(profile);
    return profile;
  }

  toPayload(profile: PersistedPlayerProfile): PlayerProfilePayload {
    const summary = summarizeProfile(profile);
    return {
      profileId: profile.profileId,
      playerName: profile.playerName,
      inventory: toSharedInventory(profile.loadout),
      equipment: toSharedEquipment(profile.loadout),
      stash: toSharedStash(profile.stash),
      pendingReturn: profile.pendingReturn.length > 0 ? toPendingReturn(profile.pendingReturn) : undefined,
      stashGold: summary.gold,
      stashTreasureValue: summary.treasureValue,
      totalItemCount: summary.totalItemCount,
      lastSettlement: profile.lastSettlement ? { ...profile.lastSettlement } : undefined
    };
  }

  private readProfile(profileId: string): PersistedPlayerProfile | undefined {
    const row = this.db
      .prepare("SELECT profile_id, player_name, inventory_json, last_settlement_json FROM profiles WHERE profile_id = ?")
      .get(profileId) as PersistedProfileRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      profileId: row.profile_id,
      playerName: row.player_name,
      ...deserializeProfileState(row.profile_id, row.player_name, row.inventory_json),
      lastSettlement: deserializeSettlement(row.last_settlement_json)
    };
  }

  private writeProfile(profile: PersistedPlayerProfile): void {
    const stored: StoredProfileState = {
      loadout: profile.loadout,
      stash: profile.stash,
      pendingReturn: profile.pendingReturn
    };

    this.db.prepare(`
      INSERT INTO profiles (profile_id, player_name, inventory_json, last_settlement_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(profile_id) DO UPDATE SET
        player_name = excluded.player_name,
        inventory_json = excluded.inventory_json,
        last_settlement_json = excluded.last_settlement_json,
        updated_at = unixepoch()
    `).run(
      profile.profileId,
      profile.playerName,
      JSON.stringify(stored),
      profile.lastSettlement ? JSON.stringify(profile.lastSettlement) : null
    );
  }
}

function createDefaultProfile(profileId: string, playerName: string): PersistedPlayerProfile {
  return {
    profileId,
    playerName: playerName.trim() || "Player",
    loadout: createEmptyInventory(),
    stash: createEmptyStash(),
    pendingReturn: []
  };
}

function deserializeProfileState(
  profileId: string,
  playerName: string,
  payload: string
): Pick<PersistedPlayerProfile, "loadout" | "stash" | "pendingReturn"> {
  try {
    const parsed = JSON.parse(payload) as StoredProfileState | Partial<InventoryState> | undefined;
    if (parsed && typeof parsed === "object" && ("loadout" in parsed || "stash" in parsed || "pendingReturn" in parsed)) {
      return {
        loadout: sanitizeInventoryState((parsed as StoredProfileState).loadout, LOADOUT_INVENTORY_WIDTH, LOADOUT_INVENTORY_HEIGHT),
        stash: sanitizeStashState((parsed as StoredProfileState).stash),
        pendingReturn: sanitizePendingReturn((parsed as StoredProfileState).pendingReturn)
      };
    }

    return {
      loadout: sanitizeInventoryState(parsed as Partial<InventoryState> | undefined, LOADOUT_INVENTORY_WIDTH, LOADOUT_INVENTORY_HEIGHT),
      stash: createEmptyStash(),
      pendingReturn: []
    };
  } catch {
    const created = createDefaultProfile(profileId, playerName);
    return {
      loadout: created.loadout,
      stash: created.stash,
      pendingReturn: created.pendingReturn
    };
  }
}

function deserializeSettlement(payload: string | null): SettlementPayload | undefined {
  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(payload) as SettlementPayload;
  } catch {
    return undefined;
  }
}

function sanitizeStashState(payload: unknown): StashState {
  const base = createEmptyStash();
  if (!payload || typeof payload !== "object") {
    return base;
  }

  const candidate = payload as Partial<StashState>;
  const width = clampPositiveInteger(candidate.width, STASH_PAGE_WIDTH);
  const height = clampPositiveInteger(candidate.height, STASH_PAGE_HEIGHT);
  const rawPages = Array.isArray(candidate.pages) ? candidate.pages : [];
  const pages: InventoryState[] = [];

  for (let index = 0; index < STASH_PAGE_COUNT; index += 1) {
    pages.push(sanitizeInventoryState(rawPages[index], width, height));
  }

  return {
    width,
    height,
    pages
  };
}

function sanitizeInventoryState(payload: unknown, defaultWidth: number, defaultHeight: number): InventoryState {
  const base = createEmptyInventory(defaultWidth, defaultHeight);
  if (!payload || typeof payload !== "object") {
    return base;
  }

  const candidate = payload as Partial<InventoryState>;
  const width = clampPositiveInteger(candidate.width, defaultWidth);
  const height = clampPositiveInteger(candidate.height, defaultHeight);
  const equipment = sanitizeEquipmentState(candidate.equipment);
  const items = Array.isArray(candidate.items)
    ? candidate.items
        .map((entry) => sanitizeInventoryEntry(entry))
        .filter((entry): entry is InventoryEntry => Boolean(entry))
    : [];

  return { width, height, items, equipment };
}

function sanitizePendingReturn(payload: unknown): InventoryItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => (isInventoryItem(item) ? cloneInventoryItem(item) : undefined))
    .filter((item): item is InventoryItem => Boolean(item));
}

function sanitizeEquipmentState(payload: unknown): InventoryState["equipment"] {
  const equipment = {} as InventoryState["equipment"];
  if (!payload || typeof payload !== "object") {
    return equipment;
  }

  for (const [slot, item] of Object.entries(payload)) {
    if (isEquipmentSlot(slot) && isInventoryItem(item)) {
      equipment[slot] = cloneInventoryItem(item);
    }
  }

  return equipment;
}

function sanitizeInventoryEntry(entry: unknown): InventoryEntry | undefined {
  if (!entry || typeof entry !== "object") {
    return undefined;
  }

  const candidate = entry as Partial<InventoryEntry>;
  if (!isInventoryItem(candidate.item)) {
    return undefined;
  }

  const x = typeof candidate.x === "number" && Number.isInteger(candidate.x) ? candidate.x : 0;
  const y = typeof candidate.y === "number" && Number.isInteger(candidate.y) ? candidate.y : 0;
  return {
    item: cloneInventoryItem(candidate.item),
    x,
    y
  };
}

function isInventoryItem(value: unknown): value is InventoryItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<InventoryItem>;
  return typeof candidate.instanceId === "string" && typeof candidate.templateId === "string";
}

function isEquipmentSlot(value: string): value is keyof InventoryState["equipment"] {
  return value === "weapon" || value === "head" || value === "chest" || value === "hands" || value === "shoes";
}

function clampPositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function createEmptyStash(): StashState {
  return {
    width: STASH_PAGE_WIDTH,
    height: STASH_PAGE_HEIGHT,
    pages: Array.from({ length: STASH_PAGE_COUNT }, () => createEmptyInventory(STASH_PAGE_WIDTH, STASH_PAGE_HEIGHT))
  };
}

function cloneStashState(stash: StashState): StashState {
  return {
    width: stash.width,
    height: stash.height,
    pages: stash.pages.map((page) => cloneInventoryState(page))
  };
}

function clonePendingReturn(items: InventoryItem[]): InventoryItem[] {
  return items.map((item) => cloneInventoryItem(item));
}

function cloneInventoryItem(item: InventoryItem): InventoryItem {
  return {
    ...item,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: (item.affixes ?? []).map((affix) => ({ ...affix }))
  };
}

function toSharedInventory(inventory: InventoryState): SharedInventoryState {
  return {
    width: inventory.width,
    height: inventory.height,
    items: inventory.items.map((entry) => ({
      ...toSharedItemInstance(entry.item),
      x: entry.x,
      y: entry.y
    }))
  };
}

function toSharedEquipment(inventory: InventoryState): EquipmentState {
  return Object.fromEntries(
    Object.entries(inventory.equipment)
      .filter(([, item]) => Boolean(item))
      .map(([slot, item]) => [slot, toSharedItemInstance(item!)])
  ) as EquipmentState;
}

function toSharedStash(stash: StashState): PagedInventoryState {
  return {
    width: stash.width,
    height: stash.height,
    pages: stash.pages.map((page) => ({
      width: page.width,
      height: page.height,
      items: page.items.map((entry) => ({
        ...toSharedItemInstance(entry.item),
        x: entry.x,
        y: entry.y
      }))
    }))
  };
}

function toPendingReturn(items: InventoryItem[]): PendingReturnPayload {
  return {
    items: items.map((item) => toSharedItemInstance(item))
  };
}

function toSharedItemInstance(item: InventoryItem) {
  return {
    definitionId: item.templateId,
    instanceId: item.instanceId,
    name: item.name,
    rarity: item.rarity,
    kind: mapSharedItemCategory(item.kind),
    width: item.width,
    height: item.height,
    equipmentSlot: item.equipmentSlot,
    weaponType: item.weaponType,
    goldValue: item.goldValue,
    treasureValue: item.treasureValue,
    healAmount: item.healAmount,
    affixes: item.affixes.map((affix) => ({ ...affix })),
    modifiers: item.modifiers ? { ...item.modifiers } : undefined
  };
}

function mapSharedItemCategory(kind: InventoryItem["kind"]): "weapon" | "armor" | "gold" | "treasure" | "consumable" {
  switch (kind) {
    case "equipment":
      return "armor";
    case "currency":
      return "gold";
    case "weapon":
    case "treasure":
    case "consumable":
      return kind;
  }
}

function summarizeProfile(profile: PersistedPlayerProfile): { gold: number; treasureValue: number; totalItemCount: number } {
  const allItems: InventoryItem[] = [
    ...profile.loadout.items.map((entry) => entry.item),
    ...Object.values(profile.loadout.equipment).filter((item): item is InventoryItem => Boolean(item)),
    ...profile.stash.pages.flatMap((page) => page.items.map((entry) => entry.item)),
    ...profile.pendingReturn
  ];

  return {
    gold: allItems.reduce((sum, item) => sum + item.goldValue, 0),
    treasureValue: allItems.reduce((sum, item) => sum + item.treasureValue, 0),
    totalItemCount: allItems.length
  };
}

function removeProfileSource(
  loadout: InventoryState,
  stash: StashState,
  pendingReturn: InventoryItem[],
  itemInstanceId: string
): ProfileSourceDescriptor | undefined {
  const loadoutGridIndex = loadout.items.findIndex((entry) => entry.item.instanceId === itemInstanceId);
  if (loadoutGridIndex >= 0) {
    const [entry] = loadout.items.splice(loadoutGridIndex, 1);
    return {
      area: "loadout-grid",
      item: cloneInventoryItem(entry.item),
      entry
    };
  }

  for (const slot of Object.keys(loadout.equipment) as Array<keyof InventoryState["equipment"]>) {
    const item = loadout.equipment[slot];
    if (item?.instanceId === itemInstanceId) {
      delete loadout.equipment[slot];
      return {
        area: "loadout-equipment",
        item: cloneInventoryItem(item),
        slot
      };
    }
  }

  for (let pageIndex = 0; pageIndex < stash.pages.length; pageIndex += 1) {
    const page = stash.pages[pageIndex];
    const entryIndex = page.items.findIndex((entry) => entry.item.instanceId === itemInstanceId);
    if (entryIndex >= 0) {
      const [entry] = page.items.splice(entryIndex, 1);
      return {
        area: "stash",
        item: cloneInventoryItem(entry.item),
        entry,
        pageIndex
      };
    }
  }

  const pendingIndex = pendingReturn.findIndex((item) => item.instanceId === itemInstanceId);
  if (pendingIndex >= 0) {
    const [item] = pendingReturn.splice(pendingIndex, 1);
    return {
      area: "pending-return",
      item: cloneInventoryItem(item)
    };
  }

  return undefined;
}

function restoreProfileSource(
  loadout: InventoryState,
  stash: StashState,
  pendingReturn: InventoryItem[],
  source: ProfileSourceDescriptor
): void {
  switch (source.area) {
    case "loadout-grid":
      loadout.items.push({
        item: cloneInventoryItem(source.item),
        x: source.entry?.x ?? 0,
        y: source.entry?.y ?? 0
      });
      break;
    case "loadout-equipment":
      if (source.slot) {
        loadout.equipment[source.slot] = cloneInventoryItem(source.item);
      } else if (source.item.equipmentSlot) {
        loadout.equipment[source.item.equipmentSlot] = cloneInventoryItem(source.item);
      }
      break;
    case "stash": {
      const page = stash.pages[source.pageIndex ?? 0] ?? stash.pages[0];
      page.items.push({
        item: cloneInventoryItem(source.item),
        x: source.entry?.x ?? 0,
        y: source.entry?.y ?? 0
      });
      break;
    }
    case "pending-return":
      pendingReturn.push(cloneInventoryItem(source.item));
      break;
  }
}

function placeIntoLoadoutEquipment(
  loadout: InventoryState,
  source: ProfileSourceDescriptor,
  requestedSlot?: keyof InventoryState["equipment"]
): void {
  const slot = requestedSlot ?? source.item.equipmentSlot;
  if (!slot || source.item.equipmentSlot !== slot) {
    throw new Error("Item cannot be equipped in the selected slot.");
  }

  const previousEquipped = loadout.equipment[slot];
  if (previousEquipped) {
    const swapPlacement = source.area === "loadout-grid" && source.entry
      ? findFirstFitAtOrAnywhere(loadout, previousEquipped, source.entry.x, source.entry.y)
      : findFirstFit(loadout, previousEquipped);
    if (!swapPlacement) {
      throw new Error("Need free loadout backpack space to swap equipment.");
    }

    loadout.items.push({
      item: cloneInventoryItem(previousEquipped),
      x: swapPlacement.x,
      y: swapPlacement.y
    });
  }

  loadout.equipment[slot] = cloneInventoryItem(source.item);
}

function placeIntoLoadoutGrid(
  loadout: InventoryState,
  source: ProfileSourceDescriptor,
  x?: number,
  y?: number
): void {
  const hasExplicitTarget = Number.isInteger(x) && Number.isInteger(y);
  const placement = hasExplicitTarget
    ? findExactFit(loadout, source.item, x!, y!)
    : findFirstFitAtOrAnywhere(loadout, source.item, source.entry?.x, source.entry?.y);
  if (!placement) {
    throw new Error("Target position is blocked.");
  }

  loadout.items.push({
    item: cloneInventoryItem(source.item),
    x: placement.x,
    y: placement.y
  });
}

function placeIntoStash(
  stash: StashState,
  source: ProfileSourceDescriptor,
  pageIndex?: number,
  x?: number,
  y?: number
): void {
  if (Number.isInteger(pageIndex)) {
    const page = stash.pages[pageIndex!];
    if (!page) {
      throw new Error("Target stash page does not exist.");
    }

    const hasExplicitTarget = Number.isInteger(x) && Number.isInteger(y);
    const placement = hasExplicitTarget
      ? findExactFit(page, source.item, x!, y!)
      : findFirstFitAtOrAnywhere(page, source.item, source.entry?.x, source.entry?.y);
    if (!placement) {
      throw new Error("Target stash position is blocked.");
    }

    page.items.push({
      item: cloneInventoryItem(source.item),
      x: placement.x,
      y: placement.y
    });
    return;
  }

  if (!placeItemIntoFirstStashFit(stash, source.item)) {
    throw new Error("Stash is full.");
  }
}

function placeItemIntoFirstStashFit(stash: StashState, item: InventoryItem): boolean {
  for (const page of stash.pages) {
    const placement = findFirstFit(page, item);
    if (!placement) {
      continue;
    }

    page.items.push({
      item: cloneInventoryItem(item),
      x: placement.x,
      y: placement.y
    });
    return true;
  }

  return false;
}

function splitExtractedInventory(
  inventory: InventoryState,
  startingLoadoutItemIds: string[]
): { loadout: InventoryState; lootItems: InventoryItem[] } {
  const keepIds = new Set(startingLoadoutItemIds);
  const loadout = createEmptyInventory(inventory.width, inventory.height);
  const lootItems: InventoryItem[] = [];

  for (const entry of inventory.items) {
    if (keepIds.has(entry.item.instanceId)) {
      loadout.items.push({
        item: cloneInventoryItem(entry.item),
        x: entry.x,
        y: entry.y
      });
    } else {
      lootItems.push(cloneInventoryItem(entry.item));
    }
  }

  for (const [slot, item] of Object.entries(inventory.equipment) as Array<[keyof InventoryState["equipment"], InventoryItem | undefined]>) {
    if (!item) {
      continue;
    }

    if (keepIds.has(item.instanceId)) {
      loadout.equipment[slot] = cloneInventoryItem(item);
    } else {
      lootItems.push(cloneInventoryItem(item));
    }
  }

  return { loadout, lootItems };
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

function findExactFit(inventory: InventoryState, item: InventoryItem, x: number, y: number): { x: number; y: number } | undefined {
  return canPlaceItem(inventory, item, x, y) ? { x, y } : undefined;
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

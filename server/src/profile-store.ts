import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  BotDifficulty,
  EquipmentSlot,
  InventoryItemInstance,
  InventoryPlacedItem,
  InventorySnapshotPayload,
  InventoryState as ProfileInventoryState,
  ProfileMovePayload,
  ProfilePatchPayload,
  ProfileSnapshot,
  ProfileRunSummary,
  SettlementPayload
} from "@gamer/shared";
import { canPlaceRect, findFirstFitRect, INVENTORY_HEIGHT, INVENTORY_WIDTH, resolveEquipmentSlot as resolveSharedEquipmentSlot } from "@gamer/shared";
import type { InventoryItem, InventoryState as RuntimeInventoryState } from "./types.js";
import { getItemTemplate } from "./inventory/catalog.js";

const PROFILE_VERSION = 1;
const STASH_WIDTH = 10;
const STASH_HEIGHT = 8;
const STASH_PAGE_COUNT = 5;
const DEFAULT_DATA_FILE = path.resolve(process.cwd(), "server/data/profiles.json");

type ItemSource =
  | { area: "pending"; item: InventoryItemInstance }
  | { area: "grid"; item: InventoryItemInstance }
  | { area: "equipment"; item: InventoryItemInstance; slot: EquipmentSlot }
  | { area: "stash"; item: InventoryItemInstance; pageIndex: number };

export class ProfileStore {
  private readonly profiles = new Map<string, ProfileSnapshot>();

  constructor(private readonly filePath = process.env.PROFILE_STORE_PATH ?? DEFAULT_DATA_FILE) {
    this.load();
  }

  get(profileId: string, displayName?: string): ProfileSnapshot {
    const id = normalizeProfileId(profileId);
    const existing = this.profiles.get(id);
    if (existing) {
      return cloneProfile(existing);
    }

    const created = createDefaultProfile(id, displayName);
    this.profiles.set(id, created);
    this.save();
    return cloneProfile(created);
  }

  patch(profileId: string, payload: ProfilePatchPayload): ProfileSnapshot {
    const profile = this.getMutable(profileId);
    if (payload.displayName != null) {
      profile.displayName = sanitizeDisplayName(payload.displayName);
    }
    if (payload.gold != null) {
      profile.gold = normalizeGold(payload.gold);
    }
    if (payload.botDifficulty != null) {
      profile.botDifficulty = normalizeBotDifficulty(payload.botDifficulty);
    }
    profile.version += 1;
    this.save();
    return cloneProfile(profile);
  }

  move(profileId: string, payload: ProfileMovePayload): ProfileSnapshot {
    const profile = this.getMutable(profileId);
    const source = removeProfileItem(profile, payload.itemInstanceId);
    if (!source) {
      throw new Error("Item not found in profile.");
    }

    if (payload.targetArea === "discard") {
      profile.version += 1;
      this.save();
      return cloneProfile(profile);
    }

    const item = stripGridPosition(source.item);
    if (payload.targetArea === "equipment") {
      const slot = payload.slot ?? inferEquipmentSlot(item);
      if (!slot) {
        restoreProfileItem(profile, source);
        throw new Error("Item cannot be equipped.");
      }

      const previous = profile.equipment[slot];
      profile.equipment[slot] = item;
      if (previous && !placeInGrid(profile.inventory, previous)) {
        profile.equipment[slot] = previous;
        restoreProfileItem(profile, source);
        throw new Error("Inventory is full.");
      }
    } else if (payload.targetArea === "grid") {
      if (!placeInGrid(profile.inventory, item, payload.x, payload.y)) {
        restoreProfileItem(profile, source);
        throw new Error("Inventory is full.");
      }
    } else {
      const pageIndex = clamp(payload.pageIndex ?? 0, 0, profile.stash.pages.length - 1);
      if (!placeInGrid(profile.stash.pages[pageIndex], item, payload.x, payload.y)) {
        restoreProfileItem(profile, source);
        throw new Error("Stash page is full.");
      }
    }

    profile.version += 1;
    this.save();
    return cloneProfile(profile);
  }

  buildLoadout(profileId: string, displayName?: string): InventorySnapshotPayload {
    const profile = this.get(profileId, displayName);
    return {
      inventory: cloneInventory(profile.inventory),
      equipment: cloneEquipment(profile.equipment)
    };
  }

  settleRun(profileId: string, settlement: SettlementPayload, runtimeInventory?: RuntimeInventoryState): ProfileSnapshot {
    const profile = this.getMutable(profileId);
    const items = runtimeInventory ? collectRuntimeItems(runtimeInventory) : [];
    const goldDelta = settlement.profileGoldDelta ?? 0;
    profile.gold = Math.max(0, profile.gold + goldDelta);
    profile.inventory = createEmptyInventory(INVENTORY_WIDTH, INVENTORY_HEIGHT);
    profile.equipment = {};

    if (settlement.result === "success") {
      const overflow: InventoryItemInstance[] = [];
      for (const item of items) {
        if (!placeInAnyStashPage(profile, item)) {
          overflow.push(stripGridPosition(item));
        }
      }
      profile.pendingReturn = overflow.length > 0 ? { items: overflow } : null;
    } else {
      profile.pendingReturn = null;
      ensureStarterWeapon(profile);
    }

    profile.lastRun = buildRunSummary(settlement, goldDelta);
    profile.version += 1;
    this.save();
    return cloneProfile(profile);
  }

  removeItemForMarket(profileId: string, itemInstanceId: string): InventoryItemInstance {
    const profile = this.getMutable(profileId);
    const source = removeProfileItem(profile, itemInstanceId);
    if (!source) {
      throw new Error("Item not found in profile.");
    }
    profile.version += 1;
    this.save();
    return stripGridPosition(source.item);
  }

  returnMarketItem(profileId: string, item: InventoryItemInstance): ProfileSnapshot {
    const profile = this.getMutable(profileId);
    if (!placeInAnyStashPage(profile, item)) {
      profile.pendingReturn = profile.pendingReturn ?? { items: [] };
      profile.pendingReturn.items.push(stripGridPosition(item));
    }
    profile.version += 1;
    this.save();
    return cloneProfile(profile);
  }

  private getMutable(profileId: string): ProfileSnapshot {
    const id = normalizeProfileId(profileId);
    let profile = this.profiles.get(id);
    if (!profile) {
      profile = createDefaultProfile(id);
      this.profiles.set(id, profile);
    }
    return profile;
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.profiles)
          ? parsed.profiles
          : [];
      for (const raw of records) {
        const profile = normalizeProfile(raw);
        this.profiles.set(profile.profileId, profile);
      }
    } catch {
      this.profiles.clear();
    }
  }

  private save(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const profiles = [...this.profiles.values()].map(cloneProfile);
    writeFileSync(this.filePath, JSON.stringify({ profiles }, null, 2), "utf8");
  }
}

function createDefaultProfile(profileId: string, displayName?: string): ProfileSnapshot {
  const profile: ProfileSnapshot = {
    profileId,
    displayName: sanitizeDisplayName(displayName ?? ""),
    gold: 500,
    inventory: createEmptyInventory(INVENTORY_WIDTH, INVENTORY_HEIGHT),
    equipment: {},
    stash: {
      width: STASH_WIDTH,
      height: STASH_HEIGHT,
      pages: Array.from({ length: STASH_PAGE_COUNT }, () => createEmptyInventory(STASH_WIDTH, STASH_HEIGHT))
    },
    pendingReturn: null,
    lastRun: null,
    botDifficulty: "normal",
    version: PROFILE_VERSION
  };
  ensureStarterWeapon(profile);
  return profile;
}

function normalizeProfile(raw: unknown): ProfileSnapshot {
  const record = isRecord(raw) ? raw : {};
  const profile = createDefaultProfile(
    typeof record.profileId === "string" ? record.profileId : `profile-${crypto.randomUUID()}`,
    typeof record.displayName === "string" ? record.displayName : ""
  );
  profile.gold = normalizeGold(record.gold);
  profile.inventory = normalizeInventory(record.inventory, INVENTORY_WIDTH, INVENTORY_HEIGHT);
  profile.equipment = normalizeEquipment(record.equipment);
  profile.stash = normalizeStash(record.stash);
  profile.pendingReturn = normalizePendingReturn(record.pendingReturn);
  profile.lastRun = normalizeLastRun(record.lastRun);
  profile.botDifficulty = normalizeBotDifficulty(record.botDifficulty);
  profile.version = typeof record.version === "number" && Number.isFinite(record.version)
    ? Math.max(PROFILE_VERSION, Math.floor(record.version))
    : PROFILE_VERSION;
  if (!profile.equipment.weapon) {
    ensureStarterWeapon(profile);
  }
  return profile;
}

function normalizeInventory(raw: unknown, fallbackWidth: number, fallbackHeight: number): ProfileInventoryState {
  const record = isRecord(raw) ? raw : {};
  const inventory = createEmptyInventory(
    normalizePositiveInt(record.width, fallbackWidth),
    normalizePositiveInt(record.height, fallbackHeight)
  );
  const items = Array.isArray(record.items) ? record.items : [];
  for (const rawItem of items) {
    const item = normalizePlacedItem(rawItem);
    if (item && canPlaceAt(inventory, item, item.x, item.y)) {
      inventory.items.push(item);
    }
  }
  return inventory;
}

function normalizeEquipment(raw: unknown): ProfileSnapshot["equipment"] {
  if (!isRecord(raw)) {
    return {};
  }
  const equipment: ProfileSnapshot["equipment"] = {};
  for (const [slot, rawItem] of Object.entries(raw)) {
    const normalizedSlot = normalizeEquipmentSlot(slot);
    const item = normalizeItem(rawItem);
    if (normalizedSlot && item) {
      equipment[normalizedSlot] = item;
    }
  }
  return equipment;
}

function normalizeStash(raw: unknown): ProfileSnapshot["stash"] {
  const record = isRecord(raw) ? raw : {};
  const width = normalizePositiveInt(record.width, STASH_WIDTH);
  const height = normalizePositiveInt(record.height, STASH_HEIGHT);
  const rawPages = Array.isArray(record.pages) ? record.pages : [];
  const pages = rawPages.map((page) => normalizeInventory(page, width, height));
  while (pages.length < STASH_PAGE_COUNT) {
    pages.push(createEmptyInventory(width, height));
  }
  return {
    width,
    height,
    pages: pages.slice(0, STASH_PAGE_COUNT)
  };
}

function normalizePendingReturn(raw: unknown): ProfileSnapshot["pendingReturn"] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return null;
  }
  const items = raw.items.map(normalizeItem).filter((item): item is InventoryItemInstance => Boolean(item));
  return items.length > 0 ? { items } : null;
}

function normalizeLastRun(raw: unknown): ProfileRunSummary | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    result: raw.result === "success" ? "success" : "failure",
    reason: typeof raw.reason === "string" ? raw.reason as ProfileRunSummary["reason"] : undefined,
    survivedSeconds: normalizeNonNegativeInt(raw.survivedSeconds, 0),
    playerKills: normalizeNonNegativeInt(raw.playerKills, 0),
    monsterKills: normalizeNonNegativeInt(raw.monsterKills, 0),
    goldDelta: typeof raw.goldDelta === "number" && Number.isFinite(raw.goldDelta) ? Math.floor(raw.goldDelta) : 0,
    items: Array.isArray(raw.items) ? raw.items.map(String).filter(Boolean) : []
  };
}

function normalizePlacedItem(raw: unknown): InventoryPlacedItem | null {
  const item = normalizeItem(raw);
  if (!item || !isRecord(raw)) {
    return null;
  }
  return {
    ...item,
    x: normalizeNonNegativeInt(raw.x, 0),
    y: normalizeNonNegativeInt(raw.y, 0)
  };
}

function normalizeItem(raw: unknown): InventoryItemInstance | null {
  if (!isRecord(raw)) {
    return null;
  }
  const definitionId = typeof raw.definitionId === "string" && raw.definitionId.trim()
    ? raw.definitionId
    : typeof raw.templateId === "string" && raw.templateId.trim()
      ? raw.templateId
      : "";
  if (!definitionId) {
    return null;
  }
  const template = safeTemplate(definitionId);
  return {
    instanceId: typeof raw.instanceId === "string" && raw.instanceId.trim() ? raw.instanceId : crypto.randomUUID(),
    definitionId: template?.templateId ?? definitionId,
    kind: normalizeItemKind(raw.kind, template),
    rarity: normalizeItemRarity(raw.rarity, template),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : template?.name,
    healAmount: typeof raw.healAmount === "number" && Number.isFinite(raw.healAmount) ? raw.healAmount : template?.healAmount,
    modifiers: isRecord(raw.modifiers) ? normalizeModifiers(raw.modifiers) : template?.modifiers ? { ...template.modifiers } : undefined,
    affixes: Array.isArray(raw.affixes)
      ? raw.affixes.flatMap((affix) => isRecord(affix) && typeof affix.key === "string" && typeof affix.value === "number"
        ? [{ key: affix.key as any, value: affix.value }]
        : [])
      : undefined
  };
}

function createStarterWeapon(): InventoryItemInstance {
  return {
    instanceId: `starter-${crypto.randomUUID()}`,
    definitionId: "weapon_sword_basic",
    kind: "weapon",
    rarity: "common",
    name: safeTemplate("weapon_sword_basic")?.name ?? "锈蚀长剑"
  };
}

function ensureStarterWeapon(profile: ProfileSnapshot): void {
  if (!profile.equipment.weapon) {
    profile.equipment.weapon = createStarterWeapon();
  }
}

function collectRuntimeItems(inventory: RuntimeInventoryState): InventoryItemInstance[] {
  return [
    ...inventory.items.map((entry) => runtimeItemToProfileItem(entry.item)),
    ...Object.values(inventory.equipment)
      .filter((item): item is InventoryItem => Boolean(item))
      .map(runtimeItemToProfileItem)
  ];
}

function runtimeItemToProfileItem(item: InventoryItem): InventoryItemInstance {
  return {
    instanceId: item.instanceId,
    definitionId: item.templateId,
    kind: item.kind === "equipment" ? "armor" : item.kind === "currency" ? "gold" : item.kind,
    rarity: item.rarity,
    name: item.name,
    healAmount: item.healAmount,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: item.affixes.map((affix) => ({ ...affix }))
  };
}

function buildRunSummary(settlement: SettlementPayload, goldDelta: number): ProfileRunSummary {
  return {
    result: settlement.result,
    reason: settlement.reason,
    survivedSeconds: settlement.survivedSeconds,
    playerKills: settlement.playerKills,
    monsterKills: settlement.monsterKills,
    goldDelta,
    items: settlement.result === "success" ? settlement.extractedItems : settlement.lostItems
  };
}

function removeProfileItem(profile: ProfileSnapshot, itemInstanceId: string): ItemSource | undefined {
  const pendingIndex = profile.pendingReturn?.items.findIndex((item) => item.instanceId === itemInstanceId) ?? -1;
  if (pendingIndex >= 0 && profile.pendingReturn) {
    const [item] = profile.pendingReturn.items.splice(pendingIndex, 1);
    if (profile.pendingReturn.items.length === 0) {
      profile.pendingReturn = null;
    }
    return { area: "pending", item };
  }

  const gridIndex = profile.inventory.items.findIndex((item) => item.instanceId === itemInstanceId);
  if (gridIndex >= 0) {
    const [item] = profile.inventory.items.splice(gridIndex, 1);
    return { area: "grid", item };
  }

  for (const slot of Object.keys(profile.equipment) as EquipmentSlot[]) {
    const item = profile.equipment[slot];
    if (item?.instanceId === itemInstanceId) {
      delete profile.equipment[slot];
      return { area: "equipment", item, slot };
    }
  }

  for (let pageIndex = 0; pageIndex < profile.stash.pages.length; pageIndex += 1) {
    const page = profile.stash.pages[pageIndex];
    const itemIndex = page.items.findIndex((item) => item.instanceId === itemInstanceId);
    if (itemIndex >= 0) {
      const [item] = page.items.splice(itemIndex, 1);
      return { area: "stash", item, pageIndex };
    }
  }
  return undefined;
}

function restoreProfileItem(profile: ProfileSnapshot, source: ItemSource): void {
  if (source.area === "pending") {
    profile.pendingReturn = profile.pendingReturn ?? { items: [] };
    profile.pendingReturn.items.push(stripGridPosition(source.item));
    return;
  }
  if (source.area === "equipment") {
    profile.equipment[source.slot] = stripGridPosition(source.item);
    return;
  }
  if (source.area === "grid") {
    placeInGrid(profile.inventory, source.item);
    return;
  }
  placeInGrid(profile.stash.pages[source.pageIndex], source.item);
}

function placeInAnyStashPage(profile: ProfileSnapshot, item: InventoryItemInstance): boolean {
  for (const page of profile.stash.pages) {
    if (placeInGrid(page, item)) {
      return true;
    }
  }
  return false;
}

function placeInGrid(grid: ProfileInventoryState, item: InventoryItemInstance, preferredX?: number, preferredY?: number): boolean {
  const size = getItemSize(item);
  const candidate = stripGridPosition(item);
  if (preferredX != null && preferredY != null && canPlaceAt(grid, candidate, preferredX, preferredY)) {
    grid.items.push({ ...candidate, x: preferredX, y: preferredY });
    return true;
  }

  const placement = findFirstFitRect(grid, getGridRects(grid), size);
  if (placement) {
    grid.items.push({ ...candidate, x: placement.x, y: placement.y });
    return true;
  }

  return false;
}

function canPlaceAt(grid: ProfileInventoryState, item: InventoryItemInstance, x: number, y: number): boolean {
  const size = getItemSize(item);
  return canPlaceRect(grid, getGridRects(grid), {
    x,
    y,
    width: size.width,
    height: size.height
  });
}

function getGridRects(grid: ProfileInventoryState): Array<{ x: number; y: number; width: number; height: number }> {
  return grid.items.map((entry) => {
    const size = getItemSize(entry);
    return {
      x: entry.x,
      y: entry.y,
      width: size.width,
      height: size.height
    };
  });
}

function getItemSize(item: InventoryItemInstance): { width: number; height: number } {
  const template = safeTemplate(item.definitionId);
  return {
    width: template?.width ?? 1,
    height: template?.height ?? 1
  };
}

function inferEquipmentSlot(item: InventoryItemInstance): EquipmentSlot | undefined {
  return resolveSharedEquipmentSlot(item) ?? safeTemplate(item.definitionId)?.equipmentSlot;
}

function createEmptyInventory(width: number, height: number): ProfileInventoryState {
  return { width, height, items: [] };
}

function stripGridPosition(item: InventoryItemInstance): InventoryItemInstance {
  const { x: _x, y: _y, ...rest } = item as InventoryItemInstance & { x?: number; y?: number };
  return {
    ...rest,
    modifiers: rest.modifiers ? { ...rest.modifiers } : undefined,
    affixes: rest.affixes ? rest.affixes.map((affix) => ({ ...affix })) : undefined
  };
}

function cloneProfile(profile: ProfileSnapshot): ProfileSnapshot {
  return {
    ...profile,
    inventory: cloneInventory(profile.inventory),
    equipment: cloneEquipment(profile.equipment),
    stash: {
      width: profile.stash.width,
      height: profile.stash.height,
      pages: profile.stash.pages.map(cloneInventory)
    },
    pendingReturn: profile.pendingReturn
      ? { items: profile.pendingReturn.items.map(stripGridPosition) }
      : null,
    lastRun: profile.lastRun ? { ...profile.lastRun, items: [...profile.lastRun.items] } : null
  };
}

function cloneInventory(inventory: ProfileInventoryState): ProfileInventoryState {
  return {
    width: inventory.width,
    height: inventory.height,
    items: inventory.items.map((item) => ({
      ...stripGridPosition(item),
      x: item.x,
      y: item.y
    }))
  };
}

function cloneEquipment(equipment: ProfileSnapshot["equipment"]): ProfileSnapshot["equipment"] {
  return Object.fromEntries(
    Object.entries(equipment).flatMap(([slot, item]) => item ? [[slot, stripGridPosition(item)]] : [])
  ) as ProfileSnapshot["equipment"];
}

function normalizeProfileId(value: string | undefined): string {
  const profileId = String(value ?? "").trim();
  if (!profileId) {
    throw new Error("profileId is required.");
  }
  return profileId.slice(0, 96);
}

function sanitizeDisplayName(value: string): string {
  return value.trim().slice(0, 24);
}

function normalizeGold(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 500;
}

function normalizeBotDifficulty(value: unknown): BotDifficulty {
  return value === "easy" || value === "hard" || value === "normal" ? value : "normal";
}

function normalizeEquipmentSlot(value: string): EquipmentSlot | undefined {
  return value === "weapon" || value === "head" || value === "chest" || value === "hands" || value === "shoes"
    ? value
    : undefined;
}

function normalizeItemKind(value: unknown, template: ReturnType<typeof safeTemplate>): InventoryItemInstance["kind"] {
  if (value === "weapon" || value === "armor" || value === "gold" || value === "treasure" || value === "consumable") {
    return value;
  }
  if (!template) {
    return undefined;
  }
  if (template.kind === "equipment") return "armor";
  if (template.kind === "currency") return "gold";
  return template.kind;
}

function normalizeItemRarity(value: unknown, template: ReturnType<typeof safeTemplate>): InventoryItemInstance["rarity"] {
  if (value === "common" || value === "uncommon" || value === "rare" || value === "epic") {
    return value;
  }
  return template?.rarity;
}

function normalizeModifiers(raw: Record<string, unknown>): InventoryItemInstance["modifiers"] {
  const modifiers: NonNullable<InventoryItemInstance["modifiers"]> = {};
  for (const key of ["attackPower", "attackSpeed", "maxHp", "moveSpeed", "damageReduction", "critRate", "critDamage", "hpRegen", "dodgeRate"] as const) {
    if (typeof raw[key] === "number" && Number.isFinite(raw[key])) {
      modifiers[key] = raw[key];
    }
  }
  return modifiers;
}

function safeTemplate(templateId: string): ReturnType<typeof getItemTemplate> | undefined {
  try {
    return getItemTemplate(templateId);
  } catch {
    return undefined;
  }
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

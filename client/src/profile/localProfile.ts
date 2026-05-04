import {
  INVENTORY_HEIGHT,
  INVENTORY_WIDTH,
  type Affix,
  type BotDifficulty,
  type EquipmentSlot,
  type InventorySnapshotPayload,
  type ItemCategory,
  type ItemRarity,
  type SettlementPayload
} from "@gamer/shared";
import type { MatchInventoryItem, MatchInventoryState } from "../game/matchRuntime";

export interface LocalRunSummary {
  result: SettlementPayload["result"];
  reason?: SettlementPayload["reason"];
  survivedSeconds: number;
  playerKills: number;
  monsterKills: number;
  goldDelta: number;
  items: string[];
}

export interface LocalProfileItem extends MatchInventoryItem {
  width: number;
  height: number;
  equipmentSlot?: EquipmentSlot;
}

export interface LocalGridItem extends LocalProfileItem {
  x: number;
  y: number;
}

export interface LocalInventoryGrid {
  width: number;
  height: number;
  items: LocalGridItem[];
}

export interface LocalStashPage {
  width: number;
  height: number;
  items: LocalGridItem[];
}

export interface LocalProfile {
  profileId: string;
  displayName: string;
  gold: number;
  stashItems: string[];
  loadout: string[];
  inventory: LocalInventoryGrid;
  equipment: Partial<Record<EquipmentSlot, LocalProfileItem>>;
  stash: {
    width: number;
    height: number;
    pages: LocalStashPage[];
  };
  pendingReturn: {
    items: LocalProfileItem[];
  } | null;
  lastRun: LocalRunSummary | null;
  botDifficulty: BotDifficulty;
}

export interface LocalProfileMovePayload {
  itemInstanceId: string;
  targetArea: "grid" | "equipment" | "stash" | "discard";
  slot?: EquipmentSlot;
  pageIndex?: number;
  x?: number;
  y?: number;
}

const STORAGE_KEY = "liuhuang.localProfile.v2";
const LEGACY_STORAGE_KEY = "liuhuang.localProfile.v1";
const STASH_WIDTH = 10;
const STASH_HEIGHT = 8;
const STASH_PAGE_COUNT = 5;

export function loadLocalProfile(): LocalProfile {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  const legacy = safeParse(localStorage.getItem(LEGACY_STORAGE_KEY));
  const profile: LocalProfile = {
    profileId: typeof parsed.profileId === "string" ? parsed.profileId : `local-${crypto.randomUUID()}`,
    displayName: typeof parsed.displayName === "string" ? parsed.displayName : typeof legacy.displayName === "string" ? legacy.displayName : "",
    gold: toNumber(parsed.gold, toNumber(legacy.gold, 500)),
    stashItems: [],
    loadout: [],
    inventory: normalizeInventoryGrid(parsed.inventory, INVENTORY_WIDTH, INVENTORY_HEIGHT),
    equipment: normalizeEquipment(parsed.equipment),
    stash: normalizeStash(parsed.stash),
    pendingReturn: normalizePendingReturn(parsed.pendingReturn),
    lastRun: normalizeLastRun(parsed.lastRun ?? legacy.lastRun),
    botDifficulty: normalizeBotDifficulty(parsed.botDifficulty ?? legacy.botDifficulty)
  };

  migrateLegacyProfile(profile, legacy);
  ensureStarterLoadout(profile);
  syncProfileSummaries(profile);
  saveLocalProfile(profile);
  return profile;
}

export function saveLocalProfile(profile: LocalProfile): void {
  syncProfileSummaries(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function applySettlementToProfile(
  profile: LocalProfile,
  settlement: SettlementPayload,
  runtimeInventory?: MatchInventoryState | null
): LocalProfile {
  const base = cloneProfile(profile);
  const extracted = settlement.result === "success"
    ? normalizeSettlementItems(runtimeInventory, settlement.extractedItems)
    : [];

  const next: LocalProfile = {
    ...base,
    gold: Math.max(0, profile.gold + (settlement.profileGoldDelta ?? 0)),
    inventory: settlement.result === "success" ? createEmptyInventory() : base.inventory,
    equipment: settlement.result === "success" ? {} : base.equipment,
    pendingReturn: settlement.result === "success" && extracted.length > 0
      ? { items: extracted }
      : null,
    lastRun: {
      result: settlement.result,
      reason: settlement.reason,
      survivedSeconds: settlement.survivedSeconds,
      playerKills: settlement.playerKills,
      monsterKills: settlement.monsterKills,
      goldDelta: settlement.profileGoldDelta ?? 0,
      items: extracted.length > 0 ? extracted.map((item) => item.name) : settlement.extractedItems ?? []
    },
    botDifficulty: profile.botDifficulty
  };

  if (settlement.result === "failure" && settlement.loadoutLost) {
    next.inventory = createEmptyInventory();
    next.equipment = {};
    next.pendingReturn = null;
    ensureStarterLoadout(next);
  }

  syncProfileSummaries(next);
  saveLocalProfile(next);
  return next;
}

export function updateProfilePreference(
  profile: LocalProfile,
  patch: Partial<Pick<LocalProfile, "displayName" | "botDifficulty">>
): LocalProfile {
  const next: LocalProfile = {
    ...cloneProfile(profile),
    displayName: patch.displayName ?? profile.displayName,
    botDifficulty: normalizeBotDifficulty(patch.botDifficulty ?? profile.botDifficulty)
  };
  syncProfileSummaries(next);
  saveLocalProfile(next);
  return next;
}

export function moveProfileItem(profile: LocalProfile, payload: LocalProfileMovePayload): LocalProfile {
  const next = cloneProfile(profile);
  const source = removeProfileItem(next, payload.itemInstanceId);
  if (!source) {
    throw new Error("未找到对应物资。");
  }

  if (payload.targetArea === "discard") {
    saveLocalProfile(next);
    return next;
  }

  if (payload.targetArea === "equipment") {
    const slot = payload.slot ?? source.item.equipmentSlot ?? normalizeEquipmentSlot(source.item.slot);
    if (!slot) {
      restoreProfileItem(next, source);
      throw new Error("这件物资不能装备。");
    }

    const previous = next.equipment[slot];
    next.equipment[slot] = stripGridPosition(source.item);
    if (previous) {
      if (!placeInInventory(next.inventory, stripGridPosition(previous))) {
        const fallbackPageIndex = clamp(payload.pageIndex ?? 0, 0, next.stash.pages.length - 1);
        const fallbackPage = next.stash.pages[fallbackPageIndex];
        if (!placeInGridPage(fallbackPage, stripGridPosition(previous))) {
          restoreProfileItem(next, source);
          next.equipment[slot] = previous;
          throw new Error("没有空位可放回被替换的装备。");
        }
      }
    }

    saveLocalProfile(next);
    return next;
  }

  if (payload.targetArea === "grid") {
    if (!placeInInventory(next.inventory, source.item, payload.x, payload.y)) {
      restoreProfileItem(next, source);
      throw new Error("携行背包没有足够空间。");
    }
    saveLocalProfile(next);
    return next;
  }

  const pageIndex = clamp(payload.pageIndex ?? 0, 0, next.stash.pages.length - 1);
  if (!placeInGridPage(next.stash.pages[pageIndex], source.item, payload.x, payload.y)) {
    restoreProfileItem(next, source);
    throw new Error("当前仓库页没有足够空间。");
  }

  saveLocalProfile(next);
  return next;
}

export function getProfilePrimaryWeapon(profile: LocalProfile): string {
  return profile.equipment.weapon?.name
    ?? profile.inventory.items.find((item) => item.equipmentSlot === "weapon")?.name
    ?? "灰铁长剑";
}

export function getProfileLoadoutCount(profile: LocalProfile): number {
  return Object.values(profile.equipment).filter(Boolean).length + profile.inventory.items.length;
}

export function getProfileStashItemCount(profile: LocalProfile): number {
  return profile.stash.pages.reduce((sum, page) => sum + page.items.length, 0);
}

export function buildProfileLoadoutSnapshot(profile: LocalProfile): InventorySnapshotPayload {
  return {
    inventory: {
      width: profile.inventory.width,
      height: profile.inventory.height,
      items: profile.inventory.items.map((item) => ({
        instanceId: item.instanceId,
        definitionId: item.definitionId,
        kind: item.kind as ItemCategory | undefined,
        rarity: item.rarity as ItemRarity | undefined,
        name: item.name,
        healAmount: item.healAmount,
        affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix } as Affix)) : undefined,
        modifiers: item.modifiers ? { ...item.modifiers } : undefined,
        x: item.x,
        y: item.y
      }))
    },
    equipment: Object.fromEntries(
      Object.entries(profile.equipment).flatMap(([slot, item]) => {
        if (!item) {
          return [];
        }

        return [[slot, {
          instanceId: item.instanceId,
          definitionId: item.definitionId,
          kind: item.kind as ItemCategory | undefined,
          rarity: item.rarity as ItemRarity | undefined,
          name: item.name,
          healAmount: item.healAmount,
          affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix } as Affix)) : undefined,
          modifiers: item.modifiers ? { ...item.modifiers } : undefined
        }]];
      })
    )
  };
}

function migrateLegacyProfile(profile: LocalProfile, legacy: Record<string, unknown>): void {
  if (profile.stash.pages.some((page) => page.items.length > 0) || Object.keys(profile.equipment).length > 0 || profile.inventory.items.length > 0) {
    return;
  }

  const legacyStashItems = Array.isArray(legacy.stashItems) ? legacy.stashItems.map(String).filter(Boolean) : [];
  const legacyLoadout = Array.isArray(legacy.loadout) ? legacy.loadout.map(String).filter(Boolean) : [];

  legacyStashItems.forEach((name, index) => {
    const item = fallbackItemFromName(name, index);
    const pageIndex = Math.floor(index / (STASH_WIDTH * STASH_HEIGHT));
    const page = profile.stash.pages[Math.min(pageIndex, profile.stash.pages.length - 1)];
    placeInGridPage(page, item);
  });

  if (legacyLoadout.length > 0) {
    const [first, ...rest] = legacyLoadout;
    profile.equipment.weapon = fallbackItemFromName(first, 0, "weapon");
    rest.forEach((name, index) => {
      placeInInventory(profile.inventory, fallbackItemFromName(name, index + 1));
    });
  }
}

function ensureStarterLoadout(profile: LocalProfile): void {
  if (!profile.equipment.weapon) {
    profile.equipment.weapon = createStarterWeapon();
  }
}

function normalizeSettlementItems(runtimeInventory: MatchInventoryState | null | undefined, names: string[]): LocalProfileItem[] {
  if (!runtimeInventory) {
    return names.map((name, index) => fallbackItemFromName(name, index));
  }

  const items: LocalProfileItem[] = [
    ...runtimeInventory.items.map((item) => ({
      ...item,
      x: undefined,
      y: undefined,
      width: item.width ?? 1,
      height: item.height ?? 1,
      equipmentSlot: normalizeEquipmentSlot(item.equipmentSlot ?? item.slot)
    })),
    ...Object.values(runtimeInventory.equipment)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        x: undefined,
        y: undefined,
        width: item.width ?? 1,
        height: item.height ?? 1,
        equipmentSlot: normalizeEquipmentSlot(item.equipmentSlot ?? item.slot)
      }))
  ];

  return items.length > 0 ? items : names.map((name, index) => fallbackItemFromName(name, index));
}

function normalizeInventoryGrid(raw: unknown, defaultWidth: number, defaultHeight: number): LocalInventoryGrid {
  const record = isRecord(raw) ? raw : {};
  return {
    width: Math.max(defaultWidth, toNumber(record.width, defaultWidth)),
    height: Math.max(defaultHeight, toNumber(record.height, defaultHeight)),
    items: normalizeGridItems(record.items)
  };
}

function normalizeEquipment(raw: unknown): Partial<Record<EquipmentSlot, LocalProfileItem>> {
  if (!isRecord(raw)) {
    return {};
  }

  const next: Partial<Record<EquipmentSlot, LocalProfileItem>> = {};
  for (const [slot, value] of Object.entries(raw)) {
    const normalizedSlot = normalizeEquipmentSlot(slot);
    const item = normalizeProfileItem(value);
    if (normalizedSlot && item) {
      next[normalizedSlot] = {
        ...item,
        equipmentSlot: normalizedSlot
      };
    }
  }
  return next;
}

function normalizeStash(raw: unknown): LocalProfile["stash"] {
  const record = isRecord(raw) ? raw : {};
  const width = toNumber(record.width, STASH_WIDTH);
  const height = toNumber(record.height, STASH_HEIGHT);
  const pagesRaw = Array.isArray(record.pages) ? record.pages : [];
  const pages = pagesRaw.map((page) => {
    const pageRecord = isRecord(page) ? page : {};
    return {
      width: toNumber(pageRecord.width, width),
      height: toNumber(pageRecord.height, height),
      items: normalizeGridItems(pageRecord.items)
    };
  });

  while (pages.length < STASH_PAGE_COUNT) {
    pages.push({
      width,
      height,
      items: []
    });
  }

  return {
    width,
    height,
    pages: pages.slice(0, STASH_PAGE_COUNT)
  };
}

function normalizePendingReturn(raw: unknown): LocalProfile["pendingReturn"] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return null;
  }

  const items = raw.items
    .map((item) => normalizeProfileItem(item))
    .filter((item): item is LocalProfileItem => Boolean(item))
    .map(stripGridPosition);

  return items.length > 0 ? { items } : null;
}

function normalizeLastRun(value: unknown): LocalRunSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    result: value.result === "success" ? "success" : "failure",
    reason: typeof value.reason === "string" ? value.reason as SettlementPayload["reason"] : undefined,
    survivedSeconds: toNumber(value.survivedSeconds, 0),
    playerKills: toNumber(value.playerKills, 0),
    monsterKills: toNumber(value.monsterKills, 0),
    goldDelta: toNumber(value.goldDelta, 0),
    items: Array.isArray(value.items) ? value.items.map(String).filter(Boolean) : []
  };
}

function normalizeProfileItem(raw: unknown): LocalProfileItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const slot = normalizeEquipmentSlot(raw.equipmentSlot ?? raw.slot);
  return {
    instanceId: asString(raw.instanceId, crypto.randomUUID()),
    definitionId: asString(raw.definitionId ?? raw.templateId, "unknown"),
    name: asString(raw.name, "未知物资"),
    kind: asOptionalString(raw.kind),
    rarity: asOptionalString(raw.rarity),
    x: asOptionalNumber(raw.x),
    y: asOptionalNumber(raw.y),
    slot: slot,
    equipmentSlot: slot,
    width: toNumber(raw.width, 1),
    height: toNumber(raw.height, 1),
    healAmount: asOptionalNumber(raw.healAmount),
    modifiers: isRecord(raw.modifiers) ? {
      attackPower: asOptionalNumber(raw.modifiers.attackPower),
      attackSpeed: asOptionalNumber(raw.modifiers.attackSpeed),
      maxHp: asOptionalNumber(raw.modifiers.maxHp),
      moveSpeed: asOptionalNumber(raw.modifiers.moveSpeed),
      damageReduction: asOptionalNumber(raw.modifiers.damageReduction),
      critRate: asOptionalNumber(raw.modifiers.critRate),
      critDamage: asOptionalNumber(raw.modifiers.critDamage),
      hpRegen: asOptionalNumber(raw.modifiers.hpRegen),
      dodgeRate: asOptionalNumber(raw.modifiers.dodgeRate)
    } : undefined,
    affixes: Array.isArray(raw.affixes)
      ? raw.affixes.flatMap((entry) => isRecord(entry) && typeof entry.key === "string" && typeof entry.value === "number"
        ? [{ key: entry.key, value: entry.value }]
        : [])
      : undefined
  };
}

function normalizeGridItems(raw: unknown): LocalGridItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry) => {
    const item = normalizeProfileItem(entry);
    const x = asOptionalNumber(isRecord(entry) ? entry.x : undefined);
    const y = asOptionalNumber(isRecord(entry) ? entry.y : undefined);
    if (!item || x == null || y == null) {
      return [];
    }
    return [{
      ...item,
      x,
      y
    }];
  });
}

function removeProfileItem(profile: LocalProfile, itemInstanceId: string):
  | { area: "pending"; item: LocalProfileItem }
  | { area: "grid"; item: LocalProfileItem }
  | { area: "equipment"; item: LocalProfileItem; slot: EquipmentSlot }
  | { area: "stash"; item: LocalProfileItem; pageIndex: number }
  | undefined {
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
    return { area: "grid", item: stripGridPosition(item) };
  }

  for (const slot of Object.keys(profile.equipment) as EquipmentSlot[]) {
    const item = profile.equipment[slot];
    if (item?.instanceId === itemInstanceId) {
      delete profile.equipment[slot];
      return { area: "equipment", item: stripGridPosition(item), slot };
    }
  }

  for (let pageIndex = 0; pageIndex < profile.stash.pages.length; pageIndex += 1) {
    const page = profile.stash.pages[pageIndex];
    const itemIndex = page.items.findIndex((item) => item.instanceId === itemInstanceId);
    if (itemIndex >= 0) {
      const [item] = page.items.splice(itemIndex, 1);
      return { area: "stash", item: stripGridPosition(item), pageIndex };
    }
  }

  return undefined;
}

function restoreProfileItem(
  profile: LocalProfile,
  source:
    | { area: "pending"; item: LocalProfileItem }
    | { area: "grid"; item: LocalProfileItem }
    | { area: "equipment"; item: LocalProfileItem; slot: EquipmentSlot }
    | { area: "stash"; item: LocalProfileItem; pageIndex: number }
): void {
  if (source.area === "pending") {
    profile.pendingReturn = profile.pendingReturn ?? { items: [] };
    profile.pendingReturn.items.push(source.item);
    return;
  }

  if (source.area === "equipment") {
    profile.equipment[source.slot] = source.item;
    return;
  }

  if (source.area === "grid") {
    placeInInventory(profile.inventory, source.item);
    return;
  }

  placeInGridPage(profile.stash.pages[source.pageIndex], source.item);
}

function placeInInventory(inventory: LocalInventoryGrid, item: LocalProfileItem, preferredX?: number, preferredY?: number): boolean {
  return placeInGridPage(inventory, item, preferredX, preferredY);
}

function placeInGridPage(
  grid: LocalInventoryGrid | LocalStashPage,
  item: LocalProfileItem,
  preferredX?: number,
  preferredY?: number
): boolean {
  const placement = resolvePlacement(grid, item, preferredX, preferredY);
  if (!placement) {
    return false;
  }

  grid.items.push({
    ...stripGridPosition(item),
    x: placement.x,
    y: placement.y
  });
  return true;
}

function resolvePlacement(
  grid: LocalInventoryGrid | LocalStashPage,
  item: LocalProfileItem,
  preferredX?: number,
  preferredY?: number
): { x: number; y: number } | null {
  if (preferredX != null && preferredY != null && canPlaceAt(grid, item, preferredX, preferredY)) {
    return { x: preferredX, y: preferredY };
  }

  for (let y = 0; y <= grid.height - item.height; y += 1) {
    for (let x = 0; x <= grid.width - item.width; x += 1) {
      if (canPlaceAt(grid, item, x, y)) {
        return { x, y };
      }
    }
  }

  return null;
}

function canPlaceAt(grid: LocalInventoryGrid | LocalStashPage, item: LocalProfileItem, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x + item.width > grid.width || y + item.height > grid.height) {
    return false;
  }

  return !grid.items.some((entry) => overlaps(entry, x, y, item.width, item.height));
}

function overlaps(entry: LocalGridItem, x: number, y: number, width: number, height: number): boolean {
  return !(
    entry.x + entry.width <= x
    || x + width <= entry.x
    || entry.y + entry.height <= y
    || y + height <= entry.y
  );
}

function stripGridPosition<T extends LocalProfileItem>(item: T): LocalProfileItem {
  return {
    ...item,
    x: undefined,
    y: undefined
  };
}

function createStarterWeapon(): LocalProfileItem {
  return {
    instanceId: "starter-weapon",
    definitionId: "iron-sword",
    name: "灰铁长剑",
    kind: "weapon",
    rarity: "common",
    slot: "weapon",
    equipmentSlot: "weapon",
    width: 1,
    height: 3
  };
}

function fallbackItemFromName(name: string, index: number, slot?: EquipmentSlot): LocalProfileItem {
  const normalizedSlot = slot ?? inferEquipmentSlot(name);
  const isWeapon = normalizedSlot === "weapon" || /剑|刀|枪|矛/.test(name);
  return {
    instanceId: `local-item-${index}-${crypto.randomUUID()}`,
    definitionId: isWeapon ? "iron-sword" : `legacy-${index}`,
    name,
    kind: isWeapon ? "weapon" : "treasure",
    rarity: isWeapon ? "common" : "uncommon",
    slot: normalizedSlot,
    equipmentSlot: normalizedSlot,
    width: isWeapon ? 1 : 1,
    height: isWeapon ? 3 : 1
  };
}

function inferEquipmentSlot(name: string): EquipmentSlot | undefined {
  if (/剑|刀|枪|矛/.test(name)) return "weapon";
  if (/盔|帽/.test(name)) return "head";
  if (/甲|胸/.test(name)) return "chest";
  if (/手|腕/.test(name)) return "hands";
  if (/靴|鞋/.test(name)) return "shoes";
  return undefined;
}

function normalizeBotDifficulty(value: unknown): BotDifficulty {
  return value === "easy" || value === "hard" || value === "normal" ? value : "normal";
}

function normalizeEquipmentSlot(value: unknown): EquipmentSlot | undefined {
  return value === "weapon" || value === "head" || value === "chest" || value === "hands" || value === "shoes"
    ? value
    : undefined;
}

function createEmptyInventory(): LocalInventoryGrid {
  return {
    width: INVENTORY_WIDTH,
    height: INVENTORY_HEIGHT,
    items: []
  };
}

function cloneProfile(profile: LocalProfile): LocalProfile {
  return {
    ...profile,
    stashItems: [...profile.stashItems],
    loadout: [...profile.loadout],
    inventory: {
      width: profile.inventory.width,
      height: profile.inventory.height,
      items: profile.inventory.items.map((item) => ({ ...item }))
    },
    equipment: Object.fromEntries(
      Object.entries(profile.equipment).flatMap(([slot, item]) => item ? [[slot, { ...item }]] : [])
    ) as LocalProfile["equipment"],
    stash: {
      width: profile.stash.width,
      height: profile.stash.height,
      pages: profile.stash.pages.map((page) => ({
        width: page.width,
        height: page.height,
        items: page.items.map((item) => ({ ...item }))
      }))
    },
    pendingReturn: profile.pendingReturn
      ? { items: profile.pendingReturn.items.map((item) => ({ ...item })) }
      : null,
    lastRun: profile.lastRun ? { ...profile.lastRun, items: [...profile.lastRun.items] } : null
  };
}

function syncProfileSummaries(profile: LocalProfile): void {
  profile.stashItems = profile.stash.pages.flatMap((page) => page.items.map((item) => item.name));
  profile.loadout = [
    ...Object.values(profile.equipment).filter((item): item is LocalProfileItem => Boolean(item)).map((item) => item.name),
    ...profile.inventory.items.map((item) => item.name)
  ];
}

function safeParse(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const value = JSON.parse(raw);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

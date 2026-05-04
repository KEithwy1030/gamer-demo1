import {
  ITEM_DEFINITIONS,
  resolveEquipmentSlot,
  resolveItemSize,
  type EquipmentSlot,
  type InventoryItemInstance,
  type InventoryPlacedItem,
  type ProfileMovePayload,
  type ProfilePatchPayload,
  type ProfileSnapshot
} from "@gamer/shared";
import type {
  LocalGridItem,
  LocalInventoryGrid,
  LocalProfile,
  LocalProfileItem
} from "./localProfile";
import { saveLocalProfile } from "./localProfile";

const PROFILE_ID_STORAGE_KEY = "liuhuang.serverProfileId.v1";
const DEFAULT_SERVER_PORT = "3000";

export function getOrCreateServerProfileId(): string {
  const existing = localStorage.getItem(PROFILE_ID_STORAGE_KEY);
  if (existing?.trim()) {
    return existing;
  }

  const created = `profile-${crypto.randomUUID()}`;
  localStorage.setItem(PROFILE_ID_STORAGE_KEY, created);
  return created;
}

export async function loadServerProfile(): Promise<LocalProfile> {
  return getServerProfile(getOrCreateServerProfileId());
}

export async function getServerProfile(profileId: string): Promise<LocalProfile> {
  const response = await fetch(`${resolveServerUrl()}/profiles/${encodeURIComponent(profileId)}`);
  if (!response.ok) {
    throw new Error("服务端档案加载失败。");
  }

  return persistServerProfile(await response.json() as ProfileSnapshot);
}

export async function patchServerProfile(
  profileId: string,
  patch: ProfilePatchPayload
): Promise<LocalProfile> {
  const response = await fetch(`${resolveServerUrl()}/profiles/${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    throw new Error("服务端档案更新失败。");
  }

  return persistServerProfile(await response.json() as ProfileSnapshot);
}

export async function moveServerProfileItem(
  profileId: string,
  payload: ProfileMovePayload
): Promise<LocalProfile> {
  const response = await fetch(`${resolveServerUrl()}/profiles/${encodeURIComponent(profileId)}/items/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await safeErrorBody(response);
    throw new Error(body || "服务端行囊整理失败。");
  }

  return persistServerProfile(await response.json() as ProfileSnapshot);
}

export function resolveServerUrl(): string {
  const explicit = import.meta.env.VITE_SERVER_URL;
  if (explicit) return explicit;

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
}

function toLocalProfile(snapshot: ProfileSnapshot): LocalProfile {
  const inventory = toLocalInventory(snapshot.inventory);
  const equipment: LocalProfile["equipment"] = {};
  for (const [slot, item] of Object.entries(snapshot.equipment)) {
    const normalizedSlot = normalizeEquipmentSlot(slot);
    if (normalizedSlot && item) {
      equipment[normalizedSlot] = enrichItem(item, normalizedSlot);
    }
  }

  const stashPages = snapshot.stash.pages.map((page) => toLocalInventory(page));
  const profile: LocalProfile = {
    profileId: snapshot.profileId,
    displayName: snapshot.displayName,
    gold: snapshot.gold,
    stashItems: [],
    loadout: [],
    inventory,
    equipment,
    stash: {
      width: snapshot.stash.width,
      height: snapshot.stash.height,
      pages: stashPages
    },
    pendingReturn: snapshot.pendingReturn
      ? { items: snapshot.pendingReturn.items.map((item) => enrichItem(item)) }
      : null,
    lastRun: snapshot.lastRun
      ? {
          result: snapshot.lastRun.result,
          reason: snapshot.lastRun.reason,
          survivedSeconds: snapshot.lastRun.survivedSeconds,
          playerKills: snapshot.lastRun.playerKills,
          monsterKills: snapshot.lastRun.monsterKills,
          goldDelta: snapshot.lastRun.goldDelta,
          items: [...snapshot.lastRun.items]
        }
      : null,
    botDifficulty: snapshot.botDifficulty
  };

  profile.stashItems = profile.stash.pages.flatMap((page) => page.items.map((item) => item.name));
  profile.loadout = [
    ...Object.values(profile.equipment).filter((item): item is LocalProfileItem => Boolean(item)).map((item) => item.name),
    ...profile.inventory.items.map((item) => item.name)
  ];
  return profile;
}

function persistServerProfile(snapshot: ProfileSnapshot): LocalProfile {
  const profile = toLocalProfile(snapshot);
  localStorage.setItem(PROFILE_ID_STORAGE_KEY, profile.profileId);
  saveLocalProfile(profile);
  return profile;
}

function toLocalInventory(inventory: ProfileSnapshot["inventory"]): LocalInventoryGrid {
  return {
    width: inventory.width,
    height: inventory.height,
    items: inventory.items.map((item) => enrichPlacedItem(item))
  };
}

function enrichPlacedItem(item: InventoryPlacedItem): LocalGridItem {
  return {
    ...enrichItem(item),
    x: item.x,
    y: item.y
  };
}

function enrichItem(item: InventoryItemInstance, forcedSlot?: EquipmentSlot): LocalProfileItem {
  const definition = ITEM_DEFINITIONS[item.definitionId];
  const equipmentSlot = forcedSlot ?? resolveEquipmentSlot(item);
  const size = resolveItemSize(item);
  return {
    instanceId: item.instanceId,
    definitionId: item.definitionId,
    name: item.name ?? definition?.name ?? item.definitionId,
    kind: item.kind,
    rarity: item.rarity,
    slot: equipmentSlot,
    equipmentSlot,
    width: size.width,
    height: size.height,
    healAmount: item.healAmount ?? definition?.healAmount,
    modifiers: item.modifiers ? { ...item.modifiers } : undefined,
    affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix })) : undefined
  };
}

function normalizeEquipmentSlot(value: unknown): EquipmentSlot | undefined {
  return value === "weapon" || value === "head" || value === "chest" || value === "hands" || value === "shoes"
    ? value
    : undefined;
}

async function safeErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message ?? "";
  } catch {
    return "";
  }
}

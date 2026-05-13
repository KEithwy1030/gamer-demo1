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
import { resolveServerUrl } from "../network/serverUrl";

const PROFILE_ID_STORAGE_KEY = "liuhuang.serverProfileId.v1";

export function getOrCreateServerProfileId(): string {
  const existing = localStorage.getItem(PROFILE_ID_STORAGE_KEY);
  if (existing?.trim()) {
    return existing;
  }

  const created = `profile-${createBrowserProfileId()}`;
  localStorage.setItem(PROFILE_ID_STORAGE_KEY, created);
  return created;
}

function createBrowserProfileId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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

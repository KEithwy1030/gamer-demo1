import { webcrypto } from "node:crypto";
import {
  applySettlementToProfile,
  buildProfileLoadoutSnapshot,
  getProfileAssetValue,
  loadLocalProfile,
  moveProfileItem,
  type LocalProfile,
  type LocalProfileItem
} from "../client/src/profile/localProfile.ts";
import type { MatchInventoryState } from "../client/src/game/matchRuntime.ts";

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true
  });
}

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeTreasure(
  instanceId: string,
  index: number,
  value: Pick<LocalProfileItem, "goldValue" | "treasureValue"> = {}
): LocalProfileItem {
  return {
    instanceId,
    definitionId: "treasure_small_idol",
    name: `Carry Idol ${index}`,
    kind: "treasure",
    rarity: "common",
    width: 1,
    height: 1,
    ...value
  };
}

function fillStash(profile: LocalProfile): LocalProfile {
  const next: LocalProfile = {
    ...profile,
    stash: {
      ...profile.stash,
      pages: profile.stash.pages.map((page, pageIndex) => ({
        ...page,
        items: Array.from({ length: page.width * page.height }, (_, index) => ({
          ...makeTreasure(`filler-${pageIndex}-${index}`, index),
          x: index % page.width,
          y: Math.floor(index / page.width)
        }))
      }))
    }
  };
  return next;
}

function main(): void {
  const assetBase = loadLocalProfile();
  const valuedProfile: LocalProfile = {
    ...assetBase,
    gold: 120,
    inventory: {
      ...assetBase.inventory,
      items: [{ ...makeTreasure("inventory-value", 10, { goldValue: 10, treasureValue: 15 }), x: 0, y: 0 }]
    },
    equipment: {
      weapon: { ...makeTreasure("weapon-value", 11, { goldValue: 30, treasureValue: 5 }), equipmentSlot: "weapon" }
    },
    stash: {
      ...assetBase.stash,
      pages: assetBase.stash.pages.map((page, pageIndex) => ({
        ...page,
        items: pageIndex === 0
          ? [{ ...makeTreasure("stash-value", 12, { goldValue: 20, treasureValue: 25 }), x: 0, y: 0 }]
          : []
      }))
    },
    pendingReturn: {
      items: [makeTreasure("pending-value", 13, { goldValue: 40, treasureValue: 50 })]
    }
  };
  assert(getProfileAssetValue(valuedProfile) === 315, "profile asset value should include gold, loadout, stash, and pending return items");

  const initial = fillStash(loadLocalProfile());
  const carried = makeTreasure("carry-contract-idol", 1);
  const runtimeInventory: MatchInventoryState = {
    width: 10,
    height: 20,
    items: [{ ...carried, x: 0, y: 0 }],
    equipment: {
      weapon: initial.equipment.weapon
    }
  };

  const settled = applySettlementToProfile(initial, {
    result: "success",
    reason: "extracted",
    survivedSeconds: 12,
    playerKills: 0,
    monsterKills: 0,
    extractedGold: 0,
    extractedTreasureValue: 40,
    extractedItems: [carried.name],
    retainedItems: [carried.name],
    lostItems: [],
    loadoutLost: false,
    profileGoldDelta: 40
  }, runtimeInventory);

  assert(settled.pendingReturn?.items.some((item) => item.instanceId === carried.instanceId), "extracted overflow item should enter pendingReturn");

  const next = moveProfileItem(settled, {
    itemInstanceId: carried.instanceId,
    targetArea: "grid"
  });
  const snapshot = buildProfileLoadoutSnapshot(next);
  assert(snapshot.inventory.items.some((item) => item.instanceId === carried.instanceId), "carried pending item should be present in next loadout snapshot");
  assert(!next.pendingReturn?.items.some((item) => item.instanceId === carried.instanceId), "carried item should leave pendingReturn after loadout move");

  console.log("[profile-carry] PASS pendingReturn item can be carried into next deterministic loadout");
}

main();

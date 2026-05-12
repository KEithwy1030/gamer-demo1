import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketStore } from "../server/src/market-store.ts";
import { ProfileStore } from "../server/src/profile-store.ts";
import type { InventoryState, InventoryItem } from "../server/src/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function listProfileItems(profile: ReturnType<ProfileStore["get"]>): string[] {
  return [
    ...profile.inventory.items.map((item) => item.instanceId),
    ...Object.values(profile.equipment).flatMap((item) => item ? [item.instanceId] : []),
    ...profile.stash.pages.flatMap((page) => page.items.map((item) => item.instanceId)),
    ...(profile.pendingReturn?.items.map((item) => item.instanceId) ?? [])
  ];
}

const tmp = mkdtempSync(path.join(tmpdir(), "gamer-market-"));

try {
  const profileStore = new ProfileStore(path.join(tmp, "profiles.json"));
  const marketStore = new MarketStore(profileStore, path.join(tmp, "market.json"));
  const profileId = "profile-market-contract";
  const settlementInventory = createOverflowSettlementInventory();
  const settledProfile = profileStore.settleRun(profileId, {
    result: "success",
    survivedSeconds: 412,
    playerKills: 3,
    monsterKills: 17,
    extractedGold: 0,
    extractedTreasureValue: 0,
    extractedItems: settlementInventory.items.map((entry) => entry.item.name),
    retainedItems: settlementInventory.items.map((entry) => entry.item.name),
    lostItems: [],
    loadoutLost: false,
    profileGoldDelta: 185
  }, settlementInventory);
  const pendingItem = settledProfile.pendingReturn?.items[0];

  assert(pendingItem, "settleRun should overflow at least one recovered item into pendingReturn");
  assert(listProfileItems(settledProfile).includes(pendingItem.instanceId), "settled item should be visible in profile before listing");

  const listing = marketStore.create({
    playerId: profileId,
    itemInstanceId: pendingItem.instanceId,
    price: 123
  });
  assert(listing.item.instanceId === pendingItem.instanceId, "listing should preserve recovered item instance id");
  assert(!listProfileItems(profileStore.get(profileId)).includes(pendingItem.instanceId), "listed recovered item should be removed from profile");

  const updated = marketStore.update(listing.listingId, {
    playerId: profileId,
    price: 321
  });
  assert(updated.price === 321, "listing price should update");
  assert(marketStore.list(profileId).length === 1, "listing should remain visible after price update");

  marketStore.cancel(profileId, listing.listingId);
  assert(marketStore.list(profileId).length === 0, "cancelled listing should be removed");
  assert(listProfileItems(profileStore.get(profileId)).includes(pendingItem.instanceId), "cancelled recovered item should return to profile");

  console.log("[market-lifecycle] PASS settleRun -> create -> update -> cancel preserves recovered item ownership");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function createOverflowSettlementInventory(): InventoryState {
  const items = Array.from({ length: 101 }, (_, index) => ({
    item: createSettlementItem(index),
    x: 0,
    y: 0
  }));
  return {
    width: 10,
    height: 6,
    items,
    equipment: {}
  };
}

function createSettlementItem(index: number): InventoryItem {
  return {
    instanceId: `settled-item-${index}`,
    templateId: "treasure_large_statue",
    name: `Recovered Statue ${index + 1}`,
    rarity: "epic",
    kind: "treasure",
    width: 2,
    height: 2,
    goldValue: 0,
    treasureValue: 220,
    affixes: []
  };
}

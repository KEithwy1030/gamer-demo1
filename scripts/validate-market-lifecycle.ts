import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  assertMarketUiCopyMatchesSettlementContract();

  const profileStore = new ProfileStore(path.join(tmp, "profiles.json"));
  const marketStore = new MarketStore(profileStore, path.join(tmp, "market.json"), 0);
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

  const goldBeforeSystemSell = profileStore.get(profileId).gold;
  const systemSale = marketStore.sellToSystem({
    playerId: profileId,
    itemInstanceId: pendingItem.instanceId
  });
  const afterSystemSell = profileStore.get(profileId);
  assert(systemSale.item.instanceId === pendingItem.instanceId, "system sale should preserve sold item identity in the receipt");
  assert(systemSale.goldDelta > 0, "system sale should produce a positive gold payout");
  assert(afterSystemSell.gold === goldBeforeSystemSell + systemSale.goldDelta, "system sale should add gold to the profile");
  assert(!listProfileItems(afterSystemSell).includes(pendingItem.instanceId), "system sold item should be removed from the profile");

  const buyerItem = { ...pendingItem, instanceId: "buyer-settlement-item" };
  profileStore.returnMarketItem(profileId, buyerItem);
  assert(listProfileItems(profileStore.get(profileId)).includes(buyerItem.instanceId), "buyer settlement fixture item should be visible in profile before listing");
  const buyerListing = marketStore.create({
    playerId: profileId,
    itemInstanceId: buyerItem.instanceId,
    price: 300
  });
  const goldBeforeBuyerSettlement = profileStore.get(profileId).gold;
  const buyerSettlement = marketStore.settle(profileId);
  const afterBuyerSettlement = profileStore.get(profileId);
  assert(buyerSettlement.sold.length === 1, "fair matured listing should sell to a simulated buyer");
  assert(buyerSettlement.sold[0]?.listingId === buyerListing.listingId, "buyer settlement receipt should identify the listing");
  assert(buyerSettlement.listings.length === 0, "sold listing should be removed from active market listings");
  assert(afterBuyerSettlement.gold === goldBeforeBuyerSettlement + buyerListing.price, "buyer settlement should pay listing price to profile");
  assert(!listProfileItems(afterBuyerSettlement).includes(buyerItem.instanceId), "buyer-settled item should stay out of profile inventory");

  console.log("[market-lifecycle] PASS settleRun -> create -> update -> cancel -> systemSell -> buyerSettle preserves ownership and payout");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function assertMarketUiCopyMatchesSettlementContract(): void {
  const marketView = readFileSync(new URL("../client/src/ui/marketView.ts", import.meta.url), "utf8");
  assert(marketView.includes("模拟买家成交已接线"), "market header should tell players simulated buyer settlement is available");
  assert(!marketView.includes("成交暂不开放"), "market header should not claim settlement is unavailable after buyer settlement is implemented");
  assert(marketView.includes("function itemDisplayName"), "market rows should centralize display-name presentation");
  assert(marketView.includes("itemText(itemDisplayName(item)"), "market candidate rows should use item presentation display names");
  assert(marketView.includes("selectedName.textContent = itemDisplayName(item)"), "market selected item should use item presentation display names");
  assert(marketView.includes("itemText(itemDisplayName(listing.item)"), "market listings should use item presentation display names");
  assert(marketView.includes("itemText(itemDisplayName(receipt.item)"), "market sale receipts should use item presentation display names");
  assert(!marketView.includes("itemText(item.name"), "market rows should not render raw local item names");
  assert(!marketView.includes("itemText(listing.item.name"), "market listings should not render raw listing item names");
  assert(!marketView.includes("itemText(receipt.item.name"), "market receipts should not render raw receipt item names");
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

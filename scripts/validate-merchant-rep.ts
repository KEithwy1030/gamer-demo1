import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { MERCHANT_REP_TIERS, nextMerchantRepTier, resolveMerchantRepTier } from "../shared/src/data/constants.ts";
import { MarketStore } from "../server/src/market-store.ts";
import { ProfileStore } from "../server/src/profile-store.ts";
import type { InventoryState } from "../server/src/types.ts";

/**
 * 商人信誉 + 生涯统计契约：
 * 1. 新档案：rep 0、生涯统计全 0
 * 2. settleRun 更新生涯统计（runs/extracts/deaths/kills/goldEarned/bestRunValue）
 * 3. 系统急售：卖出加 rep，rep 等级提升后同一物品卖价更高
 * 4. 等级解析函数单调正确
 */

// 4. 等级解析
assert.equal(resolveMerchantRepTier(0).name, MERCHANT_REP_TIERS[0]!.name, "rep 0 should be the first tier");
assert.equal(resolveMerchantRepTier(799).sellRatio, 1, "rep below tier 2 keeps base ratio");
assert.ok(resolveMerchantRepTier(800).sellRatio > 1, "tier 2 should raise the sell ratio");
assert.ok(resolveMerchantRepTier(99999).sellRatio === MERCHANT_REP_TIERS[MERCHANT_REP_TIERS.length - 1]!.sellRatio, "huge rep should cap at the last tier");
assert.equal(nextMerchantRepTier(99999), undefined, "no next tier at the cap");

const tmp = mkdtempSync(path.join(tmpdir(), "gamer-rep-"));

try {
  const profileStore = new ProfileStore(path.join(tmp, "profiles.json"));
  const marketStore = new MarketStore(profileStore, path.join(tmp, "market.json"), 0);

  // 1. 新档案
  const fresh = profileStore.get("profile-rep-test");
  assert.equal(fresh.merchantRep, 0, "fresh profile should have zero merchant rep");
  assert.equal(fresh.lifetimeStats.totalRuns, 0, "fresh profile should have zero lifetime runs");

  // 2. settleRun 生涯统计
  const emptyInventory: InventoryState = { width: 10, height: 6, items: [], equipment: {} };
  profileStore.settleRun("profile-rep-test", {
    result: "success",
    survivedSeconds: 300,
    playerKills: 2,
    monsterKills: 11,
    extractedGold: 120,
    extractedTreasureValue: 80,
    extractedItems: [],
    retainedItems: [],
    lostItems: [],
    loadoutLost: false,
    profileGoldDelta: 200
  }, emptyInventory);
  profileStore.settleRun("profile-rep-test", {
    result: "failure",
    reason: "killed",
    survivedSeconds: 90,
    playerKills: 0,
    monsterKills: 4,
    extractedGold: 0,
    extractedTreasureValue: 0,
    extractedItems: [],
    retainedItems: [],
    lostItems: [],
    loadoutLost: true,
    profileGoldDelta: 0
  }, emptyInventory);

  const stats = profileStore.get("profile-rep-test").lifetimeStats;
  assert.equal(stats.totalRuns, 2, "two runs should be recorded");
  assert.equal(stats.totalExtracts, 1, "one extract should be recorded");
  assert.equal(stats.totalDeaths, 1, "one death should be recorded");
  assert.equal(stats.totalMonsterKills, 15, "monster kills should accumulate");
  assert.equal(stats.totalPlayerKills, 2, "player kills should accumulate");
  assert.equal(stats.totalGoldEarned, 200, "positive gold should accumulate");
  assert.equal(stats.bestRunValue, 200, "best run value should track the peak");

  // 3. 急售价随信誉提升
  const sellOnce = (profileId: string): number => {
    const profile = profileStore.get(profileId);
    const stashItem = profile.stash.pages[0]?.items[0] ?? profile.inventory.items[0];
    const itemId = stashItem?.instanceId ?? profile.equipment.weapon?.instanceId;
    assert.ok(itemId, "profile should own at least the starter weapon to sell");
    return marketStore.sellToSystem({ playerId: profileId, itemInstanceId: itemId! }).goldDelta;
  };

  const lowRepPrice = sellOnce("profile-low-rep");

  const highRepId = "profile-high-rep";
  profileStore.get(highRepId);
  profileStore.addMerchantRep(highRepId, 99999);
  const highRepPrice = sellOnce(highRepId);

  assert.ok(
    highRepPrice > lowRepPrice,
    `max-tier rep should sell the same starter weapon for more (low=${lowRepPrice}, high=${highRepPrice})`
  );

  const lowRepAfter = profileStore.get("profile-low-rep").merchantRep;
  assert.equal(lowRepAfter, lowRepPrice, "selling should grant rep equal to the sale value");

  console.log("[merchant-rep] PASS rep tiers price scaling, sale rep gain, lifetime stats accumulation");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

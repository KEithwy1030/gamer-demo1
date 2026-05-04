import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketStore } from "../server/src/market-store.ts";
import { ProfileStore } from "../server/src/profile-store.ts";

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
  const profile = profileStore.get(profileId);
  const weapon = profile.equipment.weapon;

  assert(weapon, "default profile should start with an equipped weapon");

  const listing = marketStore.create({
    playerId: profileId,
    itemInstanceId: weapon.instanceId,
    price: 123
  });
  assert(listing.item.instanceId === weapon.instanceId, "listing should preserve item instance id");
  assert(!listProfileItems(profileStore.get(profileId)).includes(weapon.instanceId), "listed item should be removed from profile");

  const updated = marketStore.update(listing.listingId, {
    playerId: profileId,
    price: 321
  });
  assert(updated.price === 321, "listing price should update");
  assert(marketStore.list(profileId).length === 1, "listing should remain visible after price update");

  marketStore.cancel(profileId, listing.listingId);
  assert(marketStore.list(profileId).length === 0, "cancelled listing should be removed");
  assert(listProfileItems(profileStore.get(profileId)).includes(weapon.instanceId), "cancelled item should return to profile");

  console.log("[market-lifecycle] PASS create/update/cancel preserves item ownership");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

import { ProfileStore } from "../server/src/profile-store.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrow(action: () => void, expectedMessage: string): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedMessage), `expected error to include \"${expectedMessage}\", got \"${message}\"`);
    return;
  }
  throw new Error(`expected error containing \"${expectedMessage}\"`);
}

const PROFILE_ID = "drag-contract-profile";

function createStore(): ProfileStore {
  return new ProfileStore(`./server/data/test-profile-drag-contract-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

function seedProfile(store: ProfileStore) {
  let profile = store.get(PROFILE_ID, "Verifier");

  profile = store.move(PROFILE_ID, {
    itemInstanceId: profile.equipment.weapon!.instanceId,
    targetArea: "stash",
    pageIndex: 0,
    x: 0,
    y: 0
  });

  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "grid-a",
    definitionId: "treasure_small_idol",
    kind: "treasure",
    rarity: "common",
    name: "Grid A"
  });
  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "grid-b",
    definitionId: "gold_pouch",
    kind: "gold",
    rarity: "common",
    name: "Grid B"
  });
  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "grid-c",
    definitionId: "treasure_small_idol",
    kind: "treasure",
    rarity: "common",
    name: "Grid C"
  });
  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "stash-swap",
    definitionId: "gold_pouch",
    kind: "gold",
    rarity: "common",
    name: "Stash Swap"
  });
  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "head-stash",
    definitionId: "armor_head_common",
    kind: "armor",
    rarity: "common",
    name: "Head Stash"
  });
  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "chest-stash",
    definitionId: "armor_chest_common",
    kind: "armor",
    rarity: "common",
    name: "Chest Stash"
  });
  profile = store.returnMarketItem(PROFILE_ID, {
    instanceId: "head-equipped",
    definitionId: "leather_hood",
    kind: "armor",
    rarity: "common",
    name: "Head Equipped"
  });

  profile = store.move(PROFILE_ID, { itemInstanceId: "grid-a", targetArea: "grid", x: 0, y: 0 });
  profile = store.move(PROFILE_ID, { itemInstanceId: "grid-b", targetArea: "grid", x: 1, y: 0 });
  profile = store.move(PROFILE_ID, { itemInstanceId: "grid-c", targetArea: "grid", x: 2, y: 0 });
  profile = store.move(PROFILE_ID, { itemInstanceId: "head-equipped", targetArea: "equipment", slot: "head" });

  return profile;
}

function getInventoryItem(profile: ReturnType<ProfileStore["get"]>, id: string) {
  return profile.inventory.items.find((item) => item.instanceId === id);
}

function getStashItem(profile: ReturnType<ProfileStore["get"]>, id: string, pageIndex = 0) {
  return profile.stash.pages[pageIndex]?.items.find((item) => item.instanceId === id);
}

function assertUniqueInstances(profile: ReturnType<ProfileStore["get"]>, expectedIds: string[]): void {
  const ids = [
    ...profile.inventory.items.map((item) => item.instanceId),
    ...Object.values(profile.equipment).flatMap((item) => item ? [item.instanceId] : []),
    ...profile.stash.pages.flatMap((page) => page.items.map((item) => item.instanceId)),
    ...(profile.pendingReturn?.items ?? []).map((item) => item.instanceId)
  ];

  assert(ids.length === new Set(ids).size, `instance ids should stay unique: ${ids.join(", ")}`);
  assert(ids.length === expectedIds.length, `expected ${expectedIds.length} instances, got ${ids.length}`);
  expectedIds.forEach((id) => assert(ids.includes(id), `missing instance ${id}`));
}

function main(): void {
  {
    const store = createStore();
    let profile = seedProfile(store);
    profile = store.move(PROFILE_ID, {
      itemInstanceId: "grid-a",
      targetArea: "grid",
      x: 1,
      y: 0,
      swapItemInstanceId: "grid-b"
    });

    assert(getInventoryItem(profile, "grid-a")?.x === 1 && getInventoryItem(profile, "grid-a")?.y === 0, "grid-a should move into grid-b slot");
    assert(getInventoryItem(profile, "grid-b")?.x === 0 && getInventoryItem(profile, "grid-b")?.y === 0, "grid-b should move into grid-a slot");
    assertUniqueInstances(profile, ["grid-a", "grid-b", "grid-c", "stash-swap", "head-stash", "chest-stash", "head-equipped", profile.stash.pages[0].items.find((item) => item.definitionId === "weapon_sword_basic")!.instanceId]);
  }

  {
    const store = createStore();
    let profile = seedProfile(store);
    profile = store.move(PROFILE_ID, {
      itemInstanceId: "stash-swap",
      targetArea: "grid",
      x: 0,
      y: 0,
      swapItemInstanceId: "grid-a"
    });

    assert(getInventoryItem(profile, "stash-swap")?.x === 0 && getInventoryItem(profile, "stash-swap")?.y === 0, "stash item should land in loadout grid target slot");
    assert(Boolean(getStashItem(profile, "grid-a")), "displaced loadout item should move back into stash");
    assertUniqueInstances(profile, ["grid-a", "grid-b", "grid-c", "stash-swap", "head-stash", "chest-stash", "head-equipped", profile.stash.pages[0].items.find((item) => item.definitionId === "weapon_sword_basic")!.instanceId]);
  }

  {
    const store = createStore();
    let profile = seedProfile(store);
    profile = store.move(PROFILE_ID, {
      itemInstanceId: "head-stash",
      targetArea: "equipment",
      slot: "head",
      swapItemInstanceId: "head-equipped"
    });

    assert(profile.equipment.head?.instanceId === "head-stash", "stash armor should equip into head slot");
    assert(Boolean(getInventoryItem(profile, "head-equipped")), "displaced equipped armor should return to inventory");
  }

  {
    const store = createStore();
    let profile = seedProfile(store);
    profile = store.move(PROFILE_ID, {
      itemInstanceId: "head-equipped",
      targetArea: "grid",
      x: 6,
      y: 2
    });

    assert(getInventoryItem(profile, "head-equipped")?.x === 6 && getInventoryItem(profile, "head-equipped")?.y === 2, "equipped item should move into inventory grid");
    assert(!profile.equipment.head, "head slot should clear after moving equipped item into inventory");
  }

  {
    const store = createStore();
    seedProfile(store);
    expectThrow(() => store.move(PROFILE_ID, {
      itemInstanceId: "chest-stash",
      targetArea: "grid",
      x: 9,
      y: 4
    }), "Inventory is full.");
  }

  {
    const store = createStore();
    seedProfile(store);
    expectThrow(() => store.move(PROFILE_ID, {
      itemInstanceId: "grid-a",
      targetArea: "grid",
      x: 0,
      y: 0,
      swapItemInstanceId: "head-equipped"
    }), "Swap target not found.");
  }

  console.log("[profile-drag-contract] PASS stash/loadout/equipment move-swap contract");
}

main();

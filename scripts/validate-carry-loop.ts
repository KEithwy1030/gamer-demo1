import { setTimeout as delay } from "node:timers/promises";
import {
  STEP_TIMEOUTS,
  cleanup,
  clearThreatsNearPoint,
  createClient,
  ensureServerBuild,
  getPreferredExtractZone,
  killOneMonster,
  movePlayerAlongSafeRoute,
  pickupNearestDrop,
  startServer,
  waitForCondition,
  waitForServerReady,
  waitForSocketConnect
} from "./test-loop.mjs";
import {
  applySettlementToProfile,
  buildProfileLoadoutSnapshot,
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

type TestClient = ReturnType<typeof createClient>;

interface CarriedExpectation {
  instanceId: string;
  definitionId: string;
}

interface RoundResult {
  profile: LocalProfile;
  carriedItem: CarriedExpectation;
}

function log(message: string): void {
  console.log(`[carry-loop] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function resetClientState(client: TestClient): void {
  client.state.roomState = undefined;
  client.state.matchStarted = undefined;
  client.state.players = [];
  client.state.monsters = [];
  client.state.drops = [];
  client.state.inventory = undefined;
  client.state.lootSpawned = [];
  client.state.lootPicked = [];
  client.state.extractOpened = undefined;
  client.state.extractProgress = undefined;
  client.state.extractSuccess = undefined;
  client.state.settlement = undefined;
  client.state.roomErrors = [];
  client.state.disconnectReason = undefined;
}

function summarizeSnapshotLoadout(snapshot: ReturnType<typeof buildProfileLoadoutSnapshot>): string {
  const inventory = snapshot.inventory.items.map((item) => `${item.definitionId}:${item.instanceId}@${item.x},${item.y}`);
  const equipment = Object.entries(snapshot.equipment ?? {}).map(([slot, item]) => `${slot}=${item.definitionId}:${item.instanceId}`);
  return `inventory=[${inventory.join(", ")}] equipment=[${equipment.join(", ")}]`;
}

function summarizeRuntimeInventory(inventoryUpdate: TestClient["state"]["inventory"]): string {
  const inventory = (inventoryUpdate?.inventory?.items ?? []).map((entry) => {
    const item = entry.item;
    return `${item.templateId ?? item.definitionId ?? "unknown"}:${item.instanceId}@${entry.x},${entry.y}`;
  });
  const equipment = Object.entries(inventoryUpdate?.inventory?.equipment ?? {}).flatMap(([slot, item]) => (
    item ? [`${slot}=${item.templateId ?? item.definitionId ?? "unknown"}:${item.instanceId}`] : []
  ));
  return `inventory=[${inventory.join(", ")}] equipment=[${equipment.join(", ")}]`;
}

function listInventoryInstanceIds(inventoryUpdate: TestClient["state"]["inventory"]): Set<string> {
  const ids = new Set<string>();
  for (const entry of inventoryUpdate?.inventory?.items ?? []) {
    ids.add(entry.item.instanceId);
  }
  for (const item of Object.values(inventoryUpdate?.inventory?.equipment ?? {})) {
    if (item?.instanceId) {
      ids.add(item.instanceId);
    }
  }
  return ids;
}

function inventoryContains(
  inventoryUpdate: TestClient["state"]["inventory"],
  expected: CarriedExpectation
): boolean {
  const entries = [
    ...(inventoryUpdate?.inventory?.items ?? []).map((entry) => entry.item),
    ...Object.values(inventoryUpdate?.inventory?.equipment ?? {}).filter((item): item is NonNullable<typeof item> => Boolean(item))
  ];

  return entries.some((item) => {
    const definitionId = item.definitionId ?? item.templateId ?? "unknown";
    return item.instanceId === expected.instanceId && definitionId === expected.definitionId;
  });
}

function selectSettledWeapon(profile: LocalProfile): LocalProfileItem | undefined {
  return listReturnedItems(profile).find((item) => item.equipmentSlot === "weapon");
}

function listReturnedItems(profile: LocalProfile): LocalProfileItem[] {
  return [
    ...(profile.pendingReturn?.items ?? []),
    ...profile.stash.pages.flatMap((page) => page.items)
  ];
}

function summarizeReturnedItems(profile: LocalProfile): string {
  const pending = (profile.pendingReturn?.items ?? []).map((item) => `${item.definitionId}:${item.instanceId}`);
  const stash = profile.stash.pages.flatMap((page, pageIndex) => (
    page.items.map((item) => `p${pageIndex}:${item.definitionId}:${item.instanceId}`)
  ));
  return `pending=[${pending.join(", ")}] stash=[${stash.join(", ")}]`;
}

function selectReturnedItem(profile: LocalProfile, expected: CarriedExpectation): LocalProfileItem | undefined {
  return listReturnedItems(profile).find((item) => item.instanceId === expected.instanceId);
}

function selectCarryCandidate(profile: LocalProfile): CarriedExpectation {
  const returnedItems = listReturnedItems(profile);
  const preferred = returnedItems.find((item) => item.equipmentSlot !== "weapon") ?? returnedItems[0];
  if (!preferred) {
    throw new Error("Settlement did not leave any returned item to carry into the next run");
  }

  return {
    instanceId: preferred.instanceId,
    definitionId: preferred.definitionId
  };
}

function prepareNextLoadout(profile: LocalProfile, carriedItem: CarriedExpectation): RoundResult {
  let next = profile;
  const settledWeapon = selectSettledWeapon(next);
  if (settledWeapon) {
    next = moveProfileItem(next, {
      itemInstanceId: settledWeapon.instanceId,
      targetArea: "equipment",
      slot: "weapon"
    });
  }

  const alreadyEquipped = Object.values(next.equipment).find((item) => item?.instanceId === carriedItem.instanceId);
  if (alreadyEquipped) {
    return {
      profile: next,
      carriedItem: {
        instanceId: alreadyEquipped.instanceId,
        definitionId: alreadyEquipped.definitionId
      }
    };
  }

  const returnedItem = selectReturnedItem(next, carriedItem);
  if (!returnedItem) {
    log(`prepareNextLoadout missing carried item ${carriedItem.instanceId}; ${summarizeReturnedItems(next)}`);
    throw new Error(`Returned inventory is missing carried item ${carriedItem.instanceId}`);
  }

  if (returnedItem.equipmentSlot && !next.equipment[returnedItem.equipmentSlot]) {
    next = moveProfileItem(next, {
      itemInstanceId: returnedItem.instanceId,
      targetArea: "equipment",
      slot: returnedItem.equipmentSlot
    });
  } else {
    next = moveProfileItem(next, {
      itemInstanceId: returnedItem.instanceId,
      targetArea: "grid"
    });
  }

  const resolvedItem = next.inventory.items.find((item) => item.instanceId === carriedItem.instanceId)
    ?? Object.values(next.equipment).find((item) => item?.instanceId === carriedItem.instanceId);

  if (!resolvedItem) {
    throw new Error(`Prepared loadout is missing carried item ${carriedItem.instanceId}`);
  }

  return {
    profile: next,
    carriedItem: {
      instanceId: resolvedItem.instanceId,
      definitionId: resolvedItem.definitionId
    }
  };
}

async function reachExtractZone(client: TestClient, roundIndex: number): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const extractZone = await waitForCondition(
        () => getPreferredExtractZone(client.state),
        STEP_TIMEOUTS[9],
        `Round ${roundIndex}: no usable extract zone found`
      );

      await clearThreatsNearPoint(client, extractZone, 320, 35_000);
      await movePlayerAlongSafeRoute(client, extractZone, extractZone.radius - 36, 24_000);
      await clearThreatsNearPoint(client, extractZone, 260, 25_000);
      await movePlayerAlongSafeRoute(client, extractZone, extractZone.radius - 36, 12_000);
      return;
    } catch (error) {
      lastError = error;
      client.socket.emit("player:inputMove", {
        direction: { x: 0, y: 0 }
      });
      await delay(250);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Round ${roundIndex}: failed to reach extract zone`);
}

function normalizeRuntimeInventory(inventoryUpdate: TestClient["state"]["inventory"]): MatchInventoryState {
  return {
    width: Number.isFinite(inventoryUpdate?.inventory?.width) ? inventoryUpdate.inventory.width : 10,
    height: Number.isFinite(inventoryUpdate?.inventory?.height) ? inventoryUpdate.inventory.height : 6,
    items: (inventoryUpdate?.inventory?.items ?? []).flatMap((entry) => {
      const item = entry?.item;
      if (!item) {
        return [];
      }

      return [{
        instanceId: item.instanceId,
        definitionId: item.templateId ?? item.definitionId ?? "unknown",
        name: item.name,
        kind: item.kind,
        rarity: item.rarity,
        width: item.width,
        height: item.height,
        x: entry.x,
        y: entry.y,
        slot: item.equipmentSlot ?? item.slot,
        equipmentSlot: item.equipmentSlot ?? item.slot,
        healAmount: item.healAmount,
        modifiers: item.modifiers ? { ...item.modifiers } : undefined,
        affixes: Array.isArray(item.affixes) ? item.affixes.map((affix) => ({ ...affix })) : undefined
      }];
    }),
    equipment: Object.fromEntries(
      Object.entries(inventoryUpdate?.inventory?.equipment ?? {}).flatMap(([slot, item]) => {
        if (!item) {
          return [];
        }

        return [[slot, {
          instanceId: item.instanceId,
          definitionId: item.templateId ?? item.definitionId ?? "unknown",
          name: item.name,
          kind: item.kind,
          rarity: item.rarity,
          width: item.width,
          height: item.height,
          slot: item.equipmentSlot ?? item.slot ?? slot,
          equipmentSlot: item.equipmentSlot ?? item.slot ?? slot,
          healAmount: item.healAmount,
          modifiers: item.modifiers ? { ...item.modifiers } : undefined,
          affixes: Array.isArray(item.affixes) ? item.affixes.map((affix) => ({ ...affix })) : undefined
        }]];
      })
    )
  };
}

async function runRound(
  roundIndex: number,
  profile: LocalProfile,
  expectedCarry?: CarriedExpectation,
  options?: {
    startOnly?: boolean;
  }
): Promise<RoundResult> {
  const clients: TestClient[] = [];
  try {
    const playerA = createClient(`PlayerA-R${roundIndex}`);
    const playerB = createClient(`PlayerB-R${roundIndex}`);
    clients.push(playerA, playerB);

    resetClientState(playerA);
    resetClientState(playerB);

    await Promise.all([
      waitForSocketConnect(playerA.socket, playerA.state.label),
      waitForSocketConnect(playerB.socket, playerB.state.label)
    ]);

    const startLoadout = buildProfileLoadoutSnapshot(profile);
    playerA.socket.emit("room:create", {
      playerName: "PlayerA",
      botDifficulty: "easy",
      loadout: startLoadout
    });

    const roomState = await waitForCondition(
      () => playerA.state.roomState?.code ? playerA.state.roomState : undefined,
      STEP_TIMEOUTS[1],
      `Round ${roundIndex}: host room creation timed out`
    );
    const roomCode = roomState.code;

    playerB.socket.emit("room:join", {
      code: roomCode,
      playerName: "PlayerB"
    });

    await waitForCondition(
      () => {
        const players = playerA.state.roomState?.players ?? [];
        return players.length >= 2 ? players : undefined;
      },
      STEP_TIMEOUTS[2],
      `Round ${roundIndex}: guest join timed out`
    );

    playerA.socket.emit("room:start", {
      code: roomCode,
      botDifficulty: "easy",
      loadout: startLoadout
    });

    await Promise.all([
      waitForCondition(
        () => playerA.state.matchStarted,
        STEP_TIMEOUTS[3],
        `Round ${roundIndex}: host match start timed out`
      ),
      waitForCondition(
        () => playerB.state.matchStarted,
        STEP_TIMEOUTS[3],
        `Round ${roundIndex}: guest match start timed out`
      )
    ]);

    const startingInventory = await waitForCondition(
      () => playerA.state.inventory,
      STEP_TIMEOUTS[3],
      `Round ${roundIndex}: initial inventory:update missing`
    );

    if (expectedCarry) {
      if (!inventoryContains(startingInventory, expectedCarry)) {
        log(`round ${roundIndex} expected carry missing`);
        log(`round ${roundIndex} sent loadout ${summarizeSnapshotLoadout(startLoadout)}`);
        log(`round ${roundIndex} received inventory ${summarizeRuntimeInventory(startingInventory)}`);
      }
      assert(
        inventoryContains(startingInventory, expectedCarry),
        `Round ${roundIndex}: carried item ${expectedCarry.instanceId} was not present at match start`
      );
      log(`round ${roundIndex} start verified carried item ${expectedCarry.definitionId}:${expectedCarry.instanceId}`);
    } else {
      log(`round ${roundIndex} start verified initial loadout handshake`);
    }

    if (options?.startOnly) {
      return {
        profile,
        carriedItem: expectedCarry ?? {
          instanceId: "",
          definitionId: ""
        }
      };
    }

    await waitForCondition(
      () => playerA.state.monsters.filter((monster) => monster.isAlive).length > 0 ? true : undefined,
      STEP_TIMEOUTS[4],
      `Round ${roundIndex}: no alive monsters observed`
    );

    const initialItemIds = listInventoryInstanceIds(startingInventory);

    await killOneMonster(playerA, STEP_TIMEOUTS[5]);
    await waitForCondition(
      () => {
        if (playerA.state.lootSpawned.length > 0) {
          return true;
        }
        return playerA.state.drops.length > 0 ? true : undefined;
      },
      STEP_TIMEOUTS[6],
      `Round ${roundIndex}: no drops spawned after kill`
    );

    await pickupNearestDrop(playerA, STEP_TIMEOUTS[7]);

    const postPickupInventory = await waitForCondition(
      () => {
        const inventory = playerA.state.inventory;
        if (!inventory) {
          return undefined;
        }
        const nextIds = listInventoryInstanceIds(inventory);
        for (const id of nextIds) {
          if (!initialItemIds.has(id)) {
            return inventory;
          }
        }
        return undefined;
      },
      STEP_TIMEOUTS[7],
      `Round ${roundIndex}: pickup never appeared in inventory`
    );
    log(`round ${roundIndex} after pickup ${summarizeRuntimeInventory(postPickupInventory)}`);

    await waitForCondition(
      () => playerA.state.extractOpened,
      STEP_TIMEOUTS[8],
      `Round ${roundIndex}: extract never opened`
    );

    await reachExtractZone(playerA, roundIndex);
    playerA.socket.emit("player:startExtract");

    await waitForCondition(
      () => {
        if (playerA.state.extractSuccess) {
          return true;
        }
        const progress = playerA.state.extractProgress;
        if (
          progress
          && progress.playerId === playerA.state.matchStarted?.selfPlayerId
          && (progress.status === "started" || progress.status === "progress")
        ) {
          return true;
        }
        return undefined;
      },
      STEP_TIMEOUTS[9],
      `Round ${roundIndex}: no extract progress event observed`
    );

    const settlementEnvelope = await waitForCondition(
      () => {
        const payload = playerA.state.settlement;
        return payload?.playerId === playerA.state.matchStarted?.selfPlayerId ? payload : undefined;
      },
      STEP_TIMEOUTS[10],
      `Round ${roundIndex}: settlement timed out`
    );

    assert(
      settlementEnvelope.settlement?.result === "success" && settlementEnvelope.settlement?.reason === "extracted",
      `Round ${roundIndex}: expected extracted success, got ${settlementEnvelope.settlement?.result ?? "unknown"} / ${settlementEnvelope.settlement?.reason ?? "n/a"}`
    );

    assert(playerA.state.inventory?.inventory, `Round ${roundIndex}: final runtime inventory missing`);
    log(`round ${roundIndex} before settlement apply ${summarizeRuntimeInventory(playerA.state.inventory)}`);

    const settledProfile = applySettlementToProfile(
      profile,
      settlementEnvelope.settlement,
      normalizeRuntimeInventory(playerA.state.inventory)
    );

    const nextRound = prepareNextLoadout(
      settledProfile,
      selectCarryCandidate(settledProfile)
    );

    log(`round ${roundIndex} extracted with ${nextRound.carriedItem.definitionId}:${nextRound.carriedItem.instanceId}`);

    return nextRound;
  } finally {
    await cleanup({ clients, serverProcess: undefined });
    await delay(250);
  }
}

async function main(): Promise<void> {
  const storage = globalThis.localStorage as MemoryStorage;
  storage.clear();

  await ensureServerBuild();
  const serverProcess = startServer();

  try {
    await waitForServerReady(serverProcess);
    await delay(2_000);

    let profile = loadLocalProfile();
    let expectedCarry: CarriedExpectation | undefined;

    for (const roundIndex of [1, 2]) {
      const result = await runRound(roundIndex, profile, expectedCarry);
      profile = result.profile;
      expectedCarry = result.carriedItem;
    }

    assert(expectedCarry, "Carry-loop validation never produced a carried item for the next run");
    await runRound(3, profile, expectedCarry, { startOnly: true });

    assert(
      Boolean(profile.equipment.weapon),
      "Carry-loop validation ended without a reusable weapon in the next-run loadout"
    );
    assert(
      Boolean(
        expectedCarry
        && (
          profile.inventory.items.some((item) => item.instanceId === expectedCarry.instanceId)
          || Object.values(profile.equipment).some((item) => item?.instanceId === expectedCarry.instanceId)
        )
      ),
      "Carry-loop validation ended without the proven carried item in the next-run loadout"
    );

    log("validated three consecutive runs: extract -> pending return -> reorganize -> next run loadout");
  } finally {
    await cleanup({ clients: [], serverProcess });
  }
}

main().catch((error) => {
  console.error(`[carry-loop:fatal] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});

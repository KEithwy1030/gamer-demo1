import assert from "node:assert/strict";
import { buildMatchLayout } from "../server/src/match-layout.js";
import {
  CHEST_OPEN_DURATION_MS,
  interruptChestOpening,
  listChests,
  spawnChests,
  startChestOpening,
  tickChestOpenings
} from "../server/src/chests/chest-manager.js";
import { buildInventoryItem } from "../server/src/loot/loot-manager.js";
import type { InventoryEntry, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

assertMatchLayoutSpawnsSixteenChests();
assertSpawnChestsFromLayout();
assertRummageStartAndInventoryFeed();
assertRummageInterruptOnMovementAndDamage();
assertNoisePulseAlertsNearbyMonstersOnAnyChest();
assertFullBackpackSpillsOneDropPerTick();

console.log("[chest-contract] PASS abandoned crate shape, 3-5 item rummage, 60px interrupt, per-tick inventory/drop feed, all-chest noise pulse, rich guarantee");

function assertMatchLayoutSpawnsSixteenChests(): void {
  const layout = buildMatchLayout({
    roomCode: "CHEST",
    startedAt: 1_714_950_000_000,
    squadIds: ["player", "bot_alpha", "bot_beta"]
  });

  assert.equal(layout.chestZones.length, 16, "match layout should place exactly 16 chests");
}

function assertSpawnChestsFromLayout(): void {
  const room = createRoom();
  spawnChests(room);

  assert.equal(room.chests?.size, room.matchLayout?.chestZones.length, "spawnChests should create one chest per layout chest zone");

  const normal = room.chests?.get("crate_player");
  const rich = room.chests?.get("crate_center");
  assert.ok(normal, "normal crate should be keyed from layout chestId");
  assert.ok(rich, "rich crate should be keyed from layout chestId");
  assert.equal(normal.kind, "abandoned_crate", "normal crate should use the abandoned crate kind");
  assert.equal(normal.lane, "abandoned", "normal crate should expose the unified lane marker");
  assert.equal(normal.qualityTier, "normal", "normal crate should preserve normal quality tier");
  assert.equal(rich.qualityTier, "rich", "center crate should preserve rich quality tier");
  assert.equal(normal.state, "idle", "crate should start idle");
  assert.equal(rich.state, "idle", "rich crate should start idle");
  assert.equal(normal.itemsDispensed, 0, "crate should start with zero dispensed items");
  assert.ok(normal.totalItems >= 3 && normal.totalItems <= 5, "normal crate should roll 3-5 total items");
  assert.ok(rich.totalItems >= 3 && rich.totalItems <= 5, "rich crate should roll 3-5 total items");
  assert.equal(normal.noiseRadius, 720, "all crates should expose the shared noise radius");
  assert.equal(rich.noiseRadius, 720, "rich crates should expose the shared noise radius");
  assert.ok(
    rich.loot.some((item) => item.rarity && item.rarity !== "common"),
    "rich crate should guarantee at least one non-white item"
  );

  const listedRich = listChests(room).find((entry) => entry.chestId === rich.id);
  assert.equal(listedRich?.qualityTier, "rich", "client chest init should expose rich quality tier");
  assert.equal(listedRich?.state, "idle", "client chest init should expose idle chest state");
  assert.equal(listedRich?.totalItems, rich.totalItems, "client chest init should expose total item count");
}

function assertRummageStartAndInventoryFeed(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("crate_player")!;

  const started = startChestOpening(room, player.id, chest.id, now);
  assert.equal(started.status, "started", "starting a rummage should emit a started event");
  assert.equal(chest.state, "rummaging", "starting a rummage should move the crate into rummaging state");
  assert.equal(chest.rummagerId, player.id, "starting a rummage should record the active rummager");

  let tick = tickChestOpenings(room, now + CHEST_OPEN_DURATION_MS - 1);
  assert.equal(tick.openedEvents.length, 0, "rummage should not dispense before the tick interval");
  assert.equal(chest.itemsDispensed, 0, "pre-interval tick should not dispense any items");

  let currentTime = now + CHEST_OPEN_DURATION_MS;
  tick = tickChestOpenings(room, currentTime);
  assert.equal(tick.openedEvents.length, 1, "first rummage tick should dispense exactly one item");
  assert.deepEqual(tick.inventoryUpdatedPlayerIds, [player.id], "first rummage tick should update the rummager inventory when space exists");
  assert.equal(player.inventory!.items.length, 1, "first rummage tick should auto-place the item in inventory");
  assert.equal(room.drops?.size ?? 0, 0, "no world drops should spawn while the backpack has space");
  assert.equal(chest.itemsDispensed, 1, "first rummage tick should increment dispensed count");

  while (chest.state !== "empty") {
    currentTime += CHEST_OPEN_DURATION_MS;
    tick = tickChestOpenings(room, currentTime);
  }

  assert.equal(chest.isOpen, true, "completed rummage should mark the crate unavailable");
  assert.equal(chest.rummagerId, undefined, "completed rummage should clear the rummager");
  assert.equal(chest.itemsDispensed, chest.totalItems, "completed rummage should dispense the full rolled count");
  assert.equal(player.inventory!.items.length, chest.totalItems, "all items should auto-feed into inventory when there is space");
  assert.equal(room.drops?.size ?? 0, 0, "successful rummage should not create ground drops when there is space");
}

function assertRummageInterruptOnMovementAndDamage(): void {
  const moveRoom = createRoom();
  spawnChests(moveRoom);
  const movePlayer = moveRoom.players.get("player-1")!;
  const moveChest = moveRoom.chests!.get("crate_player")!;

  startChestOpening(moveRoom, movePlayer.id, moveChest.id, now);
  movePlayer.state!.x += 61;
  const moved = tickChestOpenings(moveRoom, now + CHEST_OPEN_DURATION_MS);
  assert.equal(moved.openedEvents.length, 0, "leaving the 60px window should not dispense items");
  assert.equal(moved.progressEvents.at(-1)?.status, "interrupted", "leaving the 60px window should interrupt rummage");
  assert.equal(moveChest.state, "interrupted", "movement interrupt should hard-empty the crate");
  assert.equal(moveChest.isOpen, true, "movement interrupt should mark the crate unavailable");
  assert.equal(moveChest.itemsDispensed, 0, "movement interrupt should lose undispatched items instead of dropping them");
  assert.equal(moveRoom.drops?.size ?? 0, 0, "movement interrupt should not spill the remaining loot");
  assert.throws(
    () => startChestOpening(moveRoom, movePlayer.id, moveChest.id, now + CHEST_OPEN_DURATION_MS * 2),
    /unavailable/,
    "interrupted crate should not be re-rummageable"
  );

  const damageRoom = createRoom();
  spawnChests(damageRoom);
  const damagePlayer = damageRoom.players.get("player-1")!;
  const damageChest = damageRoom.chests!.get("crate_player")!;
  startChestOpening(damageRoom, damagePlayer.id, damageChest.id, now);
  const manualInterruption = interruptChestOpening(damageRoom, damagePlayer.id);
  assert.equal(manualInterruption?.status, "interrupted", "manual damage interrupt should return interrupted chest progress");
  assert.equal(damageChest.state, "interrupted", "manual damage interrupt should hard-empty the crate");
  assert.equal(damagePlayer.openingChest, undefined, "manual damage interrupt should clear the active rummage state");
}

function assertNoisePulseAlertsNearbyMonstersOnAnyChest(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("crate_player")!;
  const monster = createMonster("elite-near", chest.x + 120, chest.y);
  room.monsters = new Map([[monster.id, monster]]);

  startChestOpening(room, player.id, chest.id, now);
  assert.equal(room.contestedChestNoise, undefined, "starting rummage should not emit the pulse before the first tick");

  const tick = tickChestOpenings(room, now + CHEST_OPEN_DURATION_MS);
  assert.equal(room.monsters.get(monster.id)?.targetPlayerId, player.id, "the first rummage pulse should aggro nearby monsters for any crate tier");
  assert.deepEqual(tick.openedEvents[0]?.aggroedMonsterIds, [monster.id], "the dispense event should report the aggroed monsters");
  assert.equal(room.contestedChestNoise?.chestId, chest.id, "the noise marker should track the pulsing crate");
  assert.ok(
    (room.contestedChestNoise?.expiresAt ?? 0) - (room.contestedChestNoise?.createdAt ?? 0) <= CHEST_OPEN_DURATION_MS,
    "the noise marker should last only for the active rummage pulse window"
  );
}

function assertFullBackpackSpillsOneDropPerTick(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("crate_center")!;
  player.state!.x = chest.x;
  player.state!.y = chest.y;
  player.inventory!.items = fillBackpack();

  const inventoryIdsBefore = player.inventory!.items.map((entry) => entry.item.instanceId).sort();
  startChestOpening(room, player.id, chest.id, now);

  let currentTime = now;
  while (chest.state !== "empty") {
    currentTime += CHEST_OPEN_DURATION_MS;
    const tick = tickChestOpenings(room, currentTime);
    assert.equal(tick.openedEvents.length, 1, "each rummage interval should dispense at most one item");
    assert.equal(tick.inventoryUpdatedPlayerIds.length, 0, "full backpack should not accept crate items directly");
  }

  assert.equal(player.inventory!.items.length, inventoryIdsBefore.length, "full backpack should remain unchanged while rummaging");
  assert.deepEqual(
    player.inventory!.items.map((entry) => entry.item.instanceId).sort(),
    inventoryIdsBefore,
    "full backpack should not swallow or reshuffle crate items"
  );
  assert.equal(room.drops?.size, chest.totalItems, "overflowing a backpack should spawn one ground drop per dispensed item");
  assert.equal(chest.itemsDispensed, chest.totalItems, "overflow path should still fully empty the crate");
}

function createRoom(): RuntimeRoom {
  const player = createPlayer("player-1", 900, 1000);
  return {
    code: "CHEST",
    hostPlayerId: player.id,
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([[player.id, player]]),
    matchLayout: {
      templateId: "A",
      squadSpawns: [],
      extractZones: [],
      chestZones: [
        { chestId: "crate_player", x: 900, y: 1000, kind: "abandoned_crate", lane: "abandoned", qualityTier: "normal", squadId: "player" },
        { chestId: "crate_center", x: 1900, y: 1900, kind: "abandoned_crate", lane: "abandoned", qualityTier: "rich" }
      ],
      safeZones: [],
      riverHazards: [],
      safeCrossings: [],
      obstacleZones: [],
      landmarks: []
    }
  };
}

function createPlayer(id: string, x: number, y: number): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: true,
    ready: true,
    joinedAt: now,
    squadId: "player",
    squadType: "human",
    isBot: false,
    state: {
      id,
      name: id,
      x,
      y,
      direction: { x: 1, y: 0 },
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 300,
      attackPower: 10,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0,
      statusEffects: [],
      killsPlayers: 0,
      killsMonsters: 0,
      squadId: "player",
      squadType: "human",
      isBot: false
    },
    inventory: {
      width: 10,
      height: 6,
      items: [],
      equipment: {}
    }
  };
}

function createMonster(id: string, x: number, y: number): RuntimeMonster {
  return {
    id,
    spawnId: id,
    type: "elite",
    x,
    y,
    spawnX: x,
    spawnY: y,
    patrolX: x,
    patrolY: y,
    patrolRadius: 260,
    guardRadius: 420,
    returnDelayMs: 1_000,
    aggroRange: 460,
    leashRange: 760,
    attackRange: 50,
    attackDamage: 18,
    moveSpeed: 180,
    attackCooldownMs: 900,
    nextAttackAt: now,
    behaviorPhase: "idle",
    hp: 180,
    maxHp: 180,
    isAlive: true,
    isEnraged: false,
    enrageThreshold: 0.35,
    enrageAttackDamageBonus: 6,
    enrageMoveSpeedBonus: 35,
    enrageCooldownMultiplier: 0.75
  };
}

function fillBackpack(): InventoryEntry[] {
  const items: InventoryEntry[] = [];
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const item = buildInventoryItem("health_potion", "normal");
      assert.ok(item, "health potion template should build");
      items.push({ item, x, y });
    }
  }
  return items;
}

import assert from "node:assert/strict";
import {
  CHEST_OPEN_DURATION_MS,
  interruptChestOpening,
  openChest,
  spawnChests,
  startChestOpening,
  tickChestOpenings
} from "../server/src/chests/chest-manager.js";
import { buildInventoryItem } from "../server/src/loot/loot-manager.js";
import type { InventoryEntry, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

assertSpawnChestsFromLayout();
assertOpenChestGuardsAndWorldDrops();
assertOpeningChannelCompletesAndInterrupts();
assertContestedChestNoiseAggrosNearbyMonsters();
assertFullBackpackKeepsLootAsWorldDrops();

console.log("[chest-contract] PASS layout spawn, guard rails, channel opening, interrupts, contested noise, world-drop loot, duplicate-open, full-backpack retention");

function assertSpawnChestsFromLayout(): void {
  const room = createRoom();

  spawnChests(room);

  assert.equal(room.chests?.size, room.matchLayout?.chestZones.length, "spawnChests should create one chest per layout chest zone");

  const starter = room.chests?.get("starter_player");
  const contested = room.chests?.get("contested_center");
  assert.ok(starter, "starter chest should be keyed from layout chestId");
  assert.ok(contested, "contested chest should be keyed from layout chestId");
  assert.equal(starter.x, 900, "starter chest x should come from layout");
  assert.equal(starter.y, 1000, "starter chest y should come from layout");
  assert.ok(starter.loot.length >= 2 && starter.loot.length <= 3, "starter chest should roll starter loot count");
  assert.ok(contested.loot.length >= 3 && contested.loot.length <= 5, "contested chest should roll contested loot count");
  assert.ok(
    contested.loot.some((item) => item.kind === "treasure" && item.treasureValue >= 100),
    "contested chest should guarantee at least one high-value treasure"
  );
}

function assertOpenChestGuardsAndWorldDrops(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("starter_player")!;

  assert.throws(
    () => openChest(room, player.id, chest.id, chest.x + 160, chest.y),
    /Too far from the chest/,
    "players outside chest range should not open it"
  );
  assert.equal(chest.isOpen, false, "failed distance check should not open chest");
  assert.equal(room.drops?.size ?? 0, 0, "failed distance check should not spawn drops");

  player.state!.isAlive = false;
  assert.throws(
    () => openChest(room, player.id, chest.id, chest.x, chest.y),
    /Dead players cannot open chests/,
    "dead players should not open chests"
  );
  assert.equal(chest.isOpen, false, "dead-player check should not open chest");
  assert.equal(room.drops?.size ?? 0, 0, "dead-player check should not spawn drops");

  player.state!.isAlive = true;
  const inventoryCountBefore = player.inventory!.items.length;
  const result = openChest(room, player.id, chest.id, chest.x, chest.y);
  assert.equal(chest.isOpen, true, "successful open should mark chest open");
  assert.equal(result.spawnedDrops.length, result.loot.length, "successful open should spawn one world drop per loot item");
  assert.equal(room.drops?.size, result.loot.length, "chest loot should enter shared world-drop state");
  assert.equal(player.inventory!.items.length, inventoryCountBefore, "opening a chest should not directly mutate inventory");

  const spawnedInstanceIds = new Set([...room.drops!.values()].map((drop) => drop.item.instanceId));
  for (const item of result.loot) {
    assert.ok(spawnedInstanceIds.has(item.instanceId), `world drops should preserve chest loot item ${item.instanceId}`);
  }

  assert.throws(
    () => openChest(room, player.id, chest.id, chest.x, chest.y),
    /Chest is already open/,
    "already-open chests should reject duplicate opens"
  );
  assert.equal(room.drops?.size, result.loot.length, "duplicate open should not spawn additional drops");
}

function assertOpeningChannelCompletesAndInterrupts(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("starter_player")!;

  startChestOpening(room, player.id, chest.id, now);
  assert.equal(chest.isOpen, false, "startChestOpening should not open immediately");
  assert.equal(room.drops?.size ?? 0, 0, "opening channel should not spawn drops before completion");
  assert.ok(player.openingChest, "player should record active chest opening");

  let tick = tickChestOpenings(room, now + CHEST_OPEN_DURATION_MS - 1);
  assert.equal(tick.openedEvents.length, 0, "opening should not complete before duration");
  assert.equal(chest.isOpen, false, "pre-duration tick should keep chest closed");

  tick = tickChestOpenings(room, now + CHEST_OPEN_DURATION_MS);
  assert.equal(tick.openedEvents.length, 1, "opening should complete after channel duration");
  assert.equal(tick.openedEvents[0]!.chestId, chest.id, "completion event should identify chest");
  assert.equal(chest.isOpen, true, "completion tick should open chest");
  assert.ok((room.drops?.size ?? 0) > 0, "completion tick should spawn world drops");
  assert.equal(player.openingChest, undefined, "completion tick should clear opening state");

  const interruptRoom = createRoom();
  spawnChests(interruptRoom);
  const interruptPlayer = interruptRoom.players.get("player-1")!;
  const interruptChest = interruptRoom.chests!.get("starter_player")!;
  startChestOpening(interruptRoom, interruptPlayer.id, interruptChest.id, now);
  interruptPlayer.state!.x += 40;
  tick = tickChestOpenings(interruptRoom, now + CHEST_OPEN_DURATION_MS);
  assert.equal(tick.openedEvents.length, 0, "moving during opening should not complete chest");
  assert.equal(tick.interruptedPlayerIds.includes(interruptPlayer.id), true, "moving should report interrupted opener");
  assert.equal(interruptChest.isOpen, false, "interrupted chest should remain closed");
  assert.equal(interruptRoom.drops?.size ?? 0, 0, "interrupted chest should not spawn drops");

  startChestOpening(interruptRoom, interruptPlayer.id, interruptChest.id, now);
  assert.equal(interruptPlayer.openingChest?.chestId, interruptChest.id, "restarting after movement interrupt should be allowed");
  interruptChestOpening(interruptRoom, interruptPlayer.id);
  assert.equal(interruptPlayer.openingChest, undefined, "damage/manual interrupt should clear opening state");
}

function assertContestedChestNoiseAggrosNearbyMonsters(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("contested_center")!;
  player.state!.x = chest.x;
  player.state!.y = chest.y;
  const monster = createMonster("elite-near", chest.x + 120, chest.y);
  room.monsters = new Map([[monster.id, monster]]);

  openChest(room, player.id, chest.id, chest.x, chest.y);
  assert.equal(room.monsters.get(monster.id)?.targetPlayerId, player.id, "contested chest noise should aggro nearby elite");
}

function assertFullBackpackKeepsLootAsWorldDrops(): void {
  const room = createRoom();
  spawnChests(room);
  const player = room.players.get("player-1")!;
  const chest = room.chests!.get("contested_center")!;
  player.inventory!.items = fillBackpack();

  const inventoryIdsBefore = player.inventory!.items.map((entry) => entry.item.instanceId).sort();
  const result = openChest(room, player.id, chest.id, chest.x, chest.y);

  assert.equal(player.inventory!.items.length, inventoryIdsBefore.length, "full backpack should remain unchanged when chest opens");
  assert.deepEqual(
    player.inventory!.items.map((entry) => entry.item.instanceId).sort(),
    inventoryIdsBefore,
    "full backpack should not swallow or partially place chest loot"
  );
  assert.equal(result.spawnedDrops.length, result.loot.length, "full-backpack chest loot should still become world drops");
  assert.equal(room.drops?.size, result.loot.length, "full-backpack loot should be retained in world-drop state");
  assert.ok(
    [...room.drops!.values()].some((drop) => drop.item.treasureValue >= 100),
    "full-backpack contested chest should keep high-value treasure on the ground"
  );
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
        { chestId: "starter_player", x: 900, y: 1000, lane: "starter", squadId: "player" },
        { chestId: "contested_center", x: 1900, y: 1900, lane: "contested" }
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

import assert from "node:assert/strict";
import { spawnChests, openChest } from "../server/src/chests/chest-manager.js";
import { buildInventoryItem } from "../server/src/loot/loot-manager.js";
import type { InventoryEntry, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

assertSpawnChestsFromLayout();
assertOpenChestGuardsAndWorldDrops();
assertFullBackpackKeepsLootAsWorldDrops();

console.log("[chest-contract] PASS layout spawn, guard rails, world-drop loot, duplicate-open, full-backpack retention");

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
      safeCrossings: []
    } as NonNullable<RuntimeRoom["matchLayout"]>
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

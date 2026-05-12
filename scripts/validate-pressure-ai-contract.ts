import assert from "node:assert/strict";
import { buildMatchLayout } from "../server/src/match-layout.js";
import { spawnChests, tickChestOpenings, CHEST_OPEN_DURATION_MS } from "../server/src/chests/chest-manager.js";
import { spawnInitialMonsters } from "../server/src/monsters/monster-manager.js";
import { initializeExtractState } from "../server/src/extract/index.js";
import { InventoryService } from "../server/src/inventory/service.js";
import { tickBots } from "../server/src/bots/bot-manager.js";
import { buildInventoryItem } from "../server/src/loot/loot-manager.js";
import type { InventoryState, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

assertElitePressureNearContestedResources();
assertBotScavengesChestThroughChannel();
assertBotWithCargoPrioritizesExtract();

console.log("[pressure-ai-contract] PASS elite resource pressure, bot chest channel, bot cargo extract intent");

function assertElitePressureNearContestedResources(): void {
  const room = createRoom();
  spawnChests(room);
  spawnInitialMonsters(room);

  const contestedChests = room.matchLayout!.chestZones.filter((zone) => zone.lane === "contested");
  const elites = [...room.monsters!.values()].filter((monster) => monster.type === "elite");
  assert.ok(contestedChests.length >= 3, "map should include contested resource chests");
  assert.ok(elites.length >= 3, "resource pressure requires elite monsters");

  for (const chest of contestedChests) {
    const nearestEliteDistance = Math.min(...elites.map((elite) => Math.hypot(elite.x - chest.x, elite.y - chest.y)));
    assert.ok(nearestEliteDistance <= 760, `contested chest ${chest.chestId} should have nearby elite pressure, got ${nearestEliteDistance}`);
  }
}

function assertBotScavengesChestThroughChannel(): void {
  const room = createRoom();
  spawnChests(room);
  const bot = room.players.get("bot_alpha_1")!;
  const starterChestZone = room.matchLayout!.chestZones.find((zone) => zone.lane === "starter" && zone.squadId === "bot_alpha")!;
  const starterChest = room.chests!.get(starterChestZone.chestId)!;
  bot.state!.x = starterChest.x;
  bot.state!.y = starterChest.y;
  bot.botGoal = "loot";
  bot.botPatrolPoint = { x: starterChest.x, y: starterChest.y };
  bot.botNextDecisionAt = now + 5_000;

  const result = tickBots({ room, roomState: room as any }, now);
  assert.equal(result.playerStateChanged, true, "bot should act when staged on a loot chest");
  assert.equal(starterChest.isOpen, false, "bot chest interaction should start a channel, not open instantly");
  assert.equal(bot.openingChest?.chestId, starterChest.id, "bot should enter chest opening state");

  const tick = tickChestOpenings(room, bot.openingChest!.completesAt);
  assert.equal(tick.openedEvents.length, 1, "bot opening channel should complete into a chest opened event");
  assert.equal(starterChest.isOpen, true, "bot channel completion should open chest");
  assert.ok((room.drops?.size ?? 0) > 0, "bot chest completion should spawn world drops");
}

function assertBotWithCargoPrioritizesExtract(): void {
  const room = createRoom();
  initializeExtractState(room);
  room.players.get("player-1")!.state!.isAlive = false;
  const bot = room.players.get("bot_alpha_1")!;
  const extractZone = room.extract!.zones[0]!;
  extractZone.isOpen = true;
  bot.inventory!.items.push(
    { item: buildInventoryItem("treasure_small_idol", "normal")!, x: 0, y: 0 },
    { item: buildInventoryItem("treasure_medium_tablet", "elite")!, x: 1, y: 0 }
  );
  bot.state!.x = extractZone.x - 160;
  bot.state!.y = extractZone.y;
  bot.botNextDecisionAt = 0;

  tickBots({ room, roomState: room as any }, now);
  assert.equal(bot.botGoal, "extract", "bot with two cargo items should prioritize extraction when extract is open");
  assert.ok(bot.botPatrolPoint, "extracting bot should set extract patrol point");
  assert.ok(
    Math.hypot(bot.botPatrolPoint!.x - extractZone.x, bot.botPatrolPoint!.y - extractZone.y) <= 1,
    "extracting bot should route toward active extract zone"
  );
}

function createRoom(): RuntimeRoom {
  const player = createPlayer("player-1", "player", false);
  const bot = createPlayer("bot_alpha_1", "bot_alpha", true);
  const room: RuntimeRoom = {
    code: "PRESS",
    hostPlayerId: player.id,
    botDifficulty: "hard",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([[player.id, player], [bot.id, bot]])
  };
  room.matchLayout = buildMatchLayout({
    roomCode: room.code,
    startedAt: now,
    squadIds: ["player", "bot_alpha"]
  });
  for (const participant of room.players.values()) {
    const spawn = room.matchLayout.squadSpawns.find((entry) => entry.squadId === participant.squadId)!;
    participant.state!.x = spawn.anchorX;
    participant.state!.y = spawn.anchorY;
    participant.state!.direction = { ...spawn.facing };
  }
  return room;
}

function createPlayer(id: string, squadId: "player" | "bot_alpha", isBot: boolean): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: !isBot,
    ready: true,
    joinedAt: now,
    squadId,
    squadType: isBot ? "bot" : "human",
    isBot,
    botDifficulty: isBot ? "hard" : undefined,
    state: {
      id,
      name: id,
      x: 0,
      y: 0,
      direction: { x: 1, y: 0 },
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 280,
      attackPower: 14,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0,
      statusEffects: [],
      killsPlayers: 0,
      killsMonsters: 0,
      squadId,
      squadType: isBot ? "bot" : "human",
      isBot
    },
    inventory: createInventory()
  };
}

function createInventory(): InventoryState {
  return {
    width: 10,
    height: 6,
    items: [],
    equipment: {}
  };
}

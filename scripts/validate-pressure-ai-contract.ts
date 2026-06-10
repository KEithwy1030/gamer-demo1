import assert from "node:assert/strict";
import { buildMatchLayout, isPointInsideObstacle, isPointInsideRiverHazard } from "../server/src/match-layout.js";
import { spawnChests, startChestOpening, tickChestOpenings, CHEST_OPEN_DURATION_MS } from "../server/src/chests/chest-manager.js";
import { spawnInitialMonsters, tickMonsters } from "../server/src/monsters/monster-manager.js";
import { initializeExtractState } from "../server/src/extract/index.js";
import { InventoryService } from "../server/src/inventory/service.js";
import { tickBots } from "../server/src/bots/bot-manager.js";
import { buildInventoryItem } from "../server/src/loot/loot-manager.js";
import type { InventoryState, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

assertElitePressureNearRichResources();
assertBotScavengesChestThroughRummage();
assertBotInvestigatesAnyChestNoisePulse();
assertBotWithCargoPrioritizesExtract();
assertBotWithHighValueCargoPrioritizesExtract();
assertBotExtractsWhenCorpseFogIntensifies();
assertBotStagesOnActiveExtractPressure();

console.log("[pressure-ai-contract] PASS rich resource pressure, bot rummage loop, all-crate noise response, bot cargo extract intent, high-value cargo extract intent, intensified fog extract intent, active extract pressure staging");

// 3aa7428 起精英不再静态驻守富箱：战斗压力改由 spawn-director 按阶段动态
// 投放（opening 只出 basic，danger 阶段精英/弓手缺位必补、原型混合）。这里
// 验证新契约：富箱仍是 4 个中央争夺点；danger 阶段必能补齐精英+弓手；
// 落点不进河/障碍；非 boss 原型保持多样（接替旧的"精英守卫多 profile"）。
function assertElitePressureNearRichResources(): void {
  const room = createRoom();
  spawnChests(room);
  spawnInitialMonsters(room);

  const richChests = room.matchLayout!.chestZones.filter((zone) => zone.qualityTier === "rich");
  assert.equal(richChests.length, 4, "map should include four rich central crates");

  room.startedAt = now - 250_000;
  const hasTypes = () => {
    const alive = [...room.monsters!.values()];
    return alive.some((monster) => monster.type === "elite")
      && alive.some((monster) => monster.type === "archer")
      && alive.some((monster) => monster.type === "skirmisher" || monster.type === "brute" || monster.type === "basic");
  };
  for (let attempt = 0; attempt < 40 && !hasTypes(); attempt += 1) {
    room.spawnDirector!.nextSpawnAt = 0;
    tickMonsters({ room, roomState: room as any });
  }
  room.spawnDirector!.nextSpawnAt = Number.MAX_SAFE_INTEGER;
  room.startedAt = now;
  assert.ok(hasTypes(), "danger phase should backfill elite and archer pressure archetypes");

  const nonBoss = [...room.monsters!.values()].filter((monster) => monster.type !== "boss");
  for (const monster of nonBoss) {
    assert.equal(
      isPointInsideRiverHazard(room.matchLayout!, monster.x, monster.y),
      false,
      `pressure spawn ${monster.id} should not land in river hazard`
    );
    assert.equal(
      isPointInsideObstacle(room.matchLayout!, monster.x, monster.y, 36),
      false,
      `pressure spawn ${monster.id} should not land inside an obstacle`
    );
  }

  const archetypeProfiles = new Set(nonBoss.map((monster) => `${monster.type}:${monster.moveSpeed}:${monster.attackDamage}`));
  assert.ok(
    archetypeProfiles.size >= 3,
    "phased pressure should mix at least three distinct combat archetype profiles"
  );
}

function assertBotScavengesChestThroughRummage(): void {
  const room = createRoom();
  spawnChests(room);
  const bot = room.players.get("bot_alpha_1")!;
  const chestZone = room.matchLayout!.chestZones.find((zone) => zone.squadId === "bot_alpha" && zone.qualityTier !== "rich")!;
  const chest = room.chests!.get(chestZone.chestId)!;
  bot.state!.x = chest.x;
  bot.state!.y = chest.y;
  bot.botGoal = "loot";
  bot.botPatrolPoint = { x: chest.x, y: chest.y };
  bot.botNextDecisionAt = now + 5_000;

  const result = tickBots({ room, roomState: room as any }, now);
  assert.equal(result.playerStateChanged, true, "bot should act when staged on a loot crate");
  assert.equal(result.chestProgressEvents[0]?.status, "started", "bot loot action should start a rummage");
  assert.equal(chest.state, "rummaging", "bot chest interaction should start rummaging instead of opening instantly");
  assert.equal(bot.openingChest?.chestId, chest.id, "bot should enter chest rummage state");

  const tick = tickChestOpenings(room, now + CHEST_OPEN_DURATION_MS);
  assert.equal(tick.openedEvents.length, 1, "bot rummage should dispense exactly one item on the first tick");
  assert.equal(chest.itemsDispensed, 1, "bot rummage should advance item count one by one");
  assert.equal((room.drops?.size ?? 0), 0, "bot rummage should auto-loot into inventory when the backpack has space");
}

function assertBotInvestigatesAnyChestNoisePulse(): void {
  const room = createRoom();
  spawnChests(room);
  const human = room.players.get("player-1")!;
  const bot = room.players.get("bot_alpha_1")!;
  const chestZone = room.matchLayout!.chestZones.find((zone) => zone.squadId === "player" && zone.qualityTier !== "rich")!;
  const chest = room.chests!.get(chestZone.chestId)!;
  human.state!.x = chest.x;
  human.state!.y = chest.y;
  bot.state!.x = chest.x + 1100;
  bot.state!.y = chest.y;
  bot.botNextDecisionAt = 0;

  startChestOpening(room, human.id, chest.id, now);
  assert.equal(room.contestedChestNoise, undefined, "starting rummage should not pulse noise immediately");
  tickChestOpenings(room, now + CHEST_OPEN_DURATION_MS);
  assert.equal(room.contestedChestNoise?.chestId, chest.id, "first rummage tick should create a chest noise marker");

  tickBots({ room, roomState: room as any }, now + CHEST_OPEN_DURATION_MS + 100);
  assert.equal(bot.botGoal, "patrol", "enemy bot should investigate chest noise before direct contact");
  assert.ok(bot.botPatrolPoint, "noise-investigating bot should set a staging point");
  assert.ok(
    Math.hypot(bot.botPatrolPoint!.x - chest.x, bot.botPatrolPoint!.y - chest.y) <= 180,
    "noise-investigating bot should stage near the pulsing crate"
  );

  bot.state!.x = chest.x + 220;
  bot.state!.y = chest.y;
  bot.botNextDecisionAt = 0;
  tickBots({ room, roomState: room as any }, now + CHEST_OPEN_DURATION_MS + 200);
  assert.equal(bot.botGoal, "hunt", "enemy bot should hunt the rummager once close enough to the pulse source");
  assert.equal(bot.botTargetPlayerId, human.id, "enemy bot should target the player making the crate noise");
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

function assertBotWithHighValueCargoPrioritizesExtract(): void {
  const room = createRoom();
  initializeExtractState(room);
  room.players.get("player-1")!.state!.isAlive = false;
  const bot = room.players.get("bot_alpha_1")!;
  const extractZone = room.extract!.zones[0]!;
  extractZone.isOpen = true;
  bot.inventory!.items.push(
    { item: buildInventoryItem("treasure_large_statue", "elite")!, x: 0, y: 0 }
  );
  bot.state!.x = extractZone.x - 200;
  bot.state!.y = extractZone.y;
  bot.botNextDecisionAt = 0;

  tickBots({ room, roomState: room as any }, now);
  assert.equal(bot.botGoal, "extract", "bot with a single high-value treasure should prioritize extraction when extract is open");
  assert.ok(bot.botPatrolPoint, "high-value extract bot should set extract patrol point");
}

function assertBotExtractsWhenCorpseFogIntensifies(): void {
  const room = createRoom();
  // 雾强化时间线调参后（2799c66）为 13 分钟 = 780s。
  room.startedAt = now - 781_000;
  initializeExtractState(room);
  room.players.get("player-1")!.state!.isAlive = false;
  const bot = room.players.get("bot_alpha_1")!;
  const extractZone = room.extract!.zones[0]!;
  extractZone.isOpen = true;
  bot.inventory!.items = [];
  bot.state!.x = extractZone.x - 260;
  bot.state!.y = extractZone.y;
  bot.botNextDecisionAt = 0;

  tickBots({ room, roomState: room as any }, now);
  assert.equal(bot.botGoal, "extract", "bot should stop scavenging and extract once corpse fog intensifies");
  assert.ok(bot.botPatrolPoint, "intensified-fog bot should set extract patrol point");
  assert.ok(
    Math.hypot(bot.botPatrolPoint!.x - extractZone.x, bot.botPatrolPoint!.y - extractZone.y) <= 1,
    "intensified-fog bot should route toward active extract zone"
  );
}

function assertBotStagesOnActiveExtractPressure(): void {
  const room = createRoom();
  initializeExtractState(room);
  const human = room.players.get("player-1")!;
  const bot = room.players.get("bot_alpha_1")!;
  const extractZone = room.extract!.zones[0]!;
  human.state!.x = extractZone.x + 900;
  human.state!.y = extractZone.y;
  bot.state!.x = extractZone.x + 1060;
  bot.state!.y = extractZone.y;
  bot.botNextDecisionAt = 0;
  room.extract!.activePressure = {
    zoneId: extractZone.zoneId,
    playerId: human.id,
    squadId: human.squadId,
    x: extractZone.x,
    y: extractZone.y,
    radius: 1500,
    startedAt: now,
    expiresAt: now + 2_000
  };

  tickBots({ room, roomState: room as any }, now + 100);
  assert.equal(bot.botGoal, "patrol", "enemy bot should collapse toward active extract pressure even before direct contact");
  assert.ok(bot.botPatrolPoint, "extract-pressure bot should set a staging point");
  assert.ok(
    Math.hypot(bot.botPatrolPoint!.x - extractZone.x, bot.botPatrolPoint!.y - extractZone.y) <= extractZone.radius + 160,
    "extract-pressure bot should stage around the active extract zone"
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

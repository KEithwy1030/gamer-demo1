import assert from "node:assert/strict";
import { buildMatchLayout } from "../server/src/match-layout.js";
import { InventoryService } from "../server/src/inventory/service.js";
import { applyDevRoomPreset } from "../server/src/dev-test-hooks.js";
import { spawnInitialMonsters } from "../server/src/monsters/monster-manager.js";
import { initializeExtractState } from "../server/src/extract/index.js";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

assertBossPreset();
assertExtractPreset();
assertInventoryPreset();

console.log("validate-dev-room-presets: ok");

function assertBossPreset(): void {
  const room = createRoom();
  applyDevRoomPreset(room, "boss");
  const player = getHuman(room);
  const boss = [...room.monsters!.values()].find((monster) => monster.type === "boss");
  assert.ok(boss, "boss preset requires a boss spawn");
  assert.ok(player.state, "boss preset requires human state");
  const distance = Math.hypot(player.state!.x - boss.x, player.state!.y - boss.y);
  assert.ok(distance >= 180 && distance <= 260, `boss preset should stage player near boss at safe screenshot distance, got ${distance}`);
}

function assertExtractPreset(): void {
  const room = createRoom();
  applyDevRoomPreset(room, "extract");
  const player = getHuman(room);
  const extract = room.matchLayout!.extractZones[0]!;
  assert.ok(player.state, "extract preset requires human state");
  const distance = Math.hypot(player.state!.x - extract.x, player.state!.y - extract.y);
  assert.ok(distance < 420, `extract preset should place player near extract bridge, got ${distance}`);
}

function assertInventoryPreset(): void {
  const room = createRoom();
  applyDevRoomPreset(room, "inventory");
  const player = getHuman(room);
  assert.ok(player.state, "inventory preset requires human state");
  const drops = [...(room.drops?.values() ?? [])];
  assert.ok(drops.length >= 1, "inventory preset should seed at least one nearby world drop");
  const nearest = drops.sort((left, right) => (
    Math.hypot(player.state!.x - left.x, player.state!.y - left.y)
    - Math.hypot(player.state!.x - right.x, player.state!.y - right.y)
  ))[0]!;
  const distance = Math.hypot(player.state!.x - nearest.x, player.state!.y - nearest.y);
  assert.ok(distance <= 100, `inventory preset drop should be within pickup/drag showcase range, got ${distance}`);
}

function createRoom(): RuntimeRoom {
  const player = createHumanPlayer();
  const bot = createBotPlayer();
  const room: RuntimeRoom = {
    code: "HOOK01",
    hostPlayerId: player.id,
    botDifficulty: "easy",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([[player.id, player], [bot.id, bot]])
  };

  room.matchLayout = buildMatchLayout({
    roomCode: room.code,
    startedAt: room.startedAt!,
    squadIds: ["player", "bot_alpha"]
  });

  assignInitialStates(room);
  const inventoryService = new InventoryService();
  inventoryService.initializeRoom(room);
  initializeExtractState(room);
  spawnInitialMonsters(room);
  return room;
}

function assignInitialStates(room: RuntimeRoom): void {
  const playerSpawn = room.matchLayout!.squadSpawns.find((entry) => entry.squadId === "player")!;
  const botSpawn = room.matchLayout!.squadSpawns.find((entry) => entry.squadId === "bot_alpha")!;
  const player = getHuman(room);
  const bot = [...room.players.values()].find((entry) => entry.isBot)!;

  player.state = baseState(player, playerSpawn.anchorX, playerSpawn.anchorY, playerSpawn.facing);
  bot.state = baseState(bot, botSpawn.anchorX, botSpawn.anchorY, botSpawn.facing);
  player.moveInput = { x: 0, y: 0 };
  bot.moveInput = { x: 0, y: 0 };
}

function createHumanPlayer(): RuntimePlayer {
  return {
    id: "player-1",
    name: "Verifier",
    socketId: "socket-1",
    isHost: true,
    ready: true,
    joinedAt: now,
    squadId: "player",
    squadType: "human",
    isBot: false
  };
}

function createBotPlayer(): RuntimePlayer {
  return {
    id: "bot_alpha_1",
    name: "Alpha-01",
    socketId: "bot_alpha_1",
    isHost: false,
    ready: true,
    joinedAt: now,
    squadId: "bot_alpha",
    squadType: "bot",
    isBot: true,
    botDifficulty: "easy"
  };
}

function baseState(player: RuntimePlayer, x: number, y: number, direction: { x: number; y: number }) {
  return {
    id: player.id,
    name: player.name,
    x,
    y,
    direction: { ...direction },
    hp: 100,
    maxHp: 100,
    weaponType: "sword" as const,
    isAlive: true,
    moveSpeed: 280,
    attackPower: 0,
    attackSpeed: 0,
    critRate: 0,
    dodgeRate: 0,
    damageReduction: 0,
    statusEffects: [],
    killsPlayers: 0,
    killsMonsters: 0,
    squadId: player.squadId,
    squadType: player.squadType,
    isBot: player.isBot
  };
}

function getHuman(room: RuntimeRoom): RuntimePlayer {
  const player = [...room.players.values()].find((entry) => !entry.isBot);
  assert.ok(player, "human player should exist");
  return player;
}

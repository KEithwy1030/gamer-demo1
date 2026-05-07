import assert from "node:assert/strict";
import { buildMatchLayout } from "../server/src/match-layout.js";
import { InventoryService } from "../server/src/inventory/service.js";
import { applyDevRoomPreset } from "../server/src/dev-test-hooks.js";
import { spawnInitialMonsters } from "../server/src/monsters/monster-manager.js";
import { initializeExtractState } from "../server/src/extract/index.js";
import { RoomStore } from "../server/src/room-store.js";
import {
  LOCK_ASSIST_ACQUIRE_RANGE_BUFFER,
  LOCK_ASSIST_CHASE_RANGE_BUFFER,
  LOCK_ASSIST_MONSTER_CONTACT_RADIUS
} from "../client/src/scenes/gameScene/lockAssist";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();
const SWORD_RANGE = 116;
const LOCK_ATTACK_REACH = SWORD_RANGE + LOCK_ASSIST_ACQUIRE_RANGE_BUFFER + LOCK_ASSIST_MONSTER_CONTACT_RADIUS;
const LOCK_CHASE_REACH = SWORD_RANGE + LOCK_ASSIST_CHASE_RANGE_BUFFER + LOCK_ASSIST_MONSTER_CONTACT_RADIUS;
const EXTRACT_START_INSET_MIN = 10;
const EXTRACT_START_INSET_MAX = 16;
const DEV_PRESET_MIN_SAFETY_MS = 10_000;
const DEV_PRESET_THREAT_CLEAR_RADIUS = 720;

assertBossPreset();
assertExtractPreset();
assertInventoryPreset();

console.log("validate-dev-room-presets: ok");

function assertBossPreset(): void {
  const room = createRoom();
  const beforePreset = Date.now();
  applyDevRoomPreset(room, "boss");
  const player = getHuman(room);
  const boss = [...room.monsters!.values()].find((monster) => monster.type === "boss");
  assert.ok(boss, "boss preset requires a boss spawn");
  assert.ok(player.state, "boss preset requires human state");
  const distance = Math.hypot(player.state!.x - boss.x, player.state!.y - boss.y);
  assert.ok(
    distance > LOCK_ATTACK_REACH && distance <= LOCK_CHASE_REACH,
    `boss preset should stage player in chase band (${LOCK_ATTACK_REACH}, ${LOCK_CHASE_REACH}], got ${distance}`
  );
  assert.equal(boss.aggroRange, 0, "boss preset should disable boss aggro during lock/cancel verification window");
  assert.equal(boss.moveSpeed, 0, "boss preset should keep boss from collapsing chase band before verification");
  assert.equal(boss.behaviorPhase, "idle", "boss preset should start boss in idle, not recover/windup/charge");
  assert.ok(
    boss.nextAttackAt >= beforePreset + DEV_PRESET_MIN_SAFETY_MS,
    "boss preset should delay boss basic attacks long enough for lock/cancel verification"
  );
  assert.ok(
    (boss.nextSmashAt ?? 0) >= beforePreset + DEV_PRESET_MIN_SAFETY_MS
    && (boss.nextChargeAt ?? 0) >= beforePreset + DEV_PRESET_MIN_SAFETY_MS,
    "boss preset should delay boss skill openers long enough for lock/cancel verification"
  );
  assertNoImmediateThreats(room, player.state, boss.id);
  assertBotsDelayed(room, beforePreset);
  assertMatchPayloadIncludesPlayerPosition(room, player);
}

function assertExtractPreset(): void {
  const room = createRoom();
  const beforePreset = Date.now();
  applyDevRoomPreset(room, "extract");
  const player = getHuman(room);
  const extract = room.matchLayout!.extractZones[0]!;
  assert.ok(player.state, "extract preset requires human state");
  const distance = Math.hypot(player.state!.x - extract.x, player.state!.y - extract.y);
  const startRadius = getExtractStartRadius(extract.radius);
  assert.ok(
    distance <= startRadius - 4,
    `extract preset should place player inside stable extract start radius (${startRadius}), got ${distance}`
  );
  assertNoImmediateThreats(room, extract);
  assertBotsDelayed(room, beforePreset);
  assertMatchPayloadIncludesPlayerPosition(room, player);
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
  assertMatchPayloadIncludesPlayerPosition(room, player);
}

function assertMatchPayloadIncludesPlayerPosition(room: RuntimeRoom, player: RuntimePlayer): void {
  assert.ok(player.state, "preset payload assertion requires human state");
  const payload = new RoomStore().buildMatchPayloadByPlayerId(room).get(player.id);
  const payloadPlayer = payload?.room.players.find((entry) => entry.id === player.id);
  assert.ok(payloadPlayer, "match:started payload should include the human player");
  assert.equal(payloadPlayer.x, player.state.x, "match:started payload should use preset-adjusted player x");
  assert.equal(payloadPlayer.y, player.state.y, "match:started payload should use preset-adjusted player y");
  assert.equal(payloadPlayer.isLocalPlayer, true, "match:started payload should mark the receiver as local player");
}

function assertNoImmediateThreats(room: RuntimeRoom, anchor: { x: number; y: number }, allowedMonsterId?: string): void {
  const nearbyThreat = [...(room.monsters?.values() ?? [])].find((monster) => (
    monster.isAlive
    && monster.id !== allowedMonsterId
    && Math.hypot(monster.x - anchor.x, monster.y - anchor.y) <= DEV_PRESET_THREAT_CLEAR_RADIUS
  ));
  assert.equal(
    nearbyThreat,
    undefined,
    `dev preset should clear nearby non-target threats, found ${nearbyThreat?.id ?? "unknown"}`
  );

  for (const monster of room.monsters?.values() ?? []) {
    if (!monster.isAlive) {
      continue;
    }
    assert.ok(
      monster.nextAttackAt >= Date.now() + DEV_PRESET_MIN_SAFETY_MS - 1000,
      `dev preset should delay monster attacks for verification, ${monster.id} attacks too soon`
    );
  }
}

function assertBotsDelayed(room: RuntimeRoom, beforePreset: number): void {
  for (const bot of room.players.values()) {
    if (!bot.isBot) {
      continue;
    }
    assert.ok(
      (bot.botNextDecisionAt ?? 0) >= beforePreset + DEV_PRESET_MIN_SAFETY_MS,
      "dev preset should delay bot decisions during verification window"
    );
    assert.equal(bot.botTargetPlayerId, undefined, "dev preset should clear bot player targets");
    assert.deepEqual(bot.moveInput, { x: 0, y: 0 }, "dev preset should stop bot movement initially");
  }
}

function getExtractStartRadius(zoneRadius: number): number {
  const inset = Math.min(EXTRACT_START_INSET_MAX, Math.max(EXTRACT_START_INSET_MIN, zoneRadius * 0.15));
  return Math.max(24, zoneRadius - inset);
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

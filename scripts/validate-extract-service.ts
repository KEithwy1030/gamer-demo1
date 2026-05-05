import {
  advanceExtractState,
  initializeExtractState,
  startPlayerExtract
} from "../server/src/extract/service.ts";
import type { RuntimeRoom } from "../server/src/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeExtractTorch() {
  return {
    instanceId: "torch-1",
    templateId: "extract_torch",
    name: "归营火种",
    kind: "quest" as const,
    rarity: "rare" as const,
    tags: ["extract_key" as const, "non_extractable" as const],
    width: 1,
    height: 3,
    goldValue: 0,
    treasureValue: 0,
    affixes: []
  };
}

function makeRoom(now: number): RuntimeRoom {
  const player = {
    id: "player-1",
    socketId: "socket-1",
    name: "Extract Tester",
    isHost: true,
    ready: true,
    joinedAt: now,
    squadId: "player",
    squadType: "human",
    isBot: false,
    state: {
      id: "player-1",
      name: "Extract Tester",
      x: 100,
      y: 100,
      direction: { x: 0, y: 1 },
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 300,
      attackPower: 0,
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
      height: 20,
      items: [{
        x: 0,
        y: 0,
        item: {
          instanceId: "idol-1",
          templateId: "treasure_small_idol",
          name: "Small Idol",
          kind: "treasure",
          rarity: "common",
          width: 1,
          height: 1,
          goldValue: 0,
          treasureValue: 40,
          affixes: []
        }
      }],
      equipment: {}
    }
  } satisfies RuntimeRoom["players"] extends Map<string, infer Player> ? Player : never;

  return {
    code: "TEST01",
    hostPlayerId: player.id,
    botDifficulty: "easy",
    capacity: 1,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([[player.id, player]]),
    matchLayout: {
      templateId: "A",
      squadSpawns: [],
      extractZones: [{
        zoneId: "extract-test",
        x: 100,
        y: 100,
        radius: 80,
        openAtSec: 0,
        channelDurationMs: 500
      }],
      chestZones: [],
      safeZones: [],
      riverHazards: [],
      safeCrossings: []
    }
  };
}

function main(): void {
  const now = 1_000;
  const room = makeRoom(now);
  initializeExtractState(room);
  assert(room.extract?.zones.length === 1, "initializeExtractState should clone layout zones");
  assert(room.extract.zones[0].isOpen === false, "extract zone should start closed");

  try {
    startPlayerExtract(room, "player-1", now);
    throw new Error("startPlayerExtract should require the extract torch");
  } catch (error) {
    assert(
      error instanceof Error && /extract torch/.test(error.message),
      "startPlayerExtract should require the extract torch"
    );
  }

  room.players.get("player-1")!.inventory!.items.push({
    item: makeExtractTorch(),
    x: 1,
    y: 0
  });

  const start = startPlayerExtract(room, "player-1", now);
  assert(start.opened?.zones[0].isOpen === true, "startPlayerExtract should open ready zone");
  assert(start.progressEvents[0]?.status === "started", "startPlayerExtract should emit started progress");

  const progress = advanceExtractState(room, now + 300);
  assert(progress.progressEvents.some((event) => event.status === "progress"), "advanceExtractState should emit progress while channeling");
  assert(progress.shouldCloseRoom === false, "room should stay open before completion");

  const settled = advanceExtractState(room, now + 525);
  assert(settled.successEvents.length === 1, "advanceExtractState should emit one extract success");
  assert(settled.settlementEvents[0]?.settlement.result === "success", "settlement result should be success");
  assert(settled.settlementEvents[0]?.settlement.reason === "extracted", "settlement reason should be extracted");
  assert(
    !settled.settlementEvents[0]?.settlement.extractedItems.includes("归营火种"),
    "extract torch should not be listed as extracted loot"
  );
  assert(settled.shouldCloseRoom === true, "single-player room should close after settlement");

  console.log("[extract-service] PASS torch-gated start/progress/success settlement contract");
}

main();

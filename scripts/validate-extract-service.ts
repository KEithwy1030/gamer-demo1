import {
  advanceExtractState,
  initializeExtractState,
  startPlayerExtract
} from "../server/src/extract/service.ts";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeExtractTorch(instanceId = "torch-1") {
  return {
    instanceId,
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

function makeTreasure(instanceId: string, name: string) {
  return {
    instanceId,
    templateId: `treasure_${instanceId}`,
    name,
    kind: "treasure" as const,
    rarity: "common" as const,
    width: 1,
    height: 1,
    goldValue: 0,
    treasureValue: 40,
    affixes: []
  };
}

function makePlayer(
  id: string,
  name: string,
  squadId: RuntimePlayer["squadId"],
  position: { x: number; y: number },
  items: Array<ReturnType<typeof makeTreasure> | ReturnType<typeof makeExtractTorch>> = []
): RuntimePlayer {
  return {
    id,
    socketId: `${id}-socket`,
    name,
    isHost: id === "player-1",
    ready: true,
    joinedAt: 1_000,
    squadId,
    squadType: squadId === "player" ? "human" : "bot",
    isBot: squadId !== "player",
    state: {
      id,
      name,
      x: position.x,
      y: position.y,
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
      squadId,
      squadType: squadId === "player" ? "human" : "bot",
      isBot: squadId !== "player"
    },
    inventory: {
      width: 10,
      height: 20,
      items: items.map((item, index) => ({
        item,
        x: index,
        y: 0
      })),
      equipment: {}
    }
  };
}

function makeRoom(now: number): RuntimeRoom {
  const torchCarrier = makePlayer("player-1", "Torch Bearer", "player", { x: 100, y: 100 }, [
    makeTreasure("idol-1", "Small Idol"),
    makeExtractTorch()
  ]);
  const squadMateInside = makePlayer("player-2", "Squad Mate", "player", { x: 120, y: 100 }, [
    makeTreasure("coin-1", "Coin Purse")
  ]);
  const squadMateOutside = makePlayer("player-3", "Late Mate", "player", { x: 320, y: 100 }, [
    makeTreasure("ring-1", "Scrap Ring")
  ]);
  const enemy = makePlayer("enemy-1", "Enemy Raider", "bot_alpha", { x: 100, y: 100 }, [
    makeTreasure("fang-1", "Bone Fang")
  ]);

  return {
    code: "TEST01",
    hostPlayerId: torchCarrier.id,
    botDifficulty: "easy",
    capacity: 4,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([
      [torchCarrier.id, torchCarrier],
      [squadMateInside.id, squadMateInside],
      [squadMateOutside.id, squadMateOutside],
      [enemy.id, enemy]
    ]),
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

  room.players.get("player-1")!.inventory!.items = room.players.get("player-1")!.inventory!.items.filter((entry) => entry.item.templateId !== "extract_torch");
  try {
    startPlayerExtract(room, "player-1", now);
    throw new Error("startPlayerExtract should require the extract torch");
  } catch (error) {
    assert(
      error instanceof Error && /extract torch/.test(error.message),
      "startPlayerExtract should reject ignition without the extract torch"
    );
  }

  room.players.get("player-1")!.inventory!.items.push({ item: makeExtractTorch(), x: 1, y: 0 });

  const start = startPlayerExtract(room, "player-1", now);
  assert(start.opened?.zones[0].isOpen === true, "torch squad should open ready zone");
  assert(start.opened?.squadStatus?.activeSquadId === "player", "extract should bind to carrier squad");
  assert(start.progressEvents[0]?.status === "started", "torch squad should receive started progress");

  const squadMateStart = startPlayerExtract(room, "player-2", now + 25);
  assert(squadMateStart.progressEvents[0]?.status === "started", "same squad member inside zone should be able to join extract");

  try {
    startPlayerExtract(room, "enemy-1", now + 50);
    throw new Error("other squad should not be able to use ignited extract");
  } catch (error) {
    assert(
      error instanceof Error && /another squad/.test(error.message),
      "other squad should be rejected from using the torch squad extract"
    );
  }

  const progress = advanceExtractState(room, now + 300);
  assert(progress.progressEvents.some((event) => event.status === "progress" && event.playerId === "player-1"), "carrier should receive progress events while channeling");
  assert(progress.progressEvents.some((event) => event.status === "progress" && event.playerId === "player-2"), "same squad member should receive progress events while channeling");
  assert(progress.shouldCloseRoom === false, "room should stay open before completion");

  const settled = advanceExtractState(room, now + 525);
  const successIds = new Set(settled.successEvents.map((event) => event.playerId));
  assert(successIds.has("player-1"), "carrier should extract successfully");
  assert(successIds.has("player-2"), "inside-zone squadmate should extract with carrier");
  assert(!successIds.has("player-3"), "outside-zone squadmate should not be extracted");
  assert(!successIds.has("enemy-1"), "enemy squad should not be extracted");

  const carrierSettlement = settled.settlementEvents.find((event) => event.playerId === "player-1")?.settlement;
  const insideSettlement = settled.settlementEvents.find((event) => event.playerId === "player-2")?.settlement;
  const outsideSettlement = settled.settlementEvents.find((event) => event.playerId === "player-3")?.settlement;
  assert(carrierSettlement?.result === "success", "carrier settlement should be success");
  assert(insideSettlement?.result === "success", "inside squadmate settlement should be success");
  assert(!outsideSettlement, "outside squadmate should remain unsettled after team extract");
  assert(
    !carrierSettlement?.extractedItems.includes("归营火种"),
    "extract torch should not be listed as extracted loot"
  );
  assert(
    !room.players.get("player-1")!.inventory!.items.some((entry) => entry.item.templateId === "extract_torch"),
    "extract torch should be removed from runtime inventory after success"
  );

  console.log("[extract-service] PASS no-torch reject, squad-open, enemy-block, squad-extract, outside-left, torch-not-carried");
}

main();

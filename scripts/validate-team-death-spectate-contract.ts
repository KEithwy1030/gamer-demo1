import { advanceExtractState, initializeExtractState } from "../server/src/extract/service.ts";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makePlayer(id: string, name: string, now: number): RuntimePlayer {
  return {
    id,
    socketId: `${id}-socket`,
    name,
    isHost: id === "player-1",
    ready: true,
    joinedAt: now,
    squadId: "player",
    squadType: "human",
    isBot: false,
    state: {
      id,
      name,
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
      width: 8,
      height: 8,
      items: [],
      equipment: {}
    }
  };
}

function makeRoom(now: number): RuntimeRoom {
  const player1 = makePlayer("player-1", "Torch Bearer", now);
  const player2 = makePlayer("player-2", "Wingman", now);

  player1.extract = {
    zoneId: "extract-test",
    startedAt: now - 250,
    completesAt: now + 750,
    lastProgressBroadcastAt: now - 250
  };

  return {
    code: "TEST-DEATH",
    hostPlayerId: player1.id,
    botDifficulty: "easy",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([
      [player1.id, player1],
      [player2.id, player2]
    ]),
    matchLayout: {
      templateId: "test",
      squadSpawns: [],
      extractZones: [{
        zoneId: "extract-test",
        x: 100,
        y: 100,
        radius: 80,
        openAtSec: 0,
        channelDurationMs: 1_000
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

  room.players.get("player-1")!.state!.isAlive = false;
  room.players.get("player-1")!.deathReason = "corpseFog";

  const firstTick = advanceExtractState(room, now + 100);
  assert(firstTick.progressEvents.some((event) => event.playerId === "player-1" && event.status === "interrupted" && event.reason === "dead"), "dead player should only interrupt extraction on first death");
  assert(firstTick.settlementEvents.length === 0, "single dead player should not receive settlement immediately");
  assert(room.players.get("player-1")!.extract?.settledAt === undefined, "single dead player should remain unsettled");
  assert(room.extract?.matchEndedAt === undefined, "room should stay open while another human is still alive");

  room.players.get("player-2")!.state!.isAlive = false;
  room.players.get("player-2")!.deathReason = "killed";

  const secondTick = advanceExtractState(room, now + 200);
  const settlementByPlayer = new Map(secondTick.settlementEvents.map((event) => [event.playerId, event.settlement]));
  assert(secondTick.settlementEvents.length === 2, "both dead humans should settle together once the team is eliminated");
  assert(settlementByPlayer.get("player-1")?.result === "failure", "first dead player should settle as failure");
  assert(settlementByPlayer.get("player-2")?.result === "failure", "second dead player should settle as failure");
  assert(settlementByPlayer.get("player-1")?.reason === "corpseFog", "first dead player's failure reason should preserve death reason");
  assert(settlementByPlayer.get("player-2")?.reason === "killed", "second dead player's failure reason should default to killed");
  assert(room.players.get("player-1")!.extract?.settledAt !== undefined, "first dead player should be settled after team elimination");
  assert(room.players.get("player-2")!.extract?.settledAt !== undefined, "second dead player should be settled after team elimination");
  assert(room.extract?.matchEndedAt !== undefined, "room should close once all unsettled humans are dead");

  console.log("[team-death-spectate-contract] PASS one-death-no-settlement, team-elimination-batch-failure");
}

main();

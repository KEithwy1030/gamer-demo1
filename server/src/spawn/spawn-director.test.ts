import { describe, expect, it, vi } from "vitest";
import { advanceSpawnDirector, initializeSpawnDirector } from "./spawn-director.js";
import type { RuntimeRoom } from "../types.js";

function createRoom(startedAt = 1_000): RuntimeRoom {
  return {
    code: "TEST1",
    hostPlayerId: "host",
    botDifficulty: "normal",
    capacity: 1,
    status: "started",
    createdAt: startedAt,
    startedAt,
    players: new Map(),
    monsters: new Map(),
    matchLayout: {
      templateId: "A",
      squadSpawns: [],
      extractZones: [{ zoneId: "extract_1", x: 900, y: 900, radius: 96, openAtSec: 360, channelDurationMs: 5000 }],
      chestZones: [],
      safeZones: [],
      riverHazards: [],
      safeCrossings: [],
      obstacleZones: [],
      landmarks: []
    }
  };
}

describe("spawn-director", () => {
  it("switches phases on schedule and guarantees key phase archetypes", () => {
    const room = createRoom(1_000);
    initializeSpawnDirector(room, 1_000);

    const randomSpy = vi.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
      .mockReturnValue(0.5);

    const opening = advanceSpawnDirector(room, 1_000);
    expect(opening.phaseChanged).toEqual({ phase: "opening", atRunSeconds: 0 });
    expect(opening.phase).toBe("opening");

    room.spawnDirector!.nextSpawnAt = 2_200;
    const openingSpawn = advanceSpawnDirector(room, 2_500);
    expect(openingSpawn.phase).toBe("opening");
    expect(openingSpawn.spawns[0]?.type).toBe("basic");

    room.spawnDirector!.nextSpawnAt = 93_000;
    const skirmishPhase = advanceSpawnDirector(room, 92_000);
    expect(skirmishPhase.phaseChanged).toEqual({ phase: "skirmish", atRunSeconds: 91 });

    const skirmishSpawn = advanceSpawnDirector(room, 95_000);
    expect(["basic", "skirmisher"]).toContain(skirmishSpawn.spawns[0]?.type);

    room.spawnDirector!.nextSpawnAt = 243_000;
    const dangerPhase = advanceSpawnDirector(room, 242_000);
    expect(dangerPhase.phaseChanged).toEqual({ phase: "danger", atRunSeconds: 241 });

    const dangerElite = advanceSpawnDirector(room, 244_000);
    expect(dangerElite.spawns[0]?.type).toBe("elite");
    room.monsters!.set("elite_1", {
      id: "elite_1",
      spawnId: "elite_1",
      type: "elite",
      x: 400,
      y: 400,
      hp: 100,
      maxHp: 100,
      isAlive: true,
      spawnX: 400,
      spawnY: 400,
      patrolX: 400,
      patrolY: 400,
      patrolRadius: 50,
      guardRadius: 50,
      returnDelayMs: 1000,
      aggroRange: 100,
      leashRange: 200,
      attackRange: 50,
      attackDamage: 20,
      moveSpeed: 100,
      attackCooldownMs: 1000,
      nextAttackAt: 0,
      behaviorPhase: "idle",
      isEnraged: false,
      enrageThreshold: 0,
      enrageAttackDamageBonus: 0,
      enrageMoveSpeedBonus: 0,
      enrageCooldownMultiplier: 1
    } as RuntimeRoom["monsters"] extends Map<string, infer T> ? T : never);
    room.spawnDirector!.nextSpawnAt = 245_000;
    const dangerArcher = advanceSpawnDirector(room, 246_000);
    expect(dangerArcher.spawns[0]?.type).toBe("archer");

    room.spawnDirector!.nextSpawnAt = 363_000;
    const extractPhase = advanceSpawnDirector(room, 362_000);
    expect(extractPhase.phaseChanged).toEqual({ phase: "extract", atRunSeconds: 361 });

    const extractSpawn = advanceSpawnDirector(room, 364_000);
    expect(extractSpawn.spawns[0]?.type).toBe("brute");

    randomSpy.mockRestore();
  });
});

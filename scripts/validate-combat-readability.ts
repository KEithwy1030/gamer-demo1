import assert from "node:assert/strict";
import { spawnInitialMonsters, tickMonsters, handlePlayerAttack } from "../server/src/monsters/monster-manager.js";
import { ensureDropState } from "../server/src/loot/loot-manager.js";
import { getMonsterLabel, getMonsterReadabilitySnapshot } from "../client/src/game/entities/monsterReadability";
import { MONSTER_ASSET_CONTRACTS, getMonsterActionFrames, getMonsterTextureKey } from "../client/src/game/entities/monsterVisuals";
import { assertBossFxCoverage, MonsterSkillFxController } from "../client/src/scenes/gameScene/monsterSkillFx";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();
const room = createRoom();
ensureDropState(room);
const spawned = spawnInitialMonsters(room);

const normal = spawned.find((monster) => monster.type === "normal");
const elite = spawned.find((monster) => monster.type === "elite");
const boss = spawned.find((monster) => monster.type === "boss");

assert.ok(normal, "normal monster should spawn");
assert.ok(elite, "elite monster should spawn");
assert.ok(boss, "boss monster should spawn");

const normalRuntime = [...room.monsters!.values()].find((monster) => monster.type === "normal") as RuntimeMonster;
const eliteRuntime = [...room.monsters!.values()].find((monster) => monster.type === "elite") as RuntimeMonster;
const bossRuntime = [...room.monsters!.values()].find((monster) => monster.type === "boss") as RuntimeMonster;

const hunter = createPlayer("hunter", { x: normalRuntime.x - 60, y: normalRuntime.y, direction: { x: 1, y: 0 }, squadId: "player" });
room.players.set(hunter.id, hunter);

const context: RuntimeContext = {
  room,
  roomState: {
    code: room.code,
    status: room.status,
    capacity: room.capacity,
    humanCapacity: room.capacity,
    squadCount: 2,
    botDifficulty: room.botDifficulty,
    players: [],
    hostPlayerId: hunter.id
  }
};

assertVisualContracts();
assertNormalAndEliteTelegraph();
assertBossTelegraph();
assertHitAndDeathReadable();

console.log("validate-combat-readability: ok");

function assertVisualContracts(): void {
  const labelKinds = new Set([getMonsterLabel(normal!), getMonsterLabel(elite!), getMonsterLabel(boss!)]);
  assert.equal(labelKinds.size, 3, "normal, elite, and boss should expose distinct visual labels");

  assert.equal(getMonsterTextureKey("boss"), "monster_boss_sheet", "boss should expose its dedicated texture key");
  assert.notEqual(getMonsterTextureKey("boss"), getMonsterTextureKey("elite"), "boss should no longer share elite texture key");

  assert.ok(Math.abs(MONSTER_ASSET_CONTRACTS.elite.displaySize - MONSTER_ASSET_CONTRACTS.normal.displaySize) <= 16, "normal and elite readability sizes should remain close");
  assert.ok(MONSTER_ASSET_CONTRACTS.boss.displaySize >= MONSTER_ASSET_CONTRACTS.elite.displaySize + 32, "boss readability size should stay clearly larger than elite");

  for (const action of ["idle", "move", "attack", "charge", "hurt", "death"] as const) {
    assert.ok(getMonsterActionFrames("boss", action).length > 0, `boss ${action} mapping should exist`);
  }

  assertBossFxCoverage();
  const fxCoverage = MonsterSkillFxController.getVisualCoverage();
  assert.deepEqual(Object.keys(fxCoverage).sort(), ["charge", "enrage", "recover", "smash"], "boss readability fx should cover all boss states");
  assert.ok(Object.values(fxCoverage).every((entry) => entry.requiresGeometry && entry.labelOnly === false), "boss readability fx cannot fall back to labels only");

  const bossSnapshot = getMonsterReadabilitySnapshot(boss!);
  assert.equal(bossSnapshot.isBoss, true, "boss readability snapshot should expose boss tier");
  assert.equal(typeof boss!.phaseEndsAt, "undefined", "fresh boss should not start with phase countdown");
}

function assertNormalAndEliteTelegraph(): void {
  hunter.state!.x = normalRuntime.x - 26;
  hunter.state!.y = normalRuntime.y;
  normalRuntime.nextAttackAt = 0;
  tickUntil(() => {
    const result = tickMonsters(context);
    const state = result.monsters.find((monster) => monster.id === normalRuntime.id);
    return state?.behaviorPhase === "windup" && typeof state.phaseEndsAt === "number";
  }, "normal monster should expose windup phase and phaseEndsAt");

  hunter.state!.x = eliteRuntime.x - 28;
  hunter.state!.y = eliteRuntime.y;
  eliteRuntime.nextAttackAt = 0;
  tickUntil(() => {
    const result = tickMonsters(context);
    const state = result.monsters.find((monster) => monster.id === eliteRuntime.id);
    return state?.behaviorPhase === "windup" && getMonsterLabel(state) === "ELITE STRIKE";
  }, "elite monster should expose visible windup state");
}

function assertBossTelegraph(): void {
  hunter.state!.x = bossRuntime.x - 220;
  hunter.state!.y = bossRuntime.y;
  bossRuntime.nextChargeAt = 0;
  bossRuntime.nextSmashAt = now + 60_000;

  tickUntil(() => {
    const result = tickMonsters(context);
    const state = result.monsters.find((monster) => monster.id === bossRuntime.id);
    return state?.skillState === "charge" && state.behaviorPhase === "windup" && typeof state.phaseEndsAt === "number";
  }, "boss charge should expose telegraph state");

  const chargeState = tickMonsters(context).monsters.find((monster) => monster.id === bossRuntime.id);
  assert.ok(chargeState?.telegraph?.chargeTarget, "boss charge should expose authoritative charge target to the client");
  assert.ok(chargeState?.telegraph?.aimDirection, "boss charge should expose authoritative charge direction to the client");

  bossRuntime.hp = Math.ceil(bossRuntime.maxHp * 0.3);
  const enragedState = tickMonsters(context).monsters.find((monster) => monster.id === bossRuntime.id);
  assert.equal(enragedState?.isEnraged, true, "boss should expose enraged state to client");
}

function assertHitAndDeathReadable(): void {
  hunter.state!.x = normalRuntime.x - 24;
  hunter.state!.y = normalRuntime.y;
  normalRuntime.hp = 18;
  hunter.attackCooldownEndsAt = 0;
  hunter.baseStats!.attackPower = 50;
  hunter.state!.attackPower = 50;

  const hitOutcome = handlePlayerAttack(context, hunter.id, {
    attackId: "readability-hit",
    direction: { x: 1, y: 0 },
    targetId: normalRuntime.id
  });

  const hitState = hitOutcome?.monsters.find((monster) => monster.id === normalRuntime.id);
  assert.ok(typeof hitState?.lastDamagedAt === "number", "monster hit should expose lastDamagedAt");

  const deathSnapshot = getMonsterReadabilitySnapshot(hitState!);
  assert.equal(hitState?.isAlive, false, "monster should die from lethal hit");
  assert.equal(typeof hitState?.deadAt, "number", "monster death should expose deadAt");
  assert.equal(deathSnapshot.isRecentlyDead, true, "death readability snapshot should expose corpse fade window");
}

function tickUntil(check: () => boolean, message: string): void {
  for (let index = 0; index < 40; index += 1) {
    if (check()) {
      return;
    }
    advancePhases();
  }
  throw new Error(message);
}

function advancePhases(): void {
  for (const monster of room.monsters?.values() ?? []) {
    monster.nextAttackAt = 0;
    if (monster.skillState === "charge" || monster.skillState === "smash") {
      monster.skillEndsAt = now - 1;
      monster.phaseEndsAt = now - 1;
    }
    if (monster.behaviorPhase === "windup" || monster.behaviorPhase === "recover") {
      monster.phaseEndsAt = now - 1;
    }
  }
}

function createRoom(): RuntimeRoom {
  return {
    code: "READ",
    hostPlayerId: "hunter",
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map(),
    matchLayout: {
      templateId: "A",
      squadSpawns: [],
      extractZones: [],
      chestZones: [
        { chestId: "c1", x: 2100, y: 2100, lane: "contested" },
        { chestId: "c2", x: 2500, y: 2400, lane: "contested" }
      ],
      safeZones: [],
      riverHazards: [],
      safeCrossings: []
    }
  };
}

function createPlayer(
  id: string,
  options: { x: number; y: number; direction: { x: number; y: number }; squadId: RuntimePlayer["squadId"] }
): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: true,
    ready: true,
    joinedAt: now,
    squadId: options.squadId,
    squadType: options.squadId === "player" ? "human" : "bot",
    isBot: options.squadId !== "player",
    state: {
      id,
      name: id,
      x: options.x,
      y: options.y,
      direction: options.direction,
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 300,
      attackPower: 12,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0,
      statusEffects: [],
      killsPlayers: 0,
      killsMonsters: 0,
      squadId: options.squadId,
      squadType: options.squadId === "player" ? "human" : "bot",
      isBot: options.squadId !== "player"
    },
    combat: {
      lastCastAtBySkillId: {},
      activeModifiers: [],
      pendingCombatEvents: [],
      lastAttackAt: now - 5000
    },
    baseStats: {
      maxHp: 100,
      weaponType: "sword",
      moveSpeed: 300,
      attackPower: 12,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0
    },
    attackCooldownEndsAt: 0,
    inventory: {
      width: 10,
      height: 6,
      items: [],
      equipment: {
        weapon: {
          instanceId: `${id}-weapon`,
          templateId: "weapon_sword_basic",
          name: "Sword",
          kind: "weapon",
          width: 1,
          height: 3,
          goldValue: 0,
          treasureValue: 0,
          affixes: [],
          weaponType: "sword",
          equipmentSlot: "weapon"
        }
      }
    }
  };
}

import assert from "node:assert/strict";
import { tickMonsters, handlePlayerAttack, spawnInitialMonsters } from "../server/src/monsters/monster-manager.js";
import { ensureDropState } from "../server/src/loot/loot-manager.js";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();
const room = createRoom();
ensureDropState(room);
const spawned = spawnInitialMonsters(room);
const bossState = spawned.find((monster) => monster.type === "boss");
assert.ok(bossState, "boss should spawn with initial monster set");

const boss = [...room.monsters!.values()].find((monster) => monster.type === "boss");
assert.ok(boss, "runtime boss should exist");

const player = createPlayer("hunter", { x: boss.x - 220, y: boss.y, direction: { x: 1, y: 0 }, squadId: "player" });
room.players.set(player.id, player);

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
    hostPlayerId: player.id
  }
};

const bossRuntime = boss as RuntimeMonster;
const hunter = player as RuntimePlayer;

assertBossChargeWindup();
assertBossChargeDamage();
assertBossEnrage();
assertBossSmashDamage();
assertBossRecover();
assertBossDrops();

console.log("validate-boss-loop: ok");

function assertBossChargeWindup(): void {
  tickUntil(() => {
    const result = tickMonsters(context);
    const snapshot = result.monsters.find((monster) => monster.id === bossRuntime.id);
    return snapshot?.behaviorPhase === "windup" && snapshot.skillState === "charge";
  }, "boss should enter charge windup when target is in mid range");

  const snapshot = tickMonsters(context).monsters.find((monster) => monster.id === bossRuntime.id);
  assert.ok(snapshot?.telegraph?.chargeTarget, "boss charge windup should expose charge target");
  assert.ok(snapshot?.telegraph?.aimDirection, "boss charge windup should expose charge direction");
}

function assertBossChargeDamage(): void {
  hunter.state!.x = bossRuntime.x - 40;
  hunter.state!.y = bossRuntime.y;
  tickUntil(() => {
    const result = tickMonsters(context);
    return result.combatEvents.some((event) => event.attackerId === bossRuntime.id && event.targetId === hunter.id && event.amount > 0);
  }, "boss charge should resolve into authoritative damage");
}

function assertBossEnrage(): void {
  bossRuntime.hp = Math.ceil(bossRuntime.maxHp * 0.3);
  tickUntil(() => {
    const result = tickMonsters(context);
    return result.monsters.find((monster) => monster.id === bossRuntime.id)?.isEnraged === true;
  }, "boss should become enraged at low hp");
}

function assertBossSmashDamage(): void {
  hunter.state!.x = bossRuntime.x - 18;
  hunter.state!.y = bossRuntime.y;
  bossRuntime.nextSmashAt = 0;
  bossRuntime.nextChargeAt = now + 60_000;
  tickUntil(() => {
    const result = tickMonsters(context);
    return result.monsters.find((monster) => monster.id === bossRuntime.id)?.skillState === "smash";
  }, "boss should wind up smash in close range");

  const smashSnapshot = tickMonsters(context).monsters.find((monster) => monster.id === bossRuntime.id);
  assert.ok((smashSnapshot?.telegraph?.smashRadius ?? 0) > 0, "boss smash should expose smash radius");

  bossRuntime.skillEndsAt = now - 1;
  const smashResult = tickMonsters(context);
  assert.ok(
    smashResult.combatEvents.some((event) => event.attackerId === bossRuntime.id && event.targetId === hunter.id && event.amount >= 28),
    "boss smash should land for high damage"
  );
}

function assertBossRecover(): void {
  bossRuntime.x = bossRuntime.patrolX + bossRuntime.guardRadius + 200;
  bossRuntime.y = bossRuntime.patrolY;
  bossRuntime.hp = Math.max(1, Math.floor(bossRuntime.maxHp * 0.45));
  bossRuntime.targetPlayerId = undefined;
  tickUntil(() => {
    const result = tickMonsters(context);
    const snapshot = result.monsters.find((monster) => monster.id === bossRuntime.id);
    return snapshot?.behaviorPhase === "recover";
  }, "boss should enter recover state after leashing out");

  const recoverSnapshot = tickMonsters(context).monsters.find((monster) => monster.id === bossRuntime.id);
  assert.ok(recoverSnapshot?.telegraph?.recoverAnchor, "boss recover should expose authoritative return anchor");

  const hpBeforeRecover = bossRuntime.hp;
  bossRuntime.returningUntil = now - 1;
  tickAdvance(18);
  assert.ok(bossRuntime.hp > hpBeforeRecover, "recover state should restore boss hp");
}

function assertBossDrops(): void {
  bossRuntime.x = bossRuntime.patrolX;
  bossRuntime.y = bossRuntime.patrolY;
  bossRuntime.targetPlayerId = hunter.id;
  bossRuntime.behaviorPhase = "hunt";
  bossRuntime.skillState = undefined;
  bossRuntime.skillEndsAt = undefined;
  bossRuntime.recoverUntil = undefined;
  hunter.state!.x = bossRuntime.x - 30;
  hunter.state!.y = bossRuntime.y;
  hunter.state!.direction = { x: 1, y: 0 };
  hunter.state!.hp = 100;
  hunter.state!.isAlive = true;
  hunter.attackCooldownEndsAt = 0;
  hunter.baseStats!.attackPower = 500;
  hunter.state!.attackPower = 500;
  bossRuntime.hp = 40;

  const killOutcome = handlePlayerAttack(context, hunter.id, {
    attackId: "boss-kill",
    direction: { x: 1, y: 0 },
    targetId: bossRuntime.id
  });

  assert.ok(killOutcome?.combat, "killing boss should return combat outcome");
  assert.equal(killOutcome?.combat?.targetAlive, false, "boss kill should be authoritative");
  assert.ok((killOutcome?.spawnedDrops.length ?? 0) >= 3, "boss should drop multiple rewards");
  assert.ok(killOutcome?.spawnedDrops.some((drop) => drop.item.treasureValue >= 100 || drop.item.rarity === "epic"), "boss loot should include a high-value reward");
  assert.equal(room.drops?.size, killOutcome?.spawnedDrops.length, "boss drops should enter shared world-drop state");
}

function tickAdvance(count: number): void {
  for (let index = 0; index < count; index += 1) {
    bossRuntime.nextAttackAt = 0;
    if (bossRuntime.skillState === "charge" || bossRuntime.skillState === "smash") {
      bossRuntime.skillEndsAt = now - 1;
    }
    tickMonsters(context);
  }
}

function tickUntil(check: () => boolean, message: string): void {
  for (let index = 0; index < 30; index += 1) {
    bossRuntime.nextAttackAt = 0;
    if (check()) {
      return;
    }
    if (bossRuntime.skillState === "charge" || bossRuntime.skillState === "smash") {
      bossRuntime.skillEndsAt = now - 1;
    }
  }

  throw new Error(message);
}

function createRoom(): RuntimeRoom {
  return {
    code: "BOSS",
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

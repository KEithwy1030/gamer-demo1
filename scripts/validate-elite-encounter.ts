import assert from "node:assert/strict";
import { spawnInitialMonsters, tickMonsters } from "../server/src/monsters/monster-manager.js";
import { ensureDropState } from "../server/src/loot/loot-manager.js";
import type { CombatEventPayload } from "@gamer/shared";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

validateEliteHeavyStrikeAppliesSlow();
validateNormalAttackDoesNotApplySlow();
validateBossAttackDoesNotApplySlow();
validateEliteChargedStrikeWindupAndArc();
validateEliteChargedStrikeAbort();

console.log("validate-elite-encounter: ok");

function validateEliteHeavyStrikeAppliesSlow(): void {
  const { monster, player, event } = runAttackScenario("elite");
  assert.equal(event.attackerId, monster.id, "elite encounter should emit combat event from the elite attacker");
  assert.deepEqual(event.statusApplied, ["slow"], "elite heavy strike should report slow in the combat payload");
  assert.ok(player.state?.statusEffects.some((effect) => effect.type === "slow" && effect.sourceId === monster.id), "elite hit should apply a slow status to the living target");
  assert.ok(player.state && player.state.moveSpeed < 300, "elite slow should reduce target move speed");
}

function validateNormalAttackDoesNotApplySlow(): void {
  const { event, player } = runAttackScenario("normal");
  assert.equal(event.statusApplied, undefined, "normal monster attack should not report a status effect");
  assert.equal(player.state?.statusEffects.some((effect) => effect.type === "slow"), false, "normal monster attack should not add slow");
  assert.equal(player.state?.moveSpeed, 300, "normal monster attack should preserve base move speed");
}

function validateBossAttackDoesNotApplySlow(): void {
  const { event, player } = runBossAttackScenario();
  assert.equal(event.statusApplied, undefined, "boss attack should remain unchanged and not report slow");
  assert.equal(player.state?.statusEffects.some((effect) => effect.type === "slow"), false, "boss attack should remain unchanged and not add slow");
}

function validateEliteChargedStrikeWindupAndArc(): void {
  const room = createRoom();
  ensureDropState(room);
  spawnInitialMonsters(room);
  const elite = [...(room.monsters?.values() ?? [])].find((entry) => entry.type === "elite");
  assert.ok(elite, "elite monster should spawn");

  const primary = createPlayer("elite-primary", {
    x: elite.x + 60,
    y: elite.y,
    direction: { x: -1, y: 0 },
    squadId: "player"
  });
  const frontAlly = createPlayer("elite-front-ally", {
    x: elite.x + 72,
    y: elite.y + 10,
    direction: { x: -1, y: 0 },
    squadId: "bot_alpha"
  });
  const flank = createPlayer("elite-flank", {
    x: elite.x - 70,
    y: elite.y,
    direction: { x: 1, y: 0 },
    squadId: "bot_beta"
  });
  room.players.set(primary.id, primary);
  room.players.set(frontAlly.id, frontAlly);
  room.players.set(flank.id, flank);

  const context = createContext(room, primary.id);
  const windup = tickMonsters(context);
  const windupSnapshot = windup.monsters.find((monster) => monster.id === elite.id);
  assert.equal(windup.combatEvents.length, 0, "elite charged strike should not hit during windup");
  assert.equal(windupSnapshot?.skillState, "chargedStrike", "elite should enter charged strike windup in close range");
  assert.ok((windupSnapshot?.windingUpAttackUntil ?? 0) > Date.now(), "elite charged strike should broadcast windup end time");

  elite.windingUpAttackUntil = Date.now() - 1;
  elite.phaseEndsAt = elite.windingUpAttackUntil;
  elite.skillEndsAt = elite.windingUpAttackUntil;
  const strike = tickMonsters(context);
  const hitTargets = strike.combatEvents.map((event) => event.targetId).sort();
  assert.deepEqual(hitTargets, [frontAlly.id, primary.id].sort(), "elite charged strike should damage every player in the forward arc only");
  for (const event of strike.combatEvents) {
    assert.equal(event.amount, 35, "elite charged strike should deal fixed heavy damage");
    assert.equal(event.statusApplied, undefined, "elite charged strike should not piggyback the basic slow effect");
  }
  assert.equal(flank.state?.hp, 100, "players outside the forward arc should not be hit by charged strike");
}

function validateEliteChargedStrikeAbort(): void {
  const room = createRoom();
  room.matchLayout.obstacleZones = [
    { obstacleId: "los_wall", x: 2220, y: 2040, width: 60, height: 180, kind: "wall" }
  ];
  ensureDropState(room);
  spawnInitialMonsters(room);
  const elite = [...(room.monsters?.values() ?? [])].find((entry) => entry.type === "elite");
  assert.ok(elite, "elite monster should spawn");

  elite.x = 2100;
  elite.y = 2100;
  elite.patrolX = 2100;
  elite.patrolY = 2100;

  const player = createPlayer("elite-abort-target", {
    x: 2180,
    y: 2100,
    direction: { x: -1, y: 0 },
    squadId: "player"
  });
  room.players.set(player.id, player);

  const context = createContext(room, player.id);
  const windup = tickMonsters(context);
  const windupSnapshot = windup.monsters.find((monster) => monster.id === elite.id);
  assert.equal(windupSnapshot?.skillState, "chargedStrike", "elite should start charged strike before LOS breaks");

  room.matchLayout.obstacleZones = [
    { obstacleId: "los_wall", x: 2130, y: 2040, width: 40, height: 180, kind: "wall" }
  ];
  const aborted = tickMonsters(context);
  const abortedSnapshot = aborted.monsters.find((monster) => monster.id === elite.id);
  assert.equal(aborted.combatEvents.length, 0, "elite charged strike should abort cleanly when LOS breaks");
  assert.equal(abortedSnapshot?.windingUpAttackUntil, undefined, "aborted charged strike should clear the broadcast windup timestamp");
  assert.equal(abortedSnapshot?.skillState, undefined, "aborted charged strike should leave windup state");
  assert.ok((elite.nextChargedStrikeAt ?? 0) > Date.now(), "aborted charged strike should still trigger its cooldown");
}

function runAttackScenario(type: "normal" | "elite"): { monster: RuntimeMonster; player: RuntimePlayer; event: CombatEventPayload } {
  const room = createRoom();
  ensureDropState(room);
  spawnInitialMonsters(room);
  const monster = [...(room.monsters?.values() ?? [])].find((entry) => entry.type === type);
  assert.ok(monster, `${type} monster should spawn`);

  const player = createPlayer(`${type}-target`, {
    x: monster.x - 26,
    y: monster.y,
    direction: { x: 1, y: 0 },
    squadId: "player"
  });
  room.players.set(player.id, player);

  const context = createContext(room, player.id);
  monster.nextAttackAt = 0;
  if (type === "elite") {
    monster.nextChargedStrikeAt = Date.now() + 60_000;
  }
  return {
    monster,
    player,
    event: tickUntilCombatEvent(context, monster.id, player.id)
  };
}

function runBossAttackScenario(): { player: RuntimePlayer; event: CombatEventPayload } {
  const room = createRoom();
  ensureDropState(room);
  spawnInitialMonsters(room);
  const boss = [...(room.monsters?.values() ?? [])].find((entry) => entry.type === "boss");
  assert.ok(boss, "boss monster should spawn");

  const player = createPlayer("boss-target", {
    x: boss.x - 78,
    y: boss.y,
    direction: { x: 1, y: 0 },
    squadId: "player"
  });
  room.players.set(player.id, player);

  const context = createContext(room, player.id);
  boss.nextAttackAt = 0;

  return {
    player,
    event: tickUntilCombatEvent(context, boss.id, player.id)
  };
}

function tickUntilCombatEvent(context: RuntimeContext, monsterId: string, targetId: string): CombatEventPayload {
  for (let index = 0; index < 40; index += 1) {
    const result = tickMonsters(context);
    const event = result.combatEvents.find((entry) => entry.attackerId === monsterId && entry.targetId === targetId);
    if (event) {
      return event;
    }

    const monster = context.room.monsters?.get(monsterId);
    if (monster) {
      monster.nextAttackAt = 0;
      if (monster.behaviorPhase === "windup" || monster.behaviorPhase === "recover") {
        monster.phaseEndsAt = Date.now() - 1;
      }
      if (monster.skillEndsAt) {
        monster.skillEndsAt = Date.now() - 1;
      }
    }
  }

  throw new Error(`expected combat event from ${monsterId} to ${targetId}`);
}

function createContext(room: RuntimeRoom, hostPlayerId: string): RuntimeContext {
  return {
    room,
    roomState: {
      code: room.code,
      status: room.status,
      capacity: room.capacity,
      humanCapacity: room.capacity,
      squadCount: 2,
      botDifficulty: room.botDifficulty,
      players: [],
      hostPlayerId
    }
  };
}

function createRoom(): RuntimeRoom {
  return {
    code: "ELIT",
    hostPlayerId: "host",
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
      safeCrossings: [],
      obstacleZones: [],
      landmarks: []
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

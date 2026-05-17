import assert from "node:assert/strict";
import { spawnInitialMonsters, tickMonsters } from "../server/src/monsters/monster-manager.js";
import { ensureDropState } from "../server/src/loot/loot-manager.js";
import type { CombatEventPayload } from "@gamer/shared";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

validateEliteHeavyStrikeAppliesSlow();
validateNormalAttackDoesNotApplySlow();
validateBossAttackDoesNotApplySlow();

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

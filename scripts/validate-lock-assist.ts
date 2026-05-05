import assert from "node:assert/strict";
import { WEAPON_DEFINITIONS } from "@gamer/shared";
import { resolvePlayerAttack } from "../server/src/combat/combat-service.js";
import { handlePlayerAttack as handleMonsterPlayerAttack, ensureMonsterState } from "../server/src/monsters/monster-manager.js";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

const room = createRoom();
const attacker = createPlayer("attacker", { x: 400, y: 400, direction: { x: 1, y: 0 }, squadId: "player" });
const enemy = createPlayer("enemy", { x: 780, y: 400, direction: { x: -1, y: 0 }, squadId: "bot_alpha" });
room.players.set(attacker.id, attacker);
room.players.set(enemy.id, enemy);

const farAttack = resolvePlayerAttack(room, attacker.id, {
  attackId: "atk-far-player",
  direction: { x: 1, y: 0 },
  targetId: enemy.id
});
assert.equal(farAttack.combatEvents.length, 0, "far player targetId should not bypass server range validation");

enemy.state!.x = 530;
attacker.combat!.lastAttackAt = now - 5000;
const nearAttack = resolvePlayerAttack(room, attacker.id, {
  attackId: "atk-near-player",
  direction: { x: 1, y: 0 },
  targetId: enemy.id
});
assert.equal(nearAttack.combatEvents.length, 1, "near player targetId should resolve once in range");
assert.equal(nearAttack.combatEvents[0]?.targetId, enemy.id, "player attack should hit requested enemy when valid");

attacker.combat!.lastAttackAt = now - 5000;
attacker.attackCooldownEndsAt = 0;

const monster = createMonster("monster-target", { x: 760, y: 400 });
ensureMonsterState(room).set(monster.id, monster);
const context: RuntimeContext = { room, roomState: { code: room.code, status: room.status, capacity: room.capacity, humanCapacity: room.capacity, squadCount: 2, botDifficulty: room.botDifficulty, players: [], hostPlayerId: attacker.id } };

const farMonsterAttack = handleMonsterPlayerAttack(context, attacker.id, {
  attackId: "atk-far-monster",
  direction: { x: 1, y: 0 },
  targetId: monster.id
});
assert.equal(farMonsterAttack?.combat, undefined, "far monster targetId should not bypass server range validation");

monster.x = 520;
attacker.attackCooldownEndsAt = 0;
const nearMonsterAttack = handleMonsterPlayerAttack(context, attacker.id, {
  attackId: "atk-near-monster",
  direction: { x: 1, y: 0 },
  targetId: monster.id
});
assert.equal(nearMonsterAttack?.combat?.targetId, monster.id, "near monster targetId should resolve once in range");

console.log("validate-lock-assist: ok");

function createRoom(): RuntimeRoom {
  return {
    code: "TEST",
    hostPlayerId: "attacker",
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map()
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
    isHost: id === "attacker",
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
      attackPower: 0,
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
      attackPower: 0,
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
          templateId: "weapon_sword",
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

function createMonster(id: string, options: { x: number; y: number }): RuntimeMonster {
  return {
    id,
    spawnId: id,
    type: "normal",
    x: options.x,
    y: options.y,
    hp: 45,
    maxHp: 45,
    isAlive: true,
    spawnX: options.x,
    spawnY: options.y,
    patrolX: options.x,
    patrolY: options.y,
    patrolRadius: 160,
    guardRadius: 180,
    returnDelayMs: 3000,
    aggroRange: 200,
    leashRange: 400,
    attackRange: 40,
    attackDamage: 8,
    moveSpeed: 240,
    attackCooldownMs: 1100,
    nextAttackAt: 0
  };
}

void WEAPON_DEFINITIONS;

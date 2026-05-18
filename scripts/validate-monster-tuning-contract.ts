import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnInitialMonsters, tickMonsters } from "../server/src/monsters/monster-manager.js";
import { ensureDropState } from "../server/src/loot/loot-manager.js";
import {
  ELITE_MONSTER_AGGRO_RANGE,
  ELITE_MONSTER_MAX_HP,
  ELITE_MONSTER_ATTACK_DAMAGE,
  ELITE_MONSTER_ATTACK_RANGE,
  ELITE_MONSTER_LEASH_RANGE,
  ELITE_MONSTER_MOVE_SPEED,
  NORMAL_MONSTER_AGGRO_RANGE,
  NORMAL_MONSTER_MAX_HP,
  NORMAL_MONSTER_ATTACK_DAMAGE,
  NORMAL_MONSTER_ATTACK_RANGE,
  NORMAL_MONSTER_LEASH_RANGE,
  NORMAL_MONSTER_MOVE_SPEED,
  NORMAL_MONSTER_ATTACK_COOLDOWN_MS
} from "../server/src/internal-constants.js";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const monsterManagerSource = readFileSync(`${repoRoot}server/src/monsters/monster-manager.ts`, "utf8");
const now = Date.now();

assert.equal(NORMAL_MONSTER_MOVE_SPEED, 240, "normal monster move speed should match GDD section 18.3");
assert.equal(ELITE_MONSTER_MOVE_SPEED, 252, "elite monster move speed should match GDD section 18.3");
assert.equal(NORMAL_MONSTER_ATTACK_RANGE, 40, "normal monster attack range should match GDD section 18.3");
assert.equal(ELITE_MONSTER_ATTACK_RANGE, 48, "elite monster attack range should match GDD section 18.3");
assert.equal(NORMAL_MONSTER_MAX_HP, 45, "normal monster hp should match the server combat baseline");
assert.equal(ELITE_MONSTER_MAX_HP, 135, "elite monster hp should stay at triple normal hp for encounter separation");
assert.equal(NORMAL_MONSTER_ATTACK_DAMAGE, 8, "normal monster attack damage should match GDD section 18.3");
assert.equal(ELITE_MONSTER_ATTACK_DAMAGE, 22, "elite monster attack damage should match the elite pressure contract");
assert.equal(ELITE_MONSTER_AGGRO_RANGE, 280, "elite monster aggro range should match GDD section 18.3");
assert.equal(NORMAL_MONSTER_LEASH_RANGE, 400, "normal monster leash range should match GDD section 18.3");
assert.equal(ELITE_MONSTER_LEASH_RANGE, 560, "elite monster leash range should match GDD section 18.3");

assert.ok(
  NORMAL_MONSTER_AGGRO_RANGE < ELITE_MONSTER_AGGRO_RANGE,
  "elite monsters should notice players farther away than normal monsters"
);
assert.match(
  monsterManagerSource,
  /const OPENING_PASSIVE_AGGRO_GRACE_MS = 25_000;/,
  "opening passive aggro grace should give new players time to read the first combat view"
);
assert.match(
  monsterManagerSource,
  /Date\.now\(\) - room\.startedAt < OPENING_PASSIVE_AGGRO_GRACE_MS[\s\S]*&& !monster\.lastDamagedAt[\s\S]*return undefined;/,
  "opening grace should block passive proximity aggro but preserve attacked/noise-alerted targets"
);

validateNormalBerserkContract();

console.log("validate-monster-tuning-contract: ok");

function validateNormalBerserkContract(): void {
  const room = createRoom();
  ensureDropState(room);
  spawnInitialMonsters(room);
  const normal = [...(room.monsters?.values() ?? [])].find((monster) => monster.type === "normal");
  assert.ok(normal, "normal monster should spawn");

  normal.hp = Math.floor(normal.maxHp * 0.29);
  const player = createPlayer("berserk-target", {
    x: normal.x + 200,
    y: normal.y,
    direction: { x: -1, y: 0 },
    squadId: "player"
  });
  room.players.set(player.id, player);

  const context = createContext(room, player.id);
  const startX = normal.x;
  const huntTick = tickMonsters(context);
  const snapshot = huntTick.monsters.find((monster) => monster.id === normal.id);
  assert.equal(snapshot?.berserk, true, "normal monsters below 30% hp should broadcast berserk");
  assert.ok(normal.x - startX > 30, "berserk normal should gain move speed during pursuit");

  player.state!.x = normal.x + 20;
  player.state!.y = normal.y;
  normal.nextAttackAt = 0;
  tickMonsters(context);
  normal.phaseEndsAt = Date.now() - 1;
  const resolveStartedAt = Date.now();
  const resolve = tickMonsters(context);
  const event = resolve.combatEvents.find((entry) => entry.attackerId === normal.id && entry.targetId === player.id);
  assert.ok(event, "berserk normal should still complete its basic attack");
  const cooldownMs = normal.nextAttackAt - resolveStartedAt;
  assert.ok(cooldownMs < NORMAL_MONSTER_ATTACK_COOLDOWN_MS, "berserk normal basic attack interval should be shorter than baseline");
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
    code: "BERS",
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

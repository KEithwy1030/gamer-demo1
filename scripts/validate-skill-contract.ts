import assert from "node:assert/strict";
import {
  PRIMARY_SKILL_BY_WEAPON,
  SKILL_DEFINITIONS,
  SKILLS_BY_WEAPON,
  getSkillCooldownMs,
  getSkillWindupMs,
  type SkillId
} from "@gamer/shared";
import {
  getPrimarySkillCooldownMs,
  getPrimarySkillWindupMs
} from "../client/src/scenes/gameScene/skillHelpers.js";
import { resolvePlayerSkillCast } from "../server/src/combat/combat-service.js";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const ALL_SKILLS: SkillId[] = [
  "sword_dashSlash",
  "sword_bladeFlurry",
  "sword_shadowStep",
  "blade_sweep",
  "blade_guard",
  "blade_overpower",
  "spear_heavyThrust",
  "spear_warCry",
  "spear_draggingStrike",
  "common_dodge"
];

validateSharedSkillCoverage();
validateClientConsumesSharedTiming();
validateServerDodgeCooldownContract();

console.log("validate-skill-contract: ok");

function validateSharedSkillCoverage(): void {
  assert.deepEqual(Object.keys(SKILL_DEFINITIONS).sort(), [...ALL_SKILLS].sort(), "shared skill contract should cover every SkillId");
  assert.equal(PRIMARY_SKILL_BY_WEAPON.sword, "sword_dashSlash", "sword primary skill should be dash slash");
  assert.equal(PRIMARY_SKILL_BY_WEAPON.blade, "blade_sweep", "blade primary skill should be sweep");
  assert.equal(PRIMARY_SKILL_BY_WEAPON.spear, "spear_heavyThrust", "spear primary skill should be heavy thrust");

  const weaponSkills = new Set(Object.values(SKILLS_BY_WEAPON).flat());
  for (const skillId of ALL_SKILLS.filter((entry) => entry !== "common_dodge")) {
    assert.ok(weaponSkills.has(skillId), `${skillId} should be reachable from a weapon skill slot`);
  }
  assert.equal(getSkillCooldownMs("common_dodge"), 5000, "dodge cooldown should follow the GDD 5s contract");
  assert.equal(getSkillWindupMs("spear_heavyThrust"), 450, "spear heavy thrust windup should stay shared");
}

function validateClientConsumesSharedTiming(): void {
  for (const skillId of ALL_SKILLS) {
    assert.equal(getPrimarySkillCooldownMs(skillId), getSkillCooldownMs(skillId), `${skillId} client cooldown should mirror shared`);
    assert.equal(getPrimarySkillWindupMs(skillId), getSkillWindupMs(skillId), `${skillId} client windup should mirror shared`);
  }
}

function validateServerDodgeCooldownContract(): void {
  const room = createRoom();
  const player = createPlayer("dodger");
  room.players.set(player.id, player);

  resolvePlayerSkillCast(room, player.id, { skillId: "common_dodge" });
  assert.throws(
    () => resolvePlayerSkillCast(room, player.id, { skillId: "common_dodge" }),
    /Dodge is on cooldown/,
    "server should reject a second dodge inside the shared 5s cooldown"
  );

  player.combat!.lastCastAtBySkillId.common_dodge = Date.now() - getSkillCooldownMs("common_dodge");
  assert.doesNotThrow(
    () => resolvePlayerSkillCast(room, player.id, { skillId: "common_dodge" }),
    "server should accept dodge once the shared 5s cooldown has elapsed"
  );
}

function createRoom(): RuntimeRoom {
  return {
    code: "SKIL",
    hostPlayerId: "dodger",
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: Date.now(),
    startedAt: Date.now(),
    players: new Map()
  };
}

function createPlayer(id: string): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: true,
    ready: true,
    joinedAt: Date.now(),
    squadId: "player",
    squadType: "human",
    isBot: false,
    state: {
      id,
      name: id,
      x: 300,
      y: 300,
      direction: { x: 1, y: 0 },
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
    combat: {
      lastCastAtBySkillId: {},
      activeModifiers: [],
      pendingCombatEvents: []
    }
  };
}

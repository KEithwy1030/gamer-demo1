import assert from "node:assert/strict";
import {
  PRIMARY_SKILL_BY_WEAPON,
  SKILL_DEFINITIONS,
  SKILLS_BY_WEAPON,
  getSkillCooldownMs,
  getSkillWindupMs,
  type SkillId,
  type WeaponType
} from "@gamer/shared";
import {
  getPrimarySkillCooldownMs,
  getPrimarySkillWindupMs
} from "../client/src/scenes/gameScene/skillHelpers.js";
import { resolvePlayerAttack, resolvePlayerSkillCast } from "../server/src/combat/combat-service.js";
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
validateServerWeaponSkillBranches();

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

function validateServerWeaponSkillBranches(): void {
  const damageSkillCases: Array<{ skillId: SkillId; weaponType: WeaponType }> = [
    { skillId: "sword_dashSlash", weaponType: "sword" },
    { skillId: "blade_sweep", weaponType: "blade" },
    { skillId: "spear_heavyThrust", weaponType: "spear" }
  ];

  for (const { skillId, weaponType } of damageSkillCases) {
    const { room, caster, target } = createSkillRoom(weaponType);
    const result = resolvePlayerSkillCast(room, caster.id, { skillId });
    assert.ok(result.combatEvents.some((event) => event.targetId === target.id && event.amount > 0), `${skillId} should resolve server-side damage`);
    if (skillId === "spear_heavyThrust") {
      const critEvent = result.combatEvents.find((event) => event.targetId === target.id);
      assert.equal(critEvent?.isCritical, true, "spear heavy thrust should stay flagged as a critical hit");
      assert.equal(critEvent?.critMultiplier, 1.5, "spear heavy thrust should expose its critical multiplier for VFX scaling");
    }
  }

  const bladeGuard = createSkillRoom("blade");
  resolvePlayerSkillCast(bladeGuard.room, bladeGuard.caster.id, { skillId: "blade_guard" });
  assert.ok(bladeGuard.caster.state?.statusEffects.some((effect) => effect.type === "damageReduction"), "blade guard should apply a visible damage reduction state");

  const bladeOverpower = createSkillRoom("blade");
  resolvePlayerSkillCast(bladeOverpower.room, bladeOverpower.caster.id, { skillId: "blade_overpower" });
  assert.ok(bladeOverpower.caster.state?.statusEffects.some((effect) => effect.type === "attackBoost"), "blade overpower should apply a visible attack boost state");

  const spearWarCry = createSkillRoom("spear");
  resolvePlayerSkillCast(spearWarCry.room, spearWarCry.caster.id, { skillId: "spear_warCry" });
  assert.ok(spearWarCry.caster.state?.statusEffects.some((effect) => effect.type === "damageReduction"), "spear war cry should apply damage reduction");
  assert.ok(spearWarCry.caster.state?.statusEffects.some((effect) => effect.type === "moveSpeedBoost"), "spear war cry should apply move speed boost");

  const spearDraggingStrike = createSkillRoom("spear");
  resolvePlayerSkillCast(spearDraggingStrike.room, spearDraggingStrike.caster.id, { skillId: "spear_draggingStrike" });
  const basicResult = resolvePlayerAttack(spearDraggingStrike.room, spearDraggingStrike.caster.id, { attackId: "dragging-followup" });
  assert.ok(
    basicResult.combatEvents.some((event) => event.targetId === spearDraggingStrike.target.id && event.statusApplied?.includes("slow")),
    "spear dragging strike should prime the next basic attack with a slow"
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

function createSkillRoom(weaponType: WeaponType): { room: RuntimeRoom; caster: RuntimePlayer; target: RuntimePlayer } {
  const room = createRoom();
  const caster = createPlayer("caster", weaponType, "player", 300, 300);
  const target = createPlayer("target", "sword", "bot_alpha", 405, 300);
  room.players.set(caster.id, caster);
  room.players.set(target.id, target);
  return { room, caster, target };
}

function createPlayer(
  id: string,
  weaponType: WeaponType = "sword",
  squadId: RuntimePlayer["squadId"] = "player",
  x = 300,
  y = 300
): RuntimePlayer {
  return {
    id,
    name: id,
    socketId: id,
    isHost: true,
    ready: true,
    joinedAt: Date.now(),
    squadId,
    squadType: squadId === "player" ? "human" : "bot",
    isBot: squadId !== "player",
    state: {
      id,
      name: id,
      x,
      y,
      direction: { x: 1, y: 0 },
      hp: 100,
      maxHp: 100,
      weaponType,
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
    baseStats: {
      maxHp: 100,
      weaponType,
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

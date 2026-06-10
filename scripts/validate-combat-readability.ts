import assert from "node:assert/strict";
import fs from "node:fs";
import { listMonsterStates, spawnInitialMonsters, tickMonsters, handlePlayerAttack } from "../server/src/monsters/monster-manager.js";
import { ensureDropState } from "../server/src/loot/loot-manager.js";
import { buildMatchLayout } from "../server/src/match-layout.js";
import { applyEnvironmentalDamage, drainPendingCombatEvents } from "../server/src/combat/player-effects.js";
import { getMonsterLabel, getMonsterReadabilitySnapshot } from "../client/src/game/entities/monsterReadability";
import { MONSTER_ASSET_CONTRACTS, getMonsterActionFrameRate, getMonsterActionFrames, getMonsterTextureKey, getMonsterVisualProfile } from "../client/src/game/entities/monsterVisuals";
import { assertBossFxCoverage, MonsterSkillFxController } from "../client/src/scenes/gameScene/monsterSkillFx";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const TARGET_DISPLAY_SIZE = {
  normal: 114,
  elite: 130,
  boss: 260
} as const;

const now = Date.now();
const room = createRoom();
ensureDropState(room);
// spawnInitialMonsters 现在只生成 boss；基础/精英怪改由 spawn-director 在
// tickMonsters 里按阶段动态生成，所以先放好玩家再强制推进刷怪。
spawnInitialMonsters(room);

const hunter = createPlayer("hunter", { x: 2400, y: 2400, direction: { x: 1, y: 0 }, squadId: "player" });
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

// 基础怪的运行时 type 是 "basic"（monster-manager 在 spawn 时把定义层的
// "normal" 归一成 "basic"），可视化 contract 两个 key 都支持。
const isBasicTier = (monster: { type: string }) => monster.type === "basic" || monster.type === "normal";

// opening 阶段必出 basic、danger 阶段（精英缺位时）必出 elite：分两段强制
// 推进（nextSpawnAt 清零 = 每 tick 刷一只），凑齐后冻结刷怪，避免后续断言
// 期间地图被刷满。
forceSpawnUntil(() => [...room.monsters!.values()].some(isBasicTier));
room.startedAt = now - 250_000;
forceSpawnUntil(() => [...room.monsters!.values()].some((monster) => monster.type === "elite"));
room.startedAt = now;
room.spawnDirector!.nextSpawnAt = Number.MAX_SAFE_INTEGER;

const normalRuntime = [...room.monsters!.values()].find(isBasicTier) as RuntimeMonster;
const eliteRuntime = [...room.monsters!.values()].find((monster) => monster.type === "elite") as RuntimeMonster;
const bossRuntime = [...room.monsters!.values()].find((monster) => monster.type === "boss") as RuntimeMonster;

assert.ok(normalRuntime, "normal monster should spawn");
assert.ok(eliteRuntime, "elite monster should spawn");
assert.ok(bossRuntime, "boss monster should spawn");

// 精英守卫角色由 spawn id 推导（带随机后缀），label 断言需要确定的 sentinel。
eliteRuntime.eliteRole = "sentinel";

const stateSnapshot = listMonsterStates(room);
const normal = stateSnapshot.find((monster) => monster.id === normalRuntime.id);
const elite = stateSnapshot.find((monster) => monster.id === eliteRuntime.id);
const boss = stateSnapshot.find((monster) => monster.id === bossRuntime.id);

assert.ok(normal && elite && boss, "monster state snapshot should expose all three tiers");

hunter.state!.x = normalRuntime.x - 60;
hunter.state!.y = normalRuntime.y;

function forceSpawnUntil(check: () => boolean): void {
  for (let attempt = 0; attempt < 40 && !check(); attempt += 1) {
    room.spawnDirector!.nextSpawnAt = 0;
    tickMonsters(context);
  }
}

assertVisualContracts();
assertNormalAndEliteTelegraph();
assertBossTelegraph();
assertHitAndDeathReadable();
assertUnifiedDamageFeedback();
assertPlayerStatusReadability();

console.log("validate-combat-readability: ok");

function assertVisualContracts(): void {
  const labelKinds = new Set([getMonsterLabel(normal!), getMonsterLabel(elite!), getMonsterLabel(boss!)]);
  assert.equal(labelKinds.size, 3, "normal, elite, and boss should expose distinct visual labels");

  assert.equal(getMonsterTextureKey("boss"), "monster_boss_sheet", "boss should expose its dedicated texture key");
  assert.notEqual(getMonsterTextureKey("boss"), getMonsterTextureKey("elite"), "boss should no longer share elite texture key");

  assert.equal(MONSTER_ASSET_CONTRACTS.normal.displaySize, TARGET_DISPLAY_SIZE.normal, "normal readability size should be raised to the updated 30 percent-larger target");
  assert.equal(MONSTER_ASSET_CONTRACTS.elite.displaySize, TARGET_DISPLAY_SIZE.elite, "elite readability size should sit clearly above the updated normal tier");
  assert.equal(MONSTER_ASSET_CONTRACTS.boss.displaySize, TARGET_DISPLAY_SIZE.boss, "boss readability size should sit above elite while remaining fightable after the 50 percent increase");

  const normalProfile = getMonsterVisualProfile("normal");
  const eliteProfile = getMonsterVisualProfile("elite");
  const bossProfile = getMonsterVisualProfile("boss");
  assert.equal(normalProfile.hpWidth, 101, "normal hp bar should scale up with the monster");
  assert.equal(eliteProfile.hpWidth, 85, "elite hp bar should track the requested 130px silhouette");
  assert.equal(bossProfile.hpWidth, 186, "boss hp bar should track the requested 260px silhouette");
  assert.equal(normalProfile.crownY, -130, "normal crown anchor contract should move with the larger monster silhouette");
  assert.equal(eliteProfile.crownY, -145, "elite crown anchor contract should lift above the requested elite silhouette");
  assert.equal(bossProfile.crownY, -277, "boss crown anchor contract should lift above the requested boss silhouette");
  assert.equal(eliteProfile.labelOffsetY, 93, "elite label offset should clear the requested elite feet and shadow");
  assert.equal(bossProfile.labelOffsetY, 182, "boss label offset should clear the requested boss feet and shadow");

  for (const action of ["idle", "move", "attack", "charge", "hurt", "death"] as const) {
    assert.ok(getMonsterActionFrames("boss", action).length > 0, `boss ${action} mapping should exist`);
    assert.ok(getMonsterActionFrameRate("boss", action) >= 1, `boss ${action} frame rate should stay positive`);
  }

  assert.deepEqual(getMonsterActionFrames("normal", "idle"), [0, 0, 1, 2, 1], "normal idle should include a hold frame to soften the loop");
  assert.deepEqual(getMonsterActionFrames("elite", "move"), [4, 5, 6, 7, 6, 5], "elite move should use a mirrored return loop");
  assert.deepEqual(getMonsterActionFrames("boss", "attack"), [8, 9, 10, 9], "boss attack should include a recovery frame");

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
    return state?.behaviorPhase === "windup" && getMonsterLabel(state) === "ELITE SENTINEL STRIKE";
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

function assertUnifiedDamageFeedback(): void {
  const hazardVictim = createPlayer("hazard", { x: 140, y: 160, direction: { x: 0, y: 1 }, squadId: "player" });
  const event = applyEnvironmentalDamage(hazardVictim, 7, "corpse_fog", now);
  assert.equal(event?.damageType, "environment", "environment damage should emit a combat payload");
  assert.equal(event?.attackerId, "corpse_fog", "environment damage should preserve source id");
  assert.equal(event?.interruptsExtract, false, "environment pressure should not make late extraction structurally impossible");
  assert.equal(drainPendingCombatEvents(hazardVictim).length, 0, "environment damage should not rely on a separate pending queue");
  // S5 重构后战斗反馈层是 features/combat/vfx/combatVfx.ts（feedbackFx.ts 已
  // 删除）；statusApplied 即时标签由 PlayerMarker 的状态徽章取代（见
  // assertPlayerStatusReadability）。这里按现行架构验证同一组意图。
  const combatVfxSource = fs.readFileSync(new URL("../client/src/features/combat/vfx/combatVfx.ts", import.meta.url), "utf8");
  const playerHitFontSize = Number(/playerHit:\s*\{\s*fontSize:\s*(\d+)/.exec(combatVfxSource)?.[1] ?? 0);
  const playerCritFontSize = Number(/playerCrit:\s*\{\s*fontSize:\s*(\d+)/.exec(combatVfxSource)?.[1] ?? 0);
  const playerHurtFontSize = Number(/playerHurt:\s*\{\s*fontSize:\s*(\d+)/.exec(combatVfxSource)?.[1] ?? 0);
  assert.ok(playerHitFontSize > 0, "combat vfx should keep readable damage numbers for own hits");
  assert.ok(playerCritFontSize > playerHitFontSize, "crit damage numbers should be visibly larger than normal hits");
  assert.ok(playerHurtFontSize >= playerHitFontSize, "incoming damage numbers should remain at least as readable as outgoing");
  assert.ok(
    /on\("PlayerDamaged",[\s\S]*?showDamage\(/.test(combatVfxSource),
    "damage events should always route through the unified damage feedback path"
  );
  assert.ok(
    /spawnSparkParticles\(/.test(combatVfxSource),
    "damage feedback should include a physical impact response, not only floating numbers"
  );
  assert.ok(
    /createWeaponVfx\([\s\S]*?spawnFragments\(/.test(combatVfxSource),
    "basic attack feedback should produce body-impact fragments"
  );
  assert.ok(!combatVfxSource.includes("showHitImpact("), "legacy hit-impact helper should not remain as the main effect path");
}

function assertPlayerStatusReadability(): void {
  const playerMarkerSource = fs.readFileSync(new URL("../client/src/game/entities/PlayerMarker.ts", import.meta.url), "utf8");
  assert.ok(playerMarkerSource.includes("statusBadges"), "player marker should maintain visible status badges");
  assert.ok(playerMarkerSource.includes("summarizeStatusEffects"), "player marker should summarize status effects before display");
  assert.ok(playerMarkerSource.includes("resolveStatusBadge"), "player marker should map status effects to stable badge labels");
  for (const label of ["缓", "血", "盾", "攻", "速", "疾"]) {
    assert.ok(playerMarkerSource.includes(label), `status badge ${label} should remain visible in combat UI`);
  }
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
    // spawn 逻辑（基础怪/精英分布）依赖真实布局节点，合成的空 squadSpawns
    // 布局只会出 boss——用服务端真实生成器。
    matchLayout: buildMatchLayout({
      roomCode: "READ",
      startedAt: now,
      squadIds: ["player", "bot_alpha"]
    })
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

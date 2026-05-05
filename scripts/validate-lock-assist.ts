import assert from "node:assert/strict";
import { WEAPON_DEFINITIONS } from "@gamer/shared";
import { resolvePlayerAttack } from "../server/src/combat/combat-service.js";
import { handlePlayerAttack as handleMonsterPlayerAttack, ensureMonsterState } from "../server/src/monsters/monster-manager.js";
import {
  LOCK_ASSIST_ACQUIRE_RANGE_BUFFER,
  LOCK_ASSIST_CHASE_MAX_DURATION_MS,
  LOCK_ASSIST_CHASE_MOVE_SCALE,
  getWeaponRange,
  resolveAttackAssist,
  resolveChaseAssistStep,
  type ChaseAssistState,
  type LockAssistSelf,
  type LockAssistTarget
} from "../client/src/scenes/gameScene/lockAssist.js";
import { mapLockAssistFeedbackEvent } from "../client/src/scenes/gameScene/lockAssistFeedback.js";
import type { RuntimeContext, RuntimeMonster, RuntimePlayer, RuntimeRoom } from "../server/src/types.js";

const now = Date.now();

validateServerTargetRangeGuards();
validateQueuedAttackFlow();
validateChaseCancelAndReleaseContracts();
validateFeedbackEventMappings();

console.log("validate-lock-assist: ok");

function validateServerTargetRangeGuards(): void {
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
      hostPlayerId: attacker.id
    }
  };

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
}

function validateQueuedAttackFlow(): void {
  const self = createAssistSelf();
  const target: LockAssistTarget = { id: "monster-1", x: 610, y: 400, isAlive: true };
  const assist = resolveAttackAssist(self, [], [target], { x: 1, y: 0 });

  assert.equal(assist.targetId, target.id, "assist should choose the chaseable target");
  assert.equal(assist.targetKind, "monster", "assist should preserve target kind");
  assert.equal(assist.shouldChase, true, "target outside attack reach but inside chase reach should queue chase");

  const chaseAssist: ChaseAssistState = {
    targetId: target.id,
    targetKind: "monster",
    startedAt: now,
    expiresAt: now + LOCK_ASSIST_CHASE_MAX_DURATION_MS
  };

  const continueStep = resolveChaseAssistStep({
    self,
    chaseAssist,
    target,
    queuedAttackTargetId: target.id,
    now: now + 100,
    lastFacingDirection: { x: 1, y: 0 },
    currentMoveDirection: { x: 0, y: 0 }
  });
  assert.equal(continueStep.kind, "continue", "chase should keep advancing while target is still outside attack reach");
  assert.deepEqual(continueStep.moveDirection, { x: LOCK_ASSIST_CHASE_MOVE_SCALE, y: 0 }, "chase should drive forward move input toward the target");

  const targetInRange: LockAssistTarget = {
    ...target,
    x: 400 + getWeaponRange(self.weaponType) + LOCK_ASSIST_ACQUIRE_RANGE_BUFFER - 4,
    y: 400
  };
  const attackStep = resolveChaseAssistStep({
    self,
    chaseAssist,
    target: targetInRange,
    queuedAttackTargetId: target.id,
    now: now + 180,
    lastFacingDirection: { x: 1, y: 0 },
    currentMoveDirection: { x: 0, y: 0 }
  });
  assert.equal(attackStep.kind, "attack", "queued attack should fire only after re-entering legal range");
  assert.equal(attackStep.clearQueuedAttack, true, "queued attack should be consumed when it resolves");
  assert.deepEqual(attackStep.attackDirection, { x: 1, y: 0 }, "queued attack should keep lock-facing toward the target");
}

function validateChaseCancelAndReleaseContracts(): void {
  const self = createAssistSelf();
  const chaseAssist: ChaseAssistState = {
    targetId: "monster-1",
    targetKind: "monster",
    startedAt: now,
    expiresAt: now + LOCK_ASSIST_CHASE_MAX_DURATION_MS
  };
  const target: LockAssistTarget = { id: "monster-1", x: 600, y: 400, isAlive: true };

  const retreatCancel = resolveChaseAssistStep({
    self,
    chaseAssist,
    target,
    queuedAttackTargetId: target.id,
    now: now + 90,
    lastFacingDirection: { x: 1, y: 0 },
    currentMoveDirection: { x: -1, y: 0 }
  });
  assert.equal(retreatCancel.kind, "clear", "retreat input should break chase assist");
  assert.equal(retreatCancel.reason, "retreat-input", "retreat cancellation should be explicit");
  assert.equal(retreatCancel.clearQueuedAttack, true, "retreat cancellation should also drop queued attack");

  const lostTarget = resolveChaseAssistStep({
    self,
    chaseAssist,
    target: undefined,
    queuedAttackTargetId: target.id,
    now: now + 120,
    lastFacingDirection: { x: 1, y: 0 },
    currentMoveDirection: { x: 0, y: 0 }
  });
  assert.equal(lostTarget.kind, "clear", "missing target should release chase assist");
  assert.equal(lostTarget.reason, "target-lost", "target loss should stop forced pursuit");
  assert.equal(lostTarget.clearQueuedAttack, false, "target loss only clears queued attack when still explicitly in chase path");

  const outOfChaseRange = resolveChaseAssistStep({
    self,
    chaseAssist,
    target: { ...target, x: 400 + getWeaponRange(self.weaponType) + 109, y: 400 },
    queuedAttackTargetId: target.id,
    now: now + 150,
    lastFacingDirection: { x: 1, y: 0 },
    currentMoveDirection: { x: 0, y: 0 }
  });
  assert.equal(outOfChaseRange.kind, "clear", "targets beyond chase buffer should not keep forced pursuit");
  assert.equal(outOfChaseRange.reason, "target-out-of-range", "out-of-range clear should be explicit");
  assert.equal(outOfChaseRange.clearQueuedAttack, true, "dropping out of chase range should cancel queued attack");

  const expired = resolveChaseAssistStep({
    self,
    chaseAssist,
    target,
    queuedAttackTargetId: target.id,
    now: now + LOCK_ASSIST_CHASE_MAX_DURATION_MS + 5,
    lastFacingDirection: { x: 1, y: 0 },
    currentMoveDirection: { x: 0, y: 0 }
  });
  assert.equal(expired.kind, "clear", "expired chase window should release lock assist");
  assert.equal(expired.reason, "expired", "expiration should not silently continue forced movement");
}

function validateFeedbackEventMappings(): void {
  const chaseAssist: ChaseAssistState = {
    targetId: "monster-1",
    targetKind: "monster",
    startedAt: now,
    expiresAt: now + LOCK_ASSIST_CHASE_MAX_DURATION_MS
  };

  const continueEvent = mapLockAssistFeedbackEvent({
    result: {
      kind: "continue",
      clearQueuedAttack: false,
      moveDirection: { x: 1, y: 0 },
      facingDirection: { x: 1, y: 0 },
      reason: "advance"
    },
    before: { chaseAssist, queuedAttackTargetId: chaseAssist.targetId },
    after: { chaseAssist, queuedAttackTargetId: chaseAssist.targetId }
  });
  assert.deepEqual(continueEvent, {
    key: `continue:${chaseAssist.targetId}`,
    text: "锁定追击中",
    tone: "info"
  }, "continue steps should expose a throttled pursue feedback event");

  const retreatEvent = mapLockAssistFeedbackEvent({
    result: {
      kind: "clear",
      clearQueuedAttack: true,
      facingDirection: { x: 1, y: 0 },
      reason: "retreat-input"
    },
    before: { chaseAssist, queuedAttackTargetId: chaseAssist.targetId },
    after: { chaseAssist: undefined, queuedAttackTargetId: undefined }
  });
  assert.deepEqual(retreatEvent, {
    key: "cancel:retreat-input",
    text: "后撤已取消",
    tone: "warn"
  }, "retreat cancel should map to an explicit cancel feedback event");

  const lostEvent = mapLockAssistFeedbackEvent({
    result: {
      kind: "clear",
      clearQueuedAttack: false,
      reason: "target-lost"
    },
    before: { chaseAssist, queuedAttackTargetId: chaseAssist.targetId },
    after: { chaseAssist: undefined, queuedAttackTargetId: chaseAssist.targetId }
  });
  assert.deepEqual(lostEvent, {
    key: "clear:target-lost",
    text: "目标丢失",
    tone: "warn"
  }, "target loss should map to visible release feedback");

  const duplicateLostEvent = mapLockAssistFeedbackEvent({
    result: {
      kind: "clear",
      clearQueuedAttack: false,
      reason: "target-lost"
    },
    before: { chaseAssist, queuedAttackTargetId: chaseAssist.targetId },
    after: { chaseAssist: undefined, queuedAttackTargetId: chaseAssist.targetId }
  }, {
    activeTargetId: chaseAssist.targetId,
    activeReason: "target-lost"
  });
  assert.equal(duplicateLostEvent, null, "repeating the same clear reason should not keep generating feedback events");
}

function createAssistSelf(): LockAssistSelf {
  return {
    id: "attacker",
    x: 400,
    y: 400,
    squadId: "player",
    isAlive: true,
    weaponType: "sword",
    attackSpeed: 0,
    direction: { x: 1, y: 0 }
  };
}

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

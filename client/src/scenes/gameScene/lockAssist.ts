import type { Vector2, WeaponType } from "@gamer/shared";
import { WEAPON_DEFINITIONS } from "@gamer/shared";

export const LOCK_ASSIST_ACQUIRE_RANGE_BUFFER = 32;
export const LOCK_ASSIST_CHASE_RANGE_BUFFER = 108;
export const LOCK_ASSIST_CHASE_MOVE_SCALE = 1;
export const LOCK_ASSIST_CHASE_MAX_DURATION_MS = 650;
export const LOCK_ASSIST_PLAYER_CONTACT_RADIUS = 56;
export const LOCK_ASSIST_MONSTER_CONTACT_RADIUS = 30;
export const LOCK_ASSIST_FRONT_CONE_DEG = 130;
export const LOCK_ASSIST_REAR_CONE_DEG = 95;
const LOCK_ASSIST_POINTER_TARGET_SNAP_RADIUS = 72;
const LOCK_ASSIST_POINTER_TARGET_SCORE_BONUS = 220;
const LOCK_ASSIST_RETREAT_CANCEL_DOT = -0.42;
const LOCK_ASSIST_MOVE_CANCEL_THRESHOLD = 0.18;

export interface LockAssistSelf {
  id: string;
  x: number;
  y: number;
  squadId: string;
  isAlive: boolean;
  weaponType?: WeaponType;
  attackSpeed?: number;
  direction?: Vector2;
}

export interface LockAssistTarget {
  id: string;
  x: number;
  y: number;
  isAlive: boolean;
  squadId?: string;
  type?: "normal" | "elite" | "boss";
}

export interface AttackIntentTarget {
  worldX?: number;
  worldY?: number;
}

export interface LockAssistCandidate {
  id: string;
  kind: "player" | "monster";
  direction: Vector2;
  distance: number;
  attackReach: number;
  score: number;
}

export interface ResolvedAttackAssist {
  direction: Vector2;
  targetId?: string;
  targetKind?: "player" | "monster";
  shouldChase: boolean;
}

export interface ChaseAssistState {
  targetId: string;
  targetKind: "player" | "monster";
  startedAt: number;
  expiresAt: number;
  allowManualAdvance: boolean;
}

export interface ChaseAssistStepResult {
  kind: "continue" | "attack" | "clear";
  facingDirection?: Vector2;
  moveDirection?: Vector2;
  attackDirection?: Vector2;
  clearQueuedAttack: boolean;
  clearMoveOverride: boolean;
  reason:
    | "no-self"
    | "no-chase"
    | "target-lost"
    | "target-dead"
    | "expired"
    | "retreat-input"
    | "manual-input"
    | "target-out-of-range"
    | "entered-range"
    | "advance";
}

export function getWeaponRange(weaponType: WeaponType | undefined): number {
  return WEAPON_DEFINITIONS[weaponType ?? "sword"]?.range ?? WEAPON_DEFINITIONS.sword.range;
}

export function resolveAttackAssist(
  self: LockAssistSelf,
  players: LockAssistTarget[],
  monsters: LockAssistTarget[],
  fallbackFacing: Vector2,
  intentTarget?: AttackIntentTarget
): ResolvedAttackAssist {
  const facing = normalizeVector(fallbackFacing, self.direction ?? { x: 0, y: 1 });
  const candidate = findBestAttackTarget(self, players, monsters, facing, intentTarget);
  if (!candidate) {
    return {
      direction: facing,
      shouldChase: false
    };
  }

  return {
    direction: candidate.direction,
    targetId: candidate.id,
    targetKind: candidate.kind,
    shouldChase: candidate.distance > candidate.attackReach
  };
}

export function findBestAttackTarget(
  self: LockAssistSelf,
  players: LockAssistTarget[],
  monsters: LockAssistTarget[],
  fallbackFacing: Vector2,
  intentTarget?: AttackIntentTarget
): LockAssistCandidate | null {
  const attackRange = getWeaponRange(self.weaponType);
  const attackReach = attackRange + LOCK_ASSIST_ACQUIRE_RANGE_BUFFER;
  const chaseReach = attackRange + LOCK_ASSIST_CHASE_RANGE_BUFFER;
  const facing = normalizeVector(fallbackFacing, { x: 0, y: 1 });
  const candidates: LockAssistCandidate[] = [];

  for (const player of players) {
    if (player.id === self.id || !player.isAlive || player.squadId === self.squadId) {
      continue;
    }
    const candidate = buildAssistCandidate(
      self,
      player,
      "player",
      facing,
      attackReach + LOCK_ASSIST_PLAYER_CONTACT_RADIUS,
      chaseReach + LOCK_ASSIST_PLAYER_CONTACT_RADIUS,
      intentTarget
    );
    if (candidate) candidates.push(candidate);
  }

  for (const monster of monsters) {
    if (!monster.isAlive) {
      continue;
    }
    const candidate = buildAssistCandidate(
      self,
      monster,
      "monster",
      facing,
      attackReach + LOCK_ASSIST_MONSTER_CONTACT_RADIUS,
      chaseReach + resolveMonsterContactRadius(monster),
      intentTarget
    );
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

export function resolveChaseAssistStep(params: {
  self?: LockAssistSelf;
  chaseAssist?: ChaseAssistState;
  target?: Pick<LockAssistTarget, "id" | "x" | "y" | "isAlive">;
  queuedAttackTargetId?: string;
  now: number;
  lastFacingDirection: Vector2;
  currentMoveDirection: Vector2;
  currentManualMoveDirection?: Vector2;
  allowManualAdvance?: boolean;
}): ChaseAssistStepResult {
  const {
    self,
    chaseAssist,
    target,
    queuedAttackTargetId,
    now,
    lastFacingDirection,
    currentMoveDirection,
    currentManualMoveDirection,
    allowManualAdvance
  } = params;

  if (!self || !self.isAlive) {
    return { kind: "clear", clearQueuedAttack: false, clearMoveOverride: true, reason: "no-self" };
  }
  if (!chaseAssist) {
    return { kind: "clear", clearQueuedAttack: false, clearMoveOverride: true, reason: "no-chase" };
  }
  if (!target) {
    return { kind: "clear", clearQueuedAttack: false, clearMoveOverride: true, reason: "target-lost" };
  }
  if (!target.isAlive) {
    return { kind: "clear", clearQueuedAttack: false, clearMoveOverride: true, reason: "target-dead" };
  }
  if (now > chaseAssist.expiresAt) {
    return { kind: "clear", clearQueuedAttack: false, clearMoveOverride: true, reason: "expired" };
  }

  const delta = { x: target.x - self.x, y: target.y - self.y };
  const distance = Math.hypot(delta.x, delta.y);
  const facingDirection = normalizeVector(delta, lastFacingDirection);

  const manualMove = currentManualMoveDirection ?? currentMoveDirection;
  const moveMagnitude = Math.hypot(manualMove.x, manualMove.y);
  if (moveMagnitude > LOCK_ASSIST_MOVE_CANCEL_THRESHOLD) {
    const moveNormalized = {
      x: manualMove.x / moveMagnitude,
      y: manualMove.y / moveMagnitude
    };
    const retreatDot = (moveNormalized.x * facingDirection.x) + (moveNormalized.y * facingDirection.y);
    if (retreatDot < LOCK_ASSIST_RETREAT_CANCEL_DOT) {
      return {
        kind: "clear",
        facingDirection,
        clearQueuedAttack: true,
        clearMoveOverride: true,
        reason: "retreat-input"
      };
    }

    if (allowManualAdvance && retreatDot >= 0) {
      return {
        kind: "continue",
        facingDirection,
        moveDirection: {
          x: facingDirection.x * LOCK_ASSIST_CHASE_MOVE_SCALE,
          y: facingDirection.y * LOCK_ASSIST_CHASE_MOVE_SCALE
        },
        clearQueuedAttack: false,
        clearMoveOverride: false,
        reason: "advance"
      };
    }

    return {
      kind: "clear",
      facingDirection,
      clearQueuedAttack: true,
      clearMoveOverride: true,
      reason: "manual-input"
    };
  }

  const contactRadius = getTargetContactRadius(chaseAssist.targetKind);
  const attackReach = getWeaponRange(self.weaponType) + contactRadius + LOCK_ASSIST_ACQUIRE_RANGE_BUFFER;
  if (distance <= attackReach && queuedAttackTargetId) {
    return {
      kind: "attack",
      facingDirection,
      attackDirection: facingDirection,
      clearQueuedAttack: true,
      clearMoveOverride: true,
      reason: "entered-range"
    };
  }

  if (
    distance > getWeaponRange(self.weaponType) + contactRadius + LOCK_ASSIST_CHASE_RANGE_BUFFER
    || now - chaseAssist.startedAt > LOCK_ASSIST_CHASE_MAX_DURATION_MS
  ) {
    return {
      kind: "clear",
      facingDirection,
      clearQueuedAttack: true,
      clearMoveOverride: true,
      reason: "target-out-of-range"
    };
  }

  return {
    kind: "continue",
    facingDirection,
    moveDirection: {
      x: facingDirection.x * LOCK_ASSIST_CHASE_MOVE_SCALE,
      y: facingDirection.y * LOCK_ASSIST_CHASE_MOVE_SCALE
    },
    clearQueuedAttack: false,
    clearMoveOverride: false,
    reason: "advance"
  };
}

export function normalizeVector(direction: Vector2, fallback: Vector2): Vector2 {
  const length = Math.hypot(direction.x, direction.y);
  if (length <= 0.001) {
    const fallbackLength = Math.hypot(fallback.x, fallback.y);
    if (fallbackLength <= 0.001) {
      return { x: 0, y: 1 };
    }
    return { x: fallback.x / fallbackLength, y: fallback.y / fallbackLength };
  }

  return { x: direction.x / length, y: direction.y / length };
}

function buildAssistCandidate(
  self: Pick<LockAssistSelf, "x" | "y">,
  target: Pick<LockAssistTarget, "id" | "x" | "y">,
  kind: "player" | "monster",
  facing: Vector2,
  attackReach: number,
  chaseReach: number,
  intentTarget?: AttackIntentTarget
): LockAssistCandidate | null {
  const delta = { x: target.x - self.x, y: target.y - self.y };
  const distance = Math.hypot(delta.x, delta.y);
  if (distance > chaseReach) {
    return null;
  }

  const direction = normalizeVector(delta, facing);
  const angleDeg = getAngleBetweenVectors(facing, direction);
  const intentDistance = getIntentDistance(target, intentTarget);
  const hasExplicitPointerIntent = intentDistance != null && intentDistance <= LOCK_ASSIST_POINTER_TARGET_SNAP_RADIUS;
  const allowedAngle = distance <= attackReach ? LOCK_ASSIST_REAR_CONE_DEG : LOCK_ASSIST_FRONT_CONE_DEG;
  if (!hasExplicitPointerIntent && angleDeg > allowedAngle) {
    return null;
  }

  return {
    id: target.id,
    kind,
    direction,
    distance,
    attackReach,
    score: distance + (angleDeg * 0.9) + (kind === "player" ? -12 : 0) + getIntentBias(intentDistance)
  };
}

function getTargetContactRadius(kind: "player" | "monster"): number {
  return kind === "player" ? LOCK_ASSIST_PLAYER_CONTACT_RADIUS : LOCK_ASSIST_MONSTER_CONTACT_RADIUS;
}

function resolveMonsterContactRadius(target: Pick<LockAssistTarget, "type">): number {
  if (target.type === "boss") return 38;
  if (target.type === "elite") return 34;
  return LOCK_ASSIST_MONSTER_CONTACT_RADIUS;
}

function getIntentBias(intentDistance?: number): number {
  if (typeof intentDistance !== "number") {
    return 0;
  }

  if (intentDistance <= LOCK_ASSIST_POINTER_TARGET_SNAP_RADIUS) {
    return -LOCK_ASSIST_POINTER_TARGET_SCORE_BONUS;
  }

  return Math.min(intentDistance, 240) * 0.45;
}

function getIntentDistance(
  target: Pick<LockAssistTarget, "x" | "y">,
  intentTarget?: AttackIntentTarget
): number | undefined {
  if (typeof intentTarget?.worldX !== "number" || typeof intentTarget?.worldY !== "number") {
    return undefined;
  }

  return Math.hypot(target.x - intentTarget.worldX, target.y - intentTarget.worldY);
}

function getAngleBetweenVectors(a: Vector2, b: Vector2): number {
  const dot = clamp((a.x * b.x) + (a.y * b.y), -1, 1);
  return (Math.acos(dot) * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

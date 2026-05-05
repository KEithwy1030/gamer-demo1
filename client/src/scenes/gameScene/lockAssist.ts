import type { Vector2, WeaponType } from "@gamer/shared";
import { WEAPON_DEFINITIONS } from "@gamer/shared";

export const LOCK_ASSIST_ACQUIRE_RANGE_BUFFER = 32;
export const LOCK_ASSIST_CHASE_RANGE_BUFFER = 108;
export const LOCK_ASSIST_CHASE_MOVE_SCALE = 1;
export const LOCK_ASSIST_CHASE_MAX_DURATION_MS = 650;
export const LOCK_ASSIST_PLAYER_CONTACT_RADIUS = 28;
export const LOCK_ASSIST_MONSTER_CONTACT_RADIUS = 30;
export const LOCK_ASSIST_FRONT_CONE_DEG = 130;
export const LOCK_ASSIST_REAR_CONE_DEG = 95;
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
}

export interface ChaseAssistStepResult {
  kind: "continue" | "attack" | "clear";
  facingDirection?: Vector2;
  moveDirection?: Vector2;
  attackDirection?: Vector2;
  clearQueuedAttack: boolean;
  reason:
    | "no-self"
    | "no-chase"
    | "target-lost"
    | "target-dead"
    | "expired"
    | "retreat-input"
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
  fallbackFacing: Vector2
): ResolvedAttackAssist {
  const facing = normalizeVector(fallbackFacing, self.direction ?? { x: 0, y: 1 });
  const candidate = findBestAttackTarget(self, players, monsters, facing);
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
  fallbackFacing: Vector2
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
      chaseReach + LOCK_ASSIST_PLAYER_CONTACT_RADIUS
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
      chaseReach + LOCK_ASSIST_MONSTER_CONTACT_RADIUS
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
}): ChaseAssistStepResult {
  const { self, chaseAssist, target, queuedAttackTargetId, now, lastFacingDirection, currentMoveDirection } = params;

  if (!self || !self.isAlive) {
    return { kind: "clear", clearQueuedAttack: false, reason: "no-self" };
  }
  if (!chaseAssist) {
    return { kind: "clear", clearQueuedAttack: false, reason: "no-chase" };
  }
  if (!target) {
    return { kind: "clear", clearQueuedAttack: false, reason: "target-lost" };
  }
  if (!target.isAlive) {
    return { kind: "clear", clearQueuedAttack: false, reason: "target-dead" };
  }
  if (now > chaseAssist.expiresAt) {
    return { kind: "clear", clearQueuedAttack: false, reason: "expired" };
  }

  const delta = { x: target.x - self.x, y: target.y - self.y };
  const distance = Math.hypot(delta.x, delta.y);
  const facingDirection = normalizeVector(delta, lastFacingDirection);

  const moveMagnitude = Math.hypot(currentMoveDirection.x, currentMoveDirection.y);
  if (moveMagnitude > LOCK_ASSIST_MOVE_CANCEL_THRESHOLD) {
    const moveNormalized = {
      x: currentMoveDirection.x / moveMagnitude,
      y: currentMoveDirection.y / moveMagnitude
    };
    const retreatDot = (moveNormalized.x * facingDirection.x) + (moveNormalized.y * facingDirection.y);
    if (retreatDot < LOCK_ASSIST_RETREAT_CANCEL_DOT) {
      return {
        kind: "clear",
        facingDirection,
        clearQueuedAttack: true,
        reason: "retreat-input"
      };
    }
  }

  const attackReach = getWeaponRange(self.weaponType) + LOCK_ASSIST_ACQUIRE_RANGE_BUFFER;
  if (distance <= attackReach && queuedAttackTargetId) {
    return {
      kind: "attack",
      facingDirection,
      attackDirection: facingDirection,
      clearQueuedAttack: true,
      reason: "entered-range"
    };
  }

  if (
    distance > getWeaponRange(self.weaponType) + LOCK_ASSIST_CHASE_RANGE_BUFFER
    || now - chaseAssist.startedAt > LOCK_ASSIST_CHASE_MAX_DURATION_MS
  ) {
    return {
      kind: "clear",
      facingDirection,
      clearQueuedAttack: true,
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
  chaseReach: number
): LockAssistCandidate | null {
  const delta = { x: target.x - self.x, y: target.y - self.y };
  const distance = Math.hypot(delta.x, delta.y);
  if (distance > chaseReach) {
    return null;
  }

  const direction = normalizeVector(delta, facing);
  const angleDeg = getAngleBetweenVectors(facing, direction);
  const allowedAngle = distance <= attackReach ? LOCK_ASSIST_REAR_CONE_DEG : LOCK_ASSIST_FRONT_CONE_DEG;
  if (angleDeg > allowedAngle) {
    return null;
  }

  return {
    id: target.id,
    kind,
    direction,
    distance,
    attackReach,
    score: distance + (angleDeg * 0.9) + (kind === "player" ? -12 : 0)
  };
}

function getAngleBetweenVectors(a: Vector2, b: Vector2): number {
  const dot = clamp((a.x * b.x) + (a.y * b.y), -1, 1);
  return (Math.acos(dot) * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

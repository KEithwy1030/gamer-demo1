import crypto from "node:crypto";
import type {
  MonsterProjectileDespawn,
  MonsterProjectileHit,
  MonsterProjectileSpawn
} from "@gamer/shared";
import { doesSegmentIntersectObstacle } from "../match-layout.js";
import type { RuntimeMonsterProjectile, RuntimeRoom } from "../types.js";

const PROJECTILE_IMPACT_RADIUS = 34;

export interface ProjectileImpact {
  projectile: RuntimeMonsterProjectile;
  hitPlayerId: string | null;
}

export interface ProjectileTickOutcome {
  impacts: ProjectileImpact[];
  despawned: MonsterProjectileDespawn[];
}

export function ensureProjectileState(room: RuntimeRoom): Map<string, RuntimeMonsterProjectile> {
  if (!room.monsterProjectiles) {
    room.monsterProjectiles = new Map();
  }
  return room.monsterProjectiles;
}

export function spawnMonsterProjectile(
  room: RuntimeRoom,
  options: {
    monsterId: string;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    ttlMs: number;
    damage: number;
  },
  now = Date.now()
): MonsterProjectileSpawn {
  const id = `mprj_${crypto.randomUUID().slice(0, 8)}`;
  const direction = normalize({ x: options.targetX - options.x, y: options.targetY - options.y });
  const travelDistance = Math.max(1, Math.hypot(options.targetX - options.x, options.targetY - options.y));
  const speed = travelDistance / Math.max(options.ttlMs / 1000, 0.1);
  const projectile: RuntimeMonsterProjectile = {
    id,
    monsterId: options.monsterId,
    type: "arrow",
    x: options.x,
    y: options.y,
    vx: direction.x * speed,
    vy: direction.y * speed,
    ttlMs: options.ttlMs,
    damage: options.damage,
    spawnedAt: now,
    expiresAt: now + options.ttlMs,
    targetX: options.targetX,
    targetY: options.targetY,
    lastUpdatedAt: now
  };

  ensureProjectileState(room).set(projectile.id, projectile);

  return {
    id: projectile.id,
    monsterId: projectile.monsterId,
    x: projectile.x,
    y: projectile.y,
    vx: projectile.vx,
    vy: projectile.vy,
    ttlMs: projectile.ttlMs,
    damage: projectile.damage,
    type: projectile.type
  };
}

export function tickMonsterProjectiles(room: RuntimeRoom, now = Date.now()): ProjectileTickOutcome {
  const projectiles = ensureProjectileState(room);
  const impacts: ProjectileImpact[] = [];
  const despawned: MonsterProjectileDespawn[] = [];

  for (const projectile of [...projectiles.values()]) {
    const elapsedMs = Math.max(0, now - projectile.lastUpdatedAt);
    const previous = { x: projectile.x, y: projectile.y };

    projectile.x += projectile.vx * (elapsedMs / 1000);
    projectile.y += projectile.vy * (elapsedMs / 1000);
    projectile.lastUpdatedAt = now;

    if (
      room.matchLayout
      && doesSegmentIntersectObstacle(room.matchLayout, previous, { x: projectile.x, y: projectile.y }, 6)
    ) {
      projectiles.delete(projectile.id);
      despawned.push({ id: projectile.id, reason: "blocked" });
      continue;
    }

    const reachedTarget = Math.hypot(projectile.targetX - projectile.x, projectile.targetY - projectile.y) <= PROJECTILE_IMPACT_RADIUS;
    const expired = now >= projectile.expiresAt;
    if (!reachedTarget && !expired) {
      continue;
    }

    const hitPlayerId = resolveImpactPlayerId(room, projectile);
    impacts.push({
      projectile,
      hitPlayerId
    });
    despawned.push({ id: projectile.id, reason: hitPlayerId ? "hit" : "timeout" });
    projectiles.delete(projectile.id);
  }

  return {
    impacts,
    despawned
  };
}

export function toProjectileHitPayload(impact: ProjectileImpact): MonsterProjectileHit {
  return {
    id: impact.projectile.id,
    hitPlayerId: impact.hitPlayerId,
    x: Math.round(impact.projectile.x),
    y: Math.round(impact.projectile.y)
  };
}

function resolveImpactPlayerId(room: RuntimeRoom, projectile: RuntimeMonsterProjectile): string | null {
  for (const player of room.players.values()) {
    if (!player.state?.isAlive) {
      continue;
    }

    if (Math.hypot(player.state.x - projectile.x, player.state.y - projectile.y) <= PROJECTILE_IMPACT_RADIUS) {
      return player.id;
    }
  }
  return null;
}

function normalize(direction: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 0, y: 1 };
  }
  return {
    x: direction.x / length,
    y: direction.y / length
  };
}

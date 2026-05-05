import type { MonsterState } from "@gamer/shared";

export interface MonsterReadabilitySnapshot {
  isBoss: boolean;
  isElite: boolean;
  hpRatio: number;
  isWarning: boolean;
  isAttacking: boolean;
  isRecovering: boolean;
  isRecentlyHit: boolean;
  isRecentlyDead: boolean;
  timeToPhaseEndMs: number | null;
}

const HIT_FLASH_WINDOW_MS = 220;
const DEATH_FADE_WINDOW_MS = 1000;

export function getMonsterReadabilitySnapshot(monster: MonsterState, now = Date.now()): MonsterReadabilitySnapshot {
  const hpRatio = clamp(monster.maxHp > 0 ? monster.hp / monster.maxHp : 0, 0, 1);
  const timeToPhaseEndMs = typeof monster.phaseEndsAt === "number"
    ? Math.max(0, monster.phaseEndsAt - now)
    : null;
  const isWarning = monster.behaviorPhase === "windup" || monster.skillState === "smash" || monster.skillState === "charge";
  const isAttacking = monster.behaviorPhase === "charge" || (typeof monster.lastAttackAt === "number" && now - monster.lastAttackAt < 180);
  const isRecovering = monster.behaviorPhase === "recover" || (typeof timeToPhaseEndMs === "number" && monster.behaviorPhase === "idle" && timeToPhaseEndMs > 0);
  const isRecentlyHit = typeof monster.lastDamagedAt === "number" && now - monster.lastDamagedAt <= HIT_FLASH_WINDOW_MS;
  const isRecentlyDead = !monster.isAlive && typeof monster.deadAt === "number" && now - monster.deadAt <= DEATH_FADE_WINDOW_MS;

  return {
    isBoss: monster.type === "boss",
    isElite: monster.type === "elite",
    hpRatio,
    isWarning,
    isAttacking,
    isRecovering,
    isRecentlyHit,
    isRecentlyDead,
    timeToPhaseEndMs
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getMonsterLabel(monster: MonsterState): string {
  if (monster.type === "boss") {
    if (monster.skillState === "charge" || monster.behaviorPhase === "charge") return monster.isEnraged ? "BOSS CHARGE+" : "BOSS CHARGE";
    if (monster.skillState === "smash") return monster.isEnraged ? "BOSS SMASH+" : "BOSS SMASH";
    if (monster.isEnraged) return "BOSS ENRAGED";
    return "BOSS";
  }

  if (monster.type === "elite") {
    return monster.behaviorPhase === "windup" ? "ELITE STRIKE" : "ELITE";
  }

  return monster.behaviorPhase === "windup" ? "ATTACK" : "MONSTER";
}

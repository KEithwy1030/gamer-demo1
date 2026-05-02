export interface CorpseFogState {
  visibilityPercent: number;
  damagePerSecond: number;
}

export function getCorpseFogState(startedAt: number, now: number): CorpseFogState {
  const elapsedSec = Math.max(0, (now - startedAt) / 1000);
  if (elapsedSec <= 480) {
    return {
      visibilityPercent: lerp(1, 0.5, elapsedSec / 480),
      damagePerSecond: 0
    };
  }

  if (elapsedSec <= 720) {
    return {
      visibilityPercent: lerp(0.5, 0.25, (elapsedSec - 480) / 240),
      damagePerSecond: 1
    };
  }

  return {
    visibilityPercent: lerp(0.25, 0.1, Math.min(1, (elapsedSec - 720) / 180)),
    damagePerSecond: 5
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, t));
}

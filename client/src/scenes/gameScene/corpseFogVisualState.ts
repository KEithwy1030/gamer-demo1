export function resolveCorpseFogVisualState(startedAt: number, now = Date.now()): { visibilityPercent: number } {
  const elapsedSec = Math.max(0, (now - startedAt) / 1000);
  if (elapsedSec <= 480) {
    return { visibilityPercent: lerp(1, 0.5, elapsedSec / 480) };
  }
  if (elapsedSec <= 720) {
    return { visibilityPercent: lerp(0.5, 0.25, (elapsedSec - 480) / 240) };
  }
  return { visibilityPercent: lerp(0.25, 0.1, Math.min(1, (elapsedSec - 720) / 180)) };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

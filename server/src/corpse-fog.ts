import { CORPSE_FOG_TIMELINE_OVERRIDE_SEC } from "./internal-constants.js";

export interface CorpseFogState {
  visibilityPercent: number;
  damagePerSecond: number;
}

export function getCorpseFogState(startedAt: number, now: number): CorpseFogState {
  const elapsedSec = Math.max(0, (now - startedAt) / 1000);
  const counterattackStartsAtSec = CORPSE_FOG_TIMELINE_OVERRIDE_SEC > 0
    ? CORPSE_FOG_TIMELINE_OVERRIDE_SEC
    : 480;
  const intensifiedStartsAtSec = CORPSE_FOG_TIMELINE_OVERRIDE_SEC > 0
    ? CORPSE_FOG_TIMELINE_OVERRIDE_SEC * 1.5
    : 720;
  const maxPressureStartsAtSec = CORPSE_FOG_TIMELINE_OVERRIDE_SEC > 0
    ? CORPSE_FOG_TIMELINE_OVERRIDE_SEC * 1.875
    : 900;

  if (elapsedSec <= counterattackStartsAtSec) {
    return {
      visibilityPercent: lerp(1, 0.5, elapsedSec / counterattackStartsAtSec),
      damagePerSecond: 0
    };
  }

  if (elapsedSec <= intensifiedStartsAtSec) {
    return {
      visibilityPercent: lerp(
        0.5,
        0.25,
        (elapsedSec - counterattackStartsAtSec) / (intensifiedStartsAtSec - counterattackStartsAtSec)
      ),
      damagePerSecond: 1
    };
  }

  return {
    visibilityPercent: lerp(
      0.25,
      0.1,
      Math.min(1, (elapsedSec - intensifiedStartsAtSec) / (maxPressureStartsAtSec - intensifiedStartsAtSec))
    ),
    damagePerSecond: 5
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, t));
}

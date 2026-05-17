import { resolveCorpseFogPressureState, type ExtractionPressurePhaseKind } from "@gamer/shared";
import { CORPSE_FOG_TIMELINE_OVERRIDE_SEC } from "./internal-constants.js";

export interface CorpseFogState {
  phase: ExtractionPressurePhaseKind;
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

  return resolveCorpseFogPressureState(elapsedSec, {
    extractOpenSec: counterattackStartsAtSec,
    intensifiedStartsAtSec,
    maxPressureStartsAtSec
  });
}

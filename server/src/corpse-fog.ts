import { resolveCorpseFogPressureState, type ExtractionPressurePhaseKind } from "@gamer/shared";
import {
  CORPSE_FOG_COUNTERATTACK_SEC,
  CORPSE_FOG_INTENSIFIED_SEC,
  CORPSE_FOG_MAX_PRESSURE_SEC
} from "@gamer/shared";
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
    : CORPSE_FOG_COUNTERATTACK_SEC;
  const intensifiedStartsAtSec = CORPSE_FOG_TIMELINE_OVERRIDE_SEC > 0
    ? CORPSE_FOG_TIMELINE_OVERRIDE_SEC * (13 / 6)
    : CORPSE_FOG_INTENSIFIED_SEC;
  const maxPressureStartsAtSec = CORPSE_FOG_TIMELINE_OVERRIDE_SEC > 0
    ? CORPSE_FOG_TIMELINE_OVERRIDE_SEC * 3
    : CORPSE_FOG_MAX_PRESSURE_SEC;

  return resolveCorpseFogPressureState(elapsedSec, {
    extractOpenSec: counterattackStartsAtSec,
    intensifiedStartsAtSec,
    maxPressureStartsAtSec
  });
}

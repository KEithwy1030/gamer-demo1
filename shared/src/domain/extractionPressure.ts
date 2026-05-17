import { EXTRACT_OPEN_SEC, MATCH_DURATION_SEC } from "../data/constants.js";

export type ExtractionPressurePhaseKind = "preopen" | "counterattack" | "intensified";

export type ExtractionPressurePhase =
  | { kind: "preopen"; elapsedSec: number; secondsUntilExtractOpen: number }
  | { kind: "counterattack"; elapsedSec: number }
  | { kind: "intensified"; elapsedSec: number };

export interface CorpseFogPressureState {
  phase: ExtractionPressurePhaseKind;
  visibilityPercent: number;
  damagePerSecond: number;
}

export interface ExtractionPressureTimeline {
  extractOpenSec?: number;
  intensifiedStartsAtSec?: number;
  maxPressureStartsAtSec?: number;
}

export function resolveExtractionPressurePhase(
  elapsedSec: number,
  timeline: ExtractionPressureTimeline = {}
): ExtractionPressurePhase {
  const safeElapsedSec = Math.max(0, elapsedSec);
  const extractOpenSec = timeline.extractOpenSec ?? EXTRACT_OPEN_SEC;
  const intensifiedStartsAtSec = timeline.intensifiedStartsAtSec ?? extractOpenSec * 1.5;

  if (safeElapsedSec >= intensifiedStartsAtSec) {
    return { kind: "intensified", elapsedSec: safeElapsedSec };
  }

  if (safeElapsedSec >= extractOpenSec) {
    return { kind: "counterattack", elapsedSec: safeElapsedSec };
  }

  return {
    kind: "preopen",
    elapsedSec: safeElapsedSec,
    secondsUntilExtractOpen: Math.max(0, extractOpenSec - safeElapsedSec)
  };
}

export function resolveCorpseFogPressureState(
  elapsedSec: number,
  timeline: ExtractionPressureTimeline = {}
): CorpseFogPressureState {
  const safeElapsedSec = Math.max(0, elapsedSec);
  const extractOpenSec = timeline.extractOpenSec ?? EXTRACT_OPEN_SEC;
  const intensifiedStartsAtSec = timeline.intensifiedStartsAtSec ?? extractOpenSec * 1.5;
  const maxPressureStartsAtSec = timeline.maxPressureStartsAtSec ?? MATCH_DURATION_SEC;

  if (safeElapsedSec <= extractOpenSec) {
    return {
      phase: "preopen",
      visibilityPercent: lerp(1, 0.5, extractOpenSec <= 0 ? 1 : safeElapsedSec / extractOpenSec),
      damagePerSecond: 0
    };
  }

  if (safeElapsedSec <= intensifiedStartsAtSec) {
    return {
      phase: "counterattack",
      visibilityPercent: lerp(
        0.5,
        0.25,
        divideClamped(safeElapsedSec - extractOpenSec, intensifiedStartsAtSec - extractOpenSec)
      ),
      damagePerSecond: 1
    };
  }

  return {
    phase: "intensified",
    visibilityPercent: lerp(
      0.25,
      0.1,
      divideClamped(safeElapsedSec - intensifiedStartsAtSec, maxPressureStartsAtSec - intensifiedStartsAtSec)
    ),
    damagePerSecond: 5
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function divideClamped(numerator: number, denominator: number): number {
  return denominator <= 0 ? 1 : clamp01(numerator / denominator);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

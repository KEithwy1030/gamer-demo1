import assert from "node:assert/strict";
import {
  resolveCorpseFogPressureState,
  resolveExtractionPressurePhase
} from "../shared/src/domain/extractionPressure.ts";
import { getCorpseFogState } from "../server/src/corpse-fog.ts";

const startedAt = 1_000_000;

assert.deepEqual(resolveExtractionPressurePhase(0), {
  kind: "preopen",
  elapsedSec: 0,
  secondsUntilExtractOpen: 480
});
assert.equal(resolveExtractionPressurePhase(479).kind, "preopen");
assert.equal(resolveExtractionPressurePhase(480).kind, "counterattack");
assert.equal(resolveExtractionPressurePhase(719).kind, "counterattack");
assert.equal(resolveExtractionPressurePhase(720).kind, "intensified");

assert.equal(resolveCorpseFogPressureState(0).visibilityPercent, 1);
assert.equal(resolveCorpseFogPressureState(480).visibilityPercent, 0.5);
assert.equal(resolveCorpseFogPressureState(480).damagePerSecond, 0);
assert.equal(resolveCorpseFogPressureState(481).phase, "counterattack");
assert.equal(resolveCorpseFogPressureState(481).damagePerSecond, 1);
assert.equal(resolveCorpseFogPressureState(720).visibilityPercent, 0.25);
assert.equal(resolveCorpseFogPressureState(721).phase, "intensified");
assert.equal(resolveCorpseFogPressureState(721).damagePerSecond, 5);
assert.equal(resolveCorpseFogPressureState(900).visibilityPercent, 0.1);

const serverCounterattack = getCorpseFogState(startedAt, startedAt + 481_000);
assert.equal(serverCounterattack.phase, "counterattack");
assert.equal(serverCounterattack.damagePerSecond, 1);

const serverIntensified = getCorpseFogState(startedAt, startedAt + 721_000);
assert.equal(serverIntensified.phase, "intensified");
assert.equal(serverIntensified.damagePerSecond, 5);

console.log("validate-extraction-pressure: ok");

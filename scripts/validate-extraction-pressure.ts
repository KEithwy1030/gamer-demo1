import assert from "node:assert/strict";
import {
  resolveCorpseFogPressureState,
  resolveExtractionPressurePhase
} from "../shared/src/domain/extractionPressure.ts";
import { getCorpseFogState } from "../server/src/corpse-fog.ts";

// 时间线契约（tune 2799c66：雾反扑提前、撤离开放保持 8 分钟）：
// - 撤离开放 EXTRACT_OPEN_SEC = 480s（HUD"距归营火"倒计时基准）
// - 雾反扑（开始掉血 1/s）CORPSE_FOG_COUNTERATTACK_SEC = 360s
// - 雾强化（5/s）CORPSE_FOG_INTENSIFIED_SEC = 780s
// - 雾最大压力 CORPSE_FOG_MAX_PRESSURE_SEC = 1080s

const startedAt = 1_000_000;

assert.deepEqual(resolveExtractionPressurePhase(0), {
  kind: "preopen",
  elapsedSec: 0,
  secondsUntilExtractOpen: 480
});
assert.equal(resolveExtractionPressurePhase(479).kind, "preopen");
assert.equal(resolveExtractionPressurePhase(480).kind, "counterattack");
assert.equal(resolveExtractionPressurePhase(779).kind, "counterattack");
assert.equal(resolveExtractionPressurePhase(780).kind, "intensified");

assert.equal(resolveCorpseFogPressureState(0).visibilityPercent, 1);
assert.equal(resolveCorpseFogPressureState(360).visibilityPercent, 0.5);
assert.equal(resolveCorpseFogPressureState(360).damagePerSecond, 0);
assert.equal(resolveCorpseFogPressureState(361).phase, "counterattack");
assert.equal(resolveCorpseFogPressureState(361).damagePerSecond, 1);
assert.equal(resolveCorpseFogPressureState(780).visibilityPercent, 0.25);
assert.equal(resolveCorpseFogPressureState(781).phase, "intensified");
assert.equal(resolveCorpseFogPressureState(781).damagePerSecond, 5);
assert.equal(resolveCorpseFogPressureState(1080).visibilityPercent, 0.1);

const serverCounterattack = getCorpseFogState(startedAt, startedAt + 361_000);
assert.equal(serverCounterattack.phase, "counterattack");
assert.equal(serverCounterattack.damagePerSecond, 1);

const serverIntensified = getCorpseFogState(startedAt, startedAt + 781_000);
assert.equal(serverIntensified.phase, "intensified");
assert.equal(serverIntensified.damagePerSecond, 5);

console.log("validate-extraction-pressure: ok");

import assert from "node:assert/strict";
import { buildMatchLayout } from "../server/src/match-layout.js";
import { GAME_CAMERA_CONFIG, GAME_RENDER_CONFIG } from "../client/src/scenes/gameScene/renderConfig";
import { buildRiverVisualPlan } from "../client/src/scenes/gameScene/riverVisualPlan";

assert.equal(GAME_RENDER_CONFIG.pixelArt, false, "renderer should not use pixelArt mode");
assert.equal(GAME_RENDER_CONFIG.antialias, true, "renderer should keep antialias enabled for smooth assets");
assert.equal(GAME_RENDER_CONFIG.autoRound, false, "renderer should avoid autoRound to preserve smooth sampling");
assert.equal(GAME_RENDER_CONFIG.roundPixels, false, "renderer should avoid roundPixels");
assert.equal(GAME_RENDER_CONFIG.minFilter, "LINEAR", "renderer min filter should remain linear");
assert.equal(GAME_RENDER_CONFIG.magFilter, "LINEAR", "renderer mag filter should remain linear");
assert.equal(GAME_CAMERA_CONFIG.roundPixels, false, "camera should not round pixels");

const layout = buildMatchLayout({
  roomCode: "RIVR",
  startedAt: 1_714_950_000_000,
  squadIds: ["player", "bot_alpha"]
});

const plan = buildRiverVisualPlan(layout);
assert.ok(plan.nodes.length >= 4, "river visual plan should keep multiple water nodes");
assert.ok(plan.flowStrokes.length >= plan.nodes.length - 1, "river visual plan should connect nodes with body strokes");
assert.ok(plan.rippleLines.length >= plan.nodes.length * 3, "river visual plan should create layered ripple lines");
assert.ok(plan.shoals.length >= layout.safeCrossings.length, "river visual plan should add shoals around crossings");
assert.ok(plan.crossingAccents.length === layout.safeCrossings.length, "river visual plan should accent every safe crossing");

for (const crossing of layout.safeCrossings) {
  assert.ok(
    plan.crossingAccents.some((accent) => accent.crossingId === crossing.crossingId),
    `river visual plan should include crossing accent for ${crossing.crossingId}`
  );
}

console.log("validate-visual-clarity: ok");

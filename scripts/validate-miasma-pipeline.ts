import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveCorpseFogVisualState } from "../client/src/scenes/gameScene/corpseFogVisualState";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const startedAt = 1_000_000;

assert.equal(resolveCorpseFogVisualState(startedAt, startedAt).visibilityPercent, 1);
assert.equal(resolveCorpseFogVisualState(startedAt, startedAt + 480_000).visibilityPercent, 0.5);
assert.equal(resolveCorpseFogVisualState(startedAt, startedAt + 720_000).visibilityPercent, 0.25);
assert.equal(resolveCorpseFogVisualState(startedAt, startedAt + 900_000).visibilityPercent, 0.1);

const gameSceneSource = readText("client/src/scenes/GameScene.ts");
const gameClientSource = readText("client/src/scenes/createGameClient.ts");
const pipelineSource = readText("client/src/scenes/gameScene/miasmaPipeline.ts");

assert.match(
  gameClientSource,
  /type:\s*Phaser\.AUTO,/,
  "game client should allow WebGL so the miasma post pipeline can run"
);
assert.doesNotMatch(
  gameClientSource,
  /type:\s*Phaser\.CANVAS,/,
  "game client should not force Canvas when the miasma post pipeline is enabled"
);
assert.match(
  gameSceneSource,
  /private installMiasmaPipeline\(\): MiasmaPipeline \| undefined \{/,
  "GameScene should isolate miasma post pipeline setup behind a safe installer"
);
assert.match(
  gameSceneSource,
  /!\("pipelines" in renderer\) \|\| !renderer\.pipelines/,
  "miasma installer should safely skip non-WebGL renderers"
);
assert.match(
  gameSceneSource,
  /if \(!pipelines\.has\("MiasmaPipeline"\)\) \{[\s\S]*pipelines\.addPostPipeline\("MiasmaPipeline", MiasmaPipeline\);/s,
  "miasma installer should register the post pipeline once"
);
assert.match(
  gameSceneSource,
  /this\.miasmaPipeline\.setMiasma\(screenX, screenY, screenRadius, intensity\);/,
  "miasma shader uniforms should be updated from the active pipeline every frame"
);
assert.match(
  pipelineSource,
  /Stable value noise keeps the post effect deterministic across browsers\./,
  "miasma shader should document the deterministic value-noise choice"
);
assert.match(
  pipelineSource,
  /setMiasma\(centerX: number, centerY: number, radius: number, intensity: number\): void/,
  "miasma pipeline should expose a dedicated uniform update method"
);

console.log("validate-miasma-pipeline: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}

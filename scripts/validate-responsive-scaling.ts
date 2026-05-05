import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const mainSource = readText("client/src/main.ts");
const scalerSource = readText("client/src/ui/viewportScaler.ts");
const gameClientSource = readText("client/src/scenes/createGameClient.ts");
const lobbyCss = readText("client/src/styles/lobby.css");

assert.match(
  mainSource,
  /attachViewportScaler\(gameRoot, gameViewport, \{[\s\S]*maxScale:\s*Number\.POSITIVE_INFINITY[\s\S]*centerY:\s*true[\s\S]*\}\)/,
  "game shell should enable responsive upscaling with centered fit"
);

assert.match(
  scalerSource,
  /const centerY = options\.centerY \?\? false;/,
  "viewport scaler should support optional vertical centering"
);
assert.match(
  scalerSource,
  /const offsetY = centerY \? Math\.max\(0, \(viewportHeight - scaledHeight\) \/ 2\) : 0;/,
  "viewport scaler should compute vertical fit offset"
);
assert.match(
  scalerSource,
  /frame\.style\.setProperty\("--viewport-offset-y", `\$\{offsetY\}px`\);/,
  "viewport scaler should expose vertical offset through CSS custom property"
);

assert.match(
  gameClientSource,
  /const GAME_VIEW_WIDTH = 1280;/,
  "game client should keep fixed design width"
);
assert.match(
  gameClientSource,
  /const GAME_VIEW_HEIGHT = 720;/,
  "game client should keep fixed design height"
);
assert.match(
  gameClientSource,
  /scale:\s*\{[\s\S]*mode:\s*Phaser\.Scale\.NONE[\s\S]*\}/,
  "Phaser should preserve fixed internal resolution instead of resizing world dimensions"
);
assert.doesNotMatch(
  gameClientSource,
  /game\?\.scale\.resize\(/,
  "game client should not manually resize Phaser world to viewport"
);

assert.match(
  lobbyCss,
  /\.viewport-scale-canvas\s*\{[\s\S]*top:\s*var\(--viewport-offset-y, 0\);[\s\S]*transform:\s*scale\(var\(--viewport-scale, 1\)\);[\s\S]*\}/,
  "scaled canvas wrapper should use both fit offsets and a single transform scale"
);
assert.match(
  lobbyCss,
  /\.game-scale-frame\s*\{[\s\S]*height:\s*100vh;[\s\S]*\}/,
  "game frame should occupy the full viewport height"
);
assert.match(
  lobbyCss,
  /\.game-scene-root canvas\s*\{[\s\S]*width:\s*100% !important;[\s\S]*height:\s*100% !important;[\s\S]*\}/,
  "game canvas should fill the scaled scene root"
);

console.log("validate-responsive-scaling: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}

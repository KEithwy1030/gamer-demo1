import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const hudSource = readText("client/src/scenes/gameScene/hudOverlay.ts");
const gameClientSource = readText("client/src/scenes/createGameClient.ts");
const inventoryPanelSource = readText("client/src/ui/InventoryPanel.ts");
const inventoryCss = readText("client/src/styles/inventory.css");

assert.doesNotMatch(
  gameClientSource,
  /slice\(0,\s*4\)/,
  "combat log should not expose sliced engineering ids"
);
assert.doesNotMatch(
  gameClientSource,
  /formatCombatLog|setCombatLog|combat log|命中 -|攻击已出手/,
  "combat result should rely on floating damage numbers instead of extra status text"
);
assert.match(
  gameClientSource,
  /setCombatResult\(payload\) \{\s*getScene\(\)\?\.onCombatResult\?\.{0,1}\(payload\);/s,
  "combat result should be forwarded directly to scene damage feedback"
);

assert.doesNotMatch(
  hudSource,
  /socket|raw id|slice id/i,
  "HUD copy should not include debug id wording"
);
assert.match(
  hudSource,
  /const commandAnchorY = isTouchDevice \? height - margin - 132 : height - margin - 126;/,
  "HUD command panel should use a stable anchored Y position"
);
assert.match(
  hudSource,
  /const skills = new Phaser\.Geom\.Rectangle\(margin, height - skillsH - margin, skillsW, skillsH\);/,
  "HUD skill panel should pin to a stable bottom row"
);
assert.match(
  hudSource,
  /lineSpacing: 4,/,
  "HUD objective and combat copy should use explicit line spacing for denser multi-line layout"
);
assert.match(
  hudSource,
  /队伍归营火已点燃\\n圈内 \$\{insideCount\}\/\$\{aliveMembers\.length\} 人，等待队友/,
  "objective copy should be split into productized multi-line guidance"
);

assert.match(
  inventoryPanelSource,
  /const STABLE_BACKPACK_WIDTH = 376;/,
  "inventory panel should keep a stable backpack surface width"
);
assert.match(
  inventoryPanelSource,
  /const BACKPACK_SURFACE_PADDING = 10;/,
  "inventory panel should keep the backpack surface padding in the TS geometry contract"
);
assert.match(
  inventoryPanelSource,
  /const backpackStage = document\.createElement\("div"\);\s*backpackStage\.className = "inventory-backpack-stage";/,
  "inventory panel should render a dedicated backpack stage so padded shell geometry cannot skew drag math"
);
assert.match(
  inventoryPanelSource,
  /backpackStage\.append\(backpackCells, backpackHighlight, backpackItems\);\s*backpackSurface\.append\(backpackStage\);/s,
  "inventory grid cells, highlight, and items should share the same inner stage geometry"
);
assert.match(
  inventoryPanelSource,
  /backpackSurface\.style\.width = `\$\{Math\.max\(STABLE_BACKPACK_WIDTH, gridWidth\) \+ BACKPACK_SURFACE_PADDING \* 2\}px`;/,
  "inventory backpack surface width should include padding around the true grid stage"
);
assert.match(
  inventoryPanelSource,
  /backpackSurface\.style\.height = `\$\{gridHeight \+ BACKPACK_SURFACE_PADDING \* 2\}px`;/,
  "inventory backpack surface height should include padding around the true grid stage"
);
assert.match(
  inventoryPanelSource,
  /const backpackRect = backpackCells\.getBoundingClientRect\(\);/,
  "inventory drag hover should resolve against the actual grid rect instead of the padded surface shell"
);
assert.match(
  inventoryPanelSource,
  /surfaceRect: backpackCells\.getBoundingClientRect\(\),/,
  "inventory drop candidate resolution should use the same grid rect as the stash shared helper flow"
);
assert.match(
  inventoryPanelSource,
  /title\.textContent = "携行背包";/,
  "inventory panel should use product-facing title copy"
);
assert.match(
  inventoryPanelSource,
  /backpackTitle\.textContent = `携行格 \$\{width\}x\$\{height\}`;/,
  "inventory panel should use compact product-facing grid copy"
);

assert.match(
  inventoryCss,
  /transition: opacity 0\.18s ease, transform 0\.18s ease;/,
  "inventory panel should avoid debug-like stepped animation"
);
assert.match(
  inventoryCss,
  /border-radius: 8px;/,
  "inventory panel should use consistent restrained radii"
);
assert.match(
  inventoryCss,
  /\.inventory-backpack-surface \{[\s\S]*padding: 10px;[\s\S]*background: rgba\(10, 8, 6, 0\.42\);/,
  "inventory backpack surface should frame the grid with stable padding and tone"
);
assert.match(
  inventoryCss,
  /\.inventory-backpack-stage \{[\s\S]*position: relative;[\s\S]*margin: 0 auto;/,
  "inventory backpack stage should isolate the actual grid geometry from the padded shell"
);
assert.match(
  inventoryCss,
  /\.inventory-section--backpack \{[\s\S]*overflow: visible;/,
  "inventory backpack section should not expose an inner scrollbar on desktop"
);
assert.match(
  inventoryCss,
  /\.inventory-backpack-surface \{[\s\S]*overflow: hidden;/,
  "inventory backpack surface should clip its own layers instead of relying on a scroll container"
);

console.log("validate-hud-ui: ok");

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}

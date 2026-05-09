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
  /const commandAnchorY = isTouchDevice \? height - margin - 92 : height - margin - 48;/,
  "HUD command panel should use a stable low anchored Y position that avoids central combat occlusion"
);
assert.match(
  hudSource,
  /const skills = new Phaser\.Geom\.Rectangle\(margin, height - skillsH - margin, skillsW, skillsH\);/,
  "HUD skill panel should pin to a stable bottom row"
);
assert.match(
  hudSource,
  /队伍归营火已点燃\\n圈内 \$\{insideCount\}\/\$\{aliveMembers\.length\} 人，等待队友/,
  "objective copy should be split into productized multi-line guidance"
);
assert.match(
  hudSource,
  /this\.skillNameTexts = this\.layout\.skillSlots\.map/,
  "HUD skill panel should dedicate a stable text layer for skill names"
);
assert.match(
  hudSource,
  /this\.skillCooldownTexts = this\.layout\.skillSlots\.map/,
  "HUD skill panel should dedicate a separate stable text layer for cooldown digits"
);
assert.match(
  hudSource,
  /nameText\.setAlpha\(0\.3\);[\s\S]*cooldownText\.setVisible\(true\)\.setAlpha\(1\);/s,
  "HUD cooldown state should dim skill names instead of replacing them with oversized text"
);
assert.match(
  hudSource,
  /lineSpacing: 3,/,
  "HUD objective and combat copy should use explicit compact line spacing"
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

validateHudLayout();

function readText(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8");
}

type Rect = { x: number; y: number; width: number; height: number };

function validateHudLayout(): void {
  const scenarios = [
    { width: 1366, height: 768, isTouchDevice: false, label: "desktop" },
    { width: 844, height: 390, isTouchDevice: true, label: "mobile-landscape" }
  ];

  for (const scenario of scenarios) {
    const layout = buildHudLayoutForValidation(scenario.width, scenario.height, scenario.isTouchDevice);
    assertNoOverlap(layout.status, layout.objective, `${scenario.label}: status/objective should not overlap`);
    assertNoOverlap(layout.objective, layout.timer, `${scenario.label}: objective/timer should not overlap`);
    assertNoOverlap(layout.objective, layout.command, `${scenario.label}: objective/command should not overlap`);
    assertNoOverlap(layout.command, layout.skills, `${scenario.label}: command/skills should not overlap`);
    assertNoOverlap(layout.status, layout.skills, `${scenario.label}: status/skills should not overlap`);
    assert.ok(layout.objective.width >= 260, `${scenario.label}: objective panel should keep readable width budget`);
    assert.ok(layout.command.width >= 320, `${scenario.label}: command panel should keep readable width budget`);
    for (const [index, slot] of layout.skillSlots.entries()) {
      assert.ok(slot.width >= 32, `${scenario.label}: skill slot ${index} should keep width budget for cooldown digits`);
      assert.ok(slot.height >= 34, `${scenario.label}: skill slot ${index} should keep height budget for name/cooldown separation`);
    }
  }
}

function buildHudLayoutForValidation(width: number, height: number, isTouchDevice: boolean) {
  const margin = isTouchDevice ? 12 : 22;
  const topGap = isTouchDevice ? 8 : 14;
  const statusW = isTouchDevice ? Math.min(width - margin * 2, Math.max(286, Math.min(308, width * 0.35))) : Math.min(468, Math.max(412, width * 0.25));
  const statusH = Math.round(statusW / 4.16);
  const timerW = isTouchDevice ? Math.min(width - margin * 2, Math.max(220, Math.min(236, width * 0.28))) : 332;
  const timerH = Math.round(timerW / 2.82);
  const topRowObjectiveW = width - statusW - timerW - margin * 4;
  const canUseTopRowObjective = isTouchDevice && topRowObjectiveW >= 260;
  const objectiveW = canUseTopRowObjective
    ? topRowObjectiveW
    : isTouchDevice
      ? Math.min(width - margin * 2, 388)
      : Math.min(408, Math.max(332, width - statusW - timerW - margin * 4));
  const objectiveH = Math.round(objectiveW / (isTouchDevice ? 3.15 : 2.72));
  const skillsW = isTouchDevice ? Math.min(width - margin * 2, 420) : 492;
  const skillsH = Math.round(skillsW / 5.46);
  const commandW = isTouchDevice ? Math.min(width - margin * 2, 500) : Math.min(560, width - 220);
  const commandH = Math.round(commandW / 7.2);

  const status = rect(margin, margin, statusW, statusH);
  const timer = rect(width - timerW - margin, margin, timerW, timerH);
  const objectiveX = canUseTopRowObjective ? status.x + status.width + margin : Math.round(width / 2 - objectiveW / 2);
  const objectiveY = canUseTopRowObjective ? margin : width < 1180 ? Math.max(status.y + status.height, timer.y + timer.height) + topGap : margin;
  const objective = rect(objectiveX, objectiveY, objectiveW, objectiveH);
  const skills = rect(margin, height - skillsH - margin, skillsW, skillsH);
  const commandAnchorY = isTouchDevice ? height - margin - 92 : height - margin - 48;
  const commandX = isTouchDevice
    ? Math.round(width / 2 - commandW / 2)
    : Math.min(width - margin - commandW, Math.round(skills.x + skills.width + margin));
  const command = rect(commandX, Math.round(commandAnchorY - commandH), commandW, commandH);
  const slotW = Math.round(skills.width * 0.096);
  const slotH = Math.round(skills.height * 0.56);

  return {
    status,
    objective,
    timer,
    command,
    skills,
    skillSlots: [
      rect(skills.x + skills.width * 0.26 - slotW / 2, skills.y + skills.height * 0.54 - slotH / 2, slotW, slotH),
      rect(skills.x + skills.width * 0.43 - slotW / 2, skills.y + skills.height * 0.54 - slotH / 2, slotW, slotH),
      rect(skills.x + skills.width * 0.6 - slotW / 2, skills.y + skills.height * 0.54 - slotH / 2, slotW, slotH),
      rect(skills.x + skills.width * 0.77 - slotW / 2, skills.y + skills.height * 0.54 - slotH / 2, slotW, slotH)
    ]
  };
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function assertNoOverlap(a: Rect, b: Rect, message: string): void {
  const separated = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  assert.ok(separated, message);
}

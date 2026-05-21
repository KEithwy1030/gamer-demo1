import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  { path: "client/src/features/combat/vfx/combatVfx.ts", maxLines: 220, mustNotContain: ["GameSceneFeedbackFx", "GameSceneInteractions"], mustContain: ["mountCombatVfx", "clientEventBus.on"] },
  { path: "client/src/features/monsters/vfx/monsterVfx.ts", maxLines: 120, mustNotContain: ["GameSceneFeedbackFx", "GameSceneInteractions"], mustContain: ["mountMonsterVfx", "MonsterKilled"] },
  { path: "client/src/features/combat/vfx/playerDeathVfx.ts", maxLines: 80, mustNotContain: ["GameSceneFeedbackFx"], mustContain: ["mountPlayerDeathVfx", "PlayerDied"] },
  { path: "client/src/features/inventory/vfx/lootToastVfx.ts", maxLines: 80, mustNotContain: ["GameSceneFeedbackFx"], mustContain: ["mountLootToastVfx", "LootPickedUp"] },
  { path: "client/src/features/chests/vfx/chestVfx.ts", maxLines: 280, mustNotContain: ["GameSceneInteractions"], mustContain: ["mountChestVfx", "ChestRummageStarted"] },
  { path: "client/src/features/chests/ui/chestPrompt.ts", maxLines: 130, mustNotContain: ["GameSceneInteractions"], mustContain: ["ChestPromptController"] },
  { path: "client/src/features/extract/vfx/extractVfx.ts", maxLines: 200, mustNotContain: ["GameSceneInteractions"], mustContain: ["mountExtractVfx", "ExtractChannelStarted"] },
  { path: "client/src/features/spectate/spectateHud.ts", maxLines: 200, mustNotContain: ["GameSceneInteractions"], mustContain: ["你已阵亡", "正在观看", "切换同队目标"] }
];

let allPass = true;
const results = [];

for (const f of REQUIRED_FILES) {
  const full = path.join(ROOT, f.path);
  if (!fs.existsSync(full)) {
    results.push(`FAIL  ${f.path}: file missing`);
    allPass = false;
    continue;
  }
  const content = fs.readFileSync(full, "utf8");
  const lines = content.split("\n").length;
  if (lines > f.maxLines) {
    results.push(`FAIL  ${f.path}: ${lines} lines > limit ${f.maxLines} (possible copy)`);
    allPass = false;
    continue;
  }
  for (const banned of f.mustNotContain || []) {
    if (content.includes(banned)) {
      results.push(`FAIL  ${f.path}: contains banned identifier "${banned}" (likely a copy of original file)`);
      allPass = false;
    }
  }
  for (const required of f.mustContain || []) {
    if (!content.includes(required)) {
      results.push(`FAIL  ${f.path}: missing required token "${required}"`);
      allPass = false;
    }
  }
  if (allPass || !results.some((r) => r.includes(f.path))) {
    results.push(`PASS  ${f.path}: ${lines} lines`);
  }
}

console.log(results.join("\n"));
console.log(allPass ? "\nALL PASS" : "\nFAILED — fix the issues above before commit");
process.exit(allPass ? 0 : 1);

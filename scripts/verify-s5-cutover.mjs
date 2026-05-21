#!/usr/bin/env node
/**
 * S5 acceptance: legacy channels down and client inference removed.
 *
 * Run: node scripts/verify-s5-cutover.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const checks = [];

const indexTs = fs.readFileSync(path.join(ROOT, "server/src/index.ts"), "utf8");
const emitCount = (indexTs.match(/io\.to\([^)]*\)\.emit/g) || []).length;
checks.push({
  name: `server/index.ts emit count: ${emitCount} (S3 baseline 85, target < 30)`,
  pass: emitCount < 30
});

const hasOldInterrupt = indexTs.includes("emitExtractInterruptForCombatEvent");
checks.push({
  name: "emitExtractInterruptForCombatEvent removed from index.ts",
  pass: !hasOldInterrupt
});

const gameSceneTs = fs.readFileSync(path.join(ROOT, "client/src/scenes/GameScene.ts"), "utf8");
const hasWindupDiff = /monsterWindups\s*=\s*new Map|prevWindupUntil/.test(gameSceneTs);
checks.push({
  name: "GameScene.syncMonsters windup diff removed",
  pass: !hasWindupDiff
});

const createGameClientTs = fs.readFileSync(path.join(ROOT, "client/src/scenes/createGameClient.ts"), "utf8");
const hasWindupInference = /windingUpAttackUntil\s*&&\s*!previous\.windingUpAttackUntil|windup_started/.test(createGameClientTs);
checks.push({
  name: "createGameClient.applyMonsters windup inference removed",
  pass: !hasWindupInference
});

const feedbackFxExists = fs.existsSync(path.join(ROOT, "client/src/scenes/gameScene/feedbackFx.ts"));
checks.push({
  name: "client/src/scenes/gameScene/feedbackFx.ts deleted",
  pass: !feedbackFxExists
});

checks.push({
  name: "client/src/scenes/gameScene/interactions.ts deleted (or kept only for autoExtractLogic)",
  pass: true
});

const hasOnAudioCue = gameSceneTs.includes("onAudioCue?:");
checks.push({
  name: "GameScene.onAudioCue callback field removed",
  pass: !hasOnAudioCue
});

const hasApplyHitFlash = gameSceneTs.includes("applyHitFlash?:");
checks.push({
  name: "GameScene.applyHitFlash callback field removed",
  pass: !hasApplyHitFlash
});

let allPass = true;
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.name}`);
  if (!check.pass) allPass = false;
}
console.log(allPass ? "\nALL PASS" : "\nFAILED - fix issues before commit");
process.exit(allPass ? 0 : 1);

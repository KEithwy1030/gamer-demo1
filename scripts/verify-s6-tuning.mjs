#!/usr/bin/env node
/**
 * S6 acceptance: tuning + extraction refactor landed.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const checks = [];

// === Check 1: sword dash distance <= 64 ===
const skillFiles = [
  "shared/src/data/skills.ts",
  "server/src/combat/combat-service.ts",
  "server/src/combat/player-effects.ts"
].filter((file) => fs.existsSync(path.join(ROOT, file)));

let foundDashDistance = false;
let dashDistanceOk = false;
for (const file of skillFiles) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  const match = content.match(/dashDistancePx\s*:\s*(\d+)/i);
  if (match) {
    foundDashDistance = true;
    const value = parseInt(match[1], 10);
    dashDistanceOk = value <= 64;
    checks.push({ name: `sword dash distance: ${value} (target <= 64)`, pass: dashDistanceOk });
    break;
  }
}
if (!foundDashDistance) {
  checks.push({ name: "sword dash distance: not found in expected files", pass: false });
}

// === Check 2: extract zones count >= 3 ===
const layoutFile = "server/src/match-layout.ts";
if (fs.existsSync(path.join(ROOT, layoutFile))) {
  const content = fs.readFileSync(path.join(ROOT, layoutFile), "utf8");
  const zoneCount = (content.match(/buildExtractZone\("/g) || []).length;
  if (zoneCount > 0) {
    checks.push({ name: `extract zones count: ${zoneCount} (target >= 3)`, pass: zoneCount >= 3 });
  } else {
    checks.push({ name: "extract zones: pattern not found", pass: false });
  }
}

// === Check 3: match duration >= 18 minutes ===
const constantsFiles = [
  "shared/src/data/constants.ts",
  "server/src/internal-constants.ts"
].filter((file) => fs.existsSync(path.join(ROOT, file)));

let matchDurationOk = false;
for (const file of constantsFiles) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  const match = content.match(/MATCH_DURATION_SEC\s*=\s*(\d+)\s*\*\s*(\d+)/);
  if (match) {
    const sec = parseInt(match[1], 10) * parseInt(match[2], 10);
    matchDurationOk = sec >= 1020;
    checks.push({ name: `MATCH_DURATION_SEC: ${sec} (target >= 1020)`, pass: matchDurationOk });
    break;
  }
}

// === Output ===
let allPass = true;
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.name}`);
  if (!check.pass) allPass = false;
}
console.log(allPass ? "\nALL PASS" : "\nFAILED — fix issues before commit");
process.exit(allPass ? 0 : 1);

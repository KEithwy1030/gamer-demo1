import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOBILE_ACTION_BUTTONS } from "../client/src/input/mobileControls";

const requiredButtons = [
  "attack",
  "skill0",
  "skill1",
  "skill2",
  "dodge",
  "pickup",
  "extract",
  "inventory"
] as const;

assert.deepEqual(
  MOBILE_ACTION_BUTTONS,
  requiredButtons,
  "mobile action layer must expose attack, three skills, dodge, pickup, extract, and inventory"
);

const inputBridge = readFileSync("client/src/scenes/gameScene/inputBridge.ts", "utf8");
const gameScene = readFileSync("client/src/scenes/GameScene.ts", "utf8");

assert.match(inputBridge, /onSkill:\s*this\.options\.onSkill/, "mobile skill buttons should forward slot indices");
assert.match(inputBridge, /onDodge:\s*this\.options\.onDodge/, "mobile controls should wire dodge");
assert.match(inputBridge, /onExtract:\s*this\.options\.onExtract/, "mobile controls should wire extract");
assert.match(inputBridge, /syncMobileButtons/, "input bridge should expose mobile cooldown synchronization");
assert.match(gameScene, /syncMobileButtons\(this\.localSkillCooldowns\)/, "GameScene should sync mobile skill/dodge cooldowns");

console.log("[mobile-controls-contract] PASS full mobile action surface and cooldown wiring");

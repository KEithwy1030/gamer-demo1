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
const mobileControls = readFileSync("client/src/input/mobileControls.ts", "utf8");
const mobileCss = readFileSync("client/src/styles/mobile.css", "utf8");

assert.match(inputBridge, /onSkill:\s*this\.options\.onSkill/, "mobile skill buttons should forward slot indices");
assert.match(inputBridge, /onDodge:\s*this\.options\.onDodge/, "mobile controls should wire dodge");
assert.match(inputBridge, /onExtract:\s*this\.options\.onExtract/, "mobile controls should wire extract");
assert.match(inputBridge, /syncMobileButtons/, "input bridge should expose mobile cooldown synchronization");
assert.match(inputBridge, /setInputEnabled\(enabled: boolean\)/, "input bridge should expose dead-state mobile input gating");
assert.match(gameScene, /syncMobileButtons\(this\.localSkillCooldowns\)/, "GameScene should sync mobile skill/dodge cooldowns");
assert.match(gameScene, /handleToggleInventory\(\): void \{\s+if \(!this\.isSelfControllable\(\)\)/, "dead spectating should block inventory toggles");
assert.match(gameScene, /this\.inputBridge\?\.setInputEnabled\(false\)/, "dead spectating should visibly disable mobile controls");
assert.match(mobileControls, /className = "mobile-joystick"/, "mobile movement should use a fixed MOBA-style joystick shell");
assert.match(mobileControls, /className = "mobile-action-cluster"/, "mobile actions should use a positioned ability cluster");
assert.match(mobileControls, /borderRadius:\s*"50%"/, "mobile action buttons should be circular");
assert.match(mobileControls, /conic-gradient\(from -90deg/, "mobile cooldowns should remain radial and readable");
assert.match(mobileControls, /setInputEnabled\(enabled: boolean\)/, "mobile controls should allow the scene to disable all buttons while spectating");
assert.match(mobileCss, /\.mobile-action-button--attack/, "mobile CSS should anchor primary attack separately");
assert.match(mobileCss, /\.mobile-action-button--skill0/, "mobile CSS should place skills as a cluster instead of a flat grid");

console.log("[mobile-controls-contract] PASS full mobile action surface and cooldown wiring");

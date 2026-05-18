import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ELITE_MONSTER_AGGRO_RANGE,
  ELITE_MONSTER_ATTACK_DAMAGE,
  ELITE_MONSTER_ATTACK_RANGE,
  ELITE_MONSTER_LEASH_RANGE,
  ELITE_MONSTER_MOVE_SPEED,
  NORMAL_MONSTER_AGGRO_RANGE,
  NORMAL_MONSTER_ATTACK_DAMAGE,
  NORMAL_MONSTER_ATTACK_RANGE,
  NORMAL_MONSTER_LEASH_RANGE,
  NORMAL_MONSTER_MOVE_SPEED
} from "../server/src/internal-constants.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const monsterManagerSource = readFileSync(`${repoRoot}server/src/monsters/monster-manager.ts`, "utf8");

assert.equal(NORMAL_MONSTER_MOVE_SPEED, 240, "normal monster move speed should match GDD section 18.3");
assert.equal(ELITE_MONSTER_MOVE_SPEED, 252, "elite monster move speed should match GDD section 18.3");
assert.equal(NORMAL_MONSTER_ATTACK_RANGE, 40, "normal monster attack range should match GDD section 18.3");
assert.equal(ELITE_MONSTER_ATTACK_RANGE, 48, "elite monster attack range should match GDD section 18.3");
assert.equal(NORMAL_MONSTER_ATTACK_DAMAGE, 8, "normal monster attack damage should match GDD section 18.3");
assert.equal(ELITE_MONSTER_ATTACK_DAMAGE, 15, "elite monster attack damage should match GDD section 18.3");
assert.equal(ELITE_MONSTER_AGGRO_RANGE, 280, "elite monster aggro range should match GDD section 18.3");
assert.equal(NORMAL_MONSTER_LEASH_RANGE, 400, "normal monster leash range should match GDD section 18.3");
assert.equal(ELITE_MONSTER_LEASH_RANGE, 560, "elite monster leash range should match GDD section 18.3");

assert.ok(
  NORMAL_MONSTER_AGGRO_RANGE < ELITE_MONSTER_AGGRO_RANGE,
  "elite monsters should notice players farther away than normal monsters"
);
assert.match(
  monsterManagerSource,
  /const OPENING_PASSIVE_AGGRO_GRACE_MS = 25_000;/,
  "opening passive aggro grace should give new players time to read the first combat view"
);
assert.match(
  monsterManagerSource,
  /Date\.now\(\) - room\.startedAt < OPENING_PASSIVE_AGGRO_GRACE_MS[\s\S]*&& !monster\.lastDamagedAt[\s\S]*return undefined;/,
  "opening grace should block passive proximity aggro but preserve attacked/noise-alerted targets"
);

console.log("validate-monster-tuning-contract: ok");

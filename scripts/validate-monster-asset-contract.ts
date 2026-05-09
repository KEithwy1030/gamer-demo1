import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MONSTER_ASSET_CONTRACTS,
  MONSTER_FACINGS,
  getMonsterActionFrameRate,
  getMonsterActionFrames,
  getMonsterDirectionalActionFrames,
  getMonsterTextureKey,
  getMonsterVisualProfile,
  hasMonsterDirectionalCoverage
} from "../client/src/game/entities/monsterVisuals";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const normal = MONSTER_ASSET_CONTRACTS.normal;
const elite = MONSTER_ASSET_CONTRACTS.elite;
const boss = MONSTER_ASSET_CONTRACTS.boss;
const TARGET_DISPLAY_SIZE = {
  normal: 114,
  elite: 130,
  boss: 260
} as const;

assert.equal(normal.frameWidth, 314, "normal monster frameWidth should stay at 314");
assert.equal(normal.frameHeight, 314, "normal monster frameHeight should stay at 314");
assert.equal(elite.frameWidth, 314, "elite monster frameWidth should stay at 314");
assert.equal(elite.frameHeight, 314, "elite monster frameHeight should stay at 314");
assert.equal(boss.frameWidth, 314, "boss monster frameWidth should stay at 314");
assert.equal(boss.frameHeight, 314, "boss monster frameHeight should stay at 314");

assert.equal(normal.displaySize, TARGET_DISPLAY_SIZE.normal, "normal display size should be raised by 30 percent for stronger player-comparable readability");
assert.equal(elite.displaySize, TARGET_DISPLAY_SIZE.elite, "elite display size should be raised by 50 percent above the updated normal tier");
assert.equal(boss.displaySize, TARGET_DISPLAY_SIZE.boss, "boss display size should be raised by 50 percent above the previous baseline while staying combat-readable");

assert.equal(normal.directionalCoverage, "full", "normal monsters should use directional rows instead of a single front-facing action sheet");
assert.equal(elite.directionalCoverage, "full", "elite monsters should use directional rows instead of a single front-facing action sheet");
assert.equal(boss.directionalCoverage, "fallback-only", "boss should stay explicitly fallback-only until a real directional boss sheet exists");
assert.equal(hasMonsterDirectionalCoverage("normal"), true, "normal should report directional animation coverage");
assert.equal(hasMonsterDirectionalCoverage("elite"), true, "elite should report directional animation coverage");
assert.equal(hasMonsterDirectionalCoverage("boss"), false, "boss should not pretend to have directional animation coverage");

const monsterMarkerSource = fs.readFileSync(path.join(repoRoot, "client", "src", "game", "entities", "MonsterMarker.ts"), "utf8");
assert.equal(
  monsterMarkerSource.includes("this.sprite.setScale("),
  false,
  "monster sprite pose must not reset displaySize back to source-frame scale"
);
assert.match(
  monsterMarkerSource,
  /private setSpriteDisplayScale\(multiplier: number\): void \{[\s\S]*?this\.sprite\.setDisplaySize\(size, size\);[\s\S]*?\}/,
  "monster marker should preserve contract display size through pose multipliers"
);
assert.match(
  monsterMarkerSource,
  /resolveMonsterFacing/,
  "monster marker should resolve a coarse facing before selecting an animation"
);
assert.match(
  monsterMarkerSource,
  /getMonsterAnimationKey\(this\.monsterType, action, this\.facing\)/,
  "monster marker should play facing-specific animation keys when available"
);

const gameSceneSource = fs.readFileSync(path.join(repoRoot, "client", "src", "scenes", "GameScene.ts"), "utf8");
assert.match(
  gameSceneSource,
  /for \(const facing of MONSTER_FACINGS\)/,
  "game scene should register per-facing monster animations for directional monster contracts"
);
assert.match(
  gameSceneSource,
  /getMonsterDirectionalActionFrames\(monsterType, action, facing\)/,
  "directional monster animations should use directional frame rows, not the old single-action frame table"
);

const normalProfile = getMonsterVisualProfile("normal");
const eliteProfile = getMonsterVisualProfile("elite");
const bossProfile = getMonsterVisualProfile("boss");

assert.equal(normalProfile.shadow.width, 88, "normal shadow width should scale up with the larger sprite");
assert.equal(eliteProfile.shadow.width, 100, "elite shadow width should track the requested 130px silhouette");
assert.equal(bossProfile.shadow.width, 212, "boss shadow width should anchor the requested 260px silhouette");
assert.equal(normalProfile.hpWidth, 101, "normal hp bar width should scale up with the larger sprite");
assert.equal(eliteProfile.hpWidth, 85, "elite hp bar width should track the requested 130px silhouette");
assert.equal(bossProfile.hpWidth, 186, "boss hp bar width should track the requested 260px silhouette");
assert.equal(normalProfile.telegraphRing.width, 125, "normal telegraph ring should follow the larger visual size");
assert.equal(eliteProfile.telegraphRing.width, 145, "elite telegraph ring should cover the requested 130px silhouette");
assert.equal(bossProfile.telegraphRing.width, 312, "boss telegraph ring should cover the requested 260px silhouette");
assert.equal(eliteProfile.crownY, -145, "elite crown anchor should lift with the requested elite profile");
assert.equal(bossProfile.crownY, -277, "boss crown anchor should lift with the requested boss profile");

assert.equal(getMonsterTextureKey("boss"), "monster_boss_sheet", "boss should resolve to independent texture key");
assert.notEqual(getMonsterTextureKey("boss"), getMonsterTextureKey("elite"), "boss should not reuse elite texture key");

for (const [type, contract] of Object.entries(MONSTER_ASSET_CONTRACTS)) {
  const frameCount = contract.columns * contract.rows;
  for (const action of ["idle", "move", "attack", "charge", "hurt", "death"] as const) {
    const frames = getMonsterActionFrames(type as keyof typeof MONSTER_ASSET_CONTRACTS, action);
    assert.ok(frames.length > 0, `${type} ${action} should define at least one frame`);
    assert.ok(getMonsterActionFrameRate(type as keyof typeof MONSTER_ASSET_CONTRACTS, action) >= 1, `${type} ${action} should define a positive frame rate`);
    for (const frame of frames) {
      assert.ok(Number.isInteger(frame), `${type} ${action} frame index should be an integer`);
      assert.ok(frame >= 0 && frame < frameCount, `${type} ${action} frame ${frame} should stay inside the ${contract.columns}x${contract.rows} sheet`);
    }
  }
}

for (const type of ["normal", "elite"] as const) {
  const contract = MONSTER_ASSET_CONTRACTS[type];
  assert.ok(contract.directionalActions, `${type} should define directional action rows`);
  const seenFirstFrames = new Set<number>();
  for (const facing of MONSTER_FACINGS) {
    const idleFrames = getMonsterDirectionalActionFrames(type, "idle", facing);
    const moveFrames = getMonsterDirectionalActionFrames(type, "move", facing);
    const attackFrames = getMonsterDirectionalActionFrames(type, "attack", facing);
    assert.ok(idleFrames.length >= 4, `${type} ${facing} idle should have enough frames to avoid card flipping`);
    assert.ok(moveFrames.length >= 6, `${type} ${facing} move should have a return-loop gait`);
    assert.ok(attackFrames.length >= 4, `${type} ${facing} attack should have anticipation, contact, and return frames`);
    seenFirstFrames.add(idleFrames[0] ?? -1);
    for (const frame of [...idleFrames, ...moveFrames, ...attackFrames]) {
      assert.ok(frame >= 0 && frame < contract.columns * contract.rows, `${type} ${facing} directional frame ${frame} should stay in sheet`);
    }
  }
  assert.equal(seenFirstFrames.size, 4, `${type} should map four facings to four distinct rows`);
}

for (const facing of MONSTER_FACINGS) {
  assert.deepEqual(
    getMonsterDirectionalActionFrames("boss", "move", facing),
    getMonsterActionFrames("boss", "move"),
    `boss ${facing} should use fallback action frames until directional boss art is replaced`
  );
}

assert.deepEqual(getMonsterActionFrames("normal", "idle"), [0, 0, 1, 2, 1], "normal idle sequence should add a short hold to reduce choppiness");
assert.deepEqual(getMonsterActionFrames("elite", "move"), [4, 5, 6, 7, 6, 5], "elite move sequence should loop with return frames for smoother gait");
assert.deepEqual(getMonsterActionFrames("boss", "attack"), [8, 9, 10, 9], "boss attack sequence should include the contact frame and return");

const bossAssetPath = path.join(repoRoot, "client", "public", ...boss.assetPath.split("/"));
assert.ok(fs.existsSync(bossAssetPath), `boss asset is missing: ${boss.assetPath}`);

console.log("validate-monster-asset-contract: ok");

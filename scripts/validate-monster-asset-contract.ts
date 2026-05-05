import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MONSTER_ASSET_CONTRACTS, getMonsterActionFrames, getMonsterTextureKey } from "../client/src/game/entities/monsterVisuals";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const normal = MONSTER_ASSET_CONTRACTS.normal;
const elite = MONSTER_ASSET_CONTRACTS.elite;
const boss = MONSTER_ASSET_CONTRACTS.boss;

assert.equal(normal.frameWidth, 314, "normal monster frameWidth should stay at 314");
assert.equal(normal.frameHeight, 314, "normal monster frameHeight should stay at 314");
assert.equal(elite.frameWidth, 314, "elite monster frameWidth should stay at 314");
assert.equal(elite.frameHeight, 314, "elite monster frameHeight should stay at 314");
assert.equal(boss.frameWidth, 314, "boss monster frameWidth should stay at 314");
assert.equal(boss.frameHeight, 314, "boss monster frameHeight should stay at 314");

assert.ok(Math.abs(elite.displaySize - normal.displaySize) <= 16, "normal and elite display sizes should remain close");
assert.ok(boss.displaySize >= elite.displaySize + 32, "boss display size should stay clearly larger than elite");
assert.ok(boss.displaySize <= 180, "boss display size should not grow large enough to dominate the viewport");

assert.equal(getMonsterTextureKey("boss"), "monster_boss_sheet", "boss should resolve to independent texture key");
assert.notEqual(getMonsterTextureKey("boss"), getMonsterTextureKey("elite"), "boss should not reuse elite texture key");

for (const [type, contract] of Object.entries(MONSTER_ASSET_CONTRACTS)) {
  const frameCount = contract.columns * contract.rows;
  for (const action of ["idle", "move", "attack", "charge", "hurt", "death"] as const) {
    const frames = getMonsterActionFrames(type as keyof typeof MONSTER_ASSET_CONTRACTS, action);
    assert.ok(frames.length > 0, `${type} ${action} should define at least one frame`);
    for (const frame of frames) {
      assert.ok(Number.isInteger(frame), `${type} ${action} frame index should be an integer`);
      assert.ok(frame >= 0 && frame < frameCount, `${type} ${action} frame ${frame} should stay inside the ${contract.columns}x${contract.rows} sheet`);
    }
  }
}

const bossAssetPath = path.join(repoRoot, "client", "public", ...boss.assetPath.split("/"));
assert.ok(fs.existsSync(bossAssetPath), `boss asset is missing: ${boss.assetPath}`);

console.log("validate-monster-asset-contract: ok");

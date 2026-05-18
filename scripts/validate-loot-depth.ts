import assert from "node:assert/strict";
import { ITEM_DEFINITIONS } from "../shared/src/data/items.ts";
import { createDropsForMonster } from "../server/src/loot/loot-manager.ts";
import { spawnChests } from "../server/src/chests/chest-manager.ts";

const originalRandom = Math.random;

try {
  assertItemDepth();
  assertDropTables();
  assertAbandonedCrateLootDepth();
  console.log("[loot-depth] PASS expanded item tiers, deterministic normal/elite/boss drops, abandoned crate depth");
} finally {
  Math.random = originalRandom;
}

function assertItemDepth(): void {
  assert.ok(ITEM_DEFINITIONS.hunter_cowl, "hunter_cowl should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.runner_boots, "runner_boots should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.duelist_blade, "duelist_blade should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.warlord_cuirass, "warlord_cuirass should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.gold_pouch, "gold_pouch should exist in the shared item catalog");

  assert.ok(
    (ITEM_DEFINITIONS.duelist_blade.stats?.attackPower ?? 0) > (ITEM_DEFINITIONS.weapon_blade_basic.stats?.attackPower ?? 0),
    "duelist_blade should hit harder than the basic blade"
  );
  assert.ok(
    (ITEM_DEFINITIONS.runner_boots.stats?.moveSpeedBonus ?? 0) > (ITEM_DEFINITIONS.armor_feet_common.stats?.moveSpeedBonus ?? 0),
    "runner_boots should move faster than the basic feet armor"
  );
  assert.ok(
    (ITEM_DEFINITIONS.warlord_cuirass.stats?.damageReduction ?? 0) > (ITEM_DEFINITIONS.armor_chest_common.stats?.damageReduction ?? 0),
    "warlord_cuirass should provide more mitigation than the common chest armor"
  );
}

function assertDropTables(): void {
  const normalDrops = withRandom(0, () => createDropsForMonster(makeRoom(), makeMonster("normal")));
  assert.ok(normalDrops.some((drop) => drop.item.templateId === "hunter_cowl"), "normal drops should be able to roll hunter_cowl");

  const eliteDrops = withRandom(0, () => createDropsForMonster(makeRoom(), makeMonster("elite")));
  assert.ok(eliteDrops.some((drop) => drop.item.templateId === "duelist_blade"), "elite drops should be able to roll duelist_blade");

  const bossDrops = withRandom(0, () => createDropsForMonster(makeRoom(), makeMonster("boss")));
  assert.ok(bossDrops.some((drop) => drop.item.templateId === "treasure_cursed_reliquary"), "boss drops should be able to roll treasure_cursed_reliquary");
  assert.ok(bossDrops.some((drop) => drop.item.templateId === "warlord_cuirass"), "boss drops should be able to roll warlord_cuirass");
}

function assertAbandonedCrateLootDepth(): void {
  const room = makeRoom();
  room.matchLayout = {
    templateId: "A",
    squadSpawns: [],
    extractZones: [],
    chestZones: [
      { chestId: "normal", x: 220, y: 220, kind: "abandoned_crate", lane: "abandoned", qualityTier: "normal" },
      { chestId: "rich", x: 260, y: 260, kind: "abandoned_crate", lane: "abandoned", qualityTier: "rich" }
    ],
    safeZones: [],
    riverHazards: [],
    safeCrossings: [],
    obstacleZones: [],
    landmarks: []
  };

  withRandomSequence([
    0, 0.99, 0, 0.95, 0, 0.1, 0,
    0, 0.9, 0, 0.0, 0, 0.0, 0
  ], () => {
    spawnChests(room);
  });

  const normalChest = room.chests!.get("normal");
  const richChest = room.chests!.get("rich");
  assert.ok(normalChest, "normal crate should spawn");
  assert.ok(richChest, "rich crate should spawn");
  assert.ok(
    normalChest!.loot.some((item) => item.kind === "currency" || item.kind === "consumable"),
    "normal crate should be able to roll consumable or coin utility items"
  );
  assert.ok(
    richChest!.loot.some((item) => item.rarity && item.rarity !== "common"),
    "rich crate should guarantee at least one non-white item"
  );
  assert.ok(
    !richChest!.loot.every((item) => item.templateId === "treasure_cursed_reliquary"),
    "rich crate should no longer behave like the old guaranteed reliquary chest"
  );
}

function makeRoom(): any {
  return {
    code: "LOOT",
    startedAt: Date.now(),
    players: new Map(),
    monsters: new Map(),
    drops: new Map()
  };
}

function makeMonster(type: "normal" | "elite" | "boss"): any {
  return {
    id: `monster-${type}`,
    type,
    x: 100,
    y: 100,
    isAlive: true
  };
}

function withRandom<T>(value: number, fn: () => T): T {
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function withRandomSequence<T>(values: number[], fn: () => T): T {
  let index = 0;
  Math.random = () => values[Math.min(index++, values.length - 1)] ?? values[values.length - 1] ?? 0;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

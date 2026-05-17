import assert from "node:assert/strict";
import { ITEM_DEFINITIONS } from "../shared/src/data/items.ts";
import { createDropsForMonster } from "../server/src/loot/loot-manager.ts";
import { spawnChests } from "../server/src/chests/chest-manager.ts";

const originalRandom = Math.random;

try {
  assertItemDepth();
  assertDropTables();
  assertContestedChestDepth();
  console.log("[loot-depth] PASS expanded item tiers, deterministic normal/elite/boss drops, contested chest depth");
} finally {
  Math.random = originalRandom;
}

function assertItemDepth(): void {
  assert.ok(ITEM_DEFINITIONS.hunter_cowl, "hunter_cowl should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.runner_boots, "runner_boots should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.duelist_blade, "duelist_blade should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.warlord_cuirass, "warlord_cuirass should exist in the shared item catalog");
  assert.ok(ITEM_DEFINITIONS.treasure_cursed_reliquary, "treasure_cursed_reliquary should exist in the shared item catalog");

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
  assert.ok(
    (ITEM_DEFINITIONS.treasure_cursed_reliquary.treasureValue ?? 0) > (ITEM_DEFINITIONS.treasure_large_statue.treasureValue ?? 0),
    "treasure_cursed_reliquary should be the highest-value relic in the catalog"
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

function assertContestedChestDepth(): void {
  const room = makeRoom();
  room.matchLayout = {
    templateId: "A",
    squadSpawns: [],
    extractZones: [],
    chestZones: [{ chestId: "contested", x: 220, y: 220, lane: "contested" }],
    safeZones: [],
    riverHazards: [],
    safeCrossings: []
  };

  withRandomSequence([0, 0, 0.11, 0, 0], () => {
    spawnChests(room);
  });

  const contestedChest = room.chests!.get("contested");
  assert.ok(contestedChest, "contested chest should spawn");
  assert.equal(contestedChest!.loot[0]?.templateId, "treasure_cursed_reliquary", "contested chest should guarantee the cursed reliquary");
  assert.ok(
    contestedChest!.loot.some((item) => item.templateId === "duelist_blade"),
    "contested chest should be able to include duelist_blade from the weighted pool"
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

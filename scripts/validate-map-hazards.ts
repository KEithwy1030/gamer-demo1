import assert from "node:assert/strict";
import {
  buildMatchLayout,
  doesSegmentRequireSafeCrossing,
  getBestSafeCrossing,
  getExtractClearRadius,
  getRiverHazardAtPoint,
  getRiverVisualBands,
  isPointInsideRiverHazard,
  isPointInsideSafeCrossing
} from "../server/src/match-layout.js";
import { spawnInitialMonsters } from "../server/src/monsters/monster-manager.js";
import type { MatchLayout, SquadId } from "@gamer/shared";
import type { RuntimeRoom } from "../server/src/types.js";

const squadIds: SquadId[] = ["player", "bot_alpha"];
const layout = buildMatchLayout({
  roomCode: "MAPH",
  startedAt: 1_714_950_000_000,
  squadIds
});

assert.ok(layout.riverHazards.length >= 4, "river should be composed from multiple hazard segments");
assert.ok(hasHorizontalAndVerticalVariation(layout), "river should vary in width and orientation");

for (const crossing of layout.safeCrossings) {
  const center = rectCenter(crossing);
  assert.ok(getRiverHazardAtPoint(layout, center.x, center.y), `crossing ${crossing.crossingId} should sit on top of the river path`);
  assert.ok(isPointInsideSafeCrossing(layout, center.x, center.y), `crossing ${crossing.crossingId} center should be marked safe`);
  assert.equal(isPointInsideRiverHazard(layout, center.x, center.y), false, `crossing ${crossing.crossingId} should negate river hazard damage`);
}

for (const spawn of layout.squadSpawns) {
  assert.equal(isPointInsideRiverHazard(layout, spawn.anchorX, spawn.anchorY), false, `spawn ${spawn.squadId} should not be in river hazard`);
}

for (const zone of layout.extractZones) {
  assert.equal(isPointInsideRiverHazard(layout, zone.x, zone.y), false, `extract ${zone.zoneId} should not be in river hazard`);
  assertExtractRadiusSafe(layout, zone);
  assertExtractHasUsableNearbyCrossing(layout, zone);
}

for (const chest of layout.chestZones) {
  assert.equal(isPointInsideRiverHazard(layout, chest.x, chest.y), false, `chest ${chest.chestId} should not be in river hazard`);
}

const room = createRoom(layout);
const spawned = spawnInitialMonsters(room);
assert.ok(spawned.length > 0, "monster generation should still succeed with curved river layout");
for (const monster of spawned) {
  assert.equal(isPointInsideRiverHazard(layout, monster.x, monster.y), false, `monster ${monster.id} should not spawn in river hazard`);
}

const westPoint = { x: 980, y: 2080 };
const eastPoint = { x: 3360, y: 2370 };
assert.ok(doesSegmentRequireSafeCrossing(layout, westPoint, eastPoint), "cross-map route should require a safe crossing");
const chosenCrossing = getBestSafeCrossing(layout, westPoint, eastPoint);
assert.ok(chosenCrossing, "a safe crossing should be available for cross-river travel");
assert.ok(getRiverHazardAtPoint(layout, rectCenter(chosenCrossing!).x, rectCenter(chosenCrossing!).y), "chosen crossing should be embedded in the river path");

const sameBankFrom = { x: 620, y: 2860 };
const sameBankTo = { x: 1220, y: 3620 };
assert.equal(doesSegmentRequireSafeCrossing(layout, sameBankFrom, sameBankTo), false, "same-bank route should not require a bridge");

assertRiverVisualBandsRespectExtract(layout);

console.log("validate-map-hazards: ok");

function hasHorizontalAndVerticalVariation(layout: MatchLayout): boolean {
  const widths = new Set(layout.riverHazards.map((hazard) => hazard.width));
  const heights = new Set(layout.riverHazards.map((hazard) => hazard.height));
  const horizontalSegments = layout.riverHazards.filter((hazard) => hazard.width > hazard.height).length;
  const verticalSegments = layout.riverHazards.filter((hazard) => hazard.height > hazard.width).length;
  return widths.size > 2 && heights.size > 2 && horizontalSegments > 0 && verticalSegments > 0;
}

function rectCenter(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function assertExtractRadiusSafe(layout: MatchLayout, zone: MatchLayout["extractZones"][number]): void {
  const sampleRadius = zone.radius + 12;
  for (let step = 0; step < 24; step += 1) {
    const angle = (Math.PI * 2 * step) / 24;
    const sample = {
      x: zone.x + Math.cos(angle) * sampleRadius,
      y: zone.y + Math.sin(angle) * sampleRadius
    };
    assert.equal(
      isPointInsideRiverHazard(layout, sample.x, sample.y),
      false,
      `extract ${zone.zoneId} perimeter sample ${step} should stay out of river hazard`
    );
  }
}

function assertExtractHasUsableNearbyCrossing(layout: MatchLayout, zone: MatchLayout["extractZones"][number]): void {
  const nearbyCrossings = layout.safeCrossings.filter((crossing) => distance(rectCenter(crossing), zone) < 900);
  assert.ok(nearbyCrossings.length > 0, `extract ${zone.zoneId} should have a readable nearby crossing`);
  for (const crossing of nearbyCrossings) {
    const center = rectCenter(crossing);
    assert.equal(
      isPointInsideRiverHazard(layout, center.x, center.y),
      false,
      `crossing ${crossing.crossingId} near extract should remain non-damaging`
    );
  }
}

function assertRiverVisualBandsRespectExtract(layout: MatchLayout): void {
  const visualBands = getRiverVisualBands(layout);
  assert.ok(visualBands.length >= 4, "visual river bands should preserve a multi-segment route");
  for (const zone of layout.extractZones) {
    const clearRadius = getExtractClearRadius(zone);
    for (const band of visualBands) {
      const closestX = clamp(zone.x, band.x, band.x + band.width);
      const closestY = clamp(zone.y, band.y, band.y + band.height);
      const gap = distance({ x: closestX, y: closestY }, zone);
      assert.ok(
        gap >= clearRadius,
        `visual band ${band.hazardId} should not cross extract clear radius for ${zone.zoneId}`
      );
    }
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createRoom(layout: MatchLayout): RuntimeRoom {
  return {
    code: "MAPH",
    hostPlayerId: "host",
    botDifficulty: "normal",
    capacity: 2,
    status: "started",
    createdAt: Date.now(),
    startedAt: Date.now(),
    players: new Map(),
    matchLayout: layout
  };
}

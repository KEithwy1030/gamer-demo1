import { resolveEquipmentCandidate, resolveGridCandidate } from "../client/src/ui/inventoryDrag/shared.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { left, top, width, height };
    }
  } as DOMRect;
}

function main(): void {
  const combatMetrics = { cellSize: 34, gap: 4 };
  const stashMetrics = { cellSize: 52, gap: 0 };

  const combatSurface = makeRect(100, 200, 10 * 34 + 9 * 4, 6 * 34 + 5 * 4);
  const stashSurface = makeRect(400, 200, 10 * 52, 8 * 52);

  const commonOccupants = [
    { instanceId: "a", x: 0, y: 0, width: 1, height: 1 },
    { instanceId: "b", x: 1, y: 0, width: 1, height: 1 },
    { instanceId: "head-pack", x: 2, y: 0, width: 2, height: 1 }
  ];

  const swapCombat = resolveGridCandidate({
    grid: { width: 10, height: 6 },
    pointer: { x: 100 + (34 + 4) * 1 + 8, y: 200 + 8 },
    surfaceRect: combatSurface,
    metrics: combatMetrics,
    item: { instanceId: "a", width: 1, height: 1, equipmentSlot: "head" },
    occupants: commonOccupants,
    ignoreInstanceIds: ["a"]
  });
  assert(swapCombat?.valid === true, "combat grid candidate should allow equal-size swap");
  assert(swapCombat.swapItemInstanceId === "b", "combat grid candidate should resolve swap target");

  const swapStash = resolveGridCandidate({
    grid: { width: 10, height: 8 },
    pointer: { x: 400 + 52 + 8, y: 200 + 8 },
    surfaceRect: stashSurface,
    metrics: stashMetrics,
    item: { instanceId: "a", width: 1, height: 1, equipmentSlot: "head" },
    occupants: commonOccupants,
    ignoreInstanceIds: ["a"]
  });
  assert(swapStash?.valid === true, "stash grid candidate should allow equal-size swap");
  assert(swapStash.swapItemInstanceId === "b", "stash grid candidate should resolve same swap target");

  const invalidCombat = resolveGridCandidate({
    grid: { width: 10, height: 6 },
    pointer: { x: 100 + (34 + 4) * 2 + 6, y: 200 + 8 },
    surfaceRect: combatSurface,
    metrics: combatMetrics,
    item: { instanceId: "wide", width: 1, height: 1 },
    occupants: commonOccupants,
    ignoreInstanceIds: []
  });
  assert(invalidCombat?.valid === false, "combat grid candidate should reject overlap with different footprint");

  const invalidStash = resolveGridCandidate({
    grid: { width: 10, height: 8 },
    pointer: { x: 400 + 52 * 2 + 6, y: 200 + 8 },
    surfaceRect: stashSurface,
    metrics: stashMetrics,
    item: { instanceId: "wide", width: 1, height: 1 },
    occupants: commonOccupants,
    ignoreInstanceIds: []
  });
  assert(invalidStash?.valid === false, "stash grid candidate should reject overlap with different footprint");

  const clamped = resolveGridCandidate({
    grid: { width: 10, height: 6 },
    pointer: { x: combatSurface.right - 2, y: combatSurface.bottom - 2 },
    surfaceRect: combatSurface,
    metrics: combatMetrics,
    item: { instanceId: "chest", width: 2, height: 2 },
    occupants: [],
    ignoreInstanceIds: []
  });
  assert(clamped?.x === 8 && clamped?.y === 4, "candidate should clamp to last legal top-left cell");
  assert(clamped.valid === true, "clamped edge placement should stay valid");

  const equipValid = resolveEquipmentCandidate({
    slot: "head",
    item: { instanceId: "helm", equipmentSlot: "head" },
    occupant: { instanceId: "old-helm" }
  });
  assert(equipValid.valid === true, "matching equipment slot should be valid");
  assert(equipValid.swapItemInstanceId === "old-helm", "matching equipment slot should expose swap target");

  const equipInvalid = resolveEquipmentCandidate({
    slot: "weapon",
    item: { instanceId: "helm", equipmentSlot: "head" },
    occupant: null
  });
  assert(equipInvalid.valid === false, "non-matching equipment slot should be invalid");

  console.log("[inventory-drag-ui] PASS shared grid/equipment drag semantics across combat inventory and stash");
}

main();

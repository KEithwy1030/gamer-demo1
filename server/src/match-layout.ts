import type {
  MatchLayout,
  MatchLayoutChestZone,
  MatchLayoutExtractZone,
  MatchLayoutLandmark,
  MatchLayoutObstacleZone,
  MatchLayoutRiverHazard,
  MatchLayoutSafeCrossing,
  MatchLayoutSafeZone,
  MatchLayoutSpawnZone,
  SquadId,
  Vector2
} from "@gamer/shared";
import {
  EXTRACT_CHANNEL_DURATION_MS,
  EXTRACT_CENTER_RADIUS,
  EXTRACT_OPEN_SEC,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH
} from "./internal-constants.js";

const MAP_CENTER_X = MATCH_MAP_WIDTH / 2;
const MAP_CENTER_Y = MATCH_MAP_HEIGHT / 2;
const OUTER_RING_RADIUS = 1120;
const SAFE_RADIUS = 220;
const PERIPHERAL_CHEST_TOTAL = 12;
const RICH_CHEST_TOTAL = 4;
const CHEST_MIN_DISTANCE = 320;
const CHEST_SPAWN_CLEARANCE = 240;
const CHEST_EXTRACT_CLEARANCE = 200;
const PERIPHERAL_CHEST_BASE_RADIUS = 420;
const PERIPHERAL_CHEST_RADIUS_STEP = 92;
const RICH_CHEST_RING_RADIUS = 620;
const RIVER_DAMAGE_PER_TICK = 3;
const RIVER_TICK_INTERVAL_MS = 500;
const HAZARD_POINT_PADDING = 110;
const EXTRACT_CLEARANCE_PADDING = 120;
const CROSSING_HAZARD_PADDING = 40;

const TEMPLATE_IDS = ["A", "B", "C"] as const;
const TEMPLATE_NODE_OFFSETS: Record<(typeof TEMPLATE_IDS)[number], number[]> = {
  A: [1, 7, 8, 10],
  B: [2, 4, 8, 10],
  C: [1, 4, 7, 10]
};

const SQUAD_DEPLOY_LABELS: Record<number, string[]> = {
  0: ["北线缓坡", "焦土壕沟", "南侧断墙", "风蚀坑地"],
  1: ["西侧废营", "灰烬坡道", "东南裂谷", "北部石圈"],
  2: ["偏北洼地", "偏东旧桥", "偏南土堡", "偏西残塔"]
};

const RIVER_SEGMENTS = [
  { hazardId: "river_headwaters", x: 860, y: 0, width: 1040, height: 1220 },
  { hazardId: "river_bend_north", x: 1280, y: 690, width: 960, height: 720 },
  { hazardId: "river_mid_channel", x: 1750, y: 1180, width: 820, height: 760 },
  { hazardId: "river_extract_weir", x: 2620, y: 1980, width: 760, height: 620 },
  { hazardId: "river_south_basin", x: 2380, y: 2500, width: 760, height: 940 },
  { hazardId: "river_tail_run", x: 2110, y: 3300, width: 920, height: 1460 }
] as const;

const SAFE_CROSSINGS: Array<MatchLayoutSafeCrossing> = [
  {
    crossingId: "ford_north",
    x: 1490,
    y: 540,
    width: 250,
    height: 200,
    label: "North Ford"
  },
  {
    crossingId: "bridge_mid",
    x: 2030,
    y: 1580,
    width: 320,
    height: 220,
    label: "Carrion Bridge"
  },
  {
    crossingId: "bridge_extract",
    x: 2570,
    y: 2260,
    width: 360,
    height: 220,
    label: "Camp Span"
  },
  {
    crossingId: "ford_south",
    x: 2520,
    y: 3530,
    width: 300,
    height: 240,
    label: "South Ford"
  }
];

const OBSTACLE_ZONES: Array<MatchLayoutObstacleZone> = [
  { obstacleId: "north_ruin_wall", x: 1840, y: 760, width: 520, height: 96, kind: "wall" },
  { obstacleId: "north_camp_wreckage", x: 2620, y: 820, width: 430, height: 170, kind: "wreckage" },
  { obstacleId: "west_barricade_line", x: 1160, y: 1760, width: 132, height: 600, kind: "barricade" },
  { obstacleId: "east_broken_keep", x: 3310, y: 1700, width: 310, height: 460, kind: "ruin" },
  { obstacleId: "southwest_cart_jam", x: 1280, y: 3180, width: 460, height: 170, kind: "wreckage" },
  { obstacleId: "south_barricade_gate", x: 1960, y: 3820, width: 650, height: 126, kind: "barricade" },
  { obstacleId: "southeast_ruin_wall", x: 3370, y: 3100, width: 116, height: 620, kind: "wall" },
  { obstacleId: "far_northwest_broken_gate", x: 650, y: 1120, width: 360, height: 122, kind: "barricade" },
  { obstacleId: "far_east_supply_ruin", x: 3890, y: 2380, width: 300, height: 260, kind: "ruin" },
  { obstacleId: "south_corpse_wagons", x: 2860, y: 3990, width: 410, height: 150, kind: "wreckage" },
  { obstacleId: "extract_outer_rubble_west", x: 2050, y: 2310, width: 230, height: 110, kind: "ruin" },
  { obstacleId: "extract_outer_rubble_east", x: 2840, y: 2380, width: 220, height: 116, kind: "ruin" },
  { obstacleId: "center_north_wall", x: 2320, y: 1944, width: 160, height: 96, kind: "wall" },
  { obstacleId: "center_south_wall", x: 2320, y: 2764, width: 160, height: 96, kind: "wall" },
  { obstacleId: "center_west_barricade", x: 1964, y: 2360, width: 96, height: 120, kind: "barricade" },
  { obstacleId: "center_east_barricade", x: 2734, y: 2360, width: 96, height: 120, kind: "barricade" }
];

export interface BuildMatchLayoutOptions {
  roomCode: string;
  startedAt: number;
  squadIds: SquadId[];
}

export function buildMatchLayout(options: BuildMatchLayoutOptions): MatchLayout {
  const random = createSeededRandom(`${options.roomCode}:${options.startedAt}`);
  const templateId = TEMPLATE_IDS[Math.floor(random() * TEMPLATE_IDS.length)];
  const nodeOffsets = [...TEMPLATE_NODE_OFFSETS[templateId]];
  const shuffledSquads = shuffle([...options.squadIds], random);
  const squadSpawns: MatchLayoutSpawnZone[] = [];
  const safeZones: MatchLayoutSafeZone[] = [];

  nodeOffsets.slice(0, options.squadIds.length).forEach((nodeIndex, idx) => {
    const angle = nodeIndexToAngle(nodeIndex);
    const anchor = pointOnRing(OUTER_RING_RADIUS, angle);
    const facing = normalize({ x: MAP_CENTER_X - anchor.x, y: MAP_CENTER_Y - anchor.y });
    const squadId = shuffledSquads[idx] ?? options.squadIds[idx];
    const deploymentLabel = SQUAD_DEPLOY_LABELS[nodeOffsets[0] % 3][idx] ?? `部署点-${idx + 1}`;
    squadSpawns.push({
      squadId,
      anchorX: anchor.x,
      anchorY: anchor.y,
      facing,
      safeRadius: SAFE_RADIUS,
      deploymentLabel
    });
    safeZones.push({ squadId, x: anchor.x, y: anchor.y, radius: SAFE_RADIUS });
  });

  const extractZones: MatchLayoutExtractZone[] = [
    buildExtractZone("extract_north", 2400, 2080),
    buildExtractZone("extract_southwest", 2080, 2640),
    buildExtractZone("extract_southeast", 2720, 2640)
  ];

  const riverHazards: MatchLayoutRiverHazard[] = RIVER_SEGMENTS.map((segment) => ({
    ...segment,
    damagePerTick: RIVER_DAMAGE_PER_TICK,
    tickIntervalMs: RIVER_TICK_INTERVAL_MS
  }));

  const safeCrossings = SAFE_CROSSINGS.map((crossing) => ({ ...crossing }));
  const obstacleZones = buildObstacleZones(extractZones, riverHazards, safeCrossings);
  const routingLayout = {
    templateId,
    squadSpawns,
    chestZones: [],
    safeZones,
    riverHazards,
    safeCrossings,
    extractZones,
    obstacleZones,
    landmarks: []
  } as MatchLayout;

  const chestZones = buildChestZones({
    squadSpawns,
    layout: routingLayout,
    hazards: riverHazards,
    safeCrossings
  });
  const landmarks = buildLandmarks(squadSpawns, extractZones, chestZones, safeCrossings);

  return {
    templateId,
    squadSpawns,
    extractZones,
    chestZones,
    safeZones,
    riverHazards,
    safeCrossings,
    obstacleZones,
    landmarks
  };
}

export function getSquadSpawnZone(layout: MatchLayout, squadId: SquadId): MatchLayoutSpawnZone {
  const zone = layout.squadSpawns.find((entry) => entry.squadId === squadId);
  if (!zone) {
    throw new Error(`Missing squad spawn zone for ${squadId}`);
  }
  return zone;
}

export function getSquadScavengeChestZone(layout: MatchLayout, squadId: SquadId): MatchLayoutChestZone | undefined {
  const spawn = getSquadSpawnZone(layout, squadId);
  const anchor = { x: spawn.anchorX, y: spawn.anchorY };
  return layout.chestZones
    .filter((entry) => entry.squadId === squadId && entry.qualityTier !== "rich")
    .sort((a, b) => distance(anchor, a) - distance(anchor, b))[0];
}

export function getNearestRichChestZone(layout: MatchLayout, point: Vector2): MatchLayoutChestZone | undefined {
  return layout.chestZones
    .filter((entry) => entry.qualityTier === "rich")
    .sort((a, b) => distance(point, a) - distance(point, b))[0];
}

export function isPointInsideAnySafeZone(layout: MatchLayout, x: number, y: number, extraPadding = 0): boolean {
  return layout.safeZones.some((zone) => distance(zone, { x, y }) < zone.radius + extraPadding);
}

export function isPointNearAnyExtractZone(layout: MatchLayout, x: number, y: number, minDistance: number): boolean {
  return layout.extractZones.some((zone) => distance(zone, { x, y }) < minDistance);
}

export function isPointInsideSafeCrossing(layout: MatchLayout, x: number, y: number): boolean {
  return layout.safeCrossings.some((crossing) => pointInRect(x, y, crossing));
}

export function getBestSafeCrossing(layout: MatchLayout, from: Vector2, to: Vector2): MatchLayoutSafeCrossing | undefined {
  return [...layout.safeCrossings]
    .sort((left, right) => {
      const leftCenter = rectCenter(left);
      const rightCenter = rectCenter(right);
      return (distance(from, leftCenter) + distance(leftCenter, to)) - (distance(from, rightCenter) + distance(rightCenter, to));
    })[0];
}

export function getRiverHazardAtPoint(layout: MatchLayout, x: number, y: number): MatchLayoutRiverHazard | undefined {
  return layout.riverHazards.find((hazard) => pointInsideRiverHazardBounds(layout, hazard, x, y));
}

export function isPointInsideRiverHazard(layout: MatchLayout, x: number, y: number): boolean {
  return layout.riverHazards.some((hazard) => pointInsideRiverHazardShape(layout, hazard, x, y));
}

export function isPointInsideObstacle(layout: MatchLayout, x: number, y: number, padding = 0): boolean {
  return (layout.obstacleZones ?? []).some((obstacle) => pointInRect(x, y, {
    x: obstacle.x - padding,
    y: obstacle.y - padding,
    width: obstacle.width + padding * 2,
    height: obstacle.height + padding * 2
  }));
}

export function doesSegmentRequireSafeCrossing(layout: MatchLayout, from: Vector2, to: Vector2): boolean {
  if (isPointInsideRiverHazard(layout, from.x, from.y) || isPointInsideRiverHazard(layout, to.x, to.y)) {
    return true;
  }

  return layout.riverHazards.some((hazard) => segmentIntersectsExpandedRect(from, to, hazard, HAZARD_POINT_PADDING));
}

export function doesSegmentIntersectObstacle(layout: MatchLayout, from: Vector2, to: Vector2, padding = 0): boolean {
  return (layout.obstacleZones ?? []).some((obstacle) => segmentIntersectsExpandedRect(from, to, obstacle, padding));
}

function buildObstacleZones(
  extractZones: MatchLayoutExtractZone[],
  riverHazards: MatchLayoutRiverHazard[],
  safeCrossings: MatchLayoutSafeCrossing[]
): MatchLayoutObstacleZone[] {
  return OBSTACLE_ZONES.filter((obstacle) => {
    const center = rectCenter(obstacle);
    const blocksExtract = extractZones.some((zone) => distance(center, zone) < zone.radius + 210);
    const blocksCrossing = safeCrossings.some((crossing) => rectsOverlap(obstacle, crossing));
    const fullyInsideRiver = riverHazards.some((hazard) => rectContainsCircle(
      hazard,
      center.x,
      center.y,
      Math.min(obstacle.width, obstacle.height) * 0.35
    ));

    return !blocksExtract && !blocksCrossing && !fullyInsideRiver;
  }).map((obstacle) => ({ ...obstacle }));
}

function buildLandmarks(
  squadSpawns: MatchLayoutSpawnZone[],
  extractZones: MatchLayoutExtractZone[],
  chestZones: MatchLayoutChestZone[],
  safeCrossings: MatchLayoutSafeCrossing[]
): MatchLayoutLandmark[] {
  return [
    ...squadSpawns.map((spawn): MatchLayoutLandmark => ({
      landmarkId: `spawn_${spawn.squadId}`,
      x: spawn.anchorX,
      y: spawn.anchorY,
      label: spawn.deploymentLabel,
      kind: "spawn"
    })),
    ...chestZones.filter((zone) => zone.qualityTier === "rich").map((zone): MatchLayoutLandmark => ({
      landmarkId: `resource_${zone.chestId}`,
      x: zone.x,
      y: zone.y,
      label: "Rich Crate",
      kind: "resource"
    })),
    ...safeCrossings.map((crossing): MatchLayoutLandmark => ({
      landmarkId: `crossing_${crossing.crossingId}`,
      x: crossing.x + crossing.width / 2,
      y: crossing.y + crossing.height / 2,
      label: crossing.label,
      kind: "crossing"
    })),
    ...extractZones.map((zone): MatchLayoutLandmark => ({
      landmarkId: `extract_${zone.zoneId}`,
      x: zone.x,
      y: zone.y,
      label: "Return Fire",
      kind: "extract"
    }))
  ];
}

function buildExtractZone(zoneId: string, x: number, y: number): MatchLayoutExtractZone {
  return {
    zoneId,
    x,
    y,
    radius: EXTRACT_CENTER_RADIUS,
    openAtSec: EXTRACT_OPEN_SEC,
    channelDurationMs: EXTRACT_CHANNEL_DURATION_MS
  };
}

function pointInsideRiverHazardShape(
  layout: MatchLayout,
  hazard: MatchLayoutRiverHazard,
  x: number,
  y: number
): boolean {
  if (!pointInsideRiverHazardBounds(layout, hazard, x, y)) {
    return false;
  }

  if (isPointInsideSafeCrossing(layout, x, y)) {
    return false;
  }

  if (isPointInsideAnySafeZone(layout, x, y)) {
    return false;
  }

  return true;
}

function pointInsideRiverHazardBounds(
  layout: MatchLayout,
  hazard: MatchLayoutRiverHazard,
  x: number,
  y: number
): boolean {
  if (!pointInRect(x, y, hazard)) {
    return false;
  }

  return !layout.extractZones.some((zone) => distance(zone, { x, y }) < zone.radius + EXTRACT_CLEARANCE_PADDING);
}

function pointOnRing(radius: number, angleDeg: number): { x: number; y: number } {
  const radians = (angleDeg - 90) * Math.PI / 180;
  return {
    x: Math.round(MAP_CENTER_X + Math.cos(radians) * radius),
    y: Math.round(MAP_CENTER_Y + Math.sin(radians) * radius)
  };
}

function nodeIndexToAngle(nodeIndex: number): number {
  return nodeIndex * 30;
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) return { x: 0, y: 1 };
  return { x: vector.x / length, y: vector.y / length };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function rectContainsCircle(
  rect: { x: number; y: number; width: number; height: number },
  x: number,
  y: number,
  radius: number
): boolean {
  return x - radius >= rect.x
    && x + radius <= rect.x + rect.width
    && y - radius >= rect.y
    && y + radius <= rect.y + rect.height;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function rectCenter(rect: { x: number; y: number; width: number; height: number }): Vector2 {
  return {
    x: rect.x + (rect.width / 2),
    y: rect.y + (rect.height / 2)
  };
}

function segmentIntersectsExpandedRect(
  from: Vector2,
  to: Vector2,
  rect: { x: number; y: number; width: number; height: number },
  padding: number
): boolean {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };

  if (pointInRect(from.x, from.y, expanded) || pointInRect(to.x, to.y, expanded)) {
    return true;
  }

  const minX = expanded.x;
  const maxX = expanded.x + expanded.width;
  const minY = expanded.y;
  const maxY = expanded.y + expanded.height;

  return segmentIntersectsSegment(from, to, { x: minX, y: minY }, { x: maxX, y: minY })
    || segmentIntersectsSegment(from, to, { x: maxX, y: minY }, { x: maxX, y: maxY })
    || segmentIntersectsSegment(from, to, { x: maxX, y: maxY }, { x: minX, y: maxY })
    || segmentIntersectsSegment(from, to, { x: minX, y: maxY }, { x: minX, y: minY });
}

function segmentIntersectsSegment(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const d1 = cross(subtract(a2, a1), subtract(b1, a1));
  const d2 = cross(subtract(a2, a1), subtract(b2, a1));
  const d3 = cross(subtract(b2, b1), subtract(a1, b1));
  const d4 = cross(subtract(b2, b1), subtract(a2, b1));

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return (d1 === 0 && pointOnSegment(a1, b1, a2))
    || (d2 === 0 && pointOnSegment(a1, b2, a2))
    || (d3 === 0 && pointOnSegment(b1, a1, b2))
    || (d4 === 0 && pointOnSegment(b1, a2, b2));
}

function subtract(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

function pointOnSegment(a: Vector2, p: Vector2, b: Vector2): boolean {
  return p.x >= Math.min(a.x, b.x)
    && p.x <= Math.max(a.x, b.x)
    && p.y >= Math.min(a.y, b.y)
    && p.y <= Math.max(a.y, b.y);
}

function settleChestPoint(
  point: { x: number; y: number },
  hazards: MatchLayoutRiverHazard[],
  safeCrossings: MatchLayoutSafeCrossing[],
  preferredDirection?: Vector2
): { x: number; y: number } {
  let candidate = { ...point };
  const fallbackDirection = normalize({ x: candidate.x - MAP_CENTER_X, y: candidate.y - MAP_CENTER_Y });
  const baseDirection = preferredDirection ? normalize(preferredDirection) : fallbackDirection;
  const direction = baseDirection.x === 0 && baseDirection.y === 0 ? { x: 1, y: 0 } : baseDirection;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const inHazard = hazards.some((hazard) => pointInRect(candidate.x, candidate.y, hazard));
    const inCrossing = safeCrossings.some((crossing) => pointInRect(candidate.x, candidate.y, crossing));
    if (!inHazard || inCrossing) {
      return candidate;
    }

    candidate = {
      x: clamp(Math.round(candidate.x + direction.x * 84), 120, MATCH_MAP_WIDTH - 120),
      y: clamp(Math.round(candidate.y + direction.y * 84), 120, MATCH_MAP_HEIGHT - 120)
    };
  }

  return candidate;
}

function settleStarterChestPoint(options: {
  spawn: MatchLayoutSpawnZone;
  hazards: MatchLayoutRiverHazard[];
  safeCrossings: MatchLayoutSafeCrossing[];
  layout: MatchLayout;
}): { x: number; y: number } {
  const origin = { x: Math.round(options.spawn.anchorX), y: Math.round(options.spawn.anchorY) };
  const baseDirection = normalize(options.spawn.facing);
  const radii = [PERIPHERAL_CHEST_BASE_RADIUS, PERIPHERAL_CHEST_BASE_RADIUS - 24, PERIPHERAL_CHEST_BASE_RADIUS + 36, PERIPHERAL_CHEST_BASE_RADIUS + 72];
  const angleOffsets = [0, 20, -20, 40, -40, 60, -60, 80, -80, 100, -100, 120, -120, 140, -140, 160, -160, 180];

  for (const radius of radii) {
    for (const angleOffset of angleOffsets) {
      const direction = rotateVector(baseDirection, angleOffset);
      const candidate = settleChestPoint(
        {
          x: Math.round(origin.x + direction.x * radius),
          y: Math.round(origin.y + direction.y * radius)
        },
        options.hazards,
        options.safeCrossings,
        direction
      );
      if (!doesSegmentRequireSafeCrossing(options.layout, origin, candidate)) {
        return candidate;
      }
    }
  }

  return settleChestPoint(
    {
      x: Math.round(origin.x + baseDirection.x * PERIPHERAL_CHEST_BASE_RADIUS),
      y: Math.round(origin.y + baseDirection.y * PERIPHERAL_CHEST_BASE_RADIUS)
    },
    options.hazards,
    options.safeCrossings,
    baseDirection
  );
}

function buildChestZones(options: {
  squadSpawns: MatchLayoutSpawnZone[];
  layout: MatchLayout;
  hazards: MatchLayoutRiverHazard[];
  safeCrossings: MatchLayoutSafeCrossing[];
}): MatchLayoutChestZone[] {
  const chestZones: MatchLayoutChestZone[] = [];
  const outerCounts = distributeChestCounts(options.squadSpawns.length, PERIPHERAL_CHEST_TOTAL);

  options.squadSpawns.forEach((spawn, squadIndex) => {
    const count = outerCounts[squadIndex] ?? 0;
    for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
      const point = settlePeripheralChestPoint({
        spawn,
        slotIndex,
        slotCount: count,
        existing: chestZones,
        layout: options.layout,
        hazards: options.hazards,
        safeCrossings: options.safeCrossings
      });
      chestZones.push({
        chestId: `crate_${spawn.squadId}_${slotIndex + 1}`,
        x: point.x,
        y: point.y,
        kind: "abandoned_crate",
        lane: "abandoned",
        qualityTier: "normal",
        squadId: spawn.squadId
      });
    }
  });

  const richAngles = [-45, 45, 135, 225];
  for (let index = 0; index < RICH_CHEST_TOTAL; index += 1) {
    const point = settleRichChestPoint({
      baseAngle: richAngles[index % richAngles.length] ?? (index * 90),
      existing: chestZones,
      layout: options.layout,
      hazards: options.hazards,
      safeCrossings: options.safeCrossings
    });
    chestZones.push({
      chestId: `crate_rich_${index + 1}`,
      x: point.x,
      y: point.y,
      kind: "abandoned_crate",
      lane: "abandoned",
      qualityTier: "rich"
    });
  }

  return chestZones;
}

function settlePeripheralChestPoint(options: {
  spawn: MatchLayoutSpawnZone;
  slotIndex: number;
  slotCount: number;
  existing: MatchLayoutChestZone[];
  layout: MatchLayout;
  hazards: MatchLayoutRiverHazard[];
  safeCrossings: MatchLayoutSafeCrossing[];
}): { x: number; y: number } {
  const origin = { x: Math.round(options.spawn.anchorX), y: Math.round(options.spawn.anchorY) };
  const baseDirection = normalize(options.spawn.facing);
  const spread = options.slotCount <= 1 ? 0 : 120;
  const step = options.slotCount <= 1 ? 0 : spread / Math.max(options.slotCount - 1, 1);
  const centeredOffset = options.slotCount <= 1
    ? 0
    : -spread / 2 + (step * options.slotIndex);
  const angleOffsets = [centeredOffset, centeredOffset + 18, centeredOffset - 18, centeredOffset + 36, centeredOffset - 36, centeredOffset + 54, centeredOffset - 54];
  const radiusBase = PERIPHERAL_CHEST_BASE_RADIUS + (Math.floor(options.slotIndex / 3) * PERIPHERAL_CHEST_RADIUS_STEP);
  const radii = [radiusBase, radiusBase + 56, radiusBase + 112, radiusBase - 36, radiusBase + 168];

  for (const radius of radii) {
    for (const angleOffset of angleOffsets) {
      const direction = rotateVector(baseDirection, angleOffset);
      const candidate = settleChestPoint(
        {
          x: Math.round(origin.x + direction.x * radius),
          y: Math.round(origin.y + direction.y * radius)
        },
        options.hazards,
        options.safeCrossings,
        direction
      );
      if (isChestCandidateValid(options.layout, candidate, options.existing)) {
        return candidate;
      }
    }
  }

  return settleStarterChestPoint({
    spawn: options.spawn,
    hazards: options.hazards,
    safeCrossings: options.safeCrossings,
    layout: options.layout
  });
}

function settleRichChestPoint(options: {
  baseAngle: number;
  existing: MatchLayoutChestZone[];
  layout: MatchLayout;
  hazards: MatchLayoutRiverHazard[];
  safeCrossings: MatchLayoutSafeCrossing[];
}): { x: number; y: number } {
  const angleOffsets = [0, 12, -12, 24, -24, 36, -36];
  const radii = [RICH_CHEST_RING_RADIUS, RICH_CHEST_RING_RADIUS - 80, RICH_CHEST_RING_RADIUS + 80, RICH_CHEST_RING_RADIUS - 140];

  for (const radius of radii) {
    for (const angleOffset of angleOffsets) {
      const candidate = settleChestPoint(pointOnRing(radius, options.baseAngle + angleOffset), options.hazards, options.safeCrossings);
      if (isChestCandidateValid(options.layout, candidate, options.existing)) {
        return candidate;
      }
    }
  }

  return settleChestPoint(pointOnRing(RICH_CHEST_RING_RADIUS, options.baseAngle), options.hazards, options.safeCrossings);
}

function isChestCandidateValid(
  layout: MatchLayout,
  candidate: Vector2,
  existing: MatchLayoutChestZone[]
): boolean {
  if (isPointNearAnyExtractZone(layout, candidate.x, candidate.y, CHEST_EXTRACT_CLEARANCE)) {
    return false;
  }

  if (layout.squadSpawns.some((spawn) => distance({ x: spawn.anchorX, y: spawn.anchorY }, candidate) < CHEST_SPAWN_CLEARANCE)) {
    return false;
  }

  if (layout.safeCrossings.some((crossing) => pointInRect(candidate.x, candidate.y, crossing))) {
    return false;
  }

  if (layout.riverHazards.some((hazard) => pointInsideRiverHazardShape(layout, hazard, candidate.x, candidate.y))) {
    return false;
  }

  if ((layout.obstacleZones ?? []).some((obstacle) => pointInRect(candidate.x, candidate.y, {
    x: obstacle.x - 28,
    y: obstacle.y - 28,
    width: obstacle.width + 56,
    height: obstacle.height + 56
  }))) {
    return false;
  }

  return existing.every((zone) => distance(zone, candidate) >= CHEST_MIN_DISTANCE);
}

function distributeChestCounts(squadCount: number, total: number): number[] {
  if (squadCount <= 0) {
    return [];
  }

  const base = Math.floor(total / squadCount);
  const remainder = total % squadCount;
  return Array.from({ length: squadCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function rotateVector(vector: Vector2, angleDeg: number): Vector2 {
  const radians = angleDeg * Math.PI / 180;
  return {
    x: (vector.x * Math.cos(radians)) - (vector.y * Math.sin(radians)),
    y: (vector.x * Math.sin(radians)) + (vector.y * Math.cos(radians))
  };
}

export function getExtractClearRadius(zone: MatchLayoutExtractZone): number {
  return zone.radius + EXTRACT_CLEARANCE_PADDING;
}

export function getRiverVisualBands(layout: MatchLayout): MatchLayoutRiverHazard[] {
  return layout.riverHazards.filter((hazard) => {
    const crossingProtected = layout.safeCrossings.some((crossing) => {
      const padded = {
        x: crossing.x - CROSSING_HAZARD_PADDING,
        y: crossing.y - CROSSING_HAZARD_PADDING,
        width: crossing.width + CROSSING_HAZARD_PADDING * 2,
        height: crossing.height + CROSSING_HAZARD_PADDING * 2
      };
      return rectContainsCircle(padded, hazard.x + hazard.width / 2, hazard.y + hazard.height / 2, Math.min(hazard.width, hazard.height) * 0.22);
    });

    if (crossingProtected) {
      return true;
    }

    return !layout.extractZones.some((zone) => {
      const closestX = clamp(zone.x, hazard.x, hazard.x + hazard.width);
      const closestY = clamp(zone.y, hazard.y, hazard.y + hazard.height);
      return distance(zone, { x: closestX, y: closestY }) < getExtractClearRadius(zone);
    });
  });
}

function createSeededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    h ^= seed.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const next = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = next;
  }
  return values;
}

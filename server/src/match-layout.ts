import type {
  MatchLayout,
  MatchLayoutChestZone,
  MatchLayoutExtractZone,
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
const OUTER_RING_RADIUS = 880;
const MID_CHEST_RADIUS = 720;
const SAFE_RADIUS = 340;
const STARTER_CHEST_OFFSET = 260;
const RIVER_DAMAGE_PER_TICK = 3;
const RIVER_TICK_INTERVAL_MS = 500;
const HAZARD_POINT_PADDING = 110;
const EXTRACT_CLEARANCE_PADDING = 120;
const CROSSING_HAZARD_PADDING = 40;

const TEMPLATE_IDS = ["A", "B", "C"] as const;
const TEMPLATE_NODE_OFFSETS: Record<(typeof TEMPLATE_IDS)[number], number[]> = {
  A: [0, 3, 6, 9],
  B: [1, 4, 7, 10],
  C: [2, 5, 8, 11]
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

  const extractZones: MatchLayoutExtractZone[] = [buildExtractZone("extract_center")];

  const riverHazards: MatchLayoutRiverHazard[] = RIVER_SEGMENTS.map((segment) => ({
    ...segment,
    damagePerTick: RIVER_DAMAGE_PER_TICK,
    tickIntervalMs: RIVER_TICK_INTERVAL_MS
  }));

  const safeCrossings = SAFE_CROSSINGS.map((crossing) => ({ ...crossing }));

  const chestZones: MatchLayoutChestZone[] = [
    ...squadSpawns.map((spawn, index) => {
      const point = settleChestPoint(
        {
          x: Math.round(spawn.anchorX + spawn.facing.x * STARTER_CHEST_OFFSET),
          y: Math.round(spawn.anchorY + spawn.facing.y * STARTER_CHEST_OFFSET)
        },
        riverHazards,
        safeCrossings,
        spawn.facing
      );
      return {
        chestId: `starter_${index + 1}`,
        x: point.x,
        y: point.y,
        lane: "starter" as const,
        squadId: spawn.squadId
      };
    }),
    ...Array.from({ length: 6 }, (_, index) => {
      const angle = -90 + index * 60;
      const point = settleChestPoint(pointOnRing(MID_CHEST_RADIUS, angle), riverHazards, safeCrossings);
      return {
        chestId: `contested_${index + 1}`,
        x: point.x,
        y: point.y,
        lane: "contested" as const
      };
    })
  ];

  return {
    templateId,
    squadSpawns,
    extractZones,
    chestZones,
    safeZones,
    riverHazards,
    safeCrossings
  };
}

export function getSquadSpawnZone(layout: MatchLayout, squadId: SquadId): MatchLayoutSpawnZone {
  const zone = layout.squadSpawns.find((entry) => entry.squadId === squadId);
  if (!zone) {
    throw new Error(`Missing squad spawn zone for ${squadId}`);
  }
  return zone;
}

export function getStarterChestZone(layout: MatchLayout, squadId: SquadId): MatchLayoutChestZone | undefined {
  return layout.chestZones.find((entry) => entry.lane === "starter" && entry.squadId === squadId);
}

export function getNearestContestedChestZone(layout: MatchLayout, point: Vector2): MatchLayoutChestZone | undefined {
  return layout.chestZones
    .filter((entry) => entry.lane === "contested")
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

export function doesSegmentRequireSafeCrossing(layout: MatchLayout, from: Vector2, to: Vector2): boolean {
  if (isPointInsideRiverHazard(layout, from.x, from.y) || isPointInsideRiverHazard(layout, to.x, to.y)) {
    return true;
  }

  return layout.riverHazards.some((hazard) => segmentIntersectsExpandedRect(from, to, hazard, HAZARD_POINT_PADDING));
}

function buildExtractZone(zoneId: string): MatchLayoutExtractZone {
  return {
    zoneId,
    x: MAP_CENTER_X,
    y: MAP_CENTER_Y,
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

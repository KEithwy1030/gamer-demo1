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
const INNER_EXTRACT_RADIUS = 520;
const MID_CHEST_RADIUS = 720;
const SAFE_RADIUS = 340;
const STARTER_CHEST_OFFSET = 260;
const RIVER_WIDTH = 760;
const BRIDGE_WIDTH = 620;
const BRIDGE_HEIGHT = 320;
const RIVER_DAMAGE_PER_TICK = 3;
const RIVER_TICK_INTERVAL_MS = 500;

const TEMPLATE_IDS = ["A", "B", "C"] as const;
const TEMPLATE_NODE_OFFSETS: Record<(typeof TEMPLATE_IDS)[number], number[]> = {
  A: [0, 3, 6, 9],
  B: [1, 4, 7, 10],
  C: [2, 5, 8, 11]
};

const SQUAD_DEPLOY_LABELS: Record<number, string[]> = {
  0: ["���������", "���������", "�ϲ������", "���������"],
  1: ["���������", "���������", "���������", "���������"],
  2: ["ƫ�������", "ƫ�������", "ƫ�������", "ƫ�������"]
};

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

  nodeOffsets.forEach((nodeIndex, idx) => {
    const angle = nodeIndexToAngle(nodeIndex);
    const anchor = pointOnRing(OUTER_RING_RADIUS, angle);
    const facing = normalize({ x: MAP_CENTER_X - anchor.x, y: MAP_CENTER_Y - anchor.y });
    const squadId = shuffledSquads[idx] ?? options.squadIds[idx];
    const deploymentLabel = SQUAD_DEPLOY_LABELS[nodeOffsets[0] % 3][idx] ?? `������-${idx + 1}`;
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

  const templatePhase = nodeOffsets[0] * 30;
  const extractZones: MatchLayoutExtractZone[] = [
    buildExtractZone("extract_alpha", templatePhase + 45),
    buildExtractZone("extract_beta", templatePhase + 225)
  ];

  const chestZones: MatchLayoutChestZone[] = [
    ...squadSpawns.map((spawn, index) => ({
      chestId: `starter_${index + 1}`,
      x: Math.round(spawn.anchorX + spawn.facing.x * STARTER_CHEST_OFFSET),
      y: Math.round(spawn.anchorY + spawn.facing.y * STARTER_CHEST_OFFSET),
      lane: "starter" as const,
      squadId: spawn.squadId
    })),
    ...Array.from({ length: 6 }, (_, index) => {
      const angle = -90 + index * 60;
      const point = pointOnRing(MID_CHEST_RADIUS, angle);
      return {
        chestId: `contested_${index + 1}`,
        x: point.x,
        y: point.y,
        lane: "contested" as const
      };
    })
  ];

  const riverHazards: MatchLayoutRiverHazard[] = [{
    hazardId: "river_main",
    x: Math.round(MAP_CENTER_X - (RIVER_WIDTH / 2)),
    y: 0,
    width: RIVER_WIDTH,
    height: MATCH_MAP_HEIGHT,
    damagePerTick: RIVER_DAMAGE_PER_TICK,
    tickIntervalMs: RIVER_TICK_INTERVAL_MS
  }];

  const safeCrossings: MatchLayoutSafeCrossing[] = buildSafeCrossings();

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
    .sort((left, right) => (distance(from, rectCenter(left)) + distance(rectCenter(left), to)) - (distance(from, rectCenter(right)) + distance(rectCenter(right), to)))[0];
}

export function getRiverHazardAtPoint(layout: MatchLayout, x: number, y: number): MatchLayoutRiverHazard | undefined {
  return layout.riverHazards.find((hazard) => pointInRect(x, y, hazard));
}

function buildExtractZone(zoneId: string, angleDeg: number): MatchLayoutExtractZone {
  const point = pointOnRing(INNER_EXTRACT_RADIUS, angleDeg);
  return {
    zoneId,
    x: point.x,
    y: point.y,
    radius: EXTRACT_CENTER_RADIUS,
    openAtSec: EXTRACT_OPEN_SEC,
    channelDurationMs: EXTRACT_CHANNEL_DURATION_MS
  };
}

function buildSafeCrossings(): MatchLayoutSafeCrossing[] {
  return [
    {
      crossingId: "bridge_north",
      x: Math.round(MAP_CENTER_X - (BRIDGE_WIDTH / 2)),
      y: Math.round(MATCH_MAP_HEIGHT * 0.2),
      width: BRIDGE_WIDTH,
      height: BRIDGE_HEIGHT,
      label: "North Bridge"
    },
    {
      crossingId: "bridge_mid",
      x: Math.round(MAP_CENTER_X - (BRIDGE_WIDTH / 2)),
      y: Math.round(MAP_CENTER_Y - (BRIDGE_HEIGHT / 2)),
      width: BRIDGE_WIDTH,
      height: BRIDGE_HEIGHT,
      label: "Mid Bridge"
    },
    {
      crossingId: "bridge_south",
      x: Math.round(MAP_CENTER_X - (BRIDGE_WIDTH / 2)),
      y: Math.round(MATCH_MAP_HEIGHT * 0.8 - BRIDGE_HEIGHT),
      width: BRIDGE_WIDTH,
      height: BRIDGE_HEIGHT,
      label: "South Bridge"
    }
  ];
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

function rectCenter(rect: { x: number; y: number; width: number; height: number }): Vector2 {
  return {
    x: rect.x + (rect.width / 2),
    y: rect.y + (rect.height / 2)
  };
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

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const next = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = next;
  }
  return values;
}

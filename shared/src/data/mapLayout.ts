export type HazardZoneKind = "toxic_river" | "corpse_mire";

export interface HazardZone {
  id: string;
  kind: HazardZoneKind;
  label: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  dps: number;
}

export interface RiverBridge {
  id: string;
  x: number;
  y: number;
  safeRadius: number;
}

export interface ToxicRiverSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  halfWidth: number;
  dps: number;
}

export interface BattlefieldHotspot {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  normalWeight: number;
  eliteWeight: number;
}

const HAZARD_LAYOUTS = [
  { id: "mire_west", kind: "corpse_mire", label: "尸坑复苏带", xRatio: 0.2, yRatio: 0.3, radiusXRatio: 0.1, radiusYRatio: 0.08, dps: 10 },
  { id: "mire_east", kind: "corpse_mire", label: "尸坑复苏带", xRatio: 0.8, yRatio: 0.74, radiusXRatio: 0.1, radiusYRatio: 0.08, dps: 10 }
] as const;

const RIVER_PATH = [
  { xRatio: 0.9, yRatio: 0.06 },
  { xRatio: 0.87, yRatio: 0.14 },
  { xRatio: 0.84, yRatio: 0.23 },
  { xRatio: 0.81, yRatio: 0.33 },
  { xRatio: 0.79, yRatio: 0.43 },
  { xRatio: 0.76, yRatio: 0.54 },
  { xRatio: 0.73, yRatio: 0.66 },
  { xRatio: 0.69, yRatio: 0.79 },
  { xRatio: 0.64, yRatio: 0.94 }
] as const;

const BRIDGE_LAYOUTS = [
  { id: "bridge_north", xRatio: 0.835, yRatio: 0.25, safeRadiusRatio: 0.022 },
  { id: "bridge_mid", xRatio: 0.745, yRatio: 0.57, safeRadiusRatio: 0.026 }
] as const;

const HOTSPOT_LAYOUTS = [
  { id: "ridge", label: "拾荒者山脊", xRatio: 0.16, yRatio: 0.16, radiusRatio: 0.08, normalWeight: 7, eliteWeight: 1 },
  { id: "north_riverbank", label: "尸毒河南岸", xRatio: 0.76, yRatio: 0.16, radiusRatio: 0.07, normalWeight: 9, eliteWeight: 2 },
  { id: "relay", label: "中央中继站", xRatio: 0.5, yRatio: 0.44, radiusRatio: 0.09, normalWeight: 10, eliteWeight: 3 },
  { id: "cargo", label: "货运堆场", xRatio: 0.2, yRatio: 0.82, radiusRatio: 0.08, normalWeight: 7, eliteWeight: 1 },
  { id: "lowland", label: "破碎低地", xRatio: 0.82, yRatio: 0.82, radiusRatio: 0.08, normalWeight: 8, eliteWeight: 2 },
  { id: "mire", label: "复苏尸坑", xRatio: 0.62, yRatio: 0.62, radiusRatio: 0.08, normalWeight: 9, eliteWeight: 2 }
] as const;

export function getHazardZones(width: number, height: number): HazardZone[] {
  return HAZARD_LAYOUTS.map((zone) => ({
    id: zone.id,
    kind: zone.kind,
    label: zone.label,
    x: width * zone.xRatio,
    y: height * zone.yRatio,
    radiusX: width * zone.radiusXRatio,
    radiusY: height * zone.radiusYRatio,
    dps: zone.dps
  }));
}

export function getToxicRiverSegments(width: number, height: number): ToxicRiverSegment[] {
  const halfWidth = Math.min(width, height) * 0.018;
  const dps = 18;
  const points = RIVER_PATH.map((point) => ({
    x: width * point.xRatio,
    y: height * point.yRatio
  }));

  const segments: ToxicRiverSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push({
      id: `river_${index + 1}`,
      x1: points[index].x,
      y1: points[index].y,
      x2: points[index + 1].x,
      y2: points[index + 1].y,
      halfWidth,
      dps
    });
  }

  return segments;
}

export function getRiverBridges(width: number, height: number): RiverBridge[] {
  const minSide = Math.min(width, height);
  return BRIDGE_LAYOUTS.map((bridge) => ({
    id: bridge.id,
    x: width * bridge.xRatio,
    y: height * bridge.yRatio,
    safeRadius: minSide * bridge.safeRadiusRatio
  }));
}

export function getBattlefieldHotspots(width: number, height: number): BattlefieldHotspot[] {
  const minSide = Math.min(width, height);
  return HOTSPOT_LAYOUTS.map((spot) => ({
    id: spot.id,
    label: spot.label,
    x: width * spot.xRatio,
    y: height * spot.yRatio,
    radius: minSide * spot.radiusRatio,
    normalWeight: spot.normalWeight,
    eliteWeight: spot.eliteWeight
  }));
}

export function findHazardZoneAtPosition(width: number, height: number, x: number, y: number): HazardZone | undefined {
  const bridge = getRiverBridges(width, height).find((entry) => {
    const dx = x - entry.x;
    const dy = y - entry.y;
    return (dx * dx) + (dy * dy) <= entry.safeRadius * entry.safeRadius;
  });
  if (!bridge) {
    for (const segment of getToxicRiverSegments(width, height)) {
      const distance = distancePointToSegment(x, y, segment.x1, segment.y1, segment.x2, segment.y2);
      if (distance <= segment.halfWidth) {
        return {
          id: segment.id,
          kind: "toxic_river",
          label: "尸毒溶河",
          x: (segment.x1 + segment.x2) / 2,
          y: (segment.y1 + segment.y2) / 2,
          radiusX: segment.halfWidth,
          radiusY: segment.halfWidth,
          dps: segment.dps
        };
      }
    }
  }

  for (const zone of getHazardZones(width, height)) {
    const normalizedX = (x - zone.x) / Math.max(zone.radiusX, 1);
    const normalizedY = (y - zone.y) / Math.max(zone.radiusY, 1);
    if ((normalizedX * normalizedX) + (normalizedY * normalizedY) <= 1) {
      return zone;
    }
  }

  return undefined;
}

function distancePointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSq = (abx * abx) + (aby * aby);
  if (abLengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, (((px - ax) * abx) + ((py - ay) * aby)) / abLengthSq));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(px - closestX, py - closestY);
}

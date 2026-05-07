import type { MatchLayout, MatchLayoutExtractZone, MatchLayoutRiverHazard, MatchLayoutSafeCrossing } from "@gamer/shared";

export interface RiverPlanNode {
  hazardId: string;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export interface RiverFlowStroke {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  shorelineWidth: number;
  bodyWidth: number;
  highlightWidth: number;
}

export interface RiverRippleLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RiverCrossingAccent {
  crossingId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "ford" | "bridge" | "plaza";
}

export interface RiverVisualPlan {
  nodes: RiverPlanNode[];
  flowStrokes: RiverFlowStroke[];
  rippleLines: RiverRippleLine[];
  shoals: Array<{ x: number; y: number; radiusX: number; radiusY: number }>;
  shorelinePatches: Array<{ x: number; y: number; radiusX: number; radiusY: number }>;
  crossingAccents: RiverCrossingAccent[];
}

export function buildRiverVisualPlan(layout: Pick<MatchLayout, "riverHazards" | "safeCrossings" | "extractZones">): RiverVisualPlan {
  const hazards = layout.riverHazards ?? [];
  const safeCrossings = layout.safeCrossings ?? [];
  const extractZones = layout.extractZones ?? [];

  const nodes = hazards
    .filter((hazard) => !intersectsExtractClearRadius(hazard, extractZones, 120))
    .map((hazard) => toNode(hazard));

  const flowStrokes: RiverFlowStroke[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const minRadius = Math.min(from.radiusX, from.radiusY, to.radiusX, to.radiusY);
    flowStrokes.push({
      fromX: from.centerX,
      fromY: from.centerY,
      toX: to.centerX,
      toY: to.centerY,
      shorelineWidth: Math.max(minRadius * 2.2, 220),
      bodyWidth: Math.max(minRadius * 1.58, 150),
      highlightWidth: Math.max(minRadius * 0.5, 34)
    });
  }

  const rippleLines = nodes.flatMap((node) => buildRippleLines(node));
  const shorelinePatches = nodes.map((node) => ({
    x: node.centerX,
    y: node.centerY,
    radiusX: node.radiusX * 1.14,
    radiusY: node.radiusY * 1.18
  }));
  const shoals = safeCrossings.flatMap((crossing) => buildCrossingShoals(crossing));
  const crossingAccents: RiverCrossingAccent[] = safeCrossings.map((crossing) => ({
    crossingId: crossing.crossingId,
    x: crossing.x,
    y: crossing.y,
    width: crossing.width,
    height: crossing.height,
    kind: crossing.crossingId === "extract_plaza"
      ? "plaza"
      : crossing.crossingId.includes("ford")
        ? "ford"
        : "bridge"
  }));

  return {
    nodes,
    flowStrokes,
    rippleLines,
    shoals,
    shorelinePatches,
    crossingAccents
  };
}

function toNode(hazard: MatchLayoutRiverHazard): RiverPlanNode {
  return {
    hazardId: hazard.hazardId,
    centerX: hazard.x + hazard.width / 2,
    centerY: hazard.y + hazard.height / 2,
    radiusX: Math.max(hazard.width * 0.44, 148),
    radiusY: Math.max(hazard.height * 0.44, 148)
  };
}

function buildRippleLines(node: RiverPlanNode): RiverRippleLine[] {
  const lines: RiverRippleLine[] = [];
  const step = Math.max(34, node.radiusY * 0.22);
  for (let offset = -node.radiusY * 0.6; offset <= node.radiusY * 0.6; offset += step) {
    lines.push({
      x1: node.centerX - node.radiusX * 0.48,
      y1: node.centerY + offset,
      x2: node.centerX + node.radiusX * 0.42,
      y2: node.centerY + offset * 0.72
    });
  }
  return lines;
}

function buildCrossingShoals(crossing: MatchLayoutSafeCrossing): Array<{ x: number; y: number; radiusX: number; radiusY: number }> {
  const centerX = crossing.x + crossing.width / 2;
  const centerY = crossing.y + crossing.height / 2;
  const radiusX = Math.max(crossing.width * 0.44, 78);
  const radiusY = Math.max(crossing.height * 0.54, 64);
  return [
    { x: centerX, y: centerY, radiusX, radiusY },
    { x: centerX - crossing.width * 0.34, y: centerY - crossing.height * 0.14, radiusX: radiusX * 0.42, radiusY: radiusY * 0.32 },
    { x: centerX + crossing.width * 0.34, y: centerY + crossing.height * 0.14, radiusX: radiusX * 0.42, radiusY: radiusY * 0.32 }
  ];
}

function intersectsExtractClearRadius(
  hazard: MatchLayoutRiverHazard,
  extractZones: MatchLayoutExtractZone[],
  clearancePadding: number
): boolean {
  return extractZones.some((zone) => {
    const closestX = clamp(zone.x, hazard.x, hazard.x + hazard.width);
    const closestY = clamp(zone.y, hazard.y, hazard.y + hazard.height);
    return Math.hypot(zone.x - closestX, zone.y - closestY) < zone.radius + clearancePadding;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

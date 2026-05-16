import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { ExtractUiState } from "../createGameClient";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";
import { buildRiverVisualPlan } from "./riverVisualPlan";

const EXTRACT_VISUAL_CLEARANCE_PADDING = 72;
const EXTRACT_HINT_LABEL_OFFSET = 34;

export interface WorldBackdropRefs {
  terrainLayer?: Phaser.GameObjects.TileSprite;
  detailLayer?: Phaser.GameObjects.Graphics;
  riverLayer?: Phaser.GameObjects.Graphics;
  atmosphereLayer?: Phaser.GameObjects.Graphics;
  extractOuterRing?: Phaser.GameObjects.Arc;
  extractInnerRing?: Phaser.GameObjects.Arc;
  extractBeacon?: Phaser.GameObjects.Container;
  extractLabel?: Phaser.GameObjects.Text;
  crossingSprites: Phaser.GameObjects.GameObject[];
  regionLabels: Phaser.GameObjects.Text[];
}

export function createWorldBackdropRefs(): WorldBackdropRefs {
  return {
    crossingSprites: [],
    regionLabels: []
  };
}

export function rebuildWorldBackdrop(
  scene: Phaser.Scene,
  refs: WorldBackdropRefs,
  state: MatchViewState
): WorldBackdropRefs {
  refs.terrainLayer?.destroy();
  refs.detailLayer?.destroy();
  refs.riverLayer?.destroy();
  refs.atmosphereLayer?.destroy();
  refs.extractOuterRing?.destroy();
  refs.extractInnerRing?.destroy();
  refs.extractBeacon?.destroy(true);
  refs.extractLabel?.destroy();
  refs.crossingSprites.forEach((sprite) => sprite.destroy());
  refs.regionLabels.forEach((label) => label.destroy());

  const width = state.width;
  const height = state.height;
  const centerX = width / 2;
  const centerY = height / 2;

  const terrainLayer = scene.add.tileSprite(centerX, centerY, width, height, "terrain_wasteland");
  terrainLayer.setDepth(-40);

  const detailLayer = scene.add.graphics();
  detailLayer.setDepth(-35);
  detailLayer.fillStyle(0x2a2118, 0.2);
  detailLayer.fillCircle(centerX, centerY, 260);
  detailLayer.lineStyle(8, GAMEPLAY_THEME.colors.iron900, 0.5);
  detailLayer.strokeCircle(centerX, centerY, 252);
  detailLayer.lineStyle(3, GAMEPLAY_THEME.colors.signal, 0.16);
  detailLayer.strokeCircle(centerX, centerY, 154);
  drawMapObstacles(detailLayer, state);

  const riverLayer = scene.add.graphics();
  riverLayer.setDepth(-33);
  drawCorpseRiver(detailLayer, riverLayer, state);
  const crossingSprites = drawSafeCrossings(scene, state);

  const atmosphereLayer = scene.add.graphics();
  atmosphereLayer.setDepth(-10);
  drawCorpseFogAtmosphere(atmosphereLayer, state, width, height);

  return {
    terrainLayer,
    detailLayer,
    riverLayer,
    atmosphereLayer,
    extractOuterRing: undefined,
    extractInnerRing: undefined,
    extractBeacon: undefined,
    extractLabel: undefined,
    crossingSprites,
    regionLabels: [
      createRegionLabel(scene, width * 0.18, height * 0.16, "拾荒者山脊"),
      createRegionLabel(scene, width * 0.82, height * 0.15, "尸毒溶河"),
      createRegionLabel(scene, centerX, centerY - 182, "归营石阵"),
      createRegionLabel(scene, width * 0.18, height * 0.84, "货运堆场"),
      createRegionLabel(scene, width * 0.84, height * 0.84, "破碎洼地")
    ]
  };
}

export function syncExtractBackdrop(
  scene: Phaser.Scene,
  refs: WorldBackdropRefs,
  state: MatchViewState,
  extractState: ExtractUiState
): WorldBackdropRefs {
  const centerX = extractState.x ?? state.layout?.extractZones[0]?.x ?? state.width / 2;
  const centerY = extractState.y ?? state.layout?.extractZones[0]?.y ?? state.height / 2;
  const zoneRadius = extractState.radius ?? state.layout?.extractZones[0]?.radius ?? 126;
  const outerRadius = Math.max(zoneRadius + 14, 112);
  const innerRadius = Math.max(zoneRadius - 18, 46);
  const hintAlpha = extractState.isOpen ? 0.07 : 0.1;
  const ringAlpha = extractState.isOpen ? 0.24 : 0.18;
  const labelX = Math.max(92, centerX - outerRadius - EXTRACT_HINT_LABEL_OFFSET);
  const labelY = Math.min(state.height - 42, centerY + outerRadius * 0.18);

  const extractOuterRing = refs.extractOuterRing
    ?? scene.add.circle(centerX, centerY, outerRadius, GAMEPLAY_THEME.colors.signal, hintAlpha)
      .setStrokeStyle(8, GAMEPLAY_THEME.colors.accent, ringAlpha)
      .setDepth(-6);
  extractOuterRing.setPosition(centerX, centerY);
  extractOuterRing.setRadius(outerRadius);
  extractOuterRing.setFillStyle(GAMEPLAY_THEME.colors.signal, hintAlpha);
  extractOuterRing.setStrokeStyle(8, GAMEPLAY_THEME.colors.accent, ringAlpha);

  const extractInnerRing = refs.extractInnerRing
    ?? scene.add.circle(centerX, centerY, innerRadius, GAMEPLAY_THEME.colors.signal, hintAlpha * 0.7)
      .setStrokeStyle(3, GAMEPLAY_THEME.colors.bone, ringAlpha * 0.82)
      .setDepth(-5);
  extractInnerRing.setPosition(centerX, centerY);
  extractInnerRing.setRadius(innerRadius);
  extractInnerRing.setFillStyle(GAMEPLAY_THEME.colors.signal, hintAlpha * 0.7);
  extractInnerRing.setStrokeStyle(3, GAMEPLAY_THEME.colors.bone, ringAlpha * 0.82);

  const extractBeacon = refs.extractBeacon ?? createExtractBeacon(scene, centerX, centerY);
  extractBeacon.setPosition(centerX, centerY - 14);
  extractBeacon.setAlpha(extractState.isOpen ? 0.84 : 0.72);

  const extractLabel = refs.extractLabel
    ?? scene.add.text(centerX, centerY + 126, "归营石阵", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "17px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 5
    }).setOrigin(1, 0.5).setDepth(-4);
  const members = extractState.squadStatus?.members ?? [];
  const aliveMembers = members.filter((member) => member.isAlive && !member.isSettled);
  const insideCount = aliveMembers.filter((member) => member.isInsideZone).length;
  extractLabel.setText(
    extractState.isOpen
      ? `队伍归营火 ${insideCount}/${aliveMembers.length || 0}`
      : "归营火未点燃"
  );
  extractLabel.setPosition(labelX, labelY);
  extractLabel.setAlpha(extractState.isOpen ? 0.88 : 0.72);
  extractLabel.setWordWrapWidth(240, true);

  return {
    ...refs,
    extractOuterRing,
    extractInnerRing,
    extractBeacon,
    extractLabel
  };
}

function drawCorpseRiver(
  detailLayer: Phaser.GameObjects.Graphics,
  riverLayer: Phaser.GameObjects.Graphics,
  state: MatchViewState
): void {
  const hazards = state.layout?.riverHazards ?? [];
  if (hazards.length === 0) return;

  const extractZone = state.layout?.extractZones[0];
  const plan = buildRiverVisualPlan({
    riverHazards: hazards,
    safeCrossings: state.layout?.safeCrossings ?? [],
    extractZones: state.layout?.extractZones ?? []
  });

  detailLayer.fillStyle(0x2d3423, 0.05);
  detailLayer.lineStyle(0, 0, 0);
  for (const stroke of plan.flowStrokes) {
    detailLayer.lineStyle(stroke.shorelineWidth, 0x201b14, 0.34);
    detailLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
    detailLayer.lineStyle(stroke.shorelineWidth * 0.82, 0x463224, 0.16);
    detailLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
  }
  for (const patch of plan.shorelinePatches) {
    detailLayer.fillStyle(0x271f17, 0.32);
    detailLayer.fillEllipse(patch.x, patch.y, patch.radiusX * 2.1, patch.radiusY * 2.15);
    detailLayer.lineStyle(10, 0x514536, 0.18);
    detailLayer.strokeEllipse(patch.x, patch.y, patch.radiusX * 1.86, patch.radiusY * 1.92);
  }
  for (const patch of plan.bankSoftnessPatches) {
    drawRotatedPatch(detailLayer, patch, 0x4b3f2e);
  }
  for (const patch of plan.bankShadowPatches) {
    drawRotatedPatch(detailLayer, patch, 0x17120d);
  }
  for (const patch of plan.debrisPatches) {
    drawRotatedPatch(detailLayer, patch, 0x66543a);
    detailLayer.lineStyle(2, 0x231b14, patch.alpha * 0.7);
    detailLayer.strokeEllipse(patch.x, patch.y, patch.radiusX * 1.18, patch.radiusY * 1.16);
  }

  for (const stroke of plan.flowStrokes) {
    riverLayer.lineStyle(stroke.bodyWidth * 1.12, 0x1a261f, 0.36);
    riverLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
    riverLayer.lineStyle(stroke.bodyWidth, 0x24332a, 0.64);
    riverLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
    riverLayer.lineStyle(stroke.bodyWidth * 0.8, 0x51653f, 0.34);
    riverLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
    riverLayer.lineStyle(stroke.bodyWidth * 0.38, 0x7b6e3f, 0.14);
    riverLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
    riverLayer.lineStyle(stroke.highlightWidth, 0xc4bb83, 0.12);
    riverLayer.lineBetween(stroke.fromX, stroke.fromY, stroke.toX, stroke.toY);
  }

  for (const node of plan.nodes) {
    riverLayer.fillStyle(0x1f2920, 0.82);
    riverLayer.fillEllipse(node.centerX, node.centerY, node.radiusX * 1.78, node.radiusY * 1.82);
    riverLayer.fillStyle(0x3d4d2d, 0.32);
    riverLayer.fillEllipse(node.centerX, node.centerY, node.radiusX * 1.36, node.radiusY * 1.4);
    riverLayer.fillStyle(0x716038, 0.14);
    riverLayer.fillEllipse(node.centerX + node.radiusX * 0.08, node.centerY - node.radiusY * 0.06, node.radiusX * 0.92, node.radiusY * 0.56);
    riverLayer.fillStyle(0x131913, 0.28);
    riverLayer.fillEllipse(node.centerX - node.radiusX * 0.12, node.centerY + node.radiusY * 0.08, node.radiusX * 0.86, node.radiusY * 0.72);
    riverLayer.lineStyle(8, 0x9aa76f, 0.12);
    riverLayer.strokeEllipse(node.centerX, node.centerY, node.radiusX * 1.22, node.radiusY * 1.26);
  }

  for (const patch of plan.contaminationPatches) {
    riverLayer.save();
    riverLayer.translateCanvas(patch.x, patch.y);
    riverLayer.rotateCanvas(patch.rotation);
    riverLayer.fillStyle(0x7c763f, patch.alpha);
    riverLayer.fillEllipse(0, 0, patch.radiusX * 2, patch.radiusY * 2);
    riverLayer.fillStyle(0x2d2f17, patch.alpha * 0.65);
    riverLayer.fillEllipse(patch.radiusX * 0.12, -patch.radiusY * 0.04, patch.radiusX * 1.24, patch.radiusY * 1.1);
    riverLayer.restore();
  }

  for (const slick of plan.corpseSlicks) {
    riverLayer.save();
    riverLayer.translateCanvas(slick.x, slick.y);
    riverLayer.rotateCanvas(slick.rotation);
    riverLayer.fillStyle(0x5b1c16, slick.alpha);
    riverLayer.fillEllipse(0, 0, slick.radiusX * 2, slick.radiusY * 2);
    riverLayer.fillStyle(0x20120e, slick.alpha * 0.82);
    riverLayer.fillEllipse(slick.radiusX * 0.18, slick.radiusY * 0.08, slick.radiusX * 1.24, slick.radiusY * 1.2);
    riverLayer.lineStyle(2, 0x8f7a54, slick.alpha * 0.36);
    riverLayer.strokeEllipse(0, 0, slick.radiusX * 1.54, slick.radiusY * 1.42);
    riverLayer.restore();
  }

  for (const foam of plan.foamPatches) {
    riverLayer.fillStyle(0xb7b17c, foam.alpha);
    riverLayer.fillEllipse(foam.x, foam.y, foam.radiusX * 2, foam.radiusY * 2);
    riverLayer.lineStyle(2, 0xd6cf9c, foam.alpha * 0.75);
    riverLayer.strokeEllipse(foam.x, foam.y, foam.radiusX * 1.62, foam.radiusY * 1.4);
  }

  riverLayer.lineStyle(3, 0xb7b17c, 0.12);
  for (const ripple of plan.rippleLines) {
    riverLayer.lineBetween(ripple.x1, ripple.y1, ripple.x2, ripple.y2);
  }

  for (const shoal of plan.shoals) {
    riverLayer.fillStyle(0xd1c39a, 0.12);
    riverLayer.fillEllipse(shoal.x, shoal.y, shoal.radiusX * 2, shoal.radiusY * 2);
    riverLayer.lineStyle(5, 0xe3d4ac, 0.1);
    riverLayer.strokeEllipse(shoal.x, shoal.y, shoal.radiusX * 1.44, shoal.radiusY * 1.44);
  }

  for (const accent of plan.crossingAccents) {
    const cx = accent.x + accent.width / 2;
    const cy = accent.y + accent.height / 2;
    if (accent.kind === "ford") {
      riverLayer.lineStyle(6, 0xe6ddbc, 0.08);
      riverLayer.lineBetween(accent.x + 14, cy - accent.height * 0.1, accent.x + accent.width - 14, cy + accent.height * 0.08);
      riverLayer.lineBetween(accent.x + 22, cy + accent.height * 0.16, accent.x + accent.width - 22, cy + accent.height * 0.3);
      continue;
    }

    if (accent.kind === "bridge") {
      riverLayer.lineStyle(8, 0xebe0b8, 0.09);
      riverLayer.lineBetween(cx, accent.y - 10, cx, accent.y + accent.height + 10);
      riverLayer.lineStyle(4, 0xc5b690, 0.08);
      riverLayer.lineBetween(cx - accent.width * 0.18, accent.y, cx - accent.width * 0.18, accent.y + accent.height);
      riverLayer.lineBetween(cx + accent.width * 0.18, accent.y, cx + accent.width * 0.18, accent.y + accent.height);
    }
  }

  if (extractZone) {
    detailLayer.fillStyle(0x2a2118, 0.12);
    detailLayer.fillCircle(extractZone.x, extractZone.y, extractZone.radius + EXTRACT_VISUAL_CLEARANCE_PADDING);
    detailLayer.lineStyle(6, GAMEPLAY_THEME.colors.iron900, 0.2);
    detailLayer.strokeCircle(extractZone.x, extractZone.y, extractZone.radius + EXTRACT_VISUAL_CLEARANCE_PADDING - 6);
  }
}

function drawCorpseFogAtmosphere(
  atmosphereLayer: Phaser.GameObjects.Graphics,
  state: MatchViewState,
  width: number,
  height: number
): void {
  atmosphereLayer.fillGradientStyle(0x0d0b08, 0x0d0b08, 0x0d0b08, 0x0d0b08, 0.06, 0.04, 0.18, 0.24);
  atmosphereLayer.fillRect(0, 0, width, height);

  const hazards = state.layout?.riverHazards ?? [];
  if (hazards.length === 0) {
    return;
  }

  const plan = buildRiverVisualPlan({
    riverHazards: hazards,
    safeCrossings: state.layout?.safeCrossings ?? [],
    extractZones: state.layout?.extractZones ?? []
  });

  for (const veil of plan.fogVeils) {
    atmosphereLayer.fillStyle(0x65704b, veil.alpha);
    atmosphereLayer.fillEllipse(veil.x, veil.y, veil.radiusX * 2, veil.radiusY * 2);
  }

  for (const drift of plan.fogDriftPatches) {
    atmosphereLayer.save();
    atmosphereLayer.translateCanvas(drift.x, drift.y);
    atmosphereLayer.rotateCanvas(drift.rotation);
    atmosphereLayer.fillStyle(0x7f8052, drift.alpha);
    atmosphereLayer.fillEllipse(0, 0, drift.radiusX * 2, drift.radiusY * 2);
    atmosphereLayer.fillStyle(0x3f4731, drift.alpha * 0.72);
    atmosphereLayer.fillEllipse(drift.radiusX * 0.18, -drift.radiusY * 0.08, drift.radiusX * 1.18, drift.radiusY * 0.92);
    atmosphereLayer.restore();
  }

  for (const edge of plan.fogEdgePatches) {
    atmosphereLayer.save();
    atmosphereLayer.translateCanvas(edge.x, edge.y);
    atmosphereLayer.rotateCanvas(edge.rotation);
    atmosphereLayer.fillStyle(0x23281a, edge.alpha);
    atmosphereLayer.fillEllipse(0, 0, edge.radiusX * 2.1, edge.radiusY * 2);
    atmosphereLayer.lineStyle(3, 0x94925b, edge.alpha * 0.35);
    atmosphereLayer.strokeEllipse(0, 0, edge.radiusX * 1.68, edge.radiusY * 1.42);
    atmosphereLayer.restore();
  }
}

function drawRotatedPatch(
  layer: Phaser.GameObjects.Graphics,
  patch: { x: number; y: number; radiusX: number; radiusY: number; alpha: number; rotation: number },
  color: number
): void {
  layer.save();
  layer.translateCanvas(patch.x, patch.y);
  layer.rotateCanvas(patch.rotation);
  layer.fillStyle(color, patch.alpha);
  layer.fillEllipse(0, 0, patch.radiusX * 2, patch.radiusY * 2);
  layer.restore();
}

function drawSafeCrossings(scene: Phaser.Scene, state: MatchViewState): Phaser.GameObjects.GameObject[] {
  const crossings = state.layout?.safeCrossings ?? [];
  return crossings.map((crossing) => {
    const graphics = scene.add.graphics();
    graphics.setDepth(-30);

    if (crossing.crossingId === "extract_plaza") {
      const cx = crossing.x + crossing.width / 2;
      const cy = crossing.y + crossing.height / 2;
      graphics.fillStyle(0x2a2118, 0.16);
      graphics.fillCircle(cx, cy, 270);
      graphics.lineStyle(18, 0xb7c0c7, 0.16);
      graphics.strokeCircle(cx, cy, 236);
      graphics.lineStyle(5, GAMEPLAY_THEME.colors.bone, 0.18);
      graphics.strokeCircle(cx, cy, 156);
      return graphics;
    }

    const isFord = crossing.crossingId.includes("ford");
    const padX = isFord ? Math.min(52, crossing.width * 0.1) : Math.min(86, crossing.width * 0.12);
    const padY = isFord ? Math.min(44, crossing.height * 0.12) : Math.min(64, crossing.height * 0.2);
    const x = crossing.x + padX;
    const y = crossing.y + padY;
    const width = crossing.width - padX * 2;
    const height = crossing.height - padY * 2;

    if (isFord) {
      graphics.fillStyle(0x8b7e57, 0.42);
      graphics.fillRoundedRect(x, y, width, height, 28);
      graphics.lineStyle(4, 0xc9ba88, 0.24);
      graphics.strokeRoundedRect(x, y, width, height, 28);
      graphics.lineStyle(2, 0x6e6548, 0.22);
      for (let offset = 18; offset < height; offset += 26) {
        graphics.lineBetween(x + 22, y + offset, x + width - 22, y + offset + 8);
      }
      return graphics;
    }

    graphics.fillStyle(0x5b5346, 0.58);
    graphics.fillRoundedRect(x, y, width, height, 14);
    graphics.lineStyle(5, 0xd4b24c, 0.3);
    graphics.strokeRoundedRect(x, y, width, height, 14);
    graphics.lineStyle(2, 0x16130f, 0.18);
    for (let offset = 56; offset < width; offset += 72) {
      graphics.lineBetween(x + offset, y + 12, x + offset - 20, y + height - 12);
    }
    return graphics;
  });
}

function drawMapObstacles(
  detailLayer: Phaser.GameObjects.Graphics,
  state: MatchViewState
): void {
  const obstacles = state.layout?.obstacleZones ?? [];
  for (const obstacle of obstacles) {
    const cx = obstacle.x + obstacle.width / 2;
    const cy = obstacle.y + obstacle.height / 2;
    const radius = Math.min(18, Math.min(obstacle.width, obstacle.height) * 0.16);

    detailLayer.fillStyle(0x14100c, 0.22);
    detailLayer.fillRoundedRect(obstacle.x + 12, obstacle.y + 16, obstacle.width, obstacle.height, radius);

    switch (obstacle.kind) {
      case "wall":
        detailLayer.fillStyle(0x4d4638, 0.62);
        detailLayer.fillRoundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, radius);
        detailLayer.lineStyle(5, 0x9f8f66, 0.18);
        detailLayer.strokeRoundedRect(obstacle.x + 4, obstacle.y + 4, obstacle.width - 8, obstacle.height - 8, radius);
        drawObstacleRibs(detailLayer, obstacle, obstacle.width > obstacle.height ? "horizontal" : "vertical");
        break;
      case "barricade":
        detailLayer.fillStyle(0x5c3324, 0.58);
        detailLayer.fillRoundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, radius);
        detailLayer.lineStyle(4, 0xd2a35c, 0.16);
        detailLayer.strokeRoundedRect(obstacle.x + 3, obstacle.y + 3, obstacle.width - 6, obstacle.height - 6, radius);
        drawObstacleRibs(detailLayer, obstacle, obstacle.width > obstacle.height ? "horizontal" : "vertical");
        break;
      case "wreckage":
        detailLayer.fillStyle(0x654d34, 0.44);
        detailLayer.fillEllipse(cx, cy, obstacle.width * 0.72, obstacle.height * 0.72);
        detailLayer.fillStyle(0x2b2118, 0.42);
        detailLayer.fillRoundedRect(obstacle.x + obstacle.width * 0.18, obstacle.y + obstacle.height * 0.22, obstacle.width * 0.64, obstacle.height * 0.42, radius);
        detailLayer.lineStyle(3, 0xb4935b, 0.16);
        detailLayer.strokeEllipse(cx, cy, obstacle.width * 0.62, obstacle.height * 0.58);
        break;
      case "ruin":
      default:
        detailLayer.fillStyle(0x3b352c, 0.56);
        detailLayer.fillRoundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, radius);
        detailLayer.fillStyle(0x746246, 0.32);
        detailLayer.fillRoundedRect(obstacle.x + 18, obstacle.y + 14, obstacle.width * 0.44, obstacle.height * 0.36, radius * 0.7);
        detailLayer.lineStyle(6, 0x16130f, 0.2);
        detailLayer.strokeRoundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, radius);
        break;
    }
  }
}

function drawObstacleRibs(
  detailLayer: Phaser.GameObjects.Graphics,
  obstacle: { x: number; y: number; width: number; height: number },
  direction: "horizontal" | "vertical"
): void {
  detailLayer.lineStyle(3, 0x1b1510, 0.22);
  if (direction === "horizontal") {
    for (let x = obstacle.x + 54; x < obstacle.x + obstacle.width - 24; x += 74) {
      detailLayer.lineBetween(x, obstacle.y + 10, x - 22, obstacle.y + obstacle.height - 12);
    }
    return;
  }

  for (let y = obstacle.y + 54; y < obstacle.y + obstacle.height - 24; y += 74) {
    detailLayer.lineBetween(obstacle.x + 10, y, obstacle.x + obstacle.width - 12, y - 22);
  }
}

function createRegionLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string
): Phaser.GameObjects.Text {
  const label = scene.add.text(x, y, text, {
    fontFamily: GAMEPLAY_THEME.fonts.display,
    fontSize: "22px",
    color: "#e8dfc8",
    stroke: "#16130f",
    strokeThickness: 8
  });
  label.setOrigin(0.5).setAlpha(0.34).setDepth(-11);
  return label;
}

function createExtractBeacon(
  scene: Phaser.Scene,
  x: number,
  y: number
): Phaser.GameObjects.Container {
  const beacon = scene.add.container(x, y - 8);
  beacon.setDepth(-4);
  const glow = scene.add.circle(0, -6, 56, GAMEPLAY_THEME.colors.signal, 0.11);
  const img = scene.add.image(0, 0, "extract_beacon_asset");
  img.setDisplaySize(112, 112);
  beacon.add([glow, img]);
  return beacon;
}

export function resolveCorpseFogVisualState(startedAt: number): { visibilityPercent: number } {
  const elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000);
  if (elapsedSec <= 480) {
    return { visibilityPercent: lerp(1, 0.5, elapsedSec / 480) };
  }
  if (elapsedSec <= 720) {
    return { visibilityPercent: lerp(0.5, 0.25, (elapsedSec - 480) / 240) };
  }
  return { visibilityPercent: lerp(0.25, 0.1, Math.min(1, (elapsedSec - 720) / 180)) };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Phaser.Math.Clamp(t, 0, 1);
}

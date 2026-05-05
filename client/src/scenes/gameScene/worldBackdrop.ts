import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { ExtractUiState } from "../createGameClient";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";

const EXTRACT_VISUAL_CLEARANCE_PADDING = 120;

export interface WorldBackdropRefs {
  terrainLayer?: Phaser.GameObjects.TileSprite;
  detailLayer?: Phaser.GameObjects.Graphics;
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

  drawCorpseRiver(detailLayer, state);
  const crossingSprites = drawSafeCrossings(scene, state);

  const atmosphereLayer = scene.add.graphics();
  atmosphereLayer.setDepth(-10);
  atmosphereLayer.fillGradientStyle(0x0e0b08, 0x0e0b08, 0x0e0b08, 0x0e0b08, 0.04, 0.02, 0.16, 0.22);
  atmosphereLayer.fillRect(0, 0, width, height);

  return {
    terrainLayer,
    detailLayer,
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
  const outerRadius = Math.max((extractState.radius ?? state.layout?.extractZones[0]?.radius ?? 126) + 30, 126);
  const innerRadius = Math.max((extractState.radius ?? state.layout?.extractZones[0]?.radius ?? 82) - 14, 54);

  const extractOuterRing = refs.extractOuterRing
    ?? scene.add.circle(centerX, centerY, outerRadius, GAMEPLAY_THEME.colors.signal, 0.1)
      .setStrokeStyle(10, GAMEPLAY_THEME.colors.accent, 0.32)
      .setDepth(-6);
  extractOuterRing.setPosition(centerX, centerY);
  extractOuterRing.setRadius(outerRadius);

  const extractInnerRing = refs.extractInnerRing
    ?? scene.add.circle(centerX, centerY, innerRadius, GAMEPLAY_THEME.colors.signal, 0.08)
      .setStrokeStyle(4, GAMEPLAY_THEME.colors.bone, 0.2)
      .setDepth(-5);
  extractInnerRing.setPosition(centerX, centerY);
  extractInnerRing.setRadius(innerRadius);

  const extractBeacon = refs.extractBeacon ?? createExtractBeacon(scene, centerX, centerY);
  extractBeacon.setPosition(centerX, centerY - 8);

  const extractLabel = refs.extractLabel
    ?? scene.add.text(centerX, centerY + 126, "归营石阵", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "20px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(-4);
  const members = extractState.squadStatus?.members ?? [];
  const aliveMembers = members.filter((member) => member.isAlive && !member.isSettled);
  const insideCount = aliveMembers.filter((member) => member.isInsideZone).length;
  extractLabel.setText(
    extractState.isOpen
      ? `队伍归营火 ${insideCount}/${aliveMembers.length || 0}`
      : "归营火未点燃"
  );

  return {
    ...refs,
    extractOuterRing,
    extractInnerRing,
    extractBeacon,
    extractLabel
  };
}

function drawCorpseRiver(layer: Phaser.GameObjects.Graphics, state: MatchViewState): void {
  const hazards = state.layout?.riverHazards ?? [];
  if (hazards.length === 0) return;

  const extractZone = state.layout?.extractZones[0];
  const centerline = hazards.map((hazard) => ({
    x: hazard.x + hazard.width / 2,
    y: hazard.y + hazard.height / 2,
    width: hazard.width,
    height: hazard.height,
    radius: Math.max(Math.min(hazard.width, hazard.height) * 0.42, 132)
  }));

  layer.fillStyle(0x2d3423, 0.06);
  layer.lineStyle(0, 0, 0);
  for (let index = 0; index < centerline.length - 1; index += 1) {
    const from = centerline[index];
    const to = centerline[index + 1];
    const stroke = Math.max(Math.min(from.radius, to.radius) * 1.78, 196);
    layer.lineStyle(stroke, 0x314028, 0.2);
    layer.lineBetween(from.x, from.y, to.x, to.y);
  }

  for (const node of centerline) {
    layer.fillStyle(0x314028, 0.22);
    layer.fillCircle(node.x, node.y, node.radius);
    layer.fillStyle(0x4f6330, 0.12);
    layer.fillCircle(node.x, node.y, node.radius * 0.68);
    layer.lineStyle(6, GAMEPLAY_THEME.colors.caution, 0.14);
    layer.strokeCircle(node.x, node.y, node.radius * 0.92);
    layer.lineStyle(2, 0x9aa35a, 0.08);
    for (let ripple = -node.radius * 0.58; ripple <= node.radius * 0.58; ripple += Math.max(28, node.radius * 0.22)) {
      layer.lineBetween(node.x - node.radius * 0.46, node.y + ripple, node.x + node.radius * 0.46, node.y + ripple * 0.58);
    }
  }

  if (extractZone) {
    layer.fillStyle(0x2a2118, 0.96);
    layer.fillCircle(extractZone.x, extractZone.y, extractZone.radius + EXTRACT_VISUAL_CLEARANCE_PADDING);
    layer.lineStyle(10, GAMEPLAY_THEME.colors.iron900, 0.24);
    layer.strokeCircle(extractZone.x, extractZone.y, extractZone.radius + EXTRACT_VISUAL_CLEARANCE_PADDING - 8);
  }
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
  const glow = scene.add.circle(0, -6, 74, GAMEPLAY_THEME.colors.signal, 0.13);
  const img = scene.add.image(0, 0, "extract_beacon_asset");
  img.setDisplaySize(138, 138);
  beacon.add([glow, img]);
  return beacon;
}

import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { ExtractUiState } from "../createGameClient";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";

export interface WorldBackdropRefs {
  terrainLayer?: Phaser.GameObjects.TileSprite;
  detailLayer?: Phaser.GameObjects.Graphics;
  atmosphereLayer?: Phaser.GameObjects.Graphics;
  extractOuterRing?: Phaser.GameObjects.Arc;
  extractInnerRing?: Phaser.GameObjects.Arc;
  extractBeacon?: Phaser.GameObjects.Container;
  extractLabel?: Phaser.GameObjects.Text;
  regionLabels: Phaser.GameObjects.Text[];
}

export function createWorldBackdropRefs(): WorldBackdropRefs {
  return {
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
  refs.regionLabels.forEach((label) => label.destroy());

  const width = state.width;
  const height = state.height;
  const centerX = width / 2;
  const centerY = height / 2;

  const terrainLayer = scene.add.tileSprite(centerX, centerY, width, height, "terrain_wasteland");
  terrainLayer.setDepth(-40);

  const detailLayer = scene.add.graphics();
  detailLayer.setDepth(-35);
  detailLayer.fillStyle(0x241912, 0.24);
  detailLayer.fillCircle(centerX, centerY, 250);
  detailLayer.lineStyle(8, GAMEPLAY_THEME.colors.iron900, 0.48);
  detailLayer.strokeCircle(centerX, centerY, 248);
  detailLayer.lineStyle(3, GAMEPLAY_THEME.colors.signal, 0.22);
  detailLayer.strokeCircle(centerX, centerY, 148);

  drawToxicRiver(detailLayer, width, height);

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
    regionLabels: [
      createRegionLabel(scene, width * 0.18, height * 0.16, "拾荒者山脊"),
      createRegionLabel(scene, width * 0.82, height * 0.15, "泥沼低地"),
      createRegionLabel(scene, centerX, centerY - 182, "中央中继站"),
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
  const centerX = state.width / 2;
  const centerY = state.height / 2;

  const extractOuterRing = refs.extractOuterRing
    ?? scene.add.circle(centerX, centerY, 126, GAMEPLAY_THEME.colors.signal, 0.1)
      .setStrokeStyle(10, GAMEPLAY_THEME.colors.accent, 0.32)
      .setDepth(-6);
  extractOuterRing.setPosition(centerX, centerY);

  const extractInnerRing = refs.extractInnerRing
    ?? scene.add.circle(centerX, centerY, 82, GAMEPLAY_THEME.colors.signal, 0.08)
      .setStrokeStyle(4, GAMEPLAY_THEME.colors.bone, 0.2)
      .setDepth(-5);
  extractInnerRing.setPosition(centerX, centerY);

  const extractBeacon = refs.extractBeacon ?? createExtractBeacon(scene, centerX, centerY);
  extractBeacon.setPosition(centerX, centerY - 8);

  const extractLabel = refs.extractLabel
    ?? scene.add.text(centerX, centerY + 112, "撤离点", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "20px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(-4);
  extractLabel.setText(extractState.isOpen ? "撤离点已开启" : "撤离点未开启");

  return {
    ...refs,
    extractOuterRing,
    extractInnerRing,
    extractBeacon,
    extractLabel
  };
}

function drawToxicRiver(layer: Phaser.GameObjects.Graphics, width: number, height: number): void {
  layer.lineStyle(74, 0x243c2a, 0.24);
  layer.beginPath();
  layer.moveTo(width * 0.04, height * 0.31);
  layer.lineTo(width * 0.2, height * 0.38);
  layer.lineTo(width * 0.39, height * 0.34);
  layer.lineTo(width * 0.56, height * 0.48);
  layer.lineTo(width * 0.77, height * 0.45);
  layer.lineTo(width * 0.96, height * 0.58);
  layer.strokePath();

  layer.lineStyle(30, 0x5d6a36, 0.14);
  layer.strokePath();
  layer.lineStyle(3, GAMEPLAY_THEME.colors.caution, 0.08);
  layer.strokePath();
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
  const glow = scene.add.circle(0, -12, 32, GAMEPLAY_THEME.colors.accent, 0.12);
  const img = scene.add.image(0, 0, "beacon");
  img.setDisplaySize(64, 64);
  beacon.add([glow, img]);
  return beacon;
}

import Phaser from "phaser";
import { drawPanelFrame, GAMEPLAY_THEME } from "./gameplayTheme";

type MinimapOptions = {
  scene: Phaser.Scene;
  parent: Phaser.GameObjects.Container;
  x: number;
  y: number;
  width?: number;
  height?: number;
  cols?: number;
  rows?: number;
  revealRadius?: number;
};

export class Minimap {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly exploredLayer: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly playerDot: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly mapWidth: number;
  private readonly mapHeight: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly revealRadius: number;
  private discovered: boolean[];
  private worldWidth = 1;
  private worldHeight = 1;
  private cellWidth = 1;
  private cellHeight = 1;
  private lastRevealCell = -1;

  constructor(options: MinimapOptions) {
    this.scene = options.scene;
    this.mapWidth = options.width ?? 176;
    this.mapHeight = options.height ?? 176;
    this.cols = options.cols ?? 40;
    this.rows = options.rows ?? 40;
    this.revealRadius = options.revealRadius ?? 260;
    this.discovered = new Array(this.cols * this.rows).fill(false);

    this.container = this.scene.add.container(options.x, options.y).setScrollFactor(0).setDepth(220);
    this.background = this.scene.add.rectangle(0, 0, this.mapWidth, this.mapHeight, GAMEPLAY_THEME.colors.void, 0.9).setOrigin(0, 0);
    this.exploredLayer = this.scene.add.graphics();
    this.frame = this.scene.add.graphics();
    this.playerDot = this.scene.add.circle(0, 0, 4, GAMEPLAY_THEME.colors.signal, 1).setVisible(false);
    this.label = this.scene.add.text(10, 8, "侦察图 / 局部", {
      fontFamily: "\"JetBrains Mono\", \"Noto Sans SC\", monospace",
      fontSize: "10px",
      color: "#b8ae96",
      letterSpacing: 2
    });

    this.label.setText("侦察图 / 局部");
    this.label.setFontFamily(GAMEPLAY_THEME.fonts.mono);
    this.drawFrame();
    this.container.add([this.background, this.exploredLayer, this.frame, this.playerDot, this.label]);
    options.parent.add(this.container);
  }

  syncWorldBounds(worldWidth: number, worldHeight: number): void {
    const nextWidth = Math.max(1, worldWidth);
    const nextHeight = Math.max(1, worldHeight);
    const resized = nextWidth !== this.worldWidth || nextHeight !== this.worldHeight;

    this.worldWidth = nextWidth;
    this.worldHeight = nextHeight;
    this.cellWidth = this.worldWidth / this.cols;
    this.cellHeight = this.worldHeight / this.rows;

    if (resized) {
      this.discovered.fill(false);
      this.lastRevealCell = -1;
      this.exploredLayer.clear();
      this.playerDot.setVisible(false);
    }
  }

  revealAt(worldX: number, worldY: number): void {
    if (this.worldWidth <= 0 || this.worldHeight <= 0) {
      return;
    }

    const centerCol = Phaser.Math.Clamp(Math.floor(worldX / this.cellWidth), 0, this.cols - 1);
    const centerRow = Phaser.Math.Clamp(Math.floor(worldY / this.cellHeight), 0, this.rows - 1);
    const flatIndex = centerRow * this.cols + centerCol;
    if (flatIndex === this.lastRevealCell) {
      return;
    }

    this.lastRevealCell = flatIndex;
    const radiusCols = Math.max(1, Math.ceil(this.revealRadius / this.cellWidth));
    const radiusRows = Math.max(1, Math.ceil(this.revealRadius / this.cellHeight));

    for (let row = Math.max(0, centerRow - radiusRows); row <= Math.min(this.rows - 1, centerRow + radiusRows); row += 1) {
      for (let col = Math.max(0, centerCol - radiusCols); col <= Math.min(this.cols - 1, centerCol + radiusCols); col += 1) {
        const dx = (col - centerCol) * this.cellWidth;
        const dy = (row - centerRow) * this.cellHeight;
        if ((dx * dx) + (dy * dy) > this.revealRadius * this.revealRadius) {
          continue;
        }

        const index = row * this.cols + col;
        if (this.discovered[index]) {
          continue;
        }

        this.discovered[index] = true;
        this.exploredLayer.fillStyle(0x6b5f48, 0.92);
        this.exploredLayer.fillRect(
          col * (this.mapWidth / this.cols),
          row * (this.mapHeight / this.rows),
          Math.ceil(this.mapWidth / this.cols),
          Math.ceil(this.mapHeight / this.rows)
        );
      }
    }
  }

  updatePlayer(worldX: number, worldY: number): void {
    const clampedX = Phaser.Math.Clamp(worldX, 0, this.worldWidth);
    const clampedY = Phaser.Math.Clamp(worldY, 0, this.worldHeight);
    this.playerDot.setPosition(
      (clampedX / this.worldWidth) * this.mapWidth,
      (clampedY / this.worldHeight) * this.mapHeight
    );
    this.playerDot.setVisible(true);

    if (!this.playerDot.getData("pulse")) {
      this.playerDot.setData("pulse", true);
      this.scene.tweens.add({
        targets: this.playerDot,
        alpha: 0.62,
        scale: 1.55,
        duration: 720,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1
      });
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private drawFrame(): void {
    drawPanelFrame(this.frame, 0, 0, this.mapWidth, this.mapHeight, 10);
  }
}

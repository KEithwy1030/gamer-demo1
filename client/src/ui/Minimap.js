import Phaser from "phaser";
export class Minimap {
    scene;
    container;
    background;
    exploredLayer;
    frame;
    playerDot;
    label;
    mapWidth;
    mapHeight;
    cols;
    rows;
    revealRadius;
    discovered;
    worldWidth = 1;
    worldHeight = 1;
    cellWidth = 1;
    cellHeight = 1;
    lastRevealCell = -1;
    constructor(options) {
        this.scene = options.scene;
        this.mapWidth = options.width ?? 176;
        this.mapHeight = options.height ?? 176;
        this.cols = options.cols ?? 40;
        this.rows = options.rows ?? 40;
        this.revealRadius = options.revealRadius ?? 260;
        this.discovered = new Array(this.cols * this.rows).fill(false);
        this.container = this.scene.add.container(options.x, options.y).setScrollFactor(0).setDepth(220);
        this.background = this.scene.add.rectangle(0, 0, this.mapWidth, this.mapHeight, 0x020617, 0.88).setOrigin(0, 0);
        this.exploredLayer = this.scene.add.graphics();
        this.frame = this.scene.add.graphics();
        this.playerDot = this.scene.add.circle(0, 0, 4, 0xf8fafc, 1).setVisible(false);
        this.label = this.scene.add.text(10, 8, "MAP", {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#cbd5e1"
        });
        this.drawFrame();
        this.container.add([this.background, this.exploredLayer, this.frame, this.playerDot, this.label]);
        options.parent.add(this.container);
    }
    syncWorldBounds(worldWidth, worldHeight) {
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
    revealAt(worldX, worldY) {
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
                this.exploredLayer.fillStyle(0x334155, 0.92);
                this.exploredLayer.fillRect(col * (this.mapWidth / this.cols), row * (this.mapHeight / this.rows), Math.ceil(this.mapWidth / this.cols), Math.ceil(this.mapHeight / this.rows));
            }
        }
    }
    updatePlayer(worldX, worldY) {
        const clampedX = Phaser.Math.Clamp(worldX, 0, this.worldWidth);
        const clampedY = Phaser.Math.Clamp(worldY, 0, this.worldHeight);
        this.playerDot.setPosition((clampedX / this.worldWidth) * this.mapWidth, (clampedY / this.worldHeight) * this.mapHeight);
        this.playerDot.setVisible(true);
    }
    destroy() {
        this.container.destroy(true);
    }
    drawFrame() {
        this.frame.clear();
        this.frame.lineStyle(2, 0x475569, 1);
        this.frame.strokeRoundedRect(0, 0, this.mapWidth, this.mapHeight, 10);
        this.frame.lineStyle(1, 0x1e293b, 0.9);
        this.frame.strokeRoundedRect(4, 4, this.mapWidth - 8, this.mapHeight - 8, 8);
    }
}

import Phaser from "phaser";
import type { WorldDrop } from "@gamer/shared";

export class DropMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, drop: WorldDrop) {
    this.id = drop.id;

    const cargoValue = getDropValue(drop);
    const isValuable = cargoValue >= 100;
    const ring = scene.add.ellipse(0, 20, 42, 14, 0x0e0b08, 0.36);
    const scan = scene.add.rectangle(0, -12, 46, 3, isValuable ? 0xf6c453 : 0xe8602c, isValuable ? 0.84 : 0.64);
    const sprite = scene.add.sprite(0, 0, "drop");
    sprite.setDisplaySize(68, 68);

    const label = scene.add.text(0, 36, formatDropLabel(drop), {
      fontFamily: "Arial",
      fontSize: "10px",
      color: isValuable ? "#ffe7a3" : "#e8dfc8",
      backgroundColor: isValuable ? "rgba(55, 32, 12, 0.82)" : "rgba(22,19,15,0.72)",
      padding: { x: 5, y: 2 }
    });
    label.setOrigin(0.5, 0);

    this.root = scene.add.container(drop.x, drop.y, [ring, scan, sprite, label]);
    this.root.setDepth(this.root.y);

    scene.tweens.add({
      targets: sprite,
      y: { from: 0, to: -6 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
    scene.tweens.add({
      targets: scan,
      alpha: { from: 0.1, to: 0.75 },
      x: { from: -14, to: 14 },
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut"
    });
  }

  destroy(): void {
    this.root.destroy(true);
  }
}

function formatDropLabel(drop: WorldDrop): string {
  const name = drop.item.name ?? (drop.definitionId ?? "Loot").replace(/_/g, " ");
  const value = getDropValue(drop);
  return value > 0 ? `${name} · +${formatCompactValue(value)}` : name;
}

function getDropValue(drop: WorldDrop): number {
  return Math.max(0, drop.item.goldValue ?? 0) + Math.max(0, drop.item.treasureValue ?? 0);
}

function formatCompactValue(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}k`;
  }

  return Math.round(value).toString();
}

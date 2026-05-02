import Phaser from "phaser";
import type { WorldDrop } from "@gamer/shared";

export class DropMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, drop: WorldDrop) {
    this.id = drop.id;

    const ring = scene.add.ellipse(0, 20, 42, 14, 0x0e0b08, 0.36);
    const scan = scene.add.rectangle(0, -12, 46, 3, 0xe8602c, 0.64);
    const sprite = scene.add.sprite(0, 0, "drop");
    sprite.setDisplaySize(68, 68);

    const label = scene.add.text(0, 36, formatDropLabel(drop.definitionId), {
      fontFamily: "Arial",
      fontSize: "10px",
      color: "#e8dfc8",
      backgroundColor: "rgba(22,19,15,0.72)",
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

function formatDropLabel(definitionId: string | undefined): string {
  const map: Record<string, string> = {
    "gold_pouch": "金币袋",
    "jade_idol": "古玉像",
    "trail_greaves": "径行腿甲",
    "scavenger_coat": "拾荒者大衣",
    "raider_blade": "突击者之刃",
    "hunter_spear": "猎人长矛",
    "leather_hood": "皮质兜帽"
  };
  return map[definitionId ?? ""] ?? (definitionId ?? "战利品").replace(/_/g, " ");
}

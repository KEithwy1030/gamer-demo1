import Phaser from "phaser";
import type { WorldDrop } from "@gamer/shared";

export class DropMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, drop: WorldDrop) {
    this.id = drop.id;

    const ring = scene.add.ellipse(0, 12, 28, 10, 0x020617, 0.24);
    const sprite = scene.add.sprite(0, 0, "drop");
    sprite.setDisplaySize(32, 32);

    const label = scene.add.text(0, 18, formatDropLabel(drop.definitionId), {
      fontFamily: "Arial",
      fontSize: "10px",
      color: "#f8fafc",
      backgroundColor: "rgba(15,23,42,0.64)",
      padding: { x: 5, y: 2 }
    });
    label.setOrigin(0.5, 0);

    this.root = scene.add.container(drop.x, drop.y, [ring, sprite, label]);
    this.root.setDepth(this.root.y);

    scene.tweens.add({
      targets: sprite,
      y: { from: 0, to: -6 },
      duration: 900,
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

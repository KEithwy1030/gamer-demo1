import Phaser from "phaser";
import type { MonsterState } from "@gamer/shared";

export class MonsterMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly hpTrack: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;
  public isAlive = true;
  private lastHp = 0;

  constructor(scene: Phaser.Scene, monster: MonsterState) {
    this.id = monster.id;
    this.targetX = monster.x;
    this.targetY = monster.y;
    this.isAlive = monster.isAlive;

    this.shadow = scene.add.ellipse(0, 16, 28, 10, 0x020617, 0.3);
    
    const assetKey = monster.type === "elite" ? "elite" : "monster";
    this.sprite = scene.add.sprite(0, 0, assetKey);
    this.sprite.setDisplaySize(monster.type === "elite" ? 56 : 36, monster.type === "elite" ? 56 : 36);

    if (monster.type !== "elite") {
      this.sprite.anims.play("monster-sway", true);
    }

    this.hpTrack = scene.add.rectangle(0, -28, 36, 6, 0x000000, 0.9);
    this.hpFill = scene.add.rectangle(-18, -28, 36, 6, 0xfb7185, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.label = scene.add.text(0, 24, monster.type === "elite" ? "精英" : "游荡者", {
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#fff7ed",
      backgroundColor: "rgba(69,10,10,0.8)",
      padding: { x: 5, y: 2 }
    });
    this.label.setOrigin(0.5, 0);

    this.root = scene.add.container(monster.x, monster.y, [
      this.shadow,
      this.hpTrack,
      this.hpFill,
      this.sprite,
      this.label
    ]);
    this.root.setDepth(monster.type === "elite" ? 16 : 14);

    this.applyState(monster);
  }

  sync(monster: MonsterState): void {
    if (this.isAlive && !monster.isAlive) {
      this.emitDeathParticles();
    }
    this.isAlive = monster.isAlive;
    this.targetX = monster.x;
    this.targetY = monster.y;
    this.applyState(monster);
  }

  private emitDeathParticles(): void {
    const scene = this.root.scene;
    const color = this.sprite.texture.key === "elite" ? 0xdc2626 : 0xf97316;
    
    const emitter = scene.add.particles(this.root.x, this.root.y, "drop", {
      lifespan: 600,
      speed: { min: 50, max: 150 },
      scale: { start: 0.4, end: 0 },
      tint: color,
      blendMode: "ADD",
      emitting: false
    });
    
    emitter.explode(16);
    scene.time.delayedCall(1000, () => emitter.destroy());

    // 'X' Marker effect
    const xMarker = scene.add.graphics();
    xMarker.lineStyle(3, 0xffffff, 1);
    xMarker.beginPath();
    xMarker.moveTo(-8, -8);
    xMarker.lineTo(8, 8);
    xMarker.moveTo(8, -8);
    xMarker.lineTo(-8, 8);
    xMarker.strokePath();
    xMarker.setPosition(this.root.x, this.root.y);
    xMarker.setDepth(this.root.depth + 1);

    scene.tweens.add({
      targets: xMarker,
      alpha: 0,
      scale: 2,
      duration: 400,
      ease: "Cubic.out",
      onComplete: () => xMarker.destroy()
    });

    // Impact flash
    const flash = scene.add.circle(this.root.x, this.root.y, 30, 0xffffff, 0.8);
    flash.setDepth(this.root.depth + 2);
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      duration: 150,
      onComplete: () => flash.destroy()
    });
  }

  step(alpha: number): void {
    this.root.x = Phaser.Math.Linear(this.root.x, this.targetX, alpha);
    this.root.y = Phaser.Math.Linear(this.root.y, this.targetY, alpha);
    this.root.setDepth(this.root.y);
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private applyState(monster: MonsterState): void {
    const hpRatio = Phaser.Math.Clamp(monster.maxHp > 0 ? monster.hp / monster.maxHp : 0, 0, 1);

    if (monster.hp < this.lastHp && monster.isAlive) {
      (this.root.scene as any).flashEffect?.(this.sprite);
      (this.root.scene as any).applyHitStop?.(40);
      (this.root.scene as any).shakeCamera?.(0.005, 100);
    }

    this.isAlive = monster.isAlive;
    this.lastHp = monster.hp;

    this.hpFill.width = Math.max(0, 36 * hpRatio);
    this.label.setText(monster.type === "elite" ? "精英" : "游荡者");

    if (monster.isAlive) {
      this.root.setAlpha(1);
      this.sprite.setVisible(true);
      this.label.setVisible(true);
      this.hpTrack.setVisible(true);
      this.hpFill.setVisible(true);
    } else {
      // Monster is dead - show corpse for 10 seconds
      // Keep sprite visible but remove HP bar and label
      this.sprite.setVisible(true);
      this.sprite.setTint(0x666666); // Gray tint for corpse
      this.label.setVisible(false);
      this.hpTrack.setVisible(false);
      this.hpFill.setVisible(false);
    }
  }
}

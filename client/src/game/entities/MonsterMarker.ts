import Phaser from "phaser";
import type { MonsterState } from "@gamer/shared";

const NORMAL_MONSTER_FRAME_SIZE = 120;
const ELITE_MONSTER_FRAME_SIZE = 158;

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
  private lastAliveState: boolean | null = null;
  private lastHpWidth = -1;

  constructor(scene: Phaser.Scene, monster: MonsterState) {
    this.id = monster.id;
    this.targetX = monster.x;
    this.targetY = monster.y;
    this.isAlive = monster.isAlive;

    this.shadow = scene.add.ellipse(0, 40, monster.type === "elite" ? 92 : 72, monster.type === "elite" ? 28 : 22, 0x0e0b08, 0.42);
    
    const assetKey = monster.type === "elite" ? "monster_elite_sheet" : "monster_normal_sheet";
    this.sprite = scene.add.sprite(0, 8, assetKey);
    const displaySize = monster.type === "elite" ? ELITE_MONSTER_FRAME_SIZE : NORMAL_MONSTER_FRAME_SIZE;
    this.sprite.setDisplaySize(displaySize, displaySize);

    const idleKey = monster.type === "elite" ? "monster-elite-sway" : "monster-normal-sway";
    if (scene.anims.exists(idleKey)) {
      this.sprite.anims.play(idleKey, true);
    }

    this.hpTrack = scene.add.rectangle(0, monster.type === "elite" ? -88 : -72, monster.type === "elite" ? 64 : 52, 7, 0x16130f, 0.92);
    this.hpFill = scene.add.rectangle(monster.type === "elite" ? -32 : -26, monster.type === "elite" ? -88 : -72, monster.type === "elite" ? 64 : 52, 7, 0xb8371f, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.label = scene.add.text(0, monster.type === "elite" ? 76 : 62, monster.type === "elite" ? "精英" : "游荡者", {
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#e8dfc8",
      backgroundColor: "rgba(69,10,10,0.82)",
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
      this.targetX = this.root.x;
      this.targetY = this.root.y;
    } else {
      this.targetX = monster.x;
      this.targetY = monster.y;
    }
    this.isAlive = monster.isAlive;
    this.applyState(monster);
  }

  private emitDeathParticles(): void {
    const scene = this.root.scene;
    const color = this.sprite.texture.key === "monster_elite_sheet" ? 0xdc2626 : 0xf97316;
    
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
    if (!this.isAlive) {
      if (Math.abs(this.root.depth - this.root.y) > 0.5) {
        this.root.setDepth(this.root.y);
      }
      return;
    }
    this.root.x = Phaser.Math.Linear(this.root.x, this.targetX, alpha);
    this.root.y = Phaser.Math.Linear(this.root.y, this.targetY, alpha);
    if (Math.abs(this.root.depth - this.root.y) > 0.5) {
      this.root.setDepth(this.root.y);
    }
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private applyState(monster: MonsterState): void {
    const hpRatio = Phaser.Math.Clamp(monster.maxHp > 0 ? monster.hp / monster.maxHp : 0, 0, 1);

    if (monster.hp < this.lastHp && monster.isAlive) {
      (this.root.scene as any).flashEffect?.(this.sprite);
    }

    this.isAlive = monster.isAlive;
    this.lastHp = monster.hp;

    const hpWidth = Math.max(0, (monster.type === "elite" ? 64 : 52) * hpRatio);
    if (Math.abs(this.lastHpWidth - hpWidth) > 0.5) {
      this.hpFill.width = hpWidth;
      this.lastHpWidth = hpWidth;
    }
    this.label.setText(monster.type === "elite" ? "精英" : "游荡者");

    if (this.lastAliveState === monster.isAlive) {
      return;
    }
    this.lastAliveState = monster.isAlive;

    if (monster.isAlive) {
      this.root.setAlpha(1);
      this.sprite.setVisible(true);
      this.sprite.clearTint();
      this.sprite.setAngle(0);
      this.sprite.setAlpha(1);
      this.shadow.setAlpha(1);
      this.label.setVisible(true);
      this.hpTrack.setVisible(true);
      this.hpFill.setVisible(true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(resolveCorpseFrame(monster.type));
      this.sprite.setVisible(true);
      this.sprite.setTint(0x5f5149);
      this.sprite.setAngle(monster.type === "elite" ? -70 : 72);
      this.sprite.setAlpha(0.62);
      this.shadow.setAlpha(0.2);
      this.label.setVisible(false);
      this.hpTrack.setVisible(false);
      this.hpFill.setVisible(false);
    }
  }
}

function resolveCorpseFrame(type: MonsterState["type"]): number {
  return type === "elite" ? 7 : 7;
}

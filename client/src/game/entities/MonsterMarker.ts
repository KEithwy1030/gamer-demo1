import Phaser from "phaser";
import type { MonsterState } from "@gamer/shared";

const NORMAL_MONSTER_FRAME_SIZE = 120;
const ELITE_MONSTER_FRAME_SIZE = 158;
const BOSS_MONSTER_FRAME_SIZE = 212;

export class MonsterMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly hpTrack: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly telegraphRing: Phaser.GameObjects.Ellipse;
  private readonly crown: Phaser.GameObjects.Text;
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

    const isBoss = monster.type === "boss";
    const isElite = monster.type === "elite";

    this.shadow = scene.add.ellipse(0, isBoss ? 54 : 40, isBoss ? 136 : isElite ? 92 : 72, isBoss ? 36 : isElite ? 28 : 22, 0x0e0b08, 0.42);
    
    const assetKey = isBoss || isElite ? "monster_elite_sheet" : "monster_normal_sheet";
    this.sprite = scene.add.sprite(0, 8, assetKey);
    const displaySize = isBoss ? BOSS_MONSTER_FRAME_SIZE : isElite ? ELITE_MONSTER_FRAME_SIZE : NORMAL_MONSTER_FRAME_SIZE;
    this.sprite.setDisplaySize(displaySize, displaySize);
    if (isBoss) {
      this.sprite.setTint(0xb91c1c);
    }

    const idleKey = isBoss || isElite ? "monster-elite-sway" : "monster-normal-sway";
    if (scene.anims.exists(idleKey)) {
      this.sprite.anims.play(idleKey, true);
    }

    this.telegraphRing = scene.add.ellipse(0, 12, isBoss ? 174 : 0, isBoss ? 174 : 0, 0xef4444, isBoss ? 0.12 : 0);
    this.telegraphRing.setStrokeStyle(isBoss ? 3 : 0, 0xfbbf24, 0.55);

    this.hpTrack = scene.add.rectangle(0, isBoss ? -126 : isElite ? -88 : -72, isBoss ? 104 : isElite ? 64 : 52, 9, 0x16130f, 0.92);
    this.hpFill = scene.add.rectangle(isBoss ? -52 : isElite ? -32 : -26, isBoss ? -126 : isElite ? -88 : -72, isBoss ? 104 : isElite ? 64 : 52, 9, isBoss ? 0xdc2626 : 0xb8371f, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.crown = scene.add.text(0, isBoss ? -164 : -120, isBoss ? "BOSS" : "", {
      fontFamily: "monospace",
      fontSize: "12px",
      fontStyle: "bold",
      color: "#fef08a",
      backgroundColor: "rgba(68,20,20,0.78)",
      padding: { x: 5, y: 2 }
    });
    this.crown.setOrigin(0.5, 0.5);
    this.crown.setVisible(isBoss);

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
      this.telegraphRing,
      this.hpTrack,
      this.hpFill,
      this.sprite,
      this.crown,
      this.label
    ]);
    this.root.setDepth(isBoss ? 18 : isElite ? 16 : 14);

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
    const color = this.crown.visible ? 0xdc2626 : this.sprite.texture.key === "monster_elite_sheet" ? 0xdc2626 : 0xf97316;
    
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
    const isBoss = monster.type === "boss";

    if (monster.hp < this.lastHp && monster.isAlive) {
      (this.root.scene as any).flashEffect?.(this.sprite);
    }

    this.isAlive = monster.isAlive;
    this.lastHp = monster.hp;

    const hpWidth = Math.max(0, (isBoss ? 104 : monster.type === "elite" ? 64 : 52) * hpRatio);
    if (Math.abs(this.lastHpWidth - hpWidth) > 0.5) {
      this.hpFill.width = hpWidth;
      this.lastHpWidth = hpWidth;
    }
    if (isBoss) {
      const warn = monster.skillState === "smash" || monster.skillState === "charge";
      this.telegraphRing.setVisible(monster.isAlive);
      this.telegraphRing.setScale(warn ? 1.14 : 1);
      this.telegraphRing.setFillStyle(monster.isEnraged ? 0xb91c1c : 0xef4444, warn ? 0.2 : 0.1);
      this.telegraphRing.setStrokeStyle(warn ? 4 : 3, monster.skillState === "charge" ? 0xf59e0b : 0xfbbf24, warn ? 0.95 : 0.55);
      this.crown.setText(monster.isEnraged ? "BOSS RAGE" : "BOSS");
      this.crown.setVisible(monster.isAlive);
    }
    this.label.setText(monster.type === "elite" ? "精英" : "游荡者");

    if (this.lastAliveState === monster.isAlive) {
      return;
    }
    this.lastAliveState = monster.isAlive;

    if (monster.isAlive) {
      this.root.setAlpha(1);
      this.sprite.setVisible(true);
      if (isBoss) {
        this.sprite.setTint(monster.isEnraged ? 0xfb7185 : 0xb91c1c);
      } else {
        this.sprite.clearTint();
      }
      this.sprite.setAngle(0);
      this.sprite.setAlpha(1);
      this.shadow.setAlpha(1);
      this.label.setVisible(true);
      this.telegraphRing.setVisible(isBoss);
      this.crown.setVisible(isBoss);
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
      this.telegraphRing.setVisible(false);
      this.crown.setVisible(false);
      this.hpTrack.setVisible(false);
      this.hpFill.setVisible(false);
    }
  }
}

function resolveCorpseFrame(type: MonsterState["type"]): number {
  return type === "elite" ? 7 : 7;
}

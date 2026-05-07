import Phaser from "phaser";
import type { MonsterState } from "@gamer/shared";
import { getMonsterLabel, getMonsterReadabilitySnapshot } from "./monsterReadability";
import {
  getMonsterAction,
  getMonsterAnimationKey,
  getMonsterCorpseFrame,
  getMonsterDisplaySize,
  getMonsterVisualProfile,
  getMonsterTextureKey
} from "./monsterVisuals";

export class MonsterMarker {
  readonly id: string;
  readonly root: Phaser.GameObjects.Container;
  private readonly monsterType: MonsterState["type"];

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly hpTrack: Phaser.GameObjects.Rectangle;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly telegraphRing: Phaser.GameObjects.Ellipse;
  private readonly threatAura: Phaser.GameObjects.Ellipse;
  private readonly crown: Phaser.GameObjects.Text;
  private readonly phaseBarTrack: Phaser.GameObjects.Rectangle;
  private readonly phaseBarFill: Phaser.GameObjects.Rectangle;
  private readonly impactFlash: Phaser.GameObjects.Ellipse;
  private targetX: number;
  private targetY: number;
  public isAlive = true;
  private lastAliveState: boolean | null = null;
  private lastHpWidth = -1;
  private lastPhaseWidth = -1;
  private readonly profile: ReturnType<typeof getMonsterVisualProfile>;
  private readonly displaySize: number;

  constructor(scene: Phaser.Scene, monster: MonsterState) {
    this.id = monster.id;
    this.monsterType = monster.type;
    this.targetX = monster.x;
    this.targetY = monster.y;
    this.isAlive = monster.isAlive;

    const isBoss = monster.type === "boss";
    const isElite = monster.type === "elite";
    this.profile = getMonsterVisualProfile(monster.type);
    const profile = this.profile;
    const labelOffsetY = profile.labelOffsetY;
    const hpY = profile.hpY;
    const phaseY = hpY - 12;
    const hpWidth = profile.hpWidth;

    this.shadow = scene.add.ellipse(
      0,
      profile.shadow.y,
      profile.shadow.width,
      profile.shadow.height,
      0x0e0b08,
      0.42
    );
    this.threatAura = scene.add.ellipse(
      0,
      profile.threatAura.y,
      profile.threatAura.width,
      profile.threatAura.height,
      isBoss ? 0x7f1d1d : isElite ? 0x7c2d12 : 0x431407,
      isBoss ? 0.16 : isElite ? 0.12 : 0.08
    );

    const assetKey = getMonsterTextureKey(monster.type);
    this.sprite = scene.add.sprite(0, 8, assetKey);
    this.displaySize = getMonsterDisplaySize(monster.type);
    this.setSpriteDisplayScale(1);

    const idleKey = getMonsterAnimationKey(monster.type, "idle");
    if (scene.anims.exists(idleKey)) {
      this.sprite.anims.play(idleKey, true);
    }

    this.telegraphRing = scene.add.ellipse(
      0,
      profile.telegraphRing.y,
      profile.telegraphRing.width,
      profile.telegraphRing.height,
      0xef4444,
      isBoss ? 0.10 : 0.06
    );
    this.telegraphRing.setStrokeStyle(isBoss ? 3 : 2, isBoss ? 0xfbbf24 : 0xfb923c, 0.6);

    this.impactFlash = scene.add.ellipse(
      0,
      profile.impactFlash.y,
      profile.impactFlash.width,
      profile.impactFlash.height,
      0xffffff,
      0
    );

    this.phaseBarTrack = scene.add.rectangle(0, phaseY, hpWidth, 5, 0x140f0c, 0.92);
    this.phaseBarFill = scene.add.rectangle(-(hpWidth / 2), phaseY, hpWidth, 5, 0xf59e0b, 1);
    this.phaseBarFill.setOrigin(0, 0.5);

    this.hpTrack = scene.add.rectangle(0, hpY, hpWidth, 9, 0x16130f, 0.92);
    this.hpFill = scene.add.rectangle(-(hpWidth / 2), hpY, hpWidth, 9, isBoss ? 0xdc2626 : isElite ? 0xf97316 : 0xb8371f, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.crown = scene.add.text(0, profile.crownY, isBoss ? "BOSS" : isElite ? "ELITE" : "", {
      fontFamily: "monospace",
      fontSize: isBoss ? "10px" : "9px",
      fontStyle: "bold",
      color: isBoss ? "#fef08a" : "#fdba74",
      backgroundColor: isBoss ? "rgba(68,20,20,0.78)" : "rgba(74,22,12,0.78)",
      padding: { x: 4, y: 1 }
    });
    this.crown.setOrigin(0.5, 0.5);
    this.crown.setVisible(isBoss || isElite);

    this.label = scene.add.text(0, labelOffsetY, getMonsterLabel(monster), {
      fontFamily: "monospace",
      fontSize: isBoss ? "10px" : "9px",
      fontStyle: "bold",
      color: "#f3ead6",
      backgroundColor: "rgba(24,10,10,0.84)",
      padding: { x: 4, y: 1 }
    });
    this.label.setOrigin(0.5, 0);

    this.root = scene.add.container(monster.x, monster.y, [
      this.shadow,
      this.threatAura,
      this.telegraphRing,
      this.impactFlash,
      this.phaseBarTrack,
      this.phaseBarFill,
      this.hpTrack,
      this.hpFill,
      this.sprite,
      this.crown,
      this.label
    ]);
    this.root.setDepth(monster.y);

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

  step(alpha: number): void {
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
    const now = Date.now();
    const snapshot = getMonsterReadabilitySnapshot(monster, now);
    const hpBaseWidth = this.profile.hpWidth;
    const hpWidth = Math.max(0, hpBaseWidth * snapshot.hpRatio);
    const phaseRatio = snapshot.timeToPhaseEndMs == null
      ? 0
      : Phaser.Math.Clamp(snapshot.timeToPhaseEndMs / getPhaseDurationMs(monster), 0, 1);
    const phaseWidth = snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking
      ? hpBaseWidth * phaseRatio
      : 0;

    if (Math.abs(this.lastHpWidth - hpWidth) > 0.5) {
      this.hpFill.width = hpWidth;
      this.lastHpWidth = hpWidth;
    }
    if (Math.abs(this.lastPhaseWidth - phaseWidth) > 0.5) {
      this.phaseBarFill.width = phaseWidth;
      this.lastPhaseWidth = phaseWidth;
    }

    this.label.setText(getMonsterLabel(monster));
    this.crown.setText(snapshot.isBoss ? (monster.isEnraged ? "BOSS RAGE" : "BOSS") : snapshot.isElite ? "ELITE" : "");
    this.crown.setVisible(snapshot.isBoss || snapshot.isElite);

    this.hpFill.setFillStyle(
      snapshot.isBoss ? (monster.isEnraged ? 0xfb7185 : 0xdc2626) : snapshot.isElite ? 0xf97316 : 0xb8371f,
      1
    );
    this.phaseBarTrack.setVisible(snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking);
    this.phaseBarFill.setVisible(snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking);
    this.phaseBarFill.setFillStyle(snapshot.isWarning ? 0xfbbf24 : snapshot.isAttacking ? 0xef4444 : 0x94a3b8, 1);

    this.telegraphRing.setVisible(monster.isAlive);
    this.telegraphRing.setScale(snapshot.isWarning ? 1.12 : snapshot.isAttacking ? 1.04 : 1);
    this.telegraphRing.setFillStyle(
      snapshot.isBoss ? (monster.isEnraged ? 0xb91c1c : 0xef4444) : snapshot.isElite ? 0xf97316 : 0x7f1d1d,
      snapshot.isBoss
        ? (snapshot.isWarning ? 0.1 : snapshot.isAttacking ? 0.08 : 0.04)
        : snapshot.isWarning ? 0.14 : snapshot.isAttacking ? 0.16 : snapshot.isElite ? 0.08 : 0.05
    );
    this.telegraphRing.setStrokeStyle(
      snapshot.isBoss ? (snapshot.isWarning ? 4 : 3) : snapshot.isElite ? 2 : 1,
      monster.skillState === "charge" ? 0xf59e0b : snapshot.isBoss ? 0xfbbf24 : 0xfb923c,
      snapshot.isWarning ? 0.95 : snapshot.isElite || snapshot.isBoss ? 0.55 : 0.24
    );

    this.threatAura.setVisible(monster.isAlive);
    this.threatAura.setFillStyle(
      snapshot.isBoss ? (monster.isEnraged ? 0x991b1b : 0x7f1d1d) : snapshot.isElite ? 0x9a3412 : 0x431407,
      snapshot.isWarning ? (snapshot.isBoss ? 0.16 : 0.16) : snapshot.isRecentlyHit ? 0.14 : snapshot.isElite ? 0.11 : 0.08
    );
    this.threatAura.setScale(snapshot.isWarning ? 1.08 : snapshot.isAttacking ? 1.02 : 1);

    this.impactFlash.setVisible(monster.isAlive && snapshot.isRecentlyHit);
    this.impactFlash.setAlpha(snapshot.isRecentlyHit ? 0.36 : 0);

    if (this.lastAliveState === monster.isAlive) {
      this.applyVisualPose(monster, snapshot);
      return;
    }

    this.lastAliveState = monster.isAlive;
    if (monster.isAlive) {
      this.root.setAlpha(1);
      this.sprite.setVisible(true);
      this.applyVisualPose(monster, snapshot);
      this.label.setVisible(true);
      this.hpTrack.setVisible(true);
      this.hpFill.setVisible(true);
      this.phaseBarTrack.setVisible(snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking);
      this.phaseBarFill.setVisible(snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(getMonsterCorpseFrame(monster.type));
      this.sprite.setVisible(true);
      this.sprite.setTint(0x5f5149);
      this.sprite.setAngle(snapshot.isBoss ? -84 : snapshot.isElite ? -72 : 72);
      this.sprite.setAlpha(snapshot.isRecentlyDead ? 0.7 : 0.58);
      this.setSpriteDisplayScale(snapshot.isRecentlyDead ? 1.04 : 1);
      this.shadow.setAlpha(0.18);
      this.threatAura.setVisible(false);
      this.telegraphRing.setVisible(false);
      this.impactFlash.setVisible(false);
      this.label.setVisible(false);
      this.crown.setVisible(false);
      this.hpTrack.setVisible(false);
      this.hpFill.setVisible(false);
      this.phaseBarTrack.setVisible(false);
      this.phaseBarFill.setVisible(false);
    }
  }

  private applyVisualPose(monster: MonsterState, snapshot: ReturnType<typeof getMonsterReadabilitySnapshot>): void {
    this.playAction(getMonsterAction(monster, { isRecentlyHit: snapshot.isRecentlyHit }));
    this.sprite.setAlpha(1);
    this.shadow.setAlpha(this.profile.shadow.alpha);
    this.setSpriteDisplayScale(snapshot.isWarning ? 1.04 : snapshot.isAttacking ? 1.02 : 1);
    this.sprite.setAngle(snapshot.isWarning ? -3 : snapshot.isAttacking ? 3 : 0);
    this.sprite.setTint(snapshot.isBoss ? (monster.isEnraged ? 0xfb7185 : 0xc2410c) : snapshot.isElite ? 0xf59e0b : 0xffffff);

    if (snapshot.isRecovering && !snapshot.isWarning) {
      this.sprite.setTint(snapshot.isBoss ? 0xfca5a5 : snapshot.isElite ? 0xfdba74 : 0xe7d7bf);
      this.sprite.setAlpha(0.88);
    }

    if (!snapshot.isBoss && !snapshot.isElite) {
      this.crown.setVisible(false);
    }
  }

  private setSpriteDisplayScale(multiplier: number): void {
    const size = this.displaySize * multiplier;
    this.sprite.setDisplaySize(size, size);
  }

  private emitDeathParticles(): void {
    const scene = this.root.scene;
    const color = this.crown.text.startsWith("BOSS") ? 0xdc2626 : this.crown.visible ? 0xf97316 : 0xb45309;

    const emitter = scene.add.particles(this.root.x, this.root.y, "drop", {
      lifespan: 620,
      speed: { min: 50, max: 150 },
      scale: { start: 0.4, end: 0 },
      tint: color,
      blendMode: "ADD",
      emitting: false
    });
    emitter.explode(this.crown.text.startsWith("BOSS") ? 26 : 16);
    scene.time.delayedCall(1000, () => emitter.destroy());

    const flash = scene.add.circle(this.root.x, this.root.y, 30, 0xffffff, 0.8);
    flash.setDepth(this.root.depth + 2);
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.6,
      duration: 160,
      onComplete: () => flash.destroy()
    });
  }

  private playAction(action: ReturnType<typeof getMonsterAction>): void {
    const animationKey = getMonsterAnimationKey(this.monsterType, action);
    if (!this.sprite.scene.anims.exists(animationKey)) {
      return;
    }

    const currentKey = this.sprite.anims.currentAnim?.key;
    if (currentKey === animationKey) {
      return;
    }

    this.sprite.play(animationKey, true);
  }
}

function getPhaseDurationMs(monster: MonsterState): number {
  if (monster.skillState === "smash") return 1200;
  if (monster.skillState === "charge") return monster.behaviorPhase === "charge" ? 650 : 900;
  if (monster.behaviorPhase === "windup") return monster.type === "elite" ? 420 : 280;
  if (monster.behaviorPhase === "recover") return 220;
  return 220;
}

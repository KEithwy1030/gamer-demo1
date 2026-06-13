import Phaser from "phaser";
import type { MonsterState } from "@gamer/shared";
import { getEliteRoleLabel, getMonsterLabel, getMonsterReadabilitySnapshot } from "./monsterReadability";
import {
  getMonsterAction,
  getMonsterAnimationKey,
  getMonsterCorpseFrame,
  getMonsterDisplaySize,
  getMonsterVisualProfile,
  getMonsterTextureKey,
  hasMonsterDirectionalCoverage,
  type MonsterFacing
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
  private readonly windupRing: Phaser.GameObjects.Graphics;
  private readonly spriteBaseX: number;
  private readonly spriteBaseY: number;
  private targetX: number;
  private targetY: number;
  public isAlive = true;
  private hitFlashUntil = 0;
  private lastAliveState: boolean | null = null;
  private lastHpWidth = -1;
  private lastPhaseWidth = -1;
  private readonly profile: ReturnType<typeof getMonsterVisualProfile>;
  private readonly displaySize: number;
  private facing: MonsterFacing = "down";
  private faceRight = false;

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

    // 方向性投影：右下偏移 + 加宽，和生成资产的左上光源一致，压住"纸片悬浮"感
    this.shadow = scene.add.ellipse(
      8,
      profile.shadow.y + 3,
      profile.shadow.width * 1.18,
      profile.shadow.height,
      0x0a0805,
      0.48
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
    this.spriteBaseX = 0;
    this.spriteBaseY = 8;
    this.displaySize = getMonsterDisplaySize(monster.type);
    this.setSpriteDisplayScale(1);

    this.facing = resolveMonsterFacing(monster, { x: monster.x, y: monster.y }, this.facing);
    const idleKey = getMonsterAnimationKey(monster.type, "idle", this.facing);
    if (scene.anims.exists(idleKey)) {
      this.sprite.anims.play(idleKey, true);
    }

    // 攻击范围预警：平时隐形，只在蓄力/出手瞬间亮起（常驻圈是调试画面，违反 QUALITY-BAR 铁律 3）
    this.telegraphRing = scene.add.ellipse(
      0,
      profile.telegraphRing.y,
      profile.telegraphRing.width,
      profile.telegraphRing.height,
      0xef4444,
      0
    );
    this.telegraphRing.setVisible(false);

    this.impactFlash = scene.add.ellipse(
      0,
      profile.impactFlash.y,
      profile.impactFlash.width,
      profile.impactFlash.height,
      0xffffff,
      0
    );

    this.windupRing = scene.add.graphics();
    this.windupRing.setVisible(false);

    this.phaseBarTrack = scene.add.rectangle(0, phaseY, hpWidth, 5, 0x140f0c, 0.92);
    this.phaseBarFill = scene.add.rectangle(-(hpWidth / 2), phaseY, hpWidth, 5, 0xf59e0b, 1);
    this.phaseBarFill.setOrigin(0, 0.5);

    this.hpTrack = scene.add.rectangle(0, hpY, hpWidth, 9, 0x16130f, 0.92);
    this.hpFill = scene.add.rectangle(-(hpWidth / 2), hpY, hpWidth, 9, isBoss ? 0xdc2626 : isElite ? 0xf97316 : 0xb8371f, 1);
    this.hpFill.setOrigin(0, 0.5);

    this.crown = scene.add.text(0, profile.crownY, isBoss ? "BOSS" : isElite ? getEliteRoleLabel(monster) : "", {
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
      this.windupRing,
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
    // 受击白闪到期后恢复（applyState 的状态着色会在下一次 sync 覆盖回来）
    if (this.hitFlashUntil > 0 && Date.now() >= this.hitFlashUntil) {
      this.hitFlashUntil = 0;
      this.sprite.clearTint();
    }
  }

  /** 受击反馈：全白闪 + 冲击椭圆 + 沿攻击方向的受击挫动。由战斗板块在 MonsterDamaged 时调用。
   *  不做缩放回弹——sprite 缩放归 applyState 管，避免两个所有者打架。
   *  挫动只动 sprite 的局部坐标（root 坐标归服务端同步管），且必须回到原位。 */
  flashHit(dirX = 0, dirY = 0): void {
    if (!this.isAlive) {
      return;
    }
    this.hitFlashUntil = Date.now() + 80;
    this.sprite.setTintFill(0xffffff);
    this.impactFlash.setVisible(true).setAlpha(0.55);

    const mag = Math.hypot(dirX, dirY);
    if (mag > 0) {
      const scene = this.root.scene;
      const baseX = this.spriteBaseX;
      const baseY = this.spriteBaseY;
      scene.tweens.killTweensOf(this.sprite);
      this.sprite.setPosition(baseX, baseY);
      scene.tweens.add({
        targets: this.sprite,
        x: baseX + (dirX / mag) * 10,
        y: baseY + (dirY / mag) * 10,
        duration: 45,
        yoyo: true,
        ease: "Cubic.out",
        onComplete: () => this.sprite.setPosition(baseX, baseY)
      });
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
    this.crown.setText(snapshot.isBoss
      ? (monster.isEnraged ? "BOSS RAGE" : "BOSS")
      : snapshot.isElite
        ? getEliteRoleLabel(monster)
        : "");
    this.crown.setVisible(snapshot.isBoss || snapshot.isElite);

    this.hpFill.setFillStyle(
      snapshot.isBoss ? (monster.isEnraged ? 0xfb7185 : 0xdc2626) : snapshot.isElite ? 0xf97316 : 0xb8371f,
      1
    );
    this.phaseBarTrack.setVisible(snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking);
    this.phaseBarFill.setVisible(snapshot.isWarning || snapshot.isRecovering || snapshot.isAttacking);
    this.phaseBarFill.setFillStyle(snapshot.isWarning ? 0xfbbf24 : snapshot.isAttacking ? 0xef4444 : 0x94a3b8, 1);

    // 范围预警只在"要打你"的瞬间出现：蓄力渐显、出手最亮、平时不存在
    const telegraphActive = monster.isAlive
      && (snapshot.isWarning || snapshot.isAttacking || monster.skillState === "charge");
    this.telegraphRing.setVisible(telegraphActive);
    if (telegraphActive) {
      this.telegraphRing.setScale(snapshot.isWarning ? 1.12 : 1.04);
      this.telegraphRing.setFillStyle(
        monster.isEnraged ? 0xb91c1c : snapshot.isBoss ? 0xef4444 : snapshot.isElite ? 0xf97316 : 0xdc2626,
        snapshot.isAttacking ? 0.2 : 0.13
      );
      this.telegraphRing.setStrokeStyle(2, 0x7f1d1d, snapshot.isWarning ? 0.5 : 0.3);
    }

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
      this.updateWindupRing(monster);
      return;
    }

    this.lastAliveState = monster.isAlive;
    if (monster.isAlive) {
      this.root.setAlpha(1);
      this.sprite.setVisible(true);
      this.applyVisualPose(monster, snapshot);
      this.updateWindupRing(monster);
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

  private updateWindupRing(monster: MonsterState): void {
    const now = Date.now();
    const windupUntil = monster.windingUpAttackUntil ?? 0;
    
    if (windupUntil <= now) {
      this.windupRing.setVisible(false);
      return;
    }

    this.windupRing.setVisible(true);
    this.windupRing.clear();

    const totalDuration = 1000; // [待人工调优]
    const remaining = windupUntil - now;
    const progress = Phaser.Math.Clamp(1 - (remaining / totalDuration), 0, 1);
    
    const radius = 30 + (80 - 30) * progress; // [待人工调优]
    const alpha = 0.75;
    const color = remaining < 300 ? 0xdc2626 : 0xf97316; // [待人工调优]

    this.windupRing.lineStyle(3, color, alpha);
    this.windupRing.strokeCircle(0, 0, radius);
    this.windupRing.setDepth(this.profile.telegraphRing.y - 1);
  }

  private applyVisualPose(monster: MonsterState, snapshot: ReturnType<typeof getMonsterReadabilitySnapshot>): void {
    this.facing = resolveMonsterFacing(monster, { x: this.targetX - this.root.x, y: this.targetY - this.root.y }, this.facing);
    // 水平朝向：动作图默认朝屏幕左，仅朝右时翻转（同 PlayerMarker shouldFlip 规则，防朝向反）。
    // 优先用攻击瞄准方向，其次移动方向；静止时保持上次朝向。
    const aim = monster.telegraph?.aimDirection
      ?? (monster.telegraph?.chargeTarget
        ? { x: monster.telegraph.chargeTarget.x - monster.x, y: monster.telegraph.chargeTarget.y - monster.y }
        : undefined);
    const hx = aim && Math.abs(aim.x) > 1 ? aim.x : (this.targetX - this.root.x);
    if (Math.abs(hx) > 4) {
      this.faceRight = hx > 0;
    }
    this.sprite.setFlipX(this.faceRight);
    this.playAction(getMonsterAction(monster, { isRecentlyHit: snapshot.isRecentlyHit }));

    // 受击白闪窗口内不被状态着色覆盖（20Hz 同步会在闪烁期间跑进来）
    const inHitFlash = this.hitFlashUntil > Date.now();
    if (monster.berserk) {
      if (!inHitFlash) {
        this.sprite.setTint(0xff8888); // [待人工调优]
      }
      this.sprite.anims.timeScale = 1.25; // [待人工调优]
    } else {
      if (!inHitFlash) {
        this.sprite.setTint(snapshot.isBoss ? (monster.isEnraged ? 0xfb7185 : 0xc2410c) : snapshot.isElite ? 0xf59e0b : 0xffffff);
      }
      this.sprite.anims.timeScale = 1;
    }

    this.sprite.setAlpha(1);
    this.shadow.setAlpha(this.profile.shadow.alpha);
    this.setSpriteDisplayScale(snapshot.isWarning ? 1.04 : snapshot.isAttacking ? 1.02 : 1);
    this.sprite.setAngle(snapshot.isWarning ? -3 : snapshot.isAttacking ? 3 : 0);

    if (snapshot.isRecovering && !snapshot.isWarning) {
      if (!monster.berserk && this.hitFlashUntil <= Date.now()) {
        this.sprite.setTint(snapshot.isBoss ? 0xfca5a5 : snapshot.isElite ? 0xfdba74 : 0xe7d7bf);
      }
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
    const animationKey = getMonsterAnimationKey(this.monsterType, action, this.facing);
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

function resolveMonsterFacing(
  monster: MonsterState,
  movement: { x: number; y: number },
  fallback: MonsterFacing
): MonsterFacing {
  if (!hasMonsterDirectionalCoverage(monster.type)) {
    return "down";
  }

  if (monster.telegraph?.aimDirection) {
    return directionToFacing(monster.telegraph.aimDirection, fallback);
  }

  if (monster.telegraph?.chargeTarget) {
    return directionToFacing(
      { x: monster.telegraph.chargeTarget.x - monster.x, y: monster.telegraph.chargeTarget.y - monster.y },
      fallback
    );
  }

  return directionToFacing(movement, fallback);
}

function directionToFacing(direction: { x: number; y: number }, fallback: MonsterFacing): MonsterFacing {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  if (absX < 0.8 && absY < 0.8) {
    return fallback;
  }
  if (absX > absY) {
    return direction.x < 0 ? "left" : "right";
  }
  return direction.y < 0 ? "up" : "down";
}

function getPhaseDurationMs(monster: MonsterState): number {
  if (monster.skillState === "smash") return 1200;
  if (monster.skillState === "charge") return monster.behaviorPhase === "charge" ? 650 : 900;
  if (monster.behaviorPhase === "windup") return monster.type === "elite" ? 420 : 280;
  if (monster.behaviorPhase === "recover") return 220;
  return 220;
}

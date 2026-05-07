import type { CombatEventPayload, SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { MonsterMarker } from "../../game/entities/MonsterMarker";
import type { PlayerMarker } from "../../game/entities/PlayerMarker";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";
import { getPrimarySkillWindupMs } from "./skillHelpers";

type MarkerMap = Map<string, PlayerMarker> | Map<string, MonsterMarker>;

export const DAMAGE_NUMBER_STYLE = {
  normal: {
    fontSize: 34,
    strokeThickness: 8,
    rise: 74,
    duration: 920,
    color: "#ff8a5b",
    glowColor: 0xffb089,
    startScale: 0.92,
    peakScale: 1.12,
    xJitter: 12,
    yOffset: -38
  },
  critical: {
    fontSize: 52,
    strokeThickness: 10,
    rise: 108,
    duration: 1180,
    color: "#ffe08a",
    glowColor: 0xffd24d,
    startScale: 0.84,
    peakScale: 1.2,
    xJitter: 16,
    yOffset: -46
  },
  bleed: {
    fontSize: 24,
    strokeThickness: 5,
    rise: 48,
    duration: 760,
    color: "#c62828",
    glowColor: 0x7f1d1d,
    startScale: 0.96,
    peakScale: 1.04,
    xJitter: 8,
    yOffset: -34
  },
  environment: {
    fontSize: 30,
    strokeThickness: 7,
    rise: 64,
    duration: 860,
    color: "#c8e07f",
    glowColor: 0x6d7f35,
    startScale: 0.94,
    peakScale: 1.08,
    xJitter: 10,
    yOffset: -40
  }
} as const;

export class GameSceneFeedbackFx {
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  handleServerPlayerAttack(
    payload: { playerId: string; attackId: string },
    latestState: MatchViewState | null,
    lastFacingDirection: Vector2,
    playerMarkers: Map<string, PlayerMarker>
  ): void {
    if (payload.playerId === latestState?.selfPlayerId) return;
    const player = latestState?.players.find((entry) => entry.id === payload.playerId);
    if (!player) return;

    const weaponType = player.weaponType || "sword";
    let direction = player.direction;
    if (payload.playerId === latestState?.selfPlayerId) {
      direction = lastFacingDirection;
    } else {
      const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
      direction = magnitude > 0 ? { x: direction.x / magnitude, y: direction.y / magnitude } : { x: 0, y: 1 };
    }

    this.createWeaponVfx(player.x, player.y, weaponType, direction);
    if (payload.playerId === latestState?.selfPlayerId) {
      this.shakeCamera(0.005, 100);
    }
  }

  handleCombatResult(
    payload: CombatEventPayload,
    latestState: MatchViewState | null,
    playerMarkers: Map<string, PlayerMarker>,
    monsterMarkers: Map<string, MonsterMarker>
  ): void {
    const target = playerMarkers.get(payload.targetId) || monsterMarkers.get(payload.targetId);
    if (!target) return;

    const isBleedTick = payload.damageType === "bleed";
    const isEnvironmental = payload.damageType === "environment";
    const style = payload.isCritical
      ? DAMAGE_NUMBER_STYLE.critical
      : (isBleedTick
        ? DAMAGE_NUMBER_STYLE.bleed
        : (isEnvironmental ? DAMAGE_NUMBER_STYLE.environment : DAMAGE_NUMBER_STYLE.normal));
    const text = this.scene.add.text(
      target.root.x + Phaser.Math.Between(-style.xJitter, style.xJitter),
      target.root.y + style.yOffset,
      `-${payload.amount}`,
      {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: `${style.fontSize}px`,
      fontStyle: "bold",
      color: style.color,
      stroke: "#16130f",
      strokeThickness: style.strokeThickness
    }).setOrigin(0.5).setDepth(3000).setScale(style.startScale);
    text.setShadow(0, 0, Phaser.Display.Color.IntegerToColor(style.glowColor).rgba, 18, false, true);
    this.scene.tweens.add({
      targets: text,
      y: text.y - style.rise,
      scale: style.peakScale,
      alpha: 0,
      duration: style.duration,
      ease: "Cubic.out",
      onComplete: () => text.destroy()
    });

    if (payload.isCritical) {
      const burst = this.scene.add.circle(target.root.x, target.root.y, 16, GAMEPLAY_THEME.colors.caution, 0.22).setDepth(2999);
      burst.setStrokeStyle(4, GAMEPLAY_THEME.colors.bone, 0.8);
      this.scene.tweens.add({
        targets: burst,
        alpha: 0,
        scale: 3.2,
        duration: 320,
        ease: "Cubic.out",
        onComplete: () => burst.destroy()
      });
    }

    if (!isBleedTick) {
      this.flashEffect(target.root);
    }
    if (!isBleedTick && !isEnvironmental) {
      this.showHitImpact(target.root.x, target.root.y, target.root.depth);
    }
    if (!isBleedTick && payload.targetId === latestState?.selfPlayerId) {
      this.scene.cameras.main.shake(150, 4 / this.scene.scale.width);
      this.applyHitStop(50);
      this.showDamageWash();
    }

    const attackerMonster = monsterMarkers.get(payload.attackerId);
    if (attackerMonster && payload.targetId === latestState?.selfPlayerId) {
      this.showMonsterAttackVfx(attackerMonster.root.x, attackerMonster.root.y, attackerMonster.root.depth);
    }
  }

  playLocalAttack(latestState: MatchViewState | null, lastFacingDirection: Vector2): void {
    const self = latestState?.players.find((player) => player.id === latestState?.selfPlayerId);
    if (!self) return;
    this.createWeaponVfx(self.x, self.y, self.weaponType || "sword", lastFacingDirection);
    this.shakeCamera(0.005, 100);
  }

  playLocalSkill(skillId: SkillId, phase: "windup" | "cast", latestState: MatchViewState | null, lastFacingDirection: Vector2): void {
    const self = latestState?.players.find((player) => player.id === latestState?.selfPlayerId);
    if (!self) return;

    if (skillId === "spear_heavyThrust" && phase === "windup") {
      const charge = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 110);
      charge.lineStyle(3, 0xfbbf24, 0.95).strokeCircle(0, 0, 20);
      charge.lineStyle(2, 0xef4444, 0.75).strokeCircle(0, 0, 34);
      this.scene.tweens.add({
        targets: charge,
        alpha: 0,
        scale: 1.45,
        duration: getPrimarySkillWindupMs(skillId),
        onComplete: () => charge.destroy()
      });
      return;
    }

    if (skillId === "sword_bladeFlurry") {
      const ring = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 120);
      ring.lineStyle(3, 0x93c5fd, 0.95).strokeCircle(0, 0, 30);
      ring.lineStyle(2, 0xe2e8f0, 0.7).strokeCircle(0, 0, 44);
      for (let index = 0; index < 5; index += 1) {
        const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x) + (index - 2) * 0.35;
        ring.lineStyle(3, 0xe2e8f0, 0.85).beginPath();
        ring.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
        ring.lineTo(Math.cos(angle) * 78, Math.sin(angle) * 78);
        ring.strokePath();
      }
      this.scene.tweens.add({ targets: ring, alpha: 0, scale: 1.35, duration: 360, onComplete: () => ring.destroy() });
      this.createSkillVfx(self.x, self.y, 0x93c5fd);
      return;
    }

    if (skillId === "sword_shadowStep") {
      const afterimage = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 118);
      afterimage.fillStyle(0x38bdf8, 0.18).fillEllipse(0, 0, 72, 30);
      afterimage.lineStyle(3, 0x38bdf8, 0.75).strokeEllipse(0, 0, 88, 38);
      const streak = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 119);
      streak.lineStyle(5, 0x67e8f9, 0.82).beginPath();
      streak.moveTo(-lastFacingDirection.x * 54, -lastFacingDirection.y * 54);
      streak.lineTo(lastFacingDirection.x * 36, lastFacingDirection.y * 36);
      streak.strokePath();
      this.scene.tweens.add({ targets: afterimage, alpha: 0, scale: 1.5, duration: 300, onComplete: () => afterimage.destroy() });
      this.scene.tweens.add({ targets: streak, alpha: 0, duration: 180, onComplete: () => streak.destroy() });
      this.createSkillVfx(self.x, self.y, 0x38bdf8);
      return;
    }

    this.shakeCamera(skillId === "spear_heavyThrust" ? 0.012 : 0.008, skillId === "spear_heavyThrust" ? 180 : 150);

    if (skillId === "blade_sweep") {
      this.createWeaponVfx(self.x, self.y, "blade", lastFacingDirection);
      const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x);
      const sweep = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 110);
      sweep.lineStyle(6, 0xf97316, 0.95);
      sweep.beginPath();
      sweep.arc(0, 0, 104, angle - 1.2, angle + 1.2);
      sweep.strokePath();
      const skid = this.scene.add.graphics().setPosition(
        self.x - lastFacingDirection.x * 34,
        self.y - lastFacingDirection.y * 34
      ).setDepth(self.y + 105);
      skid.fillStyle(0xf59e0b, 0.3).fillEllipse(0, 0, 34, 12);
      this.scene.tweens.add({ targets: sweep, alpha: 0, scale: 1.18, duration: 220, onComplete: () => sweep.destroy() });
      this.scene.tweens.add({ targets: skid, alpha: 0, scaleX: 1.5, duration: 180, onComplete: () => skid.destroy() });
      this.createSkillVfx(self.x, self.y, 0xf97316);
      return;
    }

    if (skillId === "spear_heavyThrust") {
      const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x);
      const thrust = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 115);
      thrust.lineStyle(6, 0xfbbf24, 1).beginPath();
      thrust.moveTo(0, 0);
      thrust.lineTo(Math.cos(angle) * 160, Math.sin(angle) * 160);
      thrust.strokePath();
      const burst = this.scene.add.graphics().setPosition(
        self.x + lastFacingDirection.x * 126,
        self.y + lastFacingDirection.y * 126
      ).setDepth(self.y + 116);
      burst.lineStyle(4, 0xef4444, 1).strokeCircle(0, 0, 18);
      burst.lineStyle(2, 0xfbbf24, 1);
      for (let index = 0; index < 6; index += 1) {
        const ray = angle + ((index - 2.5) * 0.35);
        burst.beginPath();
        burst.moveTo(0, 0);
        burst.lineTo(Math.cos(ray) * 28, Math.sin(ray) * 28);
        burst.strokePath();
      }
      this.scene.tweens.add({ targets: thrust, alpha: 0, duration: 200, onComplete: () => thrust.destroy() });
      this.scene.tweens.add({ targets: burst, alpha: 0, scale: 1.5, duration: 240, onComplete: () => burst.destroy() });
      this.createSkillVfx(self.x, self.y, 0xfbbf24);
      return;
    }

    this.createWeaponVfx(self.x, self.y, "sword", lastFacingDirection);
    const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x);
    const dash = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 110);
    dash.lineStyle(5, 0x38bdf8, 0.95).beginPath();
    dash.moveTo(-Math.cos(angle) * 18, -Math.sin(angle) * 18);
    dash.lineTo(Math.cos(angle) * 150, Math.sin(angle) * 150);
    dash.strokePath();
    this.scene.tweens.add({ targets: dash, alpha: 0, duration: 180, onComplete: () => dash.destroy() });
    this.createSkillVfx(self.x, self.y, 0x38bdf8);
  }

  private createWeaponVfx(x: number, y: number, type: WeaponType, direction: Vector2): void {
    const angle = Math.atan2(direction.y, direction.x);
    const graphics = this.scene.add.graphics().setPosition(x, y).setDepth(y + 100);
    const reach = type === "spear" ? 58 : type === "blade" ? 44 : 38;
    const width = type === "spear" ? 24 : type === "blade" ? 42 : 34;
    const color = type === "spear" ? 0xd7c27a : type === "blade" ? 0xb86b2d : 0xd8d1b5;
    const dustColor = type === "spear" ? 0x8a7a49 : type === "blade" ? 0x6f2d1d : 0x4c4637;
    const forwardX = Math.cos(angle) * reach;
    const forwardY = Math.sin(angle) * reach;

    graphics.save();
    graphics.translateCanvas(forwardX * 0.48, forwardY * 0.48);
    graphics.rotateCanvas(angle);
    graphics.fillStyle(color, 0.22);
    graphics.fillEllipse(0, 0, reach, width);
    graphics.fillStyle(0xf4e6bd, 0.18);
    graphics.fillEllipse(reach * 0.18, 0, reach * 0.54, Math.max(10, width * 0.38));
    graphics.fillStyle(dustColor, 0.18);
    graphics.fillEllipse(-reach * 0.2, width * 0.28, reach * 0.48, Math.max(8, width * 0.22));
    graphics.restore();
    this.scene.tweens.add({
      targets: graphics,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 0.84,
      duration: 160,
      ease: "Cubic.out",
      onComplete: () => graphics.destroy()
    });
  }

  private createSkillVfx(x: number, y: number, color: number): void {
    const ring = this.scene.add.graphics().lineStyle(4, color).strokeCircle(0, 0, 30).setPosition(x, y).setDepth(y + 100);
    this.scene.tweens.add({ targets: ring, alpha: 0, scale: 2, duration: 350, onComplete: () => ring.destroy() });
  }

  private showMonsterAttackVfx(x: number, y: number, depth: number): void {
    const danger = this.scene.add.graphics();
    danger.lineStyle(4, GAMEPLAY_THEME.colors.danger, 1);
    danger.strokeCircle(0, 0, 24);
    danger.fillStyle(GAMEPLAY_THEME.colors.danger, 0.25);
    danger.fillCircle(0, 0, 24);
    danger.setPosition(x, y).setDepth(depth + 5);
    this.scene.tweens.add({ targets: danger, alpha: 0, scale: 1.6, duration: 280, onComplete: () => danger.destroy() });
  }

  private showHitImpact(x: number, y: number, depth: number): void {
    const impact = this.scene.add.graphics().setPosition(x, y - 18).setDepth(depth + 8);
    impact.fillStyle(0x7f1d1d, 0.54);
    impact.fillEllipse(0, 0, 34, 18);
    impact.fillStyle(0xef4444, 0.36);
    impact.fillCircle(-14, -4, 7);
    impact.fillCircle(12, 4, 5);
    impact.fillStyle(0xf8d7a3, 0.34);
    impact.fillEllipse(4, -8, 20, 7);
    this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      y: y - 28,
      scale: 1.38,
      duration: 260,
      ease: "Cubic.out",
      onComplete: () => impact.destroy()
    });
  }

  private showDamageWash(): void {
    const wash = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, GAMEPLAY_THEME.colors.danger, 0.2)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(5000);
    this.scene.tweens.add({ targets: wash, alpha: 0, duration: 240, ease: "Cubic.out", onComplete: () => wash.destroy() });
  }

  private flashEffect(target: any): void {
    if (!target) return;

    if (typeof target.setTintFill === "function" && typeof target.clearTint === "function") {
      target.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => {
        if (target.scene) target.clearTint();
      });
      return;
    }

    const originalAlpha = typeof target.alpha === "number" ? target.alpha : 1;
    if (typeof target.setAlpha === "function") {
      target.setAlpha(1);
      this.scene.time.delayedCall(70, () => {
        if (target.scene && typeof target.setAlpha === "function") target.setAlpha(originalAlpha);
      });
    }
  }

  private applyHitStop(ms: number): void {
    const physicsWorld = (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics | undefined)?.world;
    this.scene.anims.pauseAll();
    this.scene.tweens.pauseAll();
    if (physicsWorld) physicsWorld.pause();

    this.scene.time.delayedCall(ms, () => {
      this.scene.anims.resumeAll();
      this.scene.tweens.resumeAll();
      if (physicsWorld) physicsWorld.resume();
    });
  }

  private shakeCamera(intensity: number, duration: number): void {
    this.scene.cameras.main.shake(duration, intensity);
  }
}

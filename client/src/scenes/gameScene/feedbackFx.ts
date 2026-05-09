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
    fontSize: 46,
    strokeThickness: 12,
    rise: 98,
    duration: 1060,
    color: "#ff9a6a",
    glowColor: 0xffc38e,
    startScale: 0.9,
    peakScale: 1.2,
    xJitter: 22,
    yOffset: -70
  },
  critical: {
    fontSize: 66,
    strokeThickness: 14,
    rise: 136,
    duration: 1240,
    color: "#ffe89a",
    glowColor: 0xffd66a,
    startScale: 0.82,
    peakScale: 1.24,
    xJitter: 24,
    yOffset: -78
  },
  bleed: {
    fontSize: 34,
    strokeThickness: 8,
    rise: 66,
    duration: 820,
    color: "#d64a4a",
    glowColor: 0x861d1d,
    startScale: 0.94,
    peakScale: 1.08,
    xJitter: 14,
    yOffset: -58
  },
  environment: {
    fontSize: 44,
    strokeThickness: 11,
    rise: 92,
    duration: 1040,
    color: "#d6ef97",
    glowColor: 0x708640,
    startScale: 0.92,
    peakScale: 1.12,
    xJitter: 18,
    yOffset: -68
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
    this.showBodyImpact(target.root.x, target.root.y, target.root.depth, payload.damageType, payload.isCritical ?? false);
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
      const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x);
      this.createFanImpact(self.x, self.y, angle, 0x93c5fd, 6, 0xe2e8f0, 0x94a3b8);
      this.createSkillVfx(self.x, self.y, 0x93c5fd);
      return;
    }

    if (skillId === "sword_shadowStep") {
      const afterimage = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 118);
      afterimage.fillStyle(0x38bdf8, 0.18).fillEllipse(0, 0, 72, 30);
      afterimage.lineStyle(3, 0x38bdf8, 0.75).strokeEllipse(0, 0, 88, 38);
      const streak = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 119);
      this.drawSlashArc(streak, lastFacingDirection, 0x67e8f9, 0xcffafe, 0.9, 0.42, 18, 58);
      const fragments = this.spawnFragments(self.x, self.y, lastFacingDirection, 0x67e8f9, 8, 12, 28);
      this.scene.tweens.add({ targets: afterimage, alpha: 0, scale: 1.5, duration: 300, onComplete: () => afterimage.destroy() });
      this.scene.tweens.add({ targets: streak, alpha: 0, duration: 220, onComplete: () => streak.destroy() });
      fragments.forEach((fragment) => {
        this.scene.tweens.add({ targets: fragment, alpha: 0, duration: 240, onComplete: () => fragment.destroy() });
      });
      this.createSkillVfx(self.x, self.y, 0x38bdf8);
      return;
    }

    this.shakeCamera(skillId === "spear_heavyThrust" ? 0.012 : 0.008, skillId === "spear_heavyThrust" ? 180 : 150);

    if (skillId === "blade_sweep") {
      this.createWeaponVfx(self.x, self.y, "blade", lastFacingDirection);
      const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x);
      const sweep = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 110);
      this.drawImpactArc(sweep, angle, 112, 0xf97316, 0xffd6a5, 7, 1.18);
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
      this.drawThrustWake(thrust, angle, 0xfbbf24, 0xffefb6, 156, 7);
      const burst = this.scene.add.graphics().setPosition(
        self.x + lastFacingDirection.x * 126,
        self.y + lastFacingDirection.y * 126
      ).setDepth(self.y + 116);
      this.drawImpactBurst(burst, angle, 0xef4444, 0xfbbf24, 22, 6);
      this.scene.tweens.add({ targets: thrust, alpha: 0, duration: 200, onComplete: () => thrust.destroy() });
      this.scene.tweens.add({ targets: burst, alpha: 0, scale: 1.5, duration: 240, onComplete: () => burst.destroy() });
      this.createSkillVfx(self.x, self.y, 0xfbbf24);
      return;
    }

    this.createWeaponVfx(self.x, self.y, "sword", lastFacingDirection);
    const angle = Math.atan2(lastFacingDirection.y, lastFacingDirection.x);
    const dash = this.scene.add.graphics().setPosition(self.x, self.y).setDepth(self.y + 110);
    this.drawSlashArc(dash, lastFacingDirection, 0x38bdf8, 0xa5f3fc, 0.98, 0.5, 20, 62);
    this.scene.tweens.add({ targets: dash, alpha: 0, duration: 180, onComplete: () => dash.destroy() });
    this.createSkillVfx(self.x, self.y, 0x38bdf8);
  }

  private createWeaponVfx(x: number, y: number, type: WeaponType, direction: Vector2): void {
    const graphics = this.scene.add.graphics().setPosition(x, y).setDepth(y + 100);
    const angle = Math.atan2(direction.y, direction.x);
    const reach = type === "spear" ? 60 : type === "blade" ? 48 : 42;
    const color = type === "spear" ? 0xd7c27a : type === "blade" ? 0xb86b2d : 0xd8d1b5;
    const accent = type === "spear" ? 0xf7f1c7 : type === "blade" ? 0xf7c18f : 0xf0ece2;
    const mist = type === "spear" ? 0x8a7a49 : type === "blade" ? 0x6f2d1d : 0x4c4637;
    this.drawThrustWake(graphics, angle, color, accent, reach, type === "spear" ? 6 : 8);
    this.spawnFragments(x, y, direction, mist, type === "blade" ? 8 : 6, 14, 26);
    this.scene.tweens.add({
      targets: graphics,
      alpha: 0,
      scaleX: 1.16,
      scaleY: 0.9,
      duration: 180,
      ease: "Cubic.out",
      onComplete: () => graphics.destroy()
    });
  }

  private createSkillVfx(x: number, y: number, color: number): void {
    const ring = this.scene.add.graphics().lineStyle(4, color).strokeCircle(0, 0, 30).setPosition(x, y).setDepth(y + 100);
    this.scene.tweens.add({ targets: ring, alpha: 0, scale: 2, duration: 350, onComplete: () => ring.destroy() });
  }

  private createFanImpact(
    x: number,
    y: number,
    angle: number,
    color: number,
    rays: number,
    highlight: number,
    dust: number
  ): void {
    const fan = this.scene.add.graphics().setPosition(x, y).setDepth(y + 111);
    fan.lineStyle(4, color, 0.88);
    fan.fillStyle(color, 0.16);
    fan.strokeCircle(0, 0, 24);
    fan.fillCircle(0, 0, 20);
    for (let index = 0; index < rays; index += 1) {
      const spreadAngle = angle + (index - (rays - 1) / 2) * 0.18;
      const reach = 56 + index * 6;
      fan.beginPath();
      fan.moveTo(Math.cos(spreadAngle) * 10, Math.sin(spreadAngle) * 10);
      fan.lineTo(Math.cos(spreadAngle) * reach, Math.sin(spreadAngle) * reach);
      fan.strokePath();
    }
    fan.fillStyle(highlight, 0.16);
    fan.fillEllipse(Math.cos(angle) * 18, Math.sin(angle) * 18, 42, 18);
    this.spawnFragments(x, y, { x: Math.cos(angle), y: Math.sin(angle) }, dust, 7, 10, 24);
    this.scene.tweens.add({ targets: fan, alpha: 0, scale: 1.22, duration: 260, onComplete: () => fan.destroy() });
  }

  private showMonsterAttackVfx(x: number, y: number, depth: number): void {
    const danger = this.scene.add.graphics().setPosition(x, y).setDepth(depth + 5);
    this.drawImpactBurst(danger, -Math.PI / 2, GAMEPLAY_THEME.colors.danger, 0xf8d7a3, 20, 5);
    this.scene.tweens.add({ targets: danger, alpha: 0, scale: 1.5, duration: 280, onComplete: () => danger.destroy() });
  }

  private showBodyImpact(x: number, y: number, depth: number, damageType: CombatEventPayload["damageType"], critical: boolean): void {
    const impact = this.scene.add.graphics().setPosition(x, y - 16).setDepth(depth + 8);
    const isEnvironment = damageType === "environment";
    const isBleed = damageType === "bleed";
    if (isEnvironment) {
      impact.fillStyle(0x647d2c, 0.38);
      impact.fillEllipse(0, 0, 44, 22);
      impact.fillStyle(0xd6ef97, 0.26);
      impact.fillCircle(-12, -5, 7);
      impact.fillCircle(14, 3, 5);
      impact.lineStyle(3, 0xe7ffb7, 0.75).strokeCircle(0, 0, 30);
      this.spawnFragments(x, y, { x: 0.2, y: -1 }, 0x708640, 6, 8, 20);
    } else if (isBleed) {
      impact.fillStyle(0x7f1d1d, 0.5);
      impact.fillEllipse(0, 0, 38, 20);
      impact.fillStyle(0xef4444, 0.42);
      impact.fillCircle(-14, -4, 7);
      impact.fillCircle(11, 5, 6);
      impact.lineStyle(3, 0xff8f8f, 0.7).strokeCircle(0, 0, 26);
    } else {
      impact.fillStyle(0x7f1d1d, 0.54);
      impact.fillEllipse(0, 0, critical ? 42 : 34, critical ? 22 : 18);
      impact.fillStyle(0xef4444, 0.36);
      impact.fillCircle(-14, -4, critical ? 8 : 7);
      impact.fillCircle(12, 4, critical ? 6 : 5);
      impact.fillStyle(0xf8d7a3, 0.34);
      impact.fillEllipse(4, -8, critical ? 24 : 20, critical ? 9 : 7);
      this.spawnFragments(x, y, { x: 0.3, y: -1 }, 0xb91c1c, critical ? 8 : 5, 10, 24);
    }
    this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      y: y - (isEnvironment ? 32 : 28),
      scale: isEnvironment ? 1.48 : 1.38,
      duration: isEnvironment ? 300 : 260,
      ease: "Cubic.out",
      onComplete: () => impact.destroy()
    });
  }

  private drawImpactArc(
    graphics: Phaser.GameObjects.Graphics,
    angle: number,
    radius: number,
    color: number,
    highlight: number,
    thickness: number,
    spread: number
  ): void {
    graphics.lineStyle(thickness, color, 0.9);
    graphics.beginPath();
    graphics.arc(0, 0, radius, angle - spread, angle + spread);
    graphics.strokePath();
    graphics.lineStyle(Math.max(2, thickness - 4), highlight, 0.74);
    graphics.beginPath();
    graphics.arc(0, 0, radius - 16, angle - spread * 0.72, angle + spread * 0.72);
    graphics.strokePath();
  }

  private drawSlashArc(
    graphics: Phaser.GameObjects.Graphics,
    direction: Vector2,
    color: number,
    highlight: number,
    scale: number,
    tilt: number,
    thickness: number,
    radius: number
  ): void {
    const angle = Math.atan2(direction.y, direction.x);
    graphics.lineStyle(thickness, color, 0.9);
    graphics.beginPath();
    graphics.arc(0, 0, radius, angle - tilt, angle + tilt);
    graphics.strokePath();
    graphics.lineStyle(Math.max(2, thickness - 3), highlight, 0.72);
    graphics.beginPath();
    graphics.arc(0, 0, radius * 0.82, angle - tilt * 0.7, angle + tilt * 0.7);
    graphics.strokePath();
    graphics.fillStyle(color, 0.14);
    graphics.fillEllipse(Math.cos(angle) * radius * 0.36, Math.sin(angle) * radius * 0.36, radius * 0.54 * scale, radius * 0.24 * scale);
  }

  private drawThrustWake(
    graphics: Phaser.GameObjects.Graphics,
    angle: number,
    color: number,
    highlight: number,
    length: number,
    thickness: number
  ): void {
    const forwardX = Math.cos(angle);
    const forwardY = Math.sin(angle);
    const sideX = -forwardY;
    const sideY = forwardX;
    const tipX = forwardX * length;
    const tipY = forwardY * length;
    graphics.fillStyle(color, 0.2);
    graphics.fillTriangle(sideX * thickness, sideY * thickness, tipX, tipY, -sideX * thickness, -sideY * thickness);
    graphics.fillStyle(highlight, 0.18);
    graphics.fillTriangle(sideX * thickness * 0.42, sideY * thickness * 0.42, forwardX * (length * 0.6), forwardY * (length * 0.6), -sideX * thickness * 0.42, -sideY * thickness * 0.42);
    graphics.lineStyle(3, highlight, 0.72);
    graphics.beginPath();
    graphics.arc(tipX * 0.72, tipY * 0.72, Math.max(10, thickness * 2), angle - 0.6, angle + 0.6);
    graphics.strokePath();
  }

  private drawImpactBurst(
    graphics: Phaser.GameObjects.Graphics,
    angle: number,
    outerColor: number,
    innerColor: number,
    radius: number,
    rays: number
  ): void {
    graphics.lineStyle(4, outerColor, 0.85);
    graphics.strokeCircle(0, 0, radius);
    graphics.fillStyle(outerColor, 0.22);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(2, innerColor, 0.9);
    for (let index = 0; index < rays; index += 1) {
      const rayAngle = angle + (index - (rays - 1) / 2) * 0.24;
      graphics.beginPath();
      graphics.moveTo(Math.cos(rayAngle) * (radius * 0.2), Math.sin(rayAngle) * (radius * 0.2));
      graphics.lineTo(Math.cos(rayAngle) * (radius * 0.92), Math.sin(rayAngle) * (radius * 0.92));
      graphics.strokePath();
    }
  }

  private spawnFragments(
    x: number,
    y: number,
    direction: Vector2,
    color: number,
    count: number,
    minDistance: number,
    maxDistance: number
  ): Phaser.GameObjects.Graphics[] {
    const fragments: Phaser.GameObjects.Graphics[] = [];
    const angle = Math.atan2(direction.y, direction.x);
    const spread = 0.85;
    for (let index = 0; index < count; index += 1) {
      const fragment = this.scene.add.graphics().setPosition(x, y).setDepth(y + 111 + index * 0.01);
      const fragmentAngle = angle + Phaser.Math.FloatBetween(-spread, spread);
      const distance = Phaser.Math.Between(minDistance, maxDistance);
      const size = Phaser.Math.Between(3, 7);
      const tipX = Math.cos(fragmentAngle) * distance;
      const tipY = Math.sin(fragmentAngle) * distance;
      fragment.fillStyle(color, 0.22);
      fragment.fillTriangle(0, 0, tipX, tipY, tipX * 0.6 - Math.sin(fragmentAngle) * size, tipY * 0.6 + Math.cos(fragmentAngle) * size);
      fragments.push(fragment);
      this.scene.tweens.add({
        targets: fragment,
        x: x + Math.cos(fragmentAngle) * distance,
        y: y + Math.sin(fragmentAngle) * distance,
        scaleX: 0.65,
        scaleY: 0.65,
        duration: 180 + Phaser.Math.Between(0, 90),
        ease: "Cubic.out"
      });
    }
    return fragments;
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

import type { CombatEventPayload, SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import type { MatchViewState } from "../../../game";
import type { MonsterMarker } from "../../../game/entities/MonsterMarker";
import type { PlayerMarker } from "../../../game/entities/PlayerMarker";
import { GAMEPLAY_THEME } from "../../../ui/gameplayTheme";
import { getPrimarySkillWindupMs } from "../../../scenes/gameScene/skillHelpers";
import { clientEventBus } from "../../../core/event-bus";

interface DamageStyle {
  readonly fontSize: number;
  readonly strokeThickness: number;
  readonly rise: number;
  readonly duration: number;
  readonly color: string;
  readonly glowColor: number;
  readonly startScale: number;
  readonly peakScale: number;
  readonly xJitter: number;
  readonly yOffset: number;
}

export const DAMAGE_NUMBER_STYLE: Record<string, DamageStyle> = {
  playerHit: {
    fontSize: 22,
    strokeThickness: 4,
    rise: 40,
    duration: 700,
    color: "#fbbf24", // Yellow
    glowColor: 0x78350f,
    startScale: 0.5,
    peakScale: 1.2,
    xJitter: 12,
    yOffset: -60
  },
  playerCrit: {
    fontSize: 28,
    strokeThickness: 5,
    rise: 50,
    duration: 900,
    color: "#fb923c", // Orange
    glowColor: 0x7c2d12,
    startScale: 0.4,
    peakScale: 1.6,
    xJitter: 16,
    yOffset: -70
  },
  playerHurt: {
    fontSize: 24,
    strokeThickness: 5,
    rise: 40,
    duration: 800,
    color: "#ef4444", // Red
    glowColor: 0x450a0a,
    startScale: 0.6,
    peakScale: 1.3,
    xJitter: 14,
    yOffset: -60
  },
  other: {
    fontSize: 20,
    strokeThickness: 3,
    rise: 35,
    duration: 700,
    color: "#e2e8f0", // Silver
    glowColor: 0x1e293b,
    startScale: 0.5,
    peakScale: 1.1,
    xJitter: 10,
    yOffset: -55
  }
} as const;

export class GameSceneFeedbackFx {
  private readonly scene: Phaser.Scene;
  private sparkEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly unsubscribes: Array<() => void> = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupEmitters();
    const onMonsterKilled = (payload: {
      monsterId: string;
      monsterType: string;
      position: { x: number; y: number };
      killerPlayerId: string;
      killedAt: number;
    }) => {
      this.handleMonsterKilled({
        monsterId: payload.monsterId,
        x: payload.position.x,
        y: payload.position.y,
        tier: payload.monsterType === "boss" ? "boss" : payload.monsterType === "elite" ? "elite" : "normal"
      });
    };
    clientEventBus.on("MonsterKilled", onMonsterKilled);
    this.unsubscribes.push(() => clientEventBus.off("MonsterKilled", onMonsterKilled));
  }

  private setupEmitters(): void {
    // Shared spark emitter
    this.sparkEmitter = this.scene.add.particles(0, 0, "drop", {
      lifespan: 180,
      speed: { min: 80, max: 220 },
      scale: { start: 0.4, end: 0 },
      blendMode: "ADD",
      emitting: false
    });
    this.sparkEmitter.setDepth(4000);
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

    const isSelfHurt = payload.targetId === latestState?.selfPlayerId;
    const isSelfAttacker = payload.attackerId === latestState?.selfPlayerId;
    
    let style = DAMAGE_NUMBER_STYLE.other;
    if (isSelfHurt) {
      style = DAMAGE_NUMBER_STYLE.playerHurt;
    } else if (isSelfAttacker) {
      style = payload.isCritical ? DAMAGE_NUMBER_STYLE.playerCrit : DAMAGE_NUMBER_STYLE.playerHit;
    }

    const damageX = target.root.x + Phaser.Math.Between(-style.xJitter, style.xJitter);
    const damageY = target.root.y + style.yOffset;

    const text = this.scene.add.text(
      damageX,
      damageY,
      `-${payload.amount}`,
      {
        fontFamily: GAMEPLAY_THEME.fonts.display,
        fontSize: `${style.fontSize}px`,
        fontStyle: "bold",
        color: style.color,
        stroke: "#000000",
        strokeThickness: style.strokeThickness
      }).setOrigin(0.5).setDepth(3000).setScale(style.startScale);

    const fadeDelay = Math.round(style.duration * 0.4);
    this.scene.tweens.add({
      targets: text,
      y: `-=${style.rise}`,
      duration: style.duration,
      ease: "Cubic.out"
    });
    this.scene.tweens.add({
      targets: text,
      alpha: 0,
      delay: fadeDelay,
      duration: style.duration - fadeDelay,
      ease: "Quad.in",
      onComplete: () => text.destroy()
    });
    this.scene.tweens.add({
      targets: text,
      scaleX: style.peakScale,
      scaleY: style.peakScale,
      duration: 100,
      yoyo: true,
      ease: "Back.easeOut"
    });

    // Check for "hit" damage type or undefined (which usually means a hit)
    if (payload.amount > 0 && (!payload.damageType || payload.damageType === "hit")) {
      this.spawnSparkParticles(target.root.x, target.root.y, payload.attackerId, playerMarkers, monsterMarkers);
    }

    if (isSelfHurt) {
      const shakeIntensity = payload.amount >= 20 ? 0.015 : 0.008;
      this.shakeCamera(shakeIntensity, 150);
      this.applyHitStop(payload.amount >= 20 ? 120 : 60);
      this.showDamageWash();
    } else if (isSelfAttacker) {
      if (payload.isCritical) {
        this.shakeCamera(0.012, 180);
        this.applyHitStop(100);
      }
    }
  }

  private spawnSparkParticles(
    x: number,
    y: number,
    attackerId: string,
    playerMarkers: Map<string, PlayerMarker>,
    monsterMarkers: Map<string, MonsterMarker>
  ): void {
    if (!this.sparkEmitter) return;
    
    const attacker = playerMarkers.get(attackerId) || monsterMarkers.get(attackerId);
    let angle = 0;
    if (attacker) {
      angle = Phaser.Math.Angle.Between(attacker.root.x, attacker.root.y, x, y);
    } else {
      angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    }

    const deg = Phaser.Math.RadToDeg(angle);
    // In newer Phaser versions, setAngle takes a number or a range.
    // If it fails with an object, we use the internal particle emitter API or a simpler call.
    (this.sparkEmitter as any).setAngle({ min: deg - 40, max: deg + 40 });
    this.sparkEmitter.emitParticleAt(x, y - 20, Phaser.Math.Between(3, 5));
  }

  handleMonsterKilled(payload: { monsterId: string; x: number; y: number; tier: string }): void {
    const { x, y, tier } = payload;

    // Blood Mist / Death Burst
    const burst = this.scene.add.circle(x, y, 10, 0x7f1d1d, 0.6).setDepth(y - 1);
    this.scene.tweens.add({
      targets: burst,
      scale: 4,
      alpha: 0,
      duration: 600,
      ease: "Cubic.out",
      onComplete: () => burst.destroy()
    });

    const emitter = this.scene.add.particles(x, y - 20, "drop", {
      lifespan: 500,
      speed: { min: 100, max: 200 },
      scale: { start: 0.6, end: 0 },
      tint: 0x991b1b,
      quantity: 12,
      emitting: false
    });
    emitter.setDepth(y + 10);
    emitter.explode();
    this.scene.time.delayedCall(1000, () => emitter.destroy());

    if (tier === "elite" || tier === "boss") {
      this.shakeCamera(tier === "boss" ? 0.03 : 0.02, 300);
      this.applyHitStop(tier === "boss" ? 500 : 300);
    } else {
      this.shakeCamera(0.008, 120);
      this.applyHitStop(100);
    }
  }

  handlePlayerDied(): void {
    // Red vignette pulse
    const vignette = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0xef4444, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10000);
    
    this.scene.tweens.add({
      targets: vignette,
      alpha: 0.3,
      duration: 300,
      yoyo: true,
      repeat: 1,
      ease: "Cubic.inOut",
      onComplete: () => vignette.destroy()
    });

    this.shakeCamera(0.02, 500);
  }

  showLootToast(x: number, y: number, amount: number): void {
    const text = this.scene.add.text(x, y - 60, `+${amount}`, {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "14px",
      color: "#fbbf24", // Warm gold
      stroke: "#000000",
      strokeThickness: 2,
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(3000);

    this.scene.tweens.add({
      targets: text,
      y: y - 110,
      alpha: 0,
      duration: 2000,
      ease: "Cubic.out",
      onComplete: () => text.destroy()
    });
  }

  playLocalAttack(latestState: MatchViewState | null, lastFacingDirection: Vector2): void {
    const self = latestState?.players.find((player) => player.id === latestState?.selfPlayerId);
    if (!self) return;
    this.createWeaponVfx(self.x, self.y, self.weaponType || "sword", lastFacingDirection);
    this.shakeCamera(0.005, 100);
  }

  playLocalAttackWindup(weaponType: WeaponType, x: number, y: number, direction: Vector2): void {
    const charge = this.scene.add.graphics().setPosition(x, y).setDepth(y + 110);
    const color = weaponType === "spear" ? 0xfbbf24 : weaponType === "blade" ? 0xf97316 : 0x38bdf8;
    charge.lineStyle(2, color, 0.8).strokeCircle(0, 0, 24);
    this.scene.tweens.add({
      targets: charge,
      alpha: 0,
      scale: 1.2,
      duration: 100,
      onComplete: () => charge.destroy()
    });
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

  destroy(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes.length = 0;
    this.sparkEmitter?.destroy();
  }
}



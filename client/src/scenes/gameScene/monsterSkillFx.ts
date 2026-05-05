import type { MonsterState } from "@gamer/shared";
import Phaser from "phaser";
import type { MonsterMarker } from "../../game/entities/MonsterMarker";
import { getMonsterReadabilitySnapshot } from "../../game/entities/monsterReadability";

export type BossFxKey = "charge" | "smash" | "enrage" | "recover";

type BossFxConfig = {
  requiresGeometry: boolean;
  labelOnly: false;
};

const BOSS_FX_CONFIG: Record<BossFxKey, BossFxConfig> = {
  charge: { requiresGeometry: true, labelOnly: false },
  smash: { requiresGeometry: true, labelOnly: false },
  enrage: { requiresGeometry: true, labelOnly: false },
  recover: { requiresGeometry: true, labelOnly: false }
};

type BossFxBundle = {
  root: Phaser.GameObjects.Container;
  chargeLane: Phaser.GameObjects.Graphics;
  chargeArrow: Phaser.GameObjects.Graphics;
  smashZone: Phaser.GameObjects.Graphics;
  enrageAura: Phaser.GameObjects.Graphics;
  recoverTrail: Phaser.GameObjects.Graphics;
  recoverAnchor: Phaser.GameObjects.Graphics;
  debugTag?: Phaser.GameObjects.Text;
};

export class MonsterSkillFxController {
  private readonly scene: Phaser.Scene;
  private readonly bundles = new Map<string, BossFxBundle>();
  private readonly debugMode: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.debugMode = new URLSearchParams(window.location.search).get("bossFxDebug") === "1";
  }

  sync(monster: MonsterState, marker: MonsterMarker): void {
    if (monster.type !== "boss" || !monster.isAlive) {
      this.destroy(monster.id);
      return;
    }

    const bundle = this.ensureBundle(monster.id);
    const snapshot = getMonsterReadabilitySnapshot(monster);
    bundle.root.setPosition(marker.root.x, marker.root.y);
    bundle.root.setDepth(marker.root.depth - 1);
    this.drawCharge(bundle, monster, snapshot);
    this.drawSmash(bundle, monster, snapshot);
    this.drawEnrage(bundle, monster, snapshot);
    this.drawRecover(bundle, monster, snapshot);
    if (bundle.debugTag) {
      bundle.debugTag.setText(this.resolveDebugLabel(monster));
      bundle.debugTag.setVisible(this.debugMode);
    }
  }

  step(markers: Map<string, MonsterMarker>): void {
    for (const [id, bundle] of this.bundles.entries()) {
      const marker = markers.get(id);
      if (!marker) {
        this.destroy(id);
        continue;
      }

      bundle.root.setPosition(marker.root.x, marker.root.y);
      bundle.root.setDepth(marker.root.depth - 1);
    }
  }

  destroy(monsterId?: string): void {
    if (monsterId) {
      const bundle = this.bundles.get(monsterId);
      bundle?.root.destroy(true);
      this.bundles.delete(monsterId);
      return;
    }

    for (const bundle of this.bundles.values()) {
      bundle.root.destroy(true);
    }
    this.bundles.clear();
  }

  static getVisualCoverage(): Record<BossFxKey, BossFxConfig> {
    return BOSS_FX_CONFIG;
  }

  private ensureBundle(monsterId: string): BossFxBundle {
    const existing = this.bundles.get(monsterId);
    if (existing) {
      return existing;
    }

    const chargeLane = this.scene.add.graphics();
    const chargeArrow = this.scene.add.graphics();
    const smashZone = this.scene.add.graphics();
    const enrageAura = this.scene.add.graphics();
    const recoverTrail = this.scene.add.graphics();
    const recoverAnchor = this.scene.add.graphics();
    const parts = [chargeLane, chargeArrow, smashZone, enrageAura, recoverTrail, recoverAnchor];
    const debugTag = this.debugMode
      ? this.scene.add.text(0, -180, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#fef3c7",
        backgroundColor: "rgba(41, 18, 18, 0.84)",
        padding: { x: 4, y: 2 }
      }).setOrigin(0.5, 0.5)
      : undefined;

    const root = this.scene.add.container(0, 0, debugTag ? [...parts, debugTag] : parts);
    const bundle: BossFxBundle = { root, chargeLane, chargeArrow, smashZone, enrageAura, recoverTrail, recoverAnchor, debugTag };
    this.bundles.set(monsterId, bundle);
    return bundle;
  }

  private drawCharge(bundle: BossFxBundle, monster: MonsterState, snapshot: ReturnType<typeof getMonsterReadabilitySnapshot>): void {
    const graphics = bundle.chargeLane;
    const arrow = bundle.chargeArrow;
    graphics.clear();
    arrow.clear();

    const chargeTarget = monster.telegraph?.chargeTarget;
    const aimDirection = monster.telegraph?.aimDirection;
    const isCharge = monster.skillState === "charge" || monster.behaviorPhase === "charge";
    if (!isCharge || !chargeTarget || !aimDirection) {
      return;
    }

    const dx = chargeTarget.x - monster.x;
    const dy = chargeTarget.y - monster.y;
    const distance = Math.max(48, Math.hypot(dx, dy));
    const angle = Math.atan2(aimDirection.y, aimDirection.x);
    const laneWidth = monster.behaviorPhase === "charge" ? 68 : 56;
    const fillAlpha = monster.behaviorPhase === "charge" ? 0.28 : 0.18;
    const strokeAlpha = monster.behaviorPhase === "charge" ? 1 : 0.92;

    graphics.fillStyle(0xf97316, fillAlpha);
    graphics.lineStyle(4, 0xfbbf24, strokeAlpha);
    graphics.fillRoundedRect(36, -laneWidth / 2, distance, laneWidth, 18);
    graphics.strokeRoundedRect(36, -laneWidth / 2, distance, laneWidth, 18);
    graphics.lineStyle(2, 0xffedd5, 0.78);
    graphics.beginPath();
    graphics.moveTo(42, 0);
    graphics.lineTo(36 + distance - 18, 0);
    graphics.strokePath();
    graphics.setRotation(angle);
    graphics.setAlpha(snapshot.isAttacking ? 1 : 0.96);

    arrow.lineStyle(4, 0xfffbeb, 0.95);
    arrow.fillStyle(0xfbbf24, 0.95);
    arrow.beginPath();
    arrow.moveTo(0, 0);
    arrow.lineTo(-20, 12);
    arrow.lineTo(-20, -12);
    arrow.closePath();
    arrow.fillPath();
    arrow.strokePath();
    arrow.setPosition(Math.cos(angle) * (36 + distance), Math.sin(angle) * (36 + distance));
    arrow.setRotation(angle);
  }

  private drawSmash(bundle: BossFxBundle, monster: MonsterState, snapshot: ReturnType<typeof getMonsterReadabilitySnapshot>): void {
    const graphics = bundle.smashZone;
    graphics.clear();

    const isSmash = monster.skillState === "smash";
    const radius = monster.telegraph?.smashRadius;
    if (!isSmash || !radius) {
      return;
    }

    const pulse = snapshot.timeToPhaseEndMs == null ? 1 : 1 + (snapshot.timeToPhaseEndMs / 1200) * 0.12;
    graphics.fillStyle(monster.isEnraged ? 0x991b1b : 0x7f1d1d, monster.isEnraged ? 0.26 : 0.2);
    graphics.lineStyle(4, monster.isEnraged ? 0xfb7185 : 0xfca5a5, 0.96);
    graphics.fillCircle(0, 12, radius * pulse);
    graphics.strokeCircle(0, 12, radius * pulse);
    graphics.lineStyle(2, 0xffedd5, 0.8);
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      graphics.beginPath();
      graphics.moveTo(Math.cos(angle) * (radius * 0.54), 12 + Math.sin(angle) * (radius * 0.54));
      graphics.lineTo(Math.cos(angle) * (radius * 0.94), 12 + Math.sin(angle) * (radius * 0.94));
      graphics.strokePath();
    }
  }

  private drawEnrage(bundle: BossFxBundle, monster: MonsterState, snapshot: ReturnType<typeof getMonsterReadabilitySnapshot>): void {
    const graphics = bundle.enrageAura;
    graphics.clear();
    if (!monster.isEnraged) {
      return;
    }

    const auraRadius = 122 + Math.sin(this.scene.time.now / 130) * 10;
    graphics.fillStyle(0x7f1d1d, 0.18);
    graphics.lineStyle(5, 0xfb7185, 0.82);
    graphics.fillEllipse(0, 16, auraRadius * 1.42, auraRadius);
    graphics.strokeEllipse(0, 16, auraRadius * 1.42, auraRadius);
    graphics.lineStyle(2, 0xfef2f2, 0.68);
    graphics.strokeCircle(0, 10, 68 + (snapshot.isWarning ? 8 : 0));
  }

  private drawRecover(bundle: BossFxBundle, monster: MonsterState, snapshot: ReturnType<typeof getMonsterReadabilitySnapshot>): void {
    const trail = bundle.recoverTrail;
    const anchor = bundle.recoverAnchor;
    trail.clear();
    anchor.clear();

    const recoverAnchor = monster.telegraph?.recoverAnchor;
    if (monster.behaviorPhase !== "recover" || !recoverAnchor) {
      return;
    }

    const dx = recoverAnchor.x - monster.x;
    const dy = recoverAnchor.y - monster.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const laneLength = Math.max(24, distance - 42);

    trail.lineStyle(3, 0x94a3b8, 0.72);
    trail.beginPath();
    trail.moveTo(0, 0);
    trail.lineTo(dx, dy);
    trail.strokePath();
    trail.fillStyle(0xcbd5e1, 0.12);
    trail.fillEllipse(dx * 0.5, dy * 0.5, Math.max(46, laneLength * 0.36), 20);

    anchor.lineStyle(3, 0xe2e8f0, 0.92);
    anchor.fillStyle(0x94a3b8, 0.2 + (snapshot.timeToPhaseEndMs ? Math.min(0.12, snapshot.timeToPhaseEndMs / 8000) : 0));
    anchor.fillCircle(dx, dy, 36);
    anchor.strokeCircle(dx, dy, 36);
    anchor.lineStyle(2, 0xf8fafc, 0.8);
    anchor.beginPath();
    anchor.moveTo(dx - Math.cos(angle) * 18, dy - Math.sin(angle) * 18);
    anchor.lineTo(dx, dy);
    anchor.lineTo(dx - Math.cos(angle + 0.7) * 14, dy - Math.sin(angle + 0.7) * 14);
    anchor.moveTo(dx, dy);
    anchor.lineTo(dx - Math.cos(angle - 0.7) * 14, dy - Math.sin(angle - 0.7) * 14);
    anchor.strokePath();
  }

  private resolveDebugLabel(monster: MonsterState): string {
    if (monster.behaviorPhase === "recover") {
      return "RECOVER";
    }
    if (monster.skillState === "smash") {
      return monster.isEnraged ? "SMASH+" : "SMASH";
    }
    if (monster.skillState === "charge" || monster.behaviorPhase === "charge") {
      return monster.isEnraged ? "CHARGE+" : "CHARGE";
    }
    if (monster.isEnraged) {
      return "ENRAGE";
    }
    return "BOSS";
  }
}

export function assertBossFxCoverage(): void {
  const entries = Object.entries(BOSS_FX_CONFIG) as Array<[BossFxKey, BossFxConfig]>;
  for (const [key, config] of entries) {
    if (!config.requiresGeometry) {
      throw new Error(`boss fx ${key} must declare geometry coverage`);
    }
    if (config.labelOnly) {
      throw new Error(`boss fx ${key} cannot be label-only`);
    }
  }
}


import type { DomainEventByType, SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";
import { GAMEPLAY_THEME } from "../../../ui/gameplayTheme";

interface MarkerRef { root: Phaser.GameObjects.Container }
type PlayerDamagedPayload = DomainEventByType["PlayerDamaged"]["payload"] & { isCritical?: boolean };
interface CombatVfxContext {
  scene: Phaser.Scene;
  getSelfPlayerId: () => string | null;
  getPlayerMarker: (playerId: string) => MarkerRef | undefined;
  getMonsterMarker: (monsterId: string) => MarkerRef | undefined;
  getPlayerWeapon?: (playerId: string) => WeaponType | undefined;
  getPlayerDirection?: (playerId: string) => Vector2 | undefined;
}
interface DamageStyle { fontSize: number; strokeThickness: number; rise: number; duration: number; color: string; startScale: number; peakScale: number; xJitter: number; yOffset: number }
const DAMAGE_NUMBER_STYLE: Record<string, DamageStyle> = {
  playerHit: { fontSize: 22, strokeThickness: 4, rise: 40, duration: 700, color: "#fbbf24", startScale: 0.5, peakScale: 1.2, xJitter: 12, yOffset: -60 },
  playerCrit: { fontSize: 28, strokeThickness: 5, rise: 50, duration: 900, color: "#fb923c", startScale: 0.4, peakScale: 1.6, xJitter: 16, yOffset: -70 },
  playerHurt: { fontSize: 24, strokeThickness: 5, rise: 40, duration: 800, color: "#ef4444", startScale: 0.6, peakScale: 1.3, xJitter: 14, yOffset: -60 },
  other: { fontSize: 20, strokeThickness: 3, rise: 35, duration: 700, color: "#e2e8f0", startScale: 0.5, peakScale: 1.1, xJitter: 10, yOffset: -55 },
  monsterHit: { fontSize: 22, strokeThickness: 4, rise: 44, duration: 700, color: "#f8fafc", startScale: 0.5, peakScale: 1.25, xJitter: 12, yOffset: -56 },
  monsterCrit: { fontSize: 28, strokeThickness: 5, rise: 54, duration: 900, color: "#fb923c", startScale: 0.4, peakScale: 1.6, xJitter: 16, yOffset: -64 }
};

export function mountCombatVfx(ctx: CombatVfxContext): () => void {
  const unsubs = [
    on("PlayerDamaged", (payload) => {
      const target = marker(ctx, payload.targetId);
      if (!target) return;
      showDamage(ctx.scene, target.root, payload, ctx);
      if (payload.amount > 0 && (!payload.damageType || payload.damageType === "hit")) spawnSparkParticles(ctx.scene, target.root, marker(ctx, payload.attackerId)?.root);
      if (payload.targetId === ctx.getSelfPlayerId()) {
        shakeCamera(ctx.scene, payload.amount >= 20 ? 0.015 : 0.008, 150);
        applyHitStop(ctx.scene, payload.amount >= 20 ? 120 : 60);
        showDamageWash(ctx.scene);
      }
    }),
    on("PlayerCriticalHit", (payload) => {
      if (payload.attackerId !== ctx.getSelfPlayerId()) return;
      shakeCamera(ctx.scene, 0.012, 180);
      applyHitStop(ctx.scene, 100);
    }),
    // S5 切换时打怪反馈（白闪/数字/震屏）随 feedbackFx 一起丢失；这里按
    // MonsterDamaged 域事件补回——这是"命中有没有反馈"的手感主干。
    on("MonsterDamaged", (payload) => {
      const target = ctx.getMonsterMarker(payload.monsterId);
      if (!target) return;
      (target as { flashHit?: () => void }).flashHit?.();
      showMonsterDamage(ctx.scene, target.root, payload.amount, payload.isCritical === true);
      if (payload.attackerPlayerId === ctx.getSelfPlayerId()) {
        spawnSparkParticles(ctx.scene, target.root, ctx.getPlayerMarker(payload.attackerPlayerId)?.root);
        shakeCamera(ctx.scene, 0.005, 90);
      }
    }),
    on("PlayerAttacked", (payload) => {
      const actor = ctx.getPlayerMarker(payload.playerId);
      if (!actor) return;
      createWeaponVfx(ctx.scene, actor.root.x, actor.root.y, ctx.getPlayerWeapon?.(payload.playerId) ?? "sword", ctx.getPlayerDirection?.(payload.playerId) ?? { x: 0, y: 1 });
    }),
    on("PlayerSkillCast", (payload) => {
      const actor = ctx.getPlayerMarker(payload.playerId);
      if (!actor) return;
      playSkillVfx(ctx.scene, actor.root.x, actor.root.y, payload.skillId as SkillId, norm(payload.direction));
    })
  ];
  return () => unsubs.forEach((un) => un());
}

function on<K extends keyof DomainEventByType>(type: K, handler: (payload: DomainEventByType[K]["payload"]) => void): () => void {
  clientEventBus.on(type, handler);
  return () => clientEventBus.off(type, handler);
}
function marker(ctx: CombatVfxContext, id: string): MarkerRef | undefined { return ctx.getPlayerMarker(id) ?? ctx.getMonsterMarker(id); }
function showMonsterDamage(scene: Phaser.Scene, target: Phaser.GameObjects.Container, amount: number, isCritical: boolean): void {
  const style = isCritical ? DAMAGE_NUMBER_STYLE.monsterCrit : DAMAGE_NUMBER_STYLE.monsterHit;
  const text = scene.add.text(target.x + Phaser.Math.Between(-style.xJitter, style.xJitter), target.y + style.yOffset, `-${amount}`, {
    fontFamily: GAMEPLAY_THEME.fonts.display, fontSize: `${style.fontSize}px`, fontStyle: "bold", color: style.color, stroke: "#000000", strokeThickness: style.strokeThickness
  }).setOrigin(0.5).setDepth(3000).setScale(style.startScale);
  scene.tweens.add({ targets: text, y: `-=${style.rise}`, duration: style.duration, ease: "Cubic.out" });
  scene.tweens.add({ targets: text, alpha: 0, delay: Math.round(style.duration * 0.4), duration: Math.round(style.duration * 0.6), ease: "Quad.in", onComplete: () => text.destroy() });
  scene.tweens.add({ targets: text, scaleX: style.peakScale, scaleY: style.peakScale, duration: 100, yoyo: true, ease: "Back.easeOut" });
}
function showDamage(scene: Phaser.Scene, target: Phaser.GameObjects.Container, p: PlayerDamagedPayload, ctx: CombatVfxContext): void {
  const self = ctx.getSelfPlayerId();
  const style = p.targetId === self ? DAMAGE_NUMBER_STYLE.playerHurt : p.attackerId === self ? (p.isCritical ? DAMAGE_NUMBER_STYLE.playerCrit : DAMAGE_NUMBER_STYLE.playerHit) : DAMAGE_NUMBER_STYLE.other;
  const text = scene.add.text(target.x + Phaser.Math.Between(-style.xJitter, style.xJitter), target.y + style.yOffset, `-${p.amount}`, {
    fontFamily: GAMEPLAY_THEME.fonts.display, fontSize: `${style.fontSize}px`, fontStyle: "bold", color: style.color, stroke: "#000000", strokeThickness: style.strokeThickness
  }).setOrigin(0.5).setDepth(3000).setScale(style.startScale);
  scene.tweens.add({ targets: text, y: `-=${style.rise}`, duration: style.duration, ease: "Cubic.out" });
  scene.tweens.add({ targets: text, alpha: 0, delay: Math.round(style.duration * 0.4), duration: Math.round(style.duration * 0.6), ease: "Quad.in", onComplete: () => text.destroy() });
  scene.tweens.add({ targets: text, scaleX: style.peakScale, scaleY: style.peakScale, duration: 100, yoyo: true, ease: "Back.easeOut" });
}
function createWeaponVfx(scene: Phaser.Scene, x: number, y: number, type: WeaponType, direction: Vector2): void {
  const g = scene.add.graphics().setPosition(x, y).setDepth(y + 100);
  const angle = Math.atan2(direction.y, direction.x);
  drawThrustWake(g, angle, type === "spear" ? 0xd7c27a : type === "blade" ? 0xb86b2d : 0xd8d1b5, type === "spear" ? 0xf7f1c7 : type === "blade" ? 0xf7c18f : 0xf0ece2, type === "spear" ? 60 : type === "blade" ? 48 : 42, type === "spear" ? 6 : 8);
  spawnFragments(scene, x, y, direction, type === "blade" ? 0x6f2d1d : 0x4c4637, type === "blade" ? 8 : 6, 14, 26);
  scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.16, scaleY: 0.9, duration: 180, ease: "Cubic.out", onComplete: () => g.destroy() });
}
function playSkillVfx(scene: Phaser.Scene, x: number, y: number, skillId: SkillId, d: Vector2): void {
  const angle = Math.atan2(d.y, d.x);
  if (skillId === "sword_bladeFlurry") createFanImpact(scene, x, y, angle, 0x93c5fd, 6, 0xe2e8f0, 0x94a3b8);
  else if (skillId === "blade_sweep") { createWeaponVfx(scene, x, y, "blade", d); const g = scene.add.graphics().setPosition(x, y).setDepth(y + 110); drawImpactArc(g, angle, 112, 0xf97316, 0xffd6a5, 7, 1.18); scene.tweens.add({ targets: g, alpha: 0, scale: 1.18, duration: 220, onComplete: () => g.destroy() }); }
  else if (skillId === "spear_heavyThrust") { const g = scene.add.graphics().setPosition(x, y).setDepth(y + 115); drawThrustWake(g, angle, 0xfbbf24, 0xffefb6, 156, 7); drawImpactBurst(g, angle, 0xef4444, 0xfbbf24, 22, 6); scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() }); }
  else { createWeaponVfx(scene, x, y, "sword", d); const g = scene.add.graphics().setPosition(x, y).setDepth(y + 110); drawSlashArc(g, d, 0x38bdf8, 0xa5f3fc, 0.98, 0.5, 20, 62); scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() }); }
  createSkillVfx(scene, x, y, skillId === "blade_sweep" ? 0xf97316 : skillId === "spear_heavyThrust" ? 0xfbbf24 : 0x38bdf8);
}
function drawThrustWake(g: Phaser.GameObjects.Graphics, a: number, color: number, hi: number, len: number, thick: number): void { const fx = Math.cos(a), fy = Math.sin(a), sx = -fy, sy = fx; g.fillStyle(color, 0.2).fillTriangle(sx * thick, sy * thick, fx * len, fy * len, -sx * thick, -sy * thick); g.fillStyle(hi, 0.18).fillTriangle(sx * thick * 0.42, sy * thick * 0.42, fx * len * 0.6, fy * len * 0.6, -sx * thick * 0.42, -sy * thick * 0.42); g.lineStyle(3, hi, 0.72).beginPath(); g.arc(fx * len * 0.72, fy * len * 0.72, Math.max(10, thick * 2), a - 0.6, a + 0.6); g.strokePath(); }
function drawSlashArc(g: Phaser.GameObjects.Graphics, d: Vector2, c: number, h: number, s: number, t: number, w: number, r: number): void { const a = Math.atan2(d.y, d.x); g.lineStyle(w, c, 0.9).beginPath(); g.arc(0, 0, r, a - t, a + t); g.strokePath(); g.lineStyle(Math.max(2, w - 3), h, 0.72).beginPath(); g.arc(0, 0, r * 0.82, a - t * 0.7, a + t * 0.7); g.strokePath(); g.fillStyle(c, 0.14).fillEllipse(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36, r * 0.54 * s, r * 0.24 * s); }
function drawImpactArc(g: Phaser.GameObjects.Graphics, a: number, r: number, c: number, h: number, w: number, spread: number): void { g.lineStyle(w, c, 0.9).beginPath(); g.arc(0, 0, r, a - spread, a + spread); g.strokePath(); g.lineStyle(Math.max(2, w - 4), h, 0.74).beginPath(); g.arc(0, 0, r - 16, a - spread * 0.72, a + spread * 0.72); g.strokePath(); }
function drawImpactBurst(g: Phaser.GameObjects.Graphics, a: number, c: number, h: number, r: number, rays: number): void { g.lineStyle(4, c, 0.85).strokeCircle(Math.cos(a) * 126, Math.sin(a) * 126, r); g.lineStyle(2, h, 0.9); for (let i = 0; i < rays; i += 1) { const ra = a + (i - (rays - 1) / 2) * 0.24; g.beginPath(); g.moveTo(Math.cos(a) * 126, Math.sin(a) * 126); g.lineTo(Math.cos(a) * 126 + Math.cos(ra) * r, Math.sin(a) * 126 + Math.sin(ra) * r); g.strokePath(); } }
function createFanImpact(scene: Phaser.Scene, x: number, y: number, a: number, c: number, rays: number, h: number, dust: number): void { const g = scene.add.graphics().setPosition(x, y).setDepth(y + 111); g.lineStyle(4, c, 0.88).fillStyle(c, 0.16).strokeCircle(0, 0, 24).fillCircle(0, 0, 20); for (let i = 0; i < rays; i += 1) { const ra = a + (i - (rays - 1) / 2) * 0.18; g.beginPath(); g.moveTo(Math.cos(ra) * 10, Math.sin(ra) * 10); g.lineTo(Math.cos(ra) * (56 + i * 6), Math.sin(ra) * (56 + i * 6)); g.strokePath(); } g.fillStyle(h, 0.16).fillEllipse(Math.cos(a) * 18, Math.sin(a) * 18, 42, 18); spawnFragments(scene, x, y, { x: Math.cos(a), y: Math.sin(a) }, dust, 7, 10, 24); scene.tweens.add({ targets: g, alpha: 0, scale: 1.22, duration: 260, onComplete: () => g.destroy() }); }
function createSkillVfx(scene: Phaser.Scene, x: number, y: number, color: number): void { const ring = scene.add.graphics().lineStyle(4, color).strokeCircle(0, 0, 30).setPosition(x, y).setDepth(y + 100); scene.tweens.add({ targets: ring, alpha: 0, scale: 2, duration: 350, onComplete: () => ring.destroy() }); }
function spawnFragments(scene: Phaser.Scene, x: number, y: number, d: Vector2, c: number, count: number, min: number, max: number): void { const a = Math.atan2(d.y, d.x); for (let i = 0; i < count; i += 1) { const f = scene.add.graphics().setPosition(x, y).setDepth(y + 111 + i * 0.01); const fa = a + Phaser.Math.FloatBetween(-0.85, 0.85), dist = Phaser.Math.Between(min, max), size = Phaser.Math.Between(3, 7); f.fillStyle(c, 0.22).fillTriangle(0, 0, Math.cos(fa) * dist, Math.sin(fa) * dist, Math.cos(fa) * dist * 0.6 - Math.sin(fa) * size, Math.sin(fa) * dist * 0.6 + Math.cos(fa) * size); scene.tweens.add({ targets: f, x: x + Math.cos(fa) * dist, y: y + Math.sin(fa) * dist, scaleX: 0.65, scaleY: 0.65, duration: 180 + Phaser.Math.Between(0, 90), ease: "Cubic.out", onComplete: () => f.destroy() }); } }
function spawnSparkParticles(scene: Phaser.Scene, target: Phaser.GameObjects.Container, attacker?: Phaser.GameObjects.Container): void { const angle = attacker ? Phaser.Math.Angle.Between(attacker.x, attacker.y, target.x, target.y) : Phaser.Math.FloatBetween(0, Math.PI * 2); for (let i = 0; i < 5; i += 1) { const a = angle + Phaser.Math.FloatBetween(-0.7, 0.7); const s = scene.add.circle(target.x, target.y - 20, Phaser.Math.Between(2, 4), 0xfbbf24, 0.82).setDepth(4000); scene.tweens.add({ targets: s, x: s.x + Math.cos(a) * Phaser.Math.Between(25, 55), y: s.y + Math.sin(a) * Phaser.Math.Between(25, 55), alpha: 0, duration: 180, onComplete: () => s.destroy() }); } }
function showDamageWash(scene: Phaser.Scene): void { const wash = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, GAMEPLAY_THEME.colors.danger, 0.2).setOrigin(0).setScrollFactor(0).setDepth(5000); scene.tweens.add({ targets: wash, alpha: 0, duration: 240, ease: "Cubic.out", onComplete: () => wash.destroy() }); }
function applyHitStop(scene: Phaser.Scene, ms: number): void { const world = (scene.physics as Phaser.Physics.Arcade.ArcadePhysics | undefined)?.world; scene.anims.pauseAll(); scene.tweens.pauseAll(); world?.pause(); scene.time.delayedCall(ms, () => { scene.anims.resumeAll(); scene.tweens.resumeAll(); world?.resume(); }); }
function shakeCamera(scene: Phaser.Scene, intensity: number, duration: number): void { scene.cameras.main.shake(duration, intensity); }
function norm(d: Vector2): Vector2 { const m = Math.hypot(d.x, d.y); return m > 0 ? { x: d.x / m, y: d.y / m } : { x: 0, y: 1 }; }

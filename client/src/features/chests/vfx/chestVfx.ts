import type { ChestOpenedEvent, ChestRummageInterruptedEvent, ChestRummageStartedEvent, ChestRummageTickedEvent, WorldDrop } from "@gamer/shared";
import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";
import type { ChestState } from "../../../network/socketClient";
import { GAMEPLAY_THEME } from "../../../ui/gameplayTheme";

type ChestLike = Partial<ChestState> & { chestId?: string; id?: string; x: number; y: number };
interface ChestVfxContext {
  scene: Phaser.Scene;
  getChest: (chestId: string) => ChestLike | undefined;
  getPlayerMarker: (playerId: string) => { root: Phaser.GameObjects.Container } | undefined;
  getMonsterMarkers?: () => Iterable<{ root: Phaser.GameObjects.Container; alertIcon?: Phaser.GameObjects.Text | null }>;
}

const sprites = new Map<string, Phaser.GameObjects.Image>();
const labels = new Map<string, Phaser.GameObjects.Text>();
const glows = new Map<string, Phaser.GameObjects.Image>();
const bars = new Map<string, Phaser.GameObjects.Graphics>();
const barLabels = new Map<string, Phaser.GameObjects.Text>();
const playerRings = new Map<string, Phaser.GameObjects.Graphics>();
const dispensed = new Map<string, number>();

export const CHEST_GLOW_TEXTURE = "chest-glow";

/**
 * 宝箱的存在感来自自身发出的暖光（呼吸式），不是描在地上的矢量圈。
 * 富宝箱光更亮更大、高危宝箱偏琥珀色——玩家凭光色读危险与价值。
 */
export function ensureChestGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CHEST_GLOW_TEXTURE)) return;
  const size = 256;
  const canvas = scene.textures.createCanvas(CHEST_GLOW_TEXTURE, size, size);
  if (!canvas) return;
  const g = canvas.getContext();
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.32)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  canvas.refresh();
}

export function mountChestVfx(ctx: ChestVfxContext): () => void {
  const started = (p: ChestRummageStartedEvent["payload"]) => {
    const sprite = syncChest(ctx, p.chestId);
    if (!sprite) return;
    progress(ctx, p.chestId, p.playerId, 0, Math.max(1, p.noiseRadius > 0 ? 4 : 1));
    if (p.qualityTier === "rich") showContestedChestWarning(ctx.scene, sprite.x, sprite.y, 0);
  };
  const ticked = (p: ChestRummageTickedEvent["payload"]) => {
    const chest = ctx.getChest(p.chestId);
    const total = p.droppedItemCount + p.remainingItemCount;
    progress(ctx, p.chestId, "", p.droppedItemCount, Math.max(1, total));
    const sprite = chest && syncChest(ctx, p.chestId);
    if (sprite) { spawnNoiseWave(ctx.scene, sprite.x, sprite.y); updateMonsterAlerts(ctx, sprite.x, sprite.y); }
  };
  const interrupted = (p: ChestRummageInterruptedEvent["payload"]) => clearProgress(p.chestId, p.playerId);
  const opened = (p: ChestOpenedEvent["payload"]) => {
    const sprite = syncChest(ctx, p.chestId);
    if (!sprite) return;
    sprite.setTexture("chest_open").setAlpha(1).clearTint().setAngle(0);
    ctx.scene.tweens.killTweensOf(sprite);
    // 贴图原始 1254px，世界显示尺寸由 setDisplaySize(110) 决定（scale≈0.088）。
    // 弹跳动画必须回到这个 scale，tween 到 1 会把宝箱放大到原始像素糊满屏幕。
    sprite.setDisplaySize(110, 110);
    const targetScale = sprite.scaleX;
    sprite.setScale(targetScale * 0.5);
    ctx.scene.tweens.add({ targets: sprite, scale: targetScale, duration: 400, ease: "Back.easeOut" });
    spawnRewardFlare(ctx.scene, sprite.x, sprite.y);
    spawnOpenBurst(ctx.scene, sprite.x, sprite.y);
    spawnRewardSummary(ctx.scene, sprite.x, sprite.y, p.drops);
    spawnLootPopups(ctx.scene, sprite.x, sprite.y, p.drops);
    labels.get(p.chestId)?.destroy(); labels.delete(p.chestId);
    const glow = glows.get(p.chestId);
    if (glow) { ctx.scene.tweens.killTweensOf(glow); glow.destroy(); glows.delete(p.chestId); }
    clearProgress(p.chestId, p.playerId);
  };
  clientEventBus.on("ChestRummageStarted", started);
  clientEventBus.on("ChestRummageTicked", ticked);
  clientEventBus.on("ChestRummageInterrupted", interrupted);
  clientEventBus.on("ChestOpened", opened);
  return () => {
    clientEventBus.off("ChestRummageStarted", started);
    clientEventBus.off("ChestRummageTicked", ticked);
    clientEventBus.off("ChestRummageInterrupted", interrupted);
    clientEventBus.off("ChestOpened", opened);
  };
}

function syncChest(ctx: ChestVfxContext, chestId: string): Phaser.GameObjects.Image | undefined {
  const chest = ctx.getChest(chestId);
  if (!chest) return undefined;
  let sprite = sprites.get(chestId);
  if (!sprite) {
    sprite = ctx.scene.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed").setDepth(chest.y);
    sprites.set(chestId, sprite);
  }
  sprite.setPosition(chest.x, chest.y).setDisplaySize(110, 110);
  if (chest.isOpen || chest.state === "empty") return sprite.setTexture("chest_open").setAlpha(0.6).setAngle(0);
  sprite.setTexture("chest_closed").setAlpha(chest.state === "interrupted" ? 0.4 : 1);
  if (chest.state === "interrupted") sprite.setTint(0x444444); else sprite.clearTint();
  if (chest.state === "rummaging" && !ctx.scene.tweens.isTweening(sprite)) {
    ctx.scene.tweens.add({ targets: sprite, angle: { from: -3, to: 3 }, y: { from: chest.y - 2, to: chest.y + 2 }, duration: 100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
  const rich = chest.qualityTier === "rich";
  const contested = chest.lane === "contested";
  let glow = glows.get(chestId);
  if (!glow) {
    ensureChestGlowTexture(ctx.scene);
    glow = ctx.scene.add.image(chest.x, chest.y, CHEST_GLOW_TEXTURE).setBlendMode("ADD");
    glows.set(chestId, glow);
    ctx.scene.tweens.add({
      targets: glow,
      alpha: { from: rich ? 0.5 : 0.3, to: rich ? 0.28 : 0.16 },
      duration: 1500 + Math.floor(Math.random() * 600),
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
  }
  glow
    .setPosition(chest.x, chest.y + 8)
    .setDepth(chest.y - 1)
    .setDisplaySize(rich ? 240 : 180, rich ? 200 : 150)
    .setTint(contested ? 0xff8a3d : rich ? 0xffdf8a : 0xffc46a)
    .setVisible(chest.state !== "interrupted");
  // 常驻名牌取消（宝箱长什么样玩家看得见，靠近时由交互提示接管）；只保留中断警示
  if (chest.state === "interrupted") {
    const label = labels.get(chestId) ?? ctx.scene.add.text(chest.x, chest.y - 30, "", {
      fontFamily: GAMEPLAY_THEME.fonts.display, fontSize: "14px", color: "#ef4444", stroke: "#000000", strokeThickness: 3
    }).setOrigin(0.5).setDepth(chest.y + 1);
    labels.set(chestId, label);
    label.setText("已中断").setPosition(chest.x, chest.y - 30).setVisible(true);
  } else {
    labels.get(chestId)?.setVisible(false);
  }
  return sprite;
}

function progress(ctx: ChestVfxContext, chestId: string, playerId: string, count: number, total: number): void {
  const sprite = syncChest(ctx, chestId);
  if (!sprite) return;
  const ratio = total > 0 ? count / total : 0;
  const bar = bars.get(chestId) ?? ctx.scene.add.graphics().setDepth(sprite.y + 2);
  bars.set(chestId, bar);
  bar.clear();
  const x = sprite.x - 60, y = sprite.y - 70;
  bar.fillStyle(0x000000, 0.85).fillRect(x, y, 120, 10).lineStyle(2, 0x92400e, 1).strokeRect(x, y, 120, 10);
  bar.fillStyle(0xfbbf24, 1).fillRect(x + 1, y + 1, 118 * ratio, 8);
  const label = barLabels.get(chestId) ?? ctx.scene.add.text(sprite.x, sprite.y - 88, "", {
    fontFamily: GAMEPLAY_THEME.fonts.display, fontSize: "16px", color: "#facc15", stroke: "#000000", strokeThickness: 3
  }).setOrigin(0.5).setDepth(sprite.y + 2);
  barLabels.set(chestId, label);
  label.setText(`翻找中 ${count}/${total}`).setPosition(sprite.x, sprite.y - 88);
  const marker = playerId ? ctx.getPlayerMarker(playerId) : undefined;
  if (marker) {
    const ring = playerRings.get(playerId) ?? ctx.scene.add.graphics().setDepth(marker.root.depth + 1);
    playerRings.set(playerId, ring);
    ring.clear().setPosition(marker.root.x, marker.root.y).lineStyle(4, 0x000000, 0.4).strokeCircle(0, 0, 40);
    ring.lineStyle(4, 0xf59e0b, 0.9).beginPath();
    ring.arc(0, 0, 40, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * ratio), false).strokePath();
  }
  if (count > (dispensed.get(chestId) ?? 0)) { spawnDropSparks(ctx.scene, sprite.x, sprite.y); dispensed.set(chestId, count); }
}

function clearProgress(chestId: string, playerId: string): void {
  bars.get(chestId)?.destroy(); bars.delete(chestId);
  barLabels.get(chestId)?.destroy(); barLabels.delete(chestId);
  if (playerId) { playerRings.get(playerId)?.destroy(); playerRings.delete(playerId); }
  dispensed.delete(chestId);
}
function spawnDropSparks(scene: Phaser.Scene, x: number, y: number): void { for (let i = 0; i < 8; i += 1) { const s = scene.add.circle(x, y, Phaser.Math.Between(2, 4), 0xfacc15, 0.8).setDepth(y + 10); const a = Phaser.Math.FloatBetween(-Math.PI * 0.8, -Math.PI * 0.2), speed = Phaser.Math.Between(100, 200); scene.tweens.add({ targets: s, x: x + Math.cos(a) * speed * 0.5, y: y + Math.sin(a) * speed * 0.5, alpha: 0, scale: 0.2, duration: 500, ease: "Cubic.out", onComplete: () => s.destroy() }); } }
function spawnNoiseWave(scene: Phaser.Scene, x: number, y: number): void { const wave = scene.add.graphics().setDepth(y - 2).lineStyle(2, 0xd97706, 0.7).strokeCircle(x, y, 30); scene.tweens.add({ targets: wave, scaleX: 8.3, scaleY: 8.3, alpha: 0, duration: 800, ease: "Quad.out", onComplete: () => wave.destroy() }); }
function spawnRewardFlare(scene: Phaser.Scene, x: number, y: number): void {
  ensureChestGlowTexture(scene);
  const flare = scene.add.image(x, y + 4, CHEST_GLOW_TEXTURE)
    .setBlendMode("ADD")
    .setTint(0xffd17a)
    .setAlpha(0.86)
    .setDepth(y + 6)
    .setDisplaySize(92, 68);
  const targetScaleX = flare.scaleX * 2.4;
  const targetScaleY = flare.scaleY * 1.9;
  scene.tweens.add({
    targets: flare,
    alpha: 0,
    scaleX: targetScaleX,
    scaleY: targetScaleY,
    duration: 760,
    ease: "Cubic.out",
    onComplete: () => flare.destroy()
  });
}

function spawnOpenBurst(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setPosition(x, y).setDepth(y + 10).lineStyle(2, 0xfacc15, 0.8);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, scale: 1.5, duration: 500, ease: "Cubic.out", onComplete: () => g.destroy() });
  spawnDropSparks(scene, x, y);
}

function spawnRewardSummary(scene: Phaser.Scene, x: number, y: number, loot: WorldDrop[]): void {
  const drops = Array.isArray(loot) ? loot : [];
  if (drops.length === 0) return;

  const totalValue = drops.reduce((sum, drop) => sum + getDropValue(drop), 0);
  const valueText = totalValue > 0 ? ` · +${formatCompactValue(totalValue)}` : "";
  const text = scene.add.text(x, y - 58, `收获 ${drops.length} 件${valueText}`, {
    fontFamily: GAMEPLAY_THEME.fonts.display,
    fontSize: "20px",
    color: "#ffe8a3",
    stroke: "#2a1208",
    strokeThickness: 5,
    align: "center"
  }).setOrigin(0.5).setDepth(y + 28).setAlpha(0).setScale(0.92);

  scene.tweens.add({
    targets: text,
    y: y - 86,
    alpha: 1,
    scale: 1.05,
    duration: 180,
    ease: "Back.easeOut",
    onComplete: () => {
      scene.time.delayedCall(760, () => {
        scene.tweens.add({
          targets: text,
          y: y - 118,
          alpha: 0,
          duration: 360,
          ease: "Sine.easeIn",
          onComplete: () => text.destroy()
        });
      });
    }
  });
}

function spawnLootPopups(scene: Phaser.Scene, x: number, y: number, loot: WorldDrop[]): void {
  const drops = Array.isArray(loot) ? loot : [];
  drops.forEach((drop, i) => {
    const text = scene.add.text(x, y - 34, formatDropLabel(drop), {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "16px",
      color: getDropValue(drop) >= 100 ? "#fff1b8" : "#fbbf24",
      stroke: "#1b1208",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(y + 20 + i).setAlpha(0);
    scene.tweens.add({
      targets: text,
      y: y - 126 - i * 18,
      x: x + (i % 2 === 0 ? 38 : -38),
      alpha: { from: 0, to: 1 },
      duration: 220,
      delay: i * 90,
      ease: "Sine.easeOut",
      onComplete: () => {
        scene.time.delayedCall(620, () => {
          scene.tweens.add({
            targets: text,
            y: text.y - 28,
            alpha: 0,
            duration: 420,
            ease: "Cubic.out",
            onComplete: () => text.destroy()
          });
        });
      }
    });
  });
}

function formatDropLabel(drop: WorldDrop): string {
  const item = drop.item;
  const name = item.name || item.definitionId || drop.definitionId || "Loot";
  const value = getDropValue(drop);
  return value > 0 ? `${name} +${formatCompactValue(value)}` : name;
}

function getDropValue(drop: WorldDrop): number {
  return Math.max(0, drop.item.goldValue ?? 0) + Math.max(0, drop.item.treasureValue ?? 0);
}

function formatCompactValue(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return Math.round(value).toString();
}
function updateMonsterAlerts(ctx: ChestVfxContext, x: number, y: number): void { for (const marker of ctx.getMonsterMarkers?.() ?? []) { if (Math.hypot(x - marker.root.x, y - marker.root.y) < 720) showMonsterAlert(marker); } }
function showMonsterAlert(marker: { root: Phaser.GameObjects.Container; alertIcon?: Phaser.GameObjects.Text | null }): void { if (marker.alertIcon) return; const scene = marker.root.scene; const alert = scene.add.text(0, -24, "!", { fontFamily: "monospace", fontSize: "14px", color: "#facc15", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setAlpha(0); marker.root.add(alert); marker.alertIcon = alert; scene.tweens.add({ targets: alert, alpha: 1, duration: 300 }); scene.time.delayedCall(1000, () => scene.tweens.add({ targets: alert, alpha: 0, duration: 600, onComplete: () => { alert.destroy(); marker.alertIcon = null; } })); }
function showContestedChestWarning(scene: Phaser.Scene, x: number, y: number, aggroedCount: number): void { const ring = scene.add.graphics().setDepth(y + 3).lineStyle(3, 0xfb923c, 0.9).strokeCircle(x, y, 34); scene.tweens.add({ targets: ring, alpha: 0, scaleX: 2.4, scaleY: 2.4, duration: 720, ease: "Sine.easeOut", onComplete: () => ring.destroy() }); const text = scene.add.text(x, y - 78, aggroedCount > 0 ? `噪音惊动怪物 x${aggroedCount}` : "噪音向四周扩散", { fontFamily: GAMEPLAY_THEME.fonts.display, fontSize: "15px", color: "#fed7aa", stroke: "#2a1208", strokeThickness: 4 }).setOrigin(0.5).setDepth(y + 4); scene.tweens.add({ targets: text, y: y - 104, alpha: 0, duration: 1300, ease: "Sine.easeOut", onComplete: () => text.destroy() }); }

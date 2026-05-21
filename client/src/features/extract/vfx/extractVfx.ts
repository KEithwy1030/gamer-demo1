import type { BeaconLitEvent, ExtractChannelInterruptedEvent, ExtractChannelStartedEvent, ExtractChannelTickedEvent, ExtractOpenedEvent, ExtractSucceededEvent, Vector2 } from "@gamer/shared";
import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";
import { GAMEPLAY_THEME } from "../../../ui/gameplayTheme";

interface ExtractVfxContext {
  scene: Phaser.Scene;
  getZonePosition: (zoneId?: string) => { x: number; y: number; radius: number } | undefined;
  getPlayerMarker: (playerId: string) => { root: Phaser.GameObjects.Container } | undefined;
}

let outerRing: Phaser.GameObjects.Arc | undefined;
let innerRing: Phaser.GameObjects.Arc | undefined;
let progressRing: Phaser.GameObjects.Graphics | undefined;
let label: Phaser.GameObjects.Text | undefined;
const channelTotals = new Map<string, number>();

export function mountExtractVfx(ctx: ExtractVfxContext): () => void {
  const opened = (p: ExtractOpenedEvent["payload"]) => {
    const zone = ctx.getZonePosition(p.zoneIds[0]);
    if (!zone) return;
    syncZone(ctx.scene, zone, true, 0);
  };
  const beacon = (p: BeaconLitEvent["payload"]) => {
    syncZone(ctx.scene, { ...p.position, radius: ctx.getZonePosition(p.extractZoneId)?.radius ?? 126 }, true, 0);
    spawnBeaconPulse(ctx.scene, p.position);
  };
  const started = (p: ExtractChannelStartedEvent["payload"]) => {
    channelTotals.set(p.playerId, p.channelDurationMs);
    const zone = ctx.getZonePosition(p.zoneId) ?? fromPlayer(ctx, p.playerId);
    if (zone) syncZone(ctx.scene, zone, true, 0.01);
  };
  const ticked = (p: ExtractChannelTickedEvent["payload"]) => {
    const total = channelTotals.get(p.playerId) ?? p.remainingMs;
    const zone = fromPlayer(ctx, p.playerId) ?? ctx.getZonePosition();
    if (zone) syncZone(ctx.scene, zone, true, Phaser.Math.Clamp(1 - p.remainingMs / Math.max(1, total), 0, 1));
  };
  const interrupted = (p: ExtractChannelInterruptedEvent["payload"]) => {
    const zone = fromPlayer(ctx, p.playerId) ?? ctx.getZonePosition();
    if (zone) spawnExtractInterruptWarning(ctx.scene, zone.x, zone.y, zone.radius);
    channelTotals.delete(p.playerId);
  };
  const succeeded = (p: ExtractSucceededEvent["payload"]) => {
    const zone = ctx.getZonePosition(p.zoneId) ?? fromPlayer(ctx, p.playerId);
    if (zone) {
      syncZone(ctx.scene, zone, true, 1);
      spawnExtractSuccessBurst(ctx.scene, zone.x, zone.y, zone.radius);
    }
    channelTotals.delete(p.playerId);
  };
  clientEventBus.on("ExtractOpened", opened);
  clientEventBus.on("BeaconLit", beacon);
  clientEventBus.on("ExtractChannelStarted", started);
  clientEventBus.on("ExtractChannelTicked", ticked);
  clientEventBus.on("ExtractChannelInterrupted", interrupted);
  clientEventBus.on("ExtractSucceeded", succeeded);
  return () => {
    clientEventBus.off("ExtractOpened", opened);
    clientEventBus.off("BeaconLit", beacon);
    clientEventBus.off("ExtractChannelStarted", started);
    clientEventBus.off("ExtractChannelTicked", ticked);
    clientEventBus.off("ExtractChannelInterrupted", interrupted);
    clientEventBus.off("ExtractSucceeded", succeeded);
  };
}

function syncZone(scene: Phaser.Scene, zone: { x: number; y: number; radius: number }, isOpen: boolean, progress: number): void {
  outerRing ??= scene.add.circle(zone.x, zone.y, zone.radius + 24, GAMEPLAY_THEME.colors.signal, 0.07).setDepth(-5);
  innerRing ??= scene.add.circle(zone.x, zone.y, zone.radius, GAMEPLAY_THEME.colors.signal, 0.05).setDepth(-4.9);
  progressRing ??= scene.add.graphics().setDepth(-4.5);
  label ??= scene.add.text(zone.x, zone.y + zone.radius + 18, "", {
    fontFamily: GAMEPLAY_THEME.fonts.display,
    fontSize: "14px",
    color: "#f7e5c5",
    stroke: "#1f1308",
    strokeThickness: 4,
    align: "center"
  }).setOrigin(0.5).setDepth(-3.5);

  outerRing.setPosition(zone.x, zone.y).setRadius(zone.radius + 24).setFillStyle(GAMEPLAY_THEME.colors.signal, isOpen ? 0.07 : 0.1).setStrokeStyle(8, GAMEPLAY_THEME.colors.accent, isOpen ? 0.24 : 0.18);
  innerRing.setPosition(zone.x, zone.y).setRadius(zone.radius).setFillStyle(GAMEPLAY_THEME.colors.signal, isOpen ? 0.05 : 0.07).setStrokeStyle(3, GAMEPLAY_THEME.colors.bone, isOpen ? 0.2 : 0.15);
  if (!scene.tweens.isTweening(outerRing)) {
    scene.tweens.add({ targets: [outerRing, innerRing], scaleX: { from: 0.98, to: 1.02 }, scaleY: { from: 0.98, to: 1.02 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
  progressRing.clear();
  if (progress > 0 && progress < 1) {
    progressRing.lineStyle(6, 0xfbbf24, 0.8).beginPath();
    progressRing.arc(zone.x, zone.y, zone.radius + 4, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * progress), false).strokePath();
  }
  label.setText(progress >= 1 ? "撤离完成" : progress > 0 ? "撤离中" : "撤离点已开启").setPosition(zone.x, zone.y + zone.radius + 18);
}

function spawnBeaconPulse(scene: Phaser.Scene, position: Vector2): void {
  const pulse = scene.add.circle(position.x, position.y, 24, 0xfbbf24, 0.24).setDepth(-3.8);
  scene.tweens.add({ targets: pulse, scale: 3, alpha: 0, duration: 760, ease: "Sine.easeOut", onComplete: () => pulse.destroy() });
}

function spawnExtractSuccessBurst(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  const burst = scene.add.graphics().setPosition(x, y).setDepth(-3);
  burst.lineStyle(4, 0xfbbf24, 0.9).strokeCircle(0, 0, radius);
  burst.fillStyle(0xfbbf24, 0.12).fillCircle(0, 0, radius * 0.72);
  scene.tweens.add({ targets: burst, alpha: 0, scale: 1.45, duration: 760, ease: "Cubic.out", onComplete: () => burst.destroy() });
}

function spawnExtractInterruptWarning(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  const warning = scene.add.graphics().setPosition(x, y).setDepth(-3);
  warning.lineStyle(5, 0xef4444, 0.8).strokeCircle(0, 0, radius + 8);
  scene.tweens.add({ targets: warning, alpha: 0, scale: 1.15, duration: 520, ease: "Sine.easeOut", onComplete: () => warning.destroy() });
}

function fromPlayer(ctx: ExtractVfxContext, playerId: string): { x: number; y: number; radius: number } | undefined {
  const marker = ctx.getPlayerMarker(playerId);
  return marker ? { x: marker.root.x, y: marker.root.y, radius: 126 } : undefined;
}

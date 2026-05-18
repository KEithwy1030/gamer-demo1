import Phaser from "phaser";
import type { ChestOpenedPayload, ChestProgressPayload, ChestState } from "../../network/socketClient";
import type { ExtractUiState } from "../createGameClient";
import type { PlayerMarker } from "../../game/entities/PlayerMarker";
import { logEvent } from "../../dev/runtimeLog";

function shouldSuppressAutoStartExtractForP0B(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const testHooks = (window as Window & {
    __P0B_TEST_HOOKS__?: {
      suppressAutoStartExtract?: boolean;
    };
  }).__P0B_TEST_HOOKS__;

  return testHooks?.suppressAutoStartExtract === true;
}

export class GameSceneInteractions {
  private readonly scene: Phaser.Scene;
  private readonly chestSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly chestLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly chestDangerRings = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly chestGlows = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly chestProgressBars = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly chestProgressLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly chestMetadata = new Map<string, { lane?: ChestState["lane"]; noiseRadius?: number; qualityTier?: ChestState["qualityTier"] }>();
  private readonly chestLastDispensedCount = new Map<string, number>();
  private readonly activeRummageChests = new Set<string>();
  private readonly playerProgressRings = new Map<string, Phaser.GameObjects.Graphics>();
  private localPlayerId: string | null = null;
  private playerMarkers?: Map<string, PlayerMarker>;
  private chestUnsubscribes: Array<() => void> = [];
  private interactionPrompt?: Phaser.GameObjects.Text;
  private extractAutoStarted = false;
  private extractAutoRearmRequired = false;
  private extractLastPhase: ExtractUiState["phase"] | null = null;
  private extractZone?: { x: number; y: number; radius: number };

  private static readonly EXTRACT_START_INSET_MIN = 10;
  private static readonly EXTRACT_START_INSET_MAX = 16;
  private static readonly EXTRACT_REARM_GRACE_MIN = 8;
  private static readonly EXTRACT_REARM_GRACE_MAX = 14;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  syncLocalPlayerId(id: string | null): void {
    this.localPlayerId = id;
  }

  syncPlayerMarkers(markers: Map<string, PlayerMarker>): void {
    this.playerMarkers = markers;
  }

  mount(
    subscribeChestsInit?: (callback: (chests: ChestState[]) => void) => () => void,
    subscribeChestOpened?: (callback: (payload: ChestOpenedPayload) => void) => () => void,
    subscribeChestProgress?: (callback: (payload: ChestProgressPayload) => void) => () => void,
    initialChests: ChestState[] = []
  ): void {
    this.chestUnsubscribes = [];
    if (subscribeChestsInit) {
      this.chestUnsubscribes.push(subscribeChestsInit((chests) => {
        logEvent("CHEST", "chests.init", {
          count: chests.length,
          chestIds: chests.slice(0, 5).map((chest) => chest.chestId ?? chest.id ?? "")
        });
        this.applyChests(chests);
      }));
    }

    if (initialChests.length > 0) {
      this.applyChests(initialChests);
    }

    if (subscribeChestOpened) {
      this.chestUnsubscribes.push(subscribeChestOpened((payload) => {
        const sprite = this.chestSprites.get(payload.chestId);
        if (!sprite) {
          return;
        }

        sprite.setTexture("chest_open");
        sprite.setAlpha(1);
        sprite.clearTint();
        sprite.setAngle(0); // [待人工调优] B.2 Reset shake angle
        this.scene.tweens.killTweensOf(sprite); // [待人工调优] B.2 Stop shake tween

        this.chestLabels.get(payload.chestId)?.destroy();
        this.chestLabels.delete(payload.chestId);
        this.chestDangerRings.get(payload.chestId)?.destroy();
        this.chestDangerRings.delete(payload.chestId);
        this.chestGlows.get(payload.chestId)?.destroy();
        this.chestGlows.delete(payload.chestId);
        this.chestProgressBars.get(payload.chestId)?.destroy();
        this.chestProgressBars.delete(payload.chestId);
        this.chestProgressLabels.get(payload.chestId)?.destroy();
        this.chestProgressLabels.delete(payload.chestId);
        this.chestLastDispensedCount.delete(payload.chestId);
        this.activeRummageChests.delete(payload.chestId);

        if (payload.lane === "contested") {
          this.showContestedChestWarning(sprite.x, sprite.y, payload.aggroedMonsterIds?.length ?? 0);
        }
      }));
    }

    if (subscribeChestProgress) {
      this.chestUnsubscribes.push(subscribeChestProgress((payload) => {
        this.syncChestProgress(payload);
        // C.3 Audio tick placeholder
        (this.scene as any).onAudioCue?.("rummage-tick");
      }));
    }

    this.interactionPrompt = this.scene.add.text(0, 0, "\u6309 E \u5f00\u7bb1", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#facc15",
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(4000).setVisible(false);
  }

  applyChests(chests: ChestState[]): void {
    chests.forEach((chest) => this.syncChest(chest));
  }

  updateChestPrompt(playerMarker?: PlayerMarker): void {
    if (!playerMarker || !this.interactionPrompt) return;
    let nearest: string | null = null;
    let minDistance = 80;
    for (const [id, sprite] of this.chestSprites.entries()) {
      if (sprite.texture.key === "chest_closed" && sprite.alpha > 0.6) { // Only prompt for attractive chests
        const distance = distanceBetween(playerMarker.root.x, playerMarker.root.y, sprite.x, sprite.y);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = id;
        }
      }
    }

    if (nearest) {
      const chest = this.chestSprites.get(nearest);
      if (!chest) return;
      const metadata = this.chestMetadata.get(nearest);
      this.interactionPrompt
        .setText(metadata?.lane === "contested" ? "\u6309 E \u5f00\u9ad8\u5371\u7bb1" : "\u6309 E \u5f00\u7bb1")
        .setColor(metadata?.lane === "contested" ? "#fb923c" : "#facc15")
        .setPosition(chest.x, chest.y - 50)
        .setVisible(true)
        .setData("chestId", nearest);
      return;
    }

    this.interactionPrompt.setVisible(false);
  }

  hidePrompt(): void {
    this.interactionPrompt?.setVisible(false);
  }

  handleInteract(onOpenChest?: (chestId: string) => void, onPickup?: () => void): void {
    if (this.interactionPrompt?.visible) {
      const chestId = this.interactionPrompt.getData("chestId");
      if (chestId) {
        logEvent("CHEST", "chest.open_request", {
          chestId
        });
        onOpenChest?.(chestId);
        return;
      }
    }

    onPickup?.();
  }

  updateAutoExtract(
    playerMarker: PlayerMarker | undefined,
    extractState: ExtractUiState,
    onStartExtract?: () => void
  ): void {
    if (shouldSuppressAutoStartExtractForP0B()) {
      this.extractAutoStarted = false;
      this.extractAutoRearmRequired = false;
      this.extractLastPhase = extractState.phase;
      this.syncExtractZone(extractState);
      return;
    }

    const activeSquadId = extractState.squadStatus?.activeSquadId ?? extractState.carrier?.holderSquadId ?? null;
    const selfMember = extractState.squadStatus?.members.find((member) => member.playerId === playerMarker?.id);
    const canTryExtract = extractState.isOpen
      ? Boolean(activeSquadId && selfMember)
      : extractState.carrier?.holderPlayerId === playerMarker?.id;
    if (!playerMarker || !canTryExtract) return;

    this.syncExtractZone(extractState);
    if (!this.extractZone) return;

    const distance = distanceBetween(
      playerMarker.root.x,
      playerMarker.root.y,
      this.extractZone.x,
      this.extractZone.y
    );

    const zoneRadius = this.extractZone.radius;
    const startRadius = this.getExtractStartRadius(zoneRadius);
    const rearmRadius = this.getExtractRearmRadius(zoneRadius);
    const insideStartRadius = distance <= startRadius;
    const outsideRearmRadius = distance > rearmRadius;
    const serverReportsOutsideStart = selfMember?.isInsideZone === false && !selfMember.isExtracting;
    const phaseChanged = this.extractLastPhase !== extractState.phase;
    const extractionStoppedAfterAutoStart = this.extractAutoStarted
      && !extractState.isExtracting
      && extractState.phase !== "succeeded";

    if (outsideRearmRadius) {
      this.extractAutoStarted = false;
      this.extractAutoRearmRequired = false;
      this.extractLastPhase = extractState.phase;
      return;
    }

    if (extractState.phase === "interrupted" && phaseChanged) {
      this.extractAutoStarted = false;
      this.extractAutoRearmRequired = insideStartRadius && !serverReportsOutsideStart;
    }

    // The server can follow an interrupted progress event with an opened heartbeat,
    // which normalizes the UI phase back to idle before the next scene tick. Rearm
    // the auto-start latch from the authoritative zone membership as soon as we know
    // the previous auto-started channel has stopped and the player is outside.
    if (extractionStoppedAfterAutoStart && serverReportsOutsideStart) {
      this.extractAutoStarted = false;
      this.extractAutoRearmRequired = false;
    }

    if (extractState.phase === "succeeded") {
      this.extractAutoStarted = true;
      this.extractAutoRearmRequired = false;
      this.extractLastPhase = extractState.phase;
      return;
    }

    if (this.extractAutoRearmRequired) {
      if (!insideStartRadius || serverReportsOutsideStart) {
        this.extractAutoRearmRequired = false;
        this.extractAutoStarted = false;
        this.extractLastPhase = extractState.phase;
        return;
      }
      this.extractLastPhase = extractState.phase;
      return;
    }

    if (insideStartRadius && !serverReportsOutsideStart && !this.extractAutoStarted && !extractState.isExtracting) {
      onStartExtract?.();
      this.extractAutoStarted = true;
      this.extractAutoRearmRequired = false;
    }
    this.extractLastPhase = extractState.phase;
  }

  private syncChest(chest: ChestState): void {
    const chestId = chest.chestId ?? chest.id;
    if (!chestId) {
      return;
    }

    this.chestMetadata.set(chestId, { lane: chest.lane, noiseRadius: chest.noiseRadius, qualityTier: chest.qualityTier });
    let sprite = this.chestSprites.get(chestId);
    if (!sprite) {
      sprite = this.scene.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed").setDepth(chest.y);
      this.chestSprites.set(chestId, sprite);
    }

    // [待人工调优] 1.1 Bigger and more visible base chest: 110x110
    sprite.setDisplaySize(110, 110);

    if (chest.isOpen || chest.state === "empty") {
      sprite.setTexture("chest_open");
      // [待人工调优] 1.5 Empty state: darker tint/alpha
      sprite.setAlpha(0.6);
      sprite.setAngle(0); // [待人工调优] B.2 Reset shake
      this.scene.tweens.killTweensOf(sprite); // [待人工调优] B.2 Stop shake
      this.chestGlows.get(chestId)?.destroy();
      this.chestGlows.delete(chestId);
      this.chestLabels.get(chestId)?.destroy();
      this.chestLabels.delete(chestId);
      return;
    }

    // [待人工调优] B.2 Chest Shaking Animation
    if (chest.state === "rummaging") {
      if (!this.scene.tweens.isTweening(sprite)) {
        this.scene.tweens.add({
          targets: sprite,
          angle: { from: -3, to: 3 }, // [待人工调优] ±3°
          y: { from: chest.y - 2, to: chest.y + 2 }, // [待人工调优] ±2px bob
          duration: 100, // [待人工调优] 200ms round trip
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      }
    } else {
      sprite.setAngle(0);
      sprite.setY(chest.y);
      this.scene.tweens.killTweensOf(sprite);
    }

    // [待人工调优] 1.1 Outline glow: radius 64, orange #fbbf24, alpha 0.55
    let glow = this.chestGlows.get(chestId);
    if (!glow) {
      glow = this.scene.add.graphics().setDepth(chest.y - 1);
      this.chestGlows.set(chestId, glow);
    }
    glow.clear();
    const isRich = chest.qualityTier === "rich";
    const glowColor = isRich ? 0xfacc15 : 0xfbbf24; // [待人工调优] 1.2 Gold #facc15 vs Orange #fbbf24
    const glowAlpha = isRich ? 0.75 : 0.55; // [待人工调优] 1.2 Alpha 0.75 vs 0.55
    const glowStroke = isRich ? 4 : 3; // [待人工调优] 1.2 Stroke 4 vs 3
    glow.lineStyle(glowStroke, glowColor, glowAlpha);
    glow.strokeCircle(chest.x, chest.y, 64);

    if (isRich && !this.scene.tweens.isTweening(glow)) {
      // [待人工调优] 1.2 Pulsing animation: 0.55-0.85 over 1.4s
      this.scene.tweens.add({
        targets: glow,
        alpha: { from: 0.85, to: 0.55 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    if (chest.state === "interrupted") {
      // [待人工调优] 1.4 Interrupted state: dim filter
      sprite.setTint(0x444444);
      sprite.setAlpha(0.4);
    } else {
      sprite.clearTint();
      sprite.setAlpha(1);
    }

    if (chest.lane === "contested" && !this.chestDangerRings.has(chestId)) {
      const ring = this.scene.add.graphics().setDepth(chest.y - 1);
      ring.lineStyle(2, 0xf97316, 0.72);
      ring.strokeCircle(chest.x, chest.y, 76);
      this.chestDangerRings.set(chestId, ring);
    }

    let label = this.chestLabels.get(chestId);
    if (!label) {
      label = this.scene.add.text(chest.x, chest.y - 30, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(chest.y + 1);
      this.chestLabels.set(chestId, label);
    }

    if (chest.state === "interrupted") {
      // [待人工调优] 1.4 Interrupted state: "已中断" red text
      label.setText("\u5df2\u4e2d\u65ad").setColor("#ef4444").setPosition(chest.x, chest.y - 30);
    } else {
      label.setText(chest.lane === "contested" ? "\u9ad8\u5371\u5b9d\u7bb1" : "\u5b9d\u7bb1")
           .setColor(chest.lane === "contested" ? "#fed7aa" : "#ffffff")
           .setPosition(chest.x, chest.y - 30);
    }

    if (chest.state === "rummaging" || chest.rummagerId) {
      this.syncChestProgress({
        chestId,
        playerId: chest.rummagerId ?? "",
        itemsDispensed: chest.itemsDispensed ?? 0,
        totalItems: chest.totalItems ?? 1,
        status: "progress",
        remainingMs: 0,
        durationMs: 0
      });
    }
  }

  private syncChestProgress(payload: ChestProgressPayload): void {
    const chestId = payload.chestId;
    const sprite = this.chestSprites.get(chestId);
    if (!sprite) return;

    if (payload.status === "interrupted") {
      logEvent("CHEST", "chest.interrupted", {
        chestId,
        itemsDispensed: payload.itemsDispensed ?? 0,
        totalItems: payload.totalItems ?? 0,
        reason: payload.reason ?? resolveChestInterruptReason(this.scene)
      });
      this.activeRummageChests.delete(chestId);
      this.chestLastDispensedCount.delete(chestId);
    }

    if (payload.status === "completed" || payload.state === "empty") {
      this.chestProgressBars.get(chestId)?.destroy();
      this.chestProgressBars.delete(chestId);
      this.chestProgressLabels.get(chestId)?.destroy();
      this.chestProgressLabels.delete(chestId);
      this.playerProgressRings.get(payload.playerId)?.destroy();
      this.playerProgressRings.delete(payload.playerId);
      this.chestLastDispensedCount.delete(chestId);
      this.activeRummageChests.delete(chestId);
      return;
    }

    const isRummageEvent = payload.status === "started" || payload.status === "progress" || payload.status === "dispensed";
    if (isRummageEvent && !this.activeRummageChests.has(chestId)) {
      logEvent("CHEST", "chest.rummage_started", {
        chestId,
        totalItems: payload.totalItems ?? 0
      });
      this.activeRummageChests.add(chestId);
    }

    // [待人工调优] B.3 Bigger progress bar above chest: 120x10, #fbbf24 fill, #92400e border, 70px above
    let bar = this.chestProgressBars.get(chestId);
    if (!bar) {
      bar = this.scene.add.graphics().setDepth(sprite.y + 2);
      this.chestProgressBars.set(chestId, bar);
    }
    bar.clear();
    const barW = 120; // [待人工调优]
    const barH = 10; // [待人工调优]
    const x = sprite.x - barW / 2;
    const y = sprite.y - 70;
    
    // Pulse glow under bar
    const pulse = (Math.sin(this.scene.time.now / 150) + 1) / 2;
    bar.fillStyle(0x92400e, 0.3 * pulse);
    bar.fillRoundedRect(x - 4, y - 4, barW + 8, barH + 8, 4);

    bar.fillStyle(0x000000, 0.85);
    bar.fillRect(x, y, barW, barH);
    bar.lineStyle(2, 0x92400e, 1); // [待人工调优] #92400e border
    bar.strokeRect(x, y, barW, barH);
    
    const totalItems = payload.totalItems ?? 0;
    const ratio = totalItems > 0 ? (payload.itemsDispensed ?? 0) / totalItems : 0;
    bar.fillStyle(0xfbbf24, 1); // [待人工调优] #fbbf24 fill
    bar.fillRect(x + 1, y + 1, (barW - 2) * ratio, barH - 2);

    // [待人工调优] B.3 Text label "翻找中 X/Y" 16px
    let label = this.chestProgressLabels.get(chestId);
    if (!label) {
      label = this.scene.add.text(sprite.x, sprite.y - 88, "", {
        fontFamily: "monospace",
        fontSize: "16px", // [待人工调优]
        color: "#facc15",
        stroke: "#000000",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(sprite.y + 2);
      this.chestProgressLabels.set(chestId, label);
    }
    label.setText(`\u7ffb\u627e\u4e2d ${payload.itemsDispensed}/${payload.totalItems}`);

    // [待人工调优] B.1 Player-character action indicator (Ring)
    if (payload.playerId) {
      const marker = this.playerMarkers?.get(payload.playerId);
      if (marker) {
        let ring = this.playerProgressRings.get(payload.playerId);
        if (!ring) {
          ring = this.scene.add.graphics().setDepth(marker.root.depth + 1);
          this.playerProgressRings.set(payload.playerId, ring);
        }
        ring.clear();
        ring.setPosition(marker.root.x, marker.root.y);
        
        // Background ring
        ring.lineStyle(4, 0x000000, 0.4);
        ring.strokeCircle(0, 0, 40); // [待人工调优] radius 40
        
        // Filling ring
        ring.lineStyle(4, 0xf59e0b, 0.9); // [待人工调优] warm orange #f59e0b
        const startAngle = Phaser.Math.DegToRad(-90);
        const endAngle = startAngle + Phaser.Math.DegToRad(360 * ratio);
        ring.beginPath();
        ring.arc(0, 0, 40, startAngle, endAngle, false);
        ring.strokePath();
      }
    }

    // [待人工调优] B.4 Drop spawn effect
    const currentDispensed = payload.itemsDispensed ?? 0;
    const prevCount = this.chestLastDispensedCount.get(chestId) ?? 0;
    if (currentDispensed > prevCount) {
      logEvent("CHEST", "chest.item_dispensed", {
        chestId,
        itemsDispensed: currentDispensed,
        totalItems: payload.totalItems ?? 0
      });
      this.spawnDropSparks(sprite.x, sprite.y);
      this.chestLastDispensedCount.set(chestId, currentDispensed);
    } else if (!this.chestLastDispensedCount.has(chestId)) {
      this.chestLastDispensedCount.set(chestId, currentDispensed);
    }

    // [待人工调优] C.1 Ground noise wave
    this.spawnNoiseWave(sprite.x, sprite.y);

    // [待人工调优] C.2 Attracted-monster indicator
    this.updateMonsterAlerts(sprite.x, sprite.y);
  }

  private spawnDropSparks(x: number, y: number): void {
    // [待人工调优] 6-8 sparks in gold tones
    for (let i = 0; i < 8; i++) {
      const spark = this.scene.add.circle(x, y, Phaser.Math.Between(2, 4), 0xfacc15, 0.8).setDepth(y + 10);
      const angle = Phaser.Math.FloatBetween(-Math.PI * 0.8, -Math.PI * 0.2); // Upward arc
      const speed = Phaser.Math.Between(100, 200);
      
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed * 0.5,
        y: y + Math.sin(angle) * speed * 0.5,
        alpha: 0,
        scale: 0.2,
        duration: 500, // [待人工调优]
        ease: "Cubic.out",
        onComplete: () => spark.destroy()
      });
    }
  }

  private spawnNoiseWave(x: number, y: number): void {
    // [待人工调优] C.1 Ground noise wave: 30px to 250px, amber #d97706, fade 800ms
    const wave = this.scene.add.graphics().setDepth(y - 2);
    wave.lineStyle(2, 0xd97706, 0.7);
    wave.strokeCircle(x, y, 30);
    
    this.scene.tweens.add({
      targets: wave,
      scaleX: 8.3, // 250 / 30 approx
      scaleY: 8.3,
      alpha: 0,
      duration: 800, // [待人工调优]
      ease: "Quad.out",
      onComplete: () => wave.destroy()
    });
  }

  private updateMonsterAlerts(x: number, y: number): void {
    // [待人工调优] C.2 Monsters within 720px get "!"
    const scene = this.scene as any;
    if (!scene.monsterMarkers) return;

    for (const [id, marker] of (scene.monsterMarkers as Map<string, any>).entries()) {
      const dist = distanceBetween(x, y, marker.root.x, marker.root.y);
      if (dist < 720) {
        this.showMonsterAlert(marker);
      }
    }
  }

  private showMonsterAlert(marker: any): void {
    if (marker.alertIcon) return;
    
    // [待人工调优] 14 px gold text "！" with black outline, 24 px above
    const alert = marker.root.scene.add.text(0, -24, "\uff01", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#facc15",
      stroke: "#000000",
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0);
    
    marker.root.add(alert);
    marker.alertIcon = alert;
    
    marker.root.scene.tweens.add({
      targets: alert,
      alpha: 1,
      duration: 300,
      ease: "Linear"
    });
    
    // Auto remove after some time or when chest rummage stops? 
    // For now, simple fade out after 1s
    marker.root.scene.time.delayedCall(1000, () => {
      if (alert.scene) {
        marker.root.scene.tweens.add({
          targets: alert,
          alpha: 0,
          duration: 600,
          onComplete: () => {
            alert.destroy();
            marker.alertIcon = null;
          }
        });
      }
    });
  }

  private showContestedChestWarning(x: number, y: number, aggroedCount: number): void {
    const ring = this.scene.add.graphics().setDepth(y + 3);
    ring.lineStyle(3, 0xfb923c, 0.9);
    ring.strokeCircle(x, y, 34);
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      scaleX: 2.4,
      scaleY: 2.4,
      duration: 720,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy()
    });

    const text = this.scene.add.text(
      x,
      y - 78,
      aggroedCount > 0 ? `\u566a\u97f3\u60ca\u52a8\u602a\u7269 x${aggroedCount}` : "\u566a\u97f3\u5411\u56db\u5468\u6269\u6563",
      {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#fed7aa",
        stroke: "#2a1208",
        strokeThickness: 4
      }
    ).setOrigin(0.5).setDepth(y + 4);
    this.scene.tweens.add({
      targets: text,
      y: y - 104,
      alpha: 0,
      duration: 1300,
      ease: "Sine.easeOut",
      onComplete: () => text.destroy()
    });
  }

  private getExtractStartRadius(zoneRadius: number): number {
    const inset = Math.min(
      GameSceneInteractions.EXTRACT_START_INSET_MAX,
      Math.max(GameSceneInteractions.EXTRACT_START_INSET_MIN, zoneRadius * 0.15)
    );
    return Math.max(24, zoneRadius - inset);
  }

  private getExtractRearmRadius(zoneRadius: number): number {
    const grace = Math.min(
      GameSceneInteractions.EXTRACT_REARM_GRACE_MAX,
      Math.max(GameSceneInteractions.EXTRACT_REARM_GRACE_MIN, zoneRadius * 0.12)
    );
    return zoneRadius + grace;
  }

  private syncExtractZone(extractState: ExtractUiState): void {
    if (
      typeof extractState.x === "number"
      && typeof extractState.y === "number"
      && typeof extractState.radius === "number"
    ) {
      this.extractZone = {
        x: extractState.x,
        y: extractState.y,
        radius: extractState.radius
      };
    }
  }

  destroy(): void {
    this.chestUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.chestUnsubscribes = [];
    this.interactionPrompt?.destroy();
    this.interactionPrompt = undefined;
    this.chestLabels.forEach((label) => label.destroy());
    this.chestSprites.forEach((sprite) => sprite.destroy());
    this.chestDangerRings.forEach((ring) => ring.destroy());
    this.chestGlows.forEach((glow) => glow.destroy());
    this.chestProgressBars.forEach((bar) => bar.destroy());
    this.chestProgressLabels.forEach((label) => label.destroy());
    this.chestLabels.clear();
    this.chestSprites.clear();
    this.chestDangerRings.clear();
    this.chestGlows.clear();
    this.chestProgressBars.clear();
    this.chestProgressLabels.clear();
    this.chestMetadata.clear();
    this.activeRummageChests.clear();
    this.extractAutoStarted = false;
    this.extractAutoRearmRequired = false;
    this.extractLastPhase = null;
    this.extractZone = undefined;
  }
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

function resolveChestInterruptReason(scene: Phaser.Scene): "moved" | "damaged" | "died" {
  const maybeScene = scene as Phaser.Scene & {
    resolveChestInterruptReason?: () => "moved" | "damaged" | "died";
  };
  return maybeScene.resolveChestInterruptReason?.() ?? "moved";
}

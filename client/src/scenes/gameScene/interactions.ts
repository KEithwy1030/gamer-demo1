import type Phaser from "phaser";
import type { ChestOpenedPayload, ChestProgressPayload, ChestState } from "../../network/socketClient";
import type { ExtractUiState } from "../createGameClient";
import type { PlayerMarker } from "../../game/entities/PlayerMarker";

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

  mount(
    subscribeChestsInit?: (callback: (chests: ChestState[]) => void) => () => void,
    subscribeChestOpened?: (callback: (payload: ChestOpenedPayload) => void) => () => void,
    subscribeChestProgress?: (callback: (payload: ChestProgressPayload) => void) => () => void,
    initialChests: ChestState[] = []
  ): void {
    this.chestUnsubscribes = [];
    if (subscribeChestsInit) {
      this.chestUnsubscribes.push(subscribeChestsInit((chests) => {
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

        if (payload.lane === "contested") {
          this.showContestedChestWarning(sprite.x, sprite.y, payload.aggroedMonsterIds?.length ?? 0);
        }
      }));
    }

    if (subscribeChestProgress) {
      this.chestUnsubscribes.push(subscribeChestProgress((payload) => {
        this.syncChestProgress(payload);
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
      this.chestGlows.get(chestId)?.destroy();
      this.chestGlows.delete(chestId);
      this.chestLabels.get(chestId)?.destroy();
      this.chestLabels.delete(chestId);
      return;
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

    if (payload.status === "completed" || payload.state === "empty") {
      this.chestProgressBars.get(chestId)?.destroy();
      this.chestProgressBars.delete(chestId);
      this.chestProgressLabels.get(chestId)?.destroy();
      this.chestProgressLabels.delete(chestId);
      return;
    }

    // [待人工调优] 1.3 Rummage progress bar: 80x6, black border, rust-orange #ea580c fill, 60px above
    let bar = this.chestProgressBars.get(chestId);
    if (!bar) {
      bar = this.scene.add.graphics().setDepth(sprite.y + 2);
      this.chestProgressBars.set(chestId, bar);
    }
    bar.clear();
    const x = sprite.x - 40;
    const y = sprite.y - 60;
    bar.fillStyle(0x000000, 0.8);
    bar.fillRect(x, y, 80, 6);
    bar.lineStyle(1, 0x000000, 1);
    bar.strokeRect(x, y, 80, 6);
    
    const totalItems = payload.totalItems ?? 0;
    const ratio = totalItems > 0 ? (payload.itemsDispensed ?? 0) / totalItems : 0;
    bar.fillStyle(0xea580c, 1);
    bar.fillRect(x, y, 80 * ratio, 6);

    // [待人工调优] 1.3 Text label "翻找中 X/Y"
    let label = this.chestProgressLabels.get(chestId);
    if (!label) {
      label = this.scene.add.text(sprite.x, sprite.y - 74, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f1e3c4",
        stroke: "#000000",
        strokeThickness: 2
      }).setOrigin(0.5).setDepth(sprite.y + 2);
      this.chestProgressLabels.set(chestId, label);
    }
    label.setText(`\u7ffb\u627e\u4e2d ${payload.itemsDispensed}/${payload.totalItems}`);
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
    this.extractAutoStarted = false;
    this.extractAutoRearmRequired = false;
    this.extractLastPhase = null;
    this.extractZone = undefined;
  }
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

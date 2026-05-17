import type Phaser from "phaser";
import type { ChestOpenedPayload, ChestState } from "../../network/socketClient";
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
  private readonly chestMetadata = new Map<string, { lane?: ChestState["lane"]; noiseRadius?: number }>();
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
    subscribeChestOpened?: (callback: (payload: ChestOpenedPayload) => void) => () => void
  ): void {
    this.chestUnsubscribes = [];
    if (subscribeChestsInit) {
      this.chestUnsubscribes.push(subscribeChestsInit((chests) => {
        chests.forEach((chest) => this.syncChest(chest));
      }));
    }

    if (subscribeChestOpened) {
      this.chestUnsubscribes.push(subscribeChestOpened((payload) => {
        const sprite = this.chestSprites.get(payload.chestId);
        if (!sprite) {
          return;
        }

        sprite.setTexture("chest_open");
        this.chestLabels.get(payload.chestId)?.destroy();
        this.chestLabels.delete(payload.chestId);
        this.chestDangerRings.get(payload.chestId)?.destroy();
        this.chestDangerRings.delete(payload.chestId);

        if (payload.lane === "contested") {
          this.showContestedChestWarning(sprite.x, sprite.y, payload.aggroedMonsterIds?.length ?? 0);
        }
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

  updateChestPrompt(playerMarker?: PlayerMarker): void {
    if (!playerMarker || !this.interactionPrompt) return;
    let nearest: string | null = null;
    let minDistance = 80;
    for (const [id, sprite] of this.chestSprites.entries()) {
      if (sprite.texture.key === "chest_closed") {
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

    this.chestMetadata.set(chestId, { lane: chest.lane, noiseRadius: chest.noiseRadius });
    if (this.chestSprites.has(chestId)) {
      return;
    }

    const sprite = this.scene.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed").setDepth(chest.y);
    sprite.setDisplaySize(92, 92);
    this.chestSprites.set(chestId, sprite);

    if (chest.isOpen) {
      return;
    }

    if (chest.lane === "contested") {
      const ring = this.scene.add.graphics().setDepth(chest.y - 1);
      ring.lineStyle(2, 0xf97316, 0.72);
      ring.strokeCircle(chest.x, chest.y, 76);
      this.chestDangerRings.set(chestId, ring);
    }

    const label = this.scene.add.text(
      chest.x,
      chest.y - 30,
      chest.lane === "contested" ? "\u9ad8\u5371\u5b9d\u7bb1" : "\u5b9d\u7bb1",
      {
        fontFamily: "monospace",
        fontSize: "14px",
        color: chest.lane === "contested" ? "#fed7aa" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
      }
    ).setOrigin(0.5).setDepth(chest.y + 1);
    this.chestLabels.set(chestId, label);
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
    this.chestLabels.clear();
    this.chestSprites.clear();
    this.chestDangerRings.clear();
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

import type Phaser from "phaser";
import type { ChestOpenedPayload, ChestState } from "../../network/socketClient";
import type { ExtractUiState } from "../createGameClient";
import type { PlayerMarker } from "../../game/entities/PlayerMarker";

export class GameSceneInteractions {
  private readonly scene: Phaser.Scene;
  private readonly chestSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly chestLabels = new Map<string, Phaser.GameObjects.Text>();
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
        chests.forEach((chest) => {
          if (!this.chestSprites.has(chest.chestId)) {
            const sprite = this.scene.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed").setDepth(chest.y);
            sprite.setDisplaySize(92, 92);
            this.chestSprites.set(chest.chestId, sprite);
            if (!chest.isOpen) {
              const label = this.scene.add.text(chest.x, chest.y - 30, "宝箱", {
                fontFamily: "monospace",
                fontSize: "14px",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 3
              }).setOrigin(0.5).setDepth(chest.y + 1);
              this.chestLabels.set(chest.chestId, label);
            }
          }
        });
      }));
    }

    if (subscribeChestOpened) {
      this.chestUnsubscribes.push(subscribeChestOpened((payload) => {
        const sprite = this.chestSprites.get(payload.chestId);
        if (sprite) {
          sprite.setTexture("chest_open");
          this.chestLabels.get(payload.chestId)?.destroy();
          this.chestLabels.delete(payload.chestId);
        }
      }));
    }

    this.interactionPrompt = this.scene.add.text(0, 0, "按 E 开箱", {
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
      this.interactionPrompt.setPosition(chest.x, chest.y - 50).setVisible(true).setData("chestId", nearest);
      return;
    }

    this.interactionPrompt.setVisible(false);
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
    this.chestLabels.clear();
    this.chestSprites.clear();
    this.extractAutoStarted = false;
    this.extractAutoRearmRequired = false;
    this.extractLastPhase = null;
    this.extractZone = undefined;
  }
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

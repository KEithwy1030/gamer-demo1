import Phaser from "phaser";
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
        const distance = Phaser.Math.Distance.Between(playerMarker.root.x, playerMarker.root.y, sprite.x, sprite.y);
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

    const distance = Phaser.Math.Distance.Between(
      playerMarker.root.x,
      playerMarker.root.y,
      extractState.x ?? 0,
      extractState.y ?? 0
    );

    const insideExtractZone = distance <= (extractState.radius ?? 96);

    if (!insideExtractZone) {
      this.extractAutoStarted = false;
      return;
    }

    if (extractState.phase === "interrupted") {
      this.extractAutoStarted = false;
    }

    if (extractState.phase === "succeeded") {
      this.extractAutoStarted = true;
      return;
    }

    if (insideExtractZone && !this.extractAutoStarted && !extractState.isExtracting) {
      onStartExtract?.();
      this.extractAutoStarted = true;
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
  }
}

import Phaser from "phaser";
import type { ChestState } from "../../../network/socketClient";
import { logEvent } from "../../../dev/runtimeLog";
import { GAMEPLAY_THEME } from "../../../ui/gameplayTheme";

type ChestLike = Partial<ChestState> & { chestId?: string; id?: string; x: number; y: number };

export class ChestPromptController {
  private prompt?: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene, private readonly getChests: () => Iterable<ChestLike>) {}

  mount(): void {
    this.prompt ??= this.scene.add.text(0, 0, "按 E 开箱", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "16px",
      color: "#facc15",
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(4000).setVisible(false);
  }

  update(playerMarker?: { root: Phaser.GameObjects.Container }): void {
    this.mount();
    if (!playerMarker || !this.prompt) return;
    let nearest: ChestLike | undefined;
    let nearestId = "";
    let minDistance = 80;
    for (const chest of this.getChests()) {
      const id = chest.chestId ?? chest.id ?? "";
      if (!id || chest.isOpen || chest.state === "empty") continue;
      const distance = Math.hypot(playerMarker.root.x - chest.x, playerMarker.root.y - chest.y);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = chest;
        nearestId = id;
      }
    }
    if (!nearest) {
      this.hide();
      return;
    }
    this.prompt
      .setText(nearest.lane === "contested" ? "按 E 开高危箱" : "按 E 开箱")
      .setColor(nearest.lane === "contested" ? "#fb923c" : "#facc15")
      .setPosition(nearest.x, nearest.y - 50)
      .setVisible(true)
      .setData("chestId", nearestId);
  }

  hide(): void {
    this.prompt?.setVisible(false);
  }

  handleInteract(onOpenChest?: (chestId: string) => void, onPickup?: () => void): void {
    if (this.prompt?.visible) {
      const chestId = this.prompt.getData("chestId");
      if (typeof chestId === "string" && chestId.length > 0) {
        logEvent("CHEST", "chest.open_request", { chestId });
        onOpenChest?.(chestId);
        return;
      }
    }
    onPickup?.();
  }

  destroy(): void {
    this.prompt?.destroy();
    this.prompt = undefined;
  }
}

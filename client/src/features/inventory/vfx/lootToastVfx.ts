import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";
import { GAMEPLAY_THEME } from "../../../ui/gameplayTheme";

interface LootToastVfxContext {
  scene: Phaser.Scene;
  getPlayerMarker: (playerId: string) => { root: Phaser.GameObjects.Container } | undefined;
}

export function mountLootToastVfx(ctx: LootToastVfxContext): () => void {
  const handler = (payload: Parameters<Parameters<typeof clientEventBus.on<"LootPickedUp">>[1]>[0]) => {
    const amount = payload.item.goldValue ?? payload.item.treasureValue ?? 0;
    if (amount <= 0) return;
    const marker = ctx.getPlayerMarker(payload.playerId);
    const x = marker?.root.x ?? 0;
    const y = marker?.root.y ?? 0;
    const text = ctx.scene.add.text(x, y - 60, `+${amount}`, {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "14px",
      color: "#fbbf24",
      stroke: "#000000",
      strokeThickness: 2,
      fontStyle: "bold"
    }).setOrigin(0.5).setDepth(3000);
    ctx.scene.tweens.add({ targets: text, y: y - 110, alpha: 0, duration: 2000, ease: "Cubic.out", onComplete: () => text.destroy() });
  };

  clientEventBus.on("LootPickedUp", handler);
  return () => clientEventBus.off("LootPickedUp", handler);
}

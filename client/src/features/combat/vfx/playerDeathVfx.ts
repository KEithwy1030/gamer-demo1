import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";

interface PlayerDeathVfxContext {
  scene: Phaser.Scene;
  getSelfPlayerId: () => string | null;
}

export function mountPlayerDeathVfx(ctx: PlayerDeathVfxContext): () => void {
  const handler = (payload: Parameters<Parameters<typeof clientEventBus.on<"PlayerDied">>[1]>[0]) => {
    if (payload.playerId !== ctx.getSelfPlayerId()) return;
    const vignette = ctx.scene.add.rectangle(0, 0, ctx.scene.scale.width, ctx.scene.scale.height, 0xef4444, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10000);

    ctx.scene.tweens.add({
      targets: vignette,
      alpha: 0.3,
      duration: 300,
      yoyo: true,
      repeat: 1,
      ease: "Cubic.inOut",
      onComplete: () => vignette.destroy()
    });
    ctx.scene.cameras.main.shake(500, 0.02);
  };

  clientEventBus.on("PlayerDied", handler);
  return () => clientEventBus.off("PlayerDied", handler);
}

import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";

interface MonsterVfxContext {
  scene: Phaser.Scene;
}

export function mountMonsterVfx(ctx: MonsterVfxContext): () => void {
  const handler = (payload: Parameters<Parameters<typeof clientEventBus.on<"MonsterKilled">>[1]>[0]) => {
    const { x, y } = payload.position;
    const burst = ctx.scene.add.circle(x, y, 10, 0x7f1d1d, 0.6).setDepth(y - 1);
    ctx.scene.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 600, ease: "Cubic.out", onComplete: () => burst.destroy() });

    const emitter = ctx.scene.add.particles(x, y - 20, "drop", {
      lifespan: 500,
      speed: { min: 100, max: 200 },
      scale: { start: 0.6, end: 0 },
      tint: 0x991b1b,
      quantity: 12,
      emitting: false
    });
    emitter.setDepth(y + 10);
    emitter.explode();
    ctx.scene.time.delayedCall(1000, () => emitter.destroy());

    const tier = payload.monsterType;
    if (tier === "elite" || tier === "boss") {
      shake(ctx.scene, tier === "boss" ? 0.03 : 0.02, 300);
      hitStop(ctx.scene, tier === "boss" ? 500 : 300);
    } else {
      shake(ctx.scene, 0.008, 120);
      hitStop(ctx.scene, 100);
    }
  };

  clientEventBus.on("MonsterKilled", handler);
  return () => clientEventBus.off("MonsterKilled", handler);
}

function hitStop(scene: Phaser.Scene, ms: number): void {
  const world = (scene.physics as Phaser.Physics.Arcade.ArcadePhysics | undefined)?.world;
  scene.anims.pauseAll();
  scene.tweens.pauseAll();
  world?.pause();
  scene.time.delayedCall(ms, () => {
    scene.anims.resumeAll();
    scene.tweens.resumeAll();
    world?.resume();
  });
}

function shake(scene: Phaser.Scene, intensity: number, duration: number): void {
  scene.cameras.main.shake(duration, intensity);
}

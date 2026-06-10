import Phaser from "phaser";
import { clientEventBus } from "../../../core/event-bus";

interface RareDropVfxContext {
  scene: Phaser.Scene;
}

// 稀有度 → 光柱颜色。common/uncommon 不庆祝，保持稀有时刻的稀缺感。
const BEAM_COLORS: Record<string, number> = {
  rare: 0x4da6ff,
  epic: 0xb45cff
};

const BEAM_HEIGHT = 140;
const BEAM_WIDTH = 18;

/**
 * 稀有掉落高光：rare+ 物品落地时在掉落点立起一道呼吸光柱，
 * 拾取后随即消散。让"好东西出了"在战场上隔着半个屏幕也能看见。
 */
export function mountRareDropVfx(ctx: RareDropVfxContext): () => void {
  const beams = new Map<string, Phaser.GameObjects.Container>();

  const onLootSpawned = (payload: {
    dropId: string;
    item: { rarity?: string };
    position: { x: number; y: number };
  }) => {
    const rarity = payload.item.rarity ?? "common";
    const color = BEAM_COLORS[rarity];
    if (color == null || beams.has(payload.dropId)) {
      return;
    }

    const container = ctx.scene.add.container(payload.position.x, payload.position.y).setDepth(900);

    const glow = ctx.scene.add.ellipse(0, 0, 52, 22, color, 0.32);
    const beam = ctx.scene.add.rectangle(0, -BEAM_HEIGHT / 2, BEAM_WIDTH, BEAM_HEIGHT, color, 0.22);
    const core = ctx.scene.add.rectangle(0, -BEAM_HEIGHT / 2, 4, BEAM_HEIGHT, 0xffffff, 0.4);
    container.add([glow, beam, core]);

    // 落地瞬间的冲击闪光
    const burst = ctx.scene.add.ellipse(0, 0, 16, 8, 0xffffff, 0.9);
    container.add(burst);
    ctx.scene.tweens.add({
      targets: burst,
      scaleX: 5,
      scaleY: 5,
      alpha: 0,
      duration: 420,
      ease: "Cubic.out",
      onComplete: () => burst.destroy()
    });

    // 常驻呼吸脉动
    ctx.scene.tweens.add({
      targets: [beam, glow],
      alpha: { from: 0.32, to: 0.12 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });

    beams.set(payload.dropId, container);
  };

  const removeBeam = (dropId: string) => {
    const container = beams.get(dropId);
    if (!container) {
      return;
    }
    beams.delete(dropId);
    ctx.scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: 260,
      ease: "Cubic.out",
      onComplete: () => container.destroy()
    });
  };

  const onLootPickedUp = (payload: { dropId: string }) => removeBeam(payload.dropId);

  clientEventBus.on("LootSpawned", onLootSpawned);
  clientEventBus.on("LootPickedUp", onLootPickedUp);

  return () => {
    clientEventBus.off("LootSpawned", onLootSpawned);
    clientEventBus.off("LootPickedUp", onLootPickedUp);
    for (const container of beams.values()) {
      container.destroy();
    }
    beams.clear();
  };
}

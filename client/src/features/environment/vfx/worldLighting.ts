import type Phaser from "phaser";
import { anchorScreenSpace } from "../../../scenes/gameScene/renderConfig";

/**
 * 夜境光照层（环境板块 · 客户端表现）。
 *
 * 这个世界的设定是夜晚废墟，但历史版本里没有任何"光"的概念——所有资产以
 * 原始亮度平铺，画面读作扫描件而不是场景。本模块补上三件事：
 *
 * 1. 环境压暗：全屏一层冷色微暗（让"夜"成立，并给暖光留出对比空间）
 * 2. 屏幕暗角：四角向中心的径向渐暗（视线向画面中心收拢）
 * 3. 提灯光池：跟随本机玩家的暖色光圈（拾荒者的提灯——玩家永远站在光里，
 *    也是画面里最重要的视觉锚点），带轻微呼吸式闪烁
 *
 * 深度约定：光池 -20（地表装饰之上、一切实体之下）；压暗/暗角 9790/9800
 * （高于实体 y 深度上限 9600，低于 HUD 10000）。屏幕空间元素一律经
 * anchorScreenSpace 抵消相机 zoom。
 */

const VIGNETTE_TEXTURE = "wl-vignette";
const POOL_TEXTURE = "wl-pool";

const AMBIENT_COLOR = 0x0b1020;
const AMBIENT_ALPHA = 0.16;
const VIGNETTE_EDGE_ALPHA = 0.62;
const LANTERN_TINT = 0xffb46a;
const LANTERN_ALPHA = 0.46;
const LANTERN_DIAMETER = 560;
const LIGHT_POOL_DEPTH = -20;
const AMBIENT_DEPTH = 9790;
const VIGNETTE_DEPTH = 9800;

export interface WorldLightingApi {
  /** 提灯跟随目标（本机玩家 marker root）；传 null 暂停跟随 */
  setFollowTarget(target: { x: number; y: number } | null): void;
  /** 固定位置光源（营火 / 撤离点点燃后调用） */
  addStaticLight(x: number, y: number, options?: { diameter?: number; color?: number; alpha?: number }): void;
  destroy(): void;
}

export function mountWorldLighting(scene: Phaser.Scene): WorldLightingApi {
  ensurePoolTexture(scene);
  ensureVignetteTexture(scene);

  const camera = scene.cameras.main;
  const anchor = anchorScreenSpace(camera, camera.width / 2, camera.height / 2);

  const ambient = scene.add
    .rectangle(anchor.x, anchor.y, camera.width, camera.height, AMBIENT_COLOR, AMBIENT_ALPHA)
    .setScale(anchor.scale)
    .setScrollFactor(0)
    .setDepth(AMBIENT_DEPTH);

  // setDisplaySize 内部就是改 scale，不能再叠 setScale——尺寸直接预除 zoom
  const vignette = scene.add
    .image(anchor.x, anchor.y, VIGNETTE_TEXTURE)
    .setDisplaySize(camera.width * vignetteScale(camera), camera.height * vignetteScale(camera))
    .setScrollFactor(0)
    .setDepth(VIGNETTE_DEPTH);

  const lantern = scene.add
    .image(0, 0, POOL_TEXTURE)
    .setDisplaySize(LANTERN_DIAMETER, LANTERN_DIAMETER)
    .setTint(LANTERN_TINT)
    .setAlpha(LANTERN_ALPHA)
    .setBlendMode("ADD")
    .setDepth(LIGHT_POOL_DEPTH)
    .setVisible(false);

  const flicker = scene.tweens.add({
    targets: lantern,
    alpha: LANTERN_ALPHA * 0.82,
    duration: 1400,
    yoyo: true,
    repeat: -1,
    ease: "Sine.inOut"
  });

  const staticLights: Phaser.GameObjects.Image[] = [];
  let followTarget: { x: number; y: number } | null = null;

  const onUpdate = () => {
    if (followTarget) {
      lantern.setPosition(followTarget.x, followTarget.y + 18);
      lantern.setVisible(true);
    } else {
      lantern.setVisible(false);
    }
  };
  scene.events.on("update", onUpdate);

  return {
    setFollowTarget(target) {
      followTarget = target;
    },
    addStaticLight(x, y, options) {
      const light = scene.add
        .image(x, y, POOL_TEXTURE)
        .setDisplaySize(options?.diameter ?? 420, options?.diameter ?? 420)
        .setTint(options?.color ?? 0xff9a4d)
        .setAlpha(options?.alpha ?? 0.38)
        .setBlendMode("ADD")
        .setDepth(LIGHT_POOL_DEPTH);
      scene.tweens.add({
        targets: light,
        alpha: (options?.alpha ?? 0.38) * 0.78,
        duration: 1100 + Math.floor(Math.random() * 500),
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
      staticLights.push(light);
    },
    destroy() {
      scene.events.off("update", onUpdate);
      flicker.stop();
      ambient.destroy();
      vignette.destroy();
      lantern.destroy();
      for (const light of staticLights) light.destroy();
      staticLights.length = 0;
    }
  };
}

/** 暗角贴图按视口生成；屏幕空间受相机 zoom 影响，渲染尺寸 = display * zoom，这里预除回去 */
function vignetteScale(camera: { zoom: number }): number {
  return camera.zoom > 0 ? 1 / camera.zoom : 1;
}

function ensurePoolTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(POOL_TEXTURE)) return;
  const size = 512;
  const canvas = scene.textures.createCanvas(POOL_TEXTURE, size, size);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.45)");
  gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.12)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}

function ensureVignetteTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(VIGNETTE_TEXTURE)) return;
  const width = 960;
  const height = 540;
  const canvas = scene.textures.createCanvas(VIGNETTE_TEXTURE, width, height);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const radius = Math.hypot(width / 2, height / 2);
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    radius * 0.42,
    width / 2,
    height / 2,
    radius
  );
  gradient.addColorStop(0, "rgba(6, 5, 10, 0)");
  gradient.addColorStop(0.6, `rgba(6, 5, 10, ${VIGNETTE_EDGE_ALPHA * 0.45})`);
  gradient.addColorStop(1, `rgba(6, 5, 10, ${VIGNETTE_EDGE_ALPHA})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  canvas.refresh();
}

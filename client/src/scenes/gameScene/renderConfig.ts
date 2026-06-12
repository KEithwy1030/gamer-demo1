export const GAME_RENDER_CONFIG = {
  pixelArt: false,
  antialias: true,
  autoRound: false,
  roundPixels: false,
  minFilter: "LINEAR",
  magFilter: "LINEAR"
} as const;

/**
 * 内部渲染分辨率。历史值 1280x720 经 CSS 拉伸到大屏 = 全局模糊
 * （"资产分辨率不够"观感的真正根源——314px 源图先被缩到 110px 再被拉回去）。
 * 1920x1080 + 相机 zoom x1.5：世界取景不变，像素密度提升 2.25 倍。
 */
export const GAME_VIEW_WIDTH = 1920;
export const GAME_VIEW_HEIGHT = 1080;
const RESOLUTION_SCALE = GAME_VIEW_HEIGHT / 720;

export const GAME_CAMERA_CONFIG = {
  desktopZoom: 0.96 * RESOLUTION_SCALE,
  touchZoom: 0.86 * RESOLUTION_SCALE,
  roundPixels: false
} as const;

export interface ScreenAnchor {
  x: number;
  y: number;
  scale: number;
}

/**
 * 主相机用 zoom 换原生 1080p 锐度（见 GAME_CAMERA_CONFIG）。Phaser 对
 * scrollFactor=0 的对象同样套用 zoom（绕视口中心放大），按屏幕坐标摆放的
 * UI 会被推出画面（zoom 1.44 时四角 HUD 整体出屏）。所有屏幕空间 UI 的
 * 坐标必须经过这里换算来抵消 zoom；(x, y) 传期望的屏幕位置，返回值直接
 * setPosition + setScale。
 */
export function anchorScreenSpace(
  camera: { zoom: number; width: number; height: number },
  x: number,
  y: number
): ScreenAnchor {
  const zoom = camera.zoom > 0 ? camera.zoom : 1;
  const inv = 1 / zoom;
  return {
    x: camera.width / 2 + (x - camera.width / 2) * inv,
    y: camera.height / 2 + (y - camera.height / 2) * inv,
    scale: inv
  };
}

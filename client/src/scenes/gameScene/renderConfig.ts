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

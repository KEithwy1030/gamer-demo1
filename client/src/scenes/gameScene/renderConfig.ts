export const GAME_RENDER_CONFIG = {
  pixelArt: false,
  antialias: true,
  autoRound: false,
  roundPixels: false,
  minFilter: "LINEAR",
  magFilter: "LINEAR"
} as const;

export const GAME_CAMERA_CONFIG = {
  desktopZoom: 0.96,
  touchZoom: 0.86,
  roundPixels: false
} as const;

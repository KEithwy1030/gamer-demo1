import Phaser from "phaser";

export const GAMEPLAY_THEME = {
  fonts: {
    display: "\"Noto Serif SC\", \"Noto Sans SC\", serif",
    body: "\"Noto Sans SC\", \"Inter Tight\", system-ui, sans-serif",
    mono: "\"JetBrains Mono\", \"Noto Sans SC\", monospace"
  },
  colors: {
    void: 0x0e0b08,
    iron900: 0x16130f,
    iron800: 0x1b1712,
    iron700: 0x211c15,
    iron600: 0x2b2519,
    iron500: 0x3a3223,
    iron400: 0x4d4330,
    bone: 0xe8dfc8,
    boneDim: 0xb8ae96,
    boneLow: 0x7d745e,
    signal: 0xe8602c,
    confirm: 0x7fa14a,
    danger: 0xb8371f,
    caution: 0xd4b24c,
    accent: 0x7fb4c2
  }
} as const;

export function drawPanelFrame(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 10
): void {
  graphics.clear();
  graphics.fillStyle(GAMEPLAY_THEME.colors.iron600, 0.84);
  graphics.fillRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(2, GAMEPLAY_THEME.colors.iron400, 1);
  graphics.strokeRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(1, GAMEPLAY_THEME.colors.signal, 0.16);
  graphics.strokeRoundedRect(x + 6, y + 6, width - 12, height - 12, Math.max(4, radius - 2));
}

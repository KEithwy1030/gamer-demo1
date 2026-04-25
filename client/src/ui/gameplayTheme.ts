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
  },
  alpha: {
    panel: 0.9,
    panelSoft: 0.72,
    line: 0.55,
    hotLine: 0.72
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
  graphics.fillStyle(GAMEPLAY_THEME.colors.void, 0.34);
  graphics.fillRoundedRect(x + 4, y + 6, width, height, radius);
  graphics.fillStyle(GAMEPLAY_THEME.colors.iron800, GAMEPLAY_THEME.alpha.panel);
  graphics.fillRoundedRect(x, y, width, height, radius);
  graphics.fillStyle(GAMEPLAY_THEME.colors.iron600, 0.28);
  graphics.fillRoundedRect(x + 7, y + 7, width - 14, Math.max(10, height * 0.34), Math.max(3, radius - 3));
  graphics.lineStyle(2, GAMEPLAY_THEME.colors.iron400, GAMEPLAY_THEME.alpha.line);
  graphics.strokeRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(1, GAMEPLAY_THEME.colors.signal, 0.2);
  graphics.strokeRoundedRect(x + 6, y + 6, width - 12, height - 12, Math.max(4, radius - 2));

  const corner = Math.min(18, Math.max(10, Math.floor(Math.min(width, height) * 0.32)));
  graphics.lineStyle(2, GAMEPLAY_THEME.colors.signal, GAMEPLAY_THEME.alpha.hotLine);
  graphics.beginPath();
  graphics.moveTo(x, y + corner);
  graphics.lineTo(x, y);
  graphics.lineTo(x + corner, y);
  graphics.moveTo(x + width - corner, y);
  graphics.lineTo(x + width, y);
  graphics.lineTo(x + width, y + corner);
  graphics.moveTo(x, y + height - corner);
  graphics.lineTo(x, y + height);
  graphics.lineTo(x + corner, y + height);
  graphics.moveTo(x + width - corner, y + height);
  graphics.lineTo(x + width, y + height);
  graphics.lineTo(x + width, y + height - corner);
  graphics.strokePath();

  graphics.lineStyle(1, GAMEPLAY_THEME.colors.bone, 0.08);
  for (let yy = y + 10; yy < y + height - 8; yy += 9) {
    graphics.lineBetween(x + 10, yy, x + width - 10, yy);
  }
}

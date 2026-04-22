const GAMEPLAY_THEME = {
  fonts: {
    display: '"Noto Serif SC", "Noto Sans SC", serif',
    body: '"Noto Sans SC", "Inter Tight", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Noto Sans SC", monospace'
  },
  colors: {
    void: 920328,
    iron900: 1446671,
    iron800: 1775378,
    iron700: 2169877,
    iron600: 2827545,
    iron500: 3813923,
    iron400: 5063472,
    bone: 15261640,
    boneDim: 12103318,
    boneLow: 8221790,
    signal: 15228972,
    confirm: 8364362,
    danger: 12072735,
    caution: 13939276,
    accent: 8369346
  }
};
function drawPanelFrame(graphics, x, y, width, height, radius = 10) {
  graphics.clear();
  graphics.fillStyle(GAMEPLAY_THEME.colors.iron600, 0.84);
  graphics.fillRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(2, GAMEPLAY_THEME.colors.iron400, 1);
  graphics.strokeRoundedRect(x, y, width, height, radius);
  graphics.lineStyle(1, GAMEPLAY_THEME.colors.signal, 0.16);
  graphics.strokeRoundedRect(x + 6, y + 6, width - 12, height - 12, Math.max(4, radius - 2));
}
export {
  GAMEPLAY_THEME,
  drawPanelFrame
};

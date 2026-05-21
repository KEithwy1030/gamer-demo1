import Phaser from "phaser";
import type { MatchViewState } from "../../game";

export interface SpectateHudRefs {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  titleText: Phaser.GameObjects.Text;
  targetText: Phaser.GameObjects.Text;
  hintText: Phaser.GameObjects.Text;
  cycleButton: Phaser.GameObjects.Text;
}

export function mountSpectateHud(scene: Phaser.Scene): SpectateHudRefs {
  const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(10040).setVisible(false);
  const background = scene.add.graphics();
  const titleText = scene.add.text(0, 0, "You are dead", {
    fontFamily: "monospace",
    fontSize: "13px",
    color: "#f7e5c5"
  });
  const targetText = scene.add.text(0, 0, "Watching: -", {
    fontFamily: "monospace",
    fontSize: "15px",
    color: "#ffe8b0",
    wordWrap: { width: 300, useAdvancedWrap: true }
  });
  const hintText = scene.add.text(0, 0, "[ / ] cycle squad targets", {
    fontFamily: "monospace",
    fontSize: "11px",
    color: "#b9d8df"
  });
  const cycleButton = scene.add.text(0, 0, "Cycle ally", {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#f9efdc",
    backgroundColor: "rgba(40, 28, 18, 0.9)",
    padding: { x: 10, y: 6 }
  }).setInteractive({ useHandCursor: true });

  container.add([background, titleText, targetText, hintText, cycleButton]);

  return { container, background, titleText, targetText, hintText, cycleButton };
}

export function layoutSpectateHud(
  scene: Phaser.Scene,
  refs: SpectateHudRefs,
  width: number
): void {
  const panelWidth = Math.min(540, width - 24);
  const panelHeight = 74;
  const x = width / 2;
  const y = 18;
  const left = -panelWidth / 2;
  const right = panelWidth / 2;

  refs.container.setPosition(x, y).setVisible(true);
  refs.background.clear();
  refs.background.fillStyle(0x120d0a, 0.9);
  refs.background.fillRoundedRect(left, 0, panelWidth, panelHeight, 10);
  refs.background.lineStyle(2, 0x5f7e86, 0.7);
  refs.background.strokeRoundedRect(left, 0, panelWidth, panelHeight, 10);

  refs.titleText.setPosition(left + 14, 10).setFontSize("13px");
  refs.targetText
    .setPosition(left + 14, 26)
    .setWordWrapWidth(Math.max(180, panelWidth - 160))
    .setFontSize("15px");
  refs.hintText.setPosition(left + 14, 50).setFontSize("11px");
  refs.cycleButton
    .setPosition(right - 14, 23)
    .setOrigin(1, 0)
    .setFontSize("12px");

  void scene;
}

export function showSpectateHud(
  refs: SpectateHudRefs,
  state: MatchViewState,
  target: MatchViewState["players"][number] | undefined,
  self: MatchViewState["players"][number] | undefined
): void {
  const targetLabel = target
    ? target.id === self?.id
      ? "Watching your corpse"
      : `Watching ally ${target.name}${target.isAlive ? "" : " (dead)"}`
    : "Watching: no squad target";

  refs.container.setVisible(true);
  refs.titleText.setText("You are dead");
  refs.targetText.setText(targetLabel);
  refs.hintText.setText(getSpectateHintLabel(state, self));
}

export function hideSpectateHud(refs?: SpectateHudRefs): void {
  refs?.container.setVisible(false);
}

export function destroySpectateHud(refs?: SpectateHudRefs): void {
  refs?.container.destroy(true);
}

export function getSpectateHintLabel(
  state: MatchViewState,
  self?: MatchViewState["players"][number]
): string {
  if (!self) {
    return "[ / ] unavailable";
  }

  const squadPlayers = state.players.filter((player) => player.squadId === self.squadId);
  return squadPlayers.length <= 1 ? "[ / ] unavailable" : "[ / ] cycle squad targets";
}


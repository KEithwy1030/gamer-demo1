import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import { anchorScreenSpace } from "../../scenes/gameScene/renderConfig";

interface SpectateHudRefs {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  titleText: Phaser.GameObjects.Text;
  targetText: Phaser.GameObjects.Text;
  hintText: Phaser.GameObjects.Text;
  cycleButton: Phaser.GameObjects.Text;
}

export class SpectateHudController {
  private hud?: SpectateHudRefs;
  private targetId: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getState: () => MatchViewState | null,
    private readonly getPlayerMarker: (playerId: string) => { root: Phaser.GameObjects.Container } | undefined
  ) {}

  readonly handleSpectateKeydown = (event: KeyboardEvent): void => {
    const self = this.getSelfPlayer();
    if (!self || self.isAlive) return;
    if (event.key === "[" || event.code === "BracketLeft") { event.preventDefault(); this.shiftSpectateTarget(-1); }
    else if (event.key === "]" || event.code === "BracketRight") { event.preventDefault(); this.shiftSpectateTarget(1); }
  };

  readonly handleSpectateButtonClick = (): void => this.shiftSpectateTarget(1);

  syncSpectateState(): MatchViewState["players"][number] | undefined {
    const state = this.getState();
    if (!state) return undefined;
    const self = this.getSelfPlayer(state);
    if (self?.isAlive) {
      this.targetId = null;
      this.hideSpectateHud();
      this.followPlayer(self);
      return self;
    }
    const target = this.resolveSpectateTarget(state);
    this.followPlayer(target);
    this.showSpectateHud(state, target, self);
    return target;
  }

  resolveSpectateTarget(state: MatchViewState): MatchViewState["players"][number] | undefined {
    const self = this.getSelfPlayer(state);
    const squadPlayers = this.getSpectateCandidates(state, self);
    if (squadPlayers.length === 0) return undefined;
    const alive = squadPlayers.filter((player) => player.isAlive);
    const candidates = alive.length > 0 ? alive : squadPlayers;
    const preferred = this.targetId ? candidates.find((player) => player.id === this.targetId) : undefined;
    const target = preferred ?? candidates.find((player) => player.id === self?.id) ?? candidates[0];
    this.targetId = target?.id ?? null;
    return target;
  }

  shiftSpectateTarget(step: number): void {
    const state = this.getState();
    const self = this.getSelfPlayer(state);
    if (!state || !self || self.isAlive) return;
    const candidates = this.getSpectateCandidates(state, self);
    if (candidates.length === 0) return;
    const current = this.resolveSpectateTarget(state);
    const currentIndex = current ? candidates.findIndex((player) => player.id === current.id) : -1;
    this.targetId = candidates[(currentIndex + step + candidates.length) % candidates.length]?.id ?? null;
    this.syncSpectateState();
  }

  getSpectateCandidates(state: MatchViewState, self?: MatchViewState["players"][number]): MatchViewState["players"] {
    if (!self) return [];
    const sameSquad = state.players.filter((player) => player.squadId === self.squadId);
    const aliveSameSquad = sameSquad.filter((player) => player.isAlive);
    return aliveSameSquad.length > 0 ? aliveSameSquad : sameSquad;
  }

  followPlayer(player: MatchViewState["players"][number] | undefined): void {
    if (!player) return;
    const marker = this.getPlayerMarker(player.id);
    if (marker) this.scene.cameras.main.startFollow(marker.root, true, 0.12, 0.12);
  }

  mountSpectateHud(): void {
    if (this.hud) return;
    const container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(10040).setVisible(false);
    const background = this.scene.add.graphics();
    const titleText = this.scene.add.text(0, 0, "你已阵亡", { fontFamily: "monospace", fontSize: "13px", color: "#f7e5c5" });
    const targetText = this.scene.add.text(0, 0, "正在观看：--", { fontFamily: "monospace", fontSize: "15px", color: "#ffe8b0", wordWrap: { width: 300, useAdvancedWrap: true } });
    const hintText = this.scene.add.text(0, 0, "[ / ] 切换同队目标", { fontFamily: "monospace", fontSize: "11px", color: "#b9d8df" });
    const cycleButton = this.scene.add.text(0, 0, "切换队友", { fontFamily: "monospace", fontSize: "12px", color: "#f9efdc", backgroundColor: "rgba(40, 28, 18, 0.9)", padding: { x: 10, y: 6 } }).setInteractive({ useHandCursor: true });
    cycleButton.on("pointerdown", this.handleSpectateButtonClick);
    container.add([background, titleText, targetText, hintText, cycleButton]);
    this.hud = { container, background, titleText, targetText, hintText, cycleButton };
    this.layoutSpectateHud(this.scene.scale.width);
  }

  layoutSpectateHud(width: number): void {
    if (!this.hud) return;
    const panelWidth = Math.min(540, width - 24), panelHeight = 74, left = -panelWidth / 2, right = panelWidth / 2;
    const anchor = anchorScreenSpace(this.scene.cameras.main, width / 2, 18);
    this.hud.container.setPosition(anchor.x, anchor.y).setScale(anchor.scale).setVisible(true);
    this.hud.background.clear().fillStyle(0x120d0a, 0.9).fillRoundedRect(left, 0, panelWidth, panelHeight, 10).lineStyle(2, 0x5f7e86, 0.7).strokeRoundedRect(left, 0, panelWidth, panelHeight, 10);
    this.hud.titleText.setPosition(left + 14, 10).setFontSize("13px");
    this.hud.targetText.setPosition(left + 14, 26).setWordWrapWidth(Math.max(180, panelWidth - 160)).setFontSize("15px");
    this.hud.hintText.setPosition(left + 14, 50).setFontSize("11px");
    this.hud.cycleButton.setPosition(right - 14, 23).setOrigin(1, 0).setFontSize("12px");
  }

  showSpectateHud(state: MatchViewState, target: MatchViewState["players"][number] | undefined, self: MatchViewState["players"][number] | undefined): void {
    this.mountSpectateHud();
    if (!this.hud) return;
    const targetLabel = target ? target.id === self?.id ? "正在观看：自己的尸体" : `正在观看：队友 ${target.name}${target.isAlive ? "" : "（阵亡）"}` : "正在观看：暂无同队目标";
    this.hud.container.setVisible(true);
    this.hud.titleText.setText("你已阵亡");
    this.hud.targetText.setText(targetLabel);
    this.hud.hintText.setText(this.getSpectateHintLabel(state));
    this.layoutSpectateHud(this.scene.scale.width);
  }

  hideSpectateHud(): void { this.hud?.container.setVisible(false); }
  destroySpectateHud(): void { this.hud?.container.destroy(true); this.hud = undefined; }
  private getSelfPlayer(state: MatchViewState | null = this.getState()): MatchViewState["players"][number] | undefined { return state?.players.find((player) => player.id === state.selfPlayerId); }
  private getSpectateHintLabel(state: MatchViewState): string { return this.getSpectateCandidates(state, this.getSelfPlayer(state)).length <= 1 ? "[ / ] 暂无可切换目标" : "[ / ] 切换同队目标"; }
}

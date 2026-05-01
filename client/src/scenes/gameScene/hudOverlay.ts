import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { ExtractUiState } from "../createGameClient";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";
import {
  formatSeconds,
  formatTenths,
  getPrimarySkillLabel,
  getWeaponLabel,
  resolvePrimarySkill
} from "./skillHelpers";

type HudLayout = {
  statusX: number;
  statusY: number;
  statusW: number;
  statusH: number;
  hpBarX: number;
  hpBarY: number;
  hpBarW: number;
  timerX: number;
  timerY: number;
  timerW: number;
  timerH: number;
  commandX: number;
  commandY: number;
  commandW: number;
  commandH: number;
};

export interface HudSyncContext {
  state: MatchViewState;
  extractState: ExtractUiState;
  skillCooldownEndsAt: number;
  skillWindupEndsAt: number;
}

export class GameHudOverlay {
  private readonly scene: Phaser.Scene;
  private readonly isTouchDevice: boolean;
  private container?: Phaser.GameObjects.Container;
  private layout?: HudLayout;
  private hpBar?: { fill: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text };
  private timerText?: Phaser.GameObjects.Text;
  private roomCodeText?: Phaser.GameObjects.Text;
  private weaponNameText?: Phaser.GameObjects.Text;
  private killsText?: Phaser.GameObjects.Text;
  private skillStatusText?: Phaser.GameObjects.Text;
  private combatText?: Phaser.GameObjects.Text;
  private controlsHint?: Phaser.GameObjects.Text;
  private extractProgressTrack?: Phaser.GameObjects.Graphics;
  private extractProgressFill?: Phaser.GameObjects.Graphics;
  private extractProgressLabel?: Phaser.GameObjects.Text;
  private lowHpOverlay?: Phaser.GameObjects.Rectangle;
  private pickupToast?: Phaser.GameObjects.Text;
  private pickupToastTween?: Phaser.Tweens.Tween;
  private lastHudPinX: number | null = null;
  private lastHudPinY: number | null = null;
  private lastHudPinScale: number | null = null;
  private lastSelfHpRatio = -1;
  private lastHudHpColor = -1;
  private lastHudHpLabel = "";
  private lastWeaponLabel = "";
  private lastKillsLabel = "";
  private lastTimerLabel = "";
  private lastRoomCodeLabel = "";
  private lastSkillStatusLabel = "";
  private lastCombatLabel = "";
  private lastExtractProgressValue = -1;
  private lastExtractProgressLabel = "";
  private lastExtractProgressActive: boolean | null = null;

  constructor(scene: Phaser.Scene, isTouchDevice: boolean) {
    this.scene = scene;
    this.isTouchDevice = isTouchDevice;
  }

  mount(): void {
    const { width, height } = this.scene.scale;
    const statusW = this.isTouchDevice ? Math.min(360, width - 32) : 372;
    const statusH = this.isTouchDevice ? 86 : 92;
    const statusX = 20;
    const statusY = 18;
    const timerW = this.isTouchDevice ? Math.min(230, width - 32) : 250;
    const timerH = this.isTouchDevice ? 78 : 84;
    const timerX = width - timerW - 20;
    const timerY = 18;
    const commandW = this.isTouchDevice ? Math.min(width - 36, 500) : 560;
    const commandH = this.isTouchDevice ? 56 : 62;
    const commandX = Math.floor(width / 2 - commandW / 2);
    const commandY = height - (this.isTouchDevice ? 112 : 84);

    this.layout = {
      statusX,
      statusY,
      statusW,
      statusH,
      hpBarX: statusX + 92,
      hpBarY: statusY + 42,
      hpBarW: statusW - 124,
      timerX,
      timerY,
      timerW,
      timerH,
      commandX,
      commandY,
      commandW,
      commandH
    };

    this.container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(200);

    const statusPanel = this.scene.add.image(statusX + statusW / 2, statusY + statusH / 2, "hud_status_panel");
    statusPanel.setDisplaySize(statusW, statusH);
    const callsignText = this.scene.add.text(statusX + 96, statusY + 14, "流亡者 / FIELD UNIT", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#b8ae96",
      letterSpacing: 1
    });

    const hpLabel = this.scene.add.text(statusX + 96, statusY + 18, "生命 -- / --", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "18px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 5,
      letterSpacing: 1
    });
    this.hpBar = { fill: this.scene.add.graphics(), label: hpLabel };

    this.weaponNameText = this.scene.add.text(statusX + 96, statusY + 64, "武器 ----", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "12px",
      color: "#e8602c",
      stroke: "#16130f",
      strokeThickness: 4,
      letterSpacing: 1
    });

    const timerPanel = this.scene.add.image(timerX + timerW / 2, timerY + timerH / 2, "hud_timer_panel");
    timerPanel.setDisplaySize(timerW, timerH);
    const timerCaption = this.scene.add.text(timerX + 18, timerY + 14, "封锁倒计时", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#b8ae96",
      letterSpacing: 1
    });
    this.timerText = this.scene.add.text(timerX + timerW - 16, timerY + 10, "00:00", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "30px",
      color: "#d4b24c"
    }).setOrigin(1, 0);
    this.roomCodeText = this.scene.add.text(timerX + 18, timerY + 46, "频道 ------", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#e8dfc8",
      letterSpacing: 1
    });
    this.skillStatusText = this.scene.add.text(timerX + timerW - 16, timerY + 46, "Q 技能 就绪", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#d9c68f",
      letterSpacing: 1
    }).setOrigin(1, 0);

    this.killsText = this.scene.add.text(timerX + 18, timerY + 64, "压制 0/0", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#e8602c",
      letterSpacing: 1
    });

    const commandPanel = this.scene.add.image(commandX + commandW / 2, commandY + commandH / 2, "hud_command_panel");
    commandPanel.setDisplaySize(commandW, commandH);
    const objectiveLabel = this.scene.add.text(commandX + 16, commandY + 8, "行动指令", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#e8602c",
      letterSpacing: 2
    });
    this.combatText = this.scene.add.text(commandX + commandW / 2, commandY + 34, "", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: "16px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 5,
      align: "center"
    }).setOrigin(0.5, 0.5);

    this.extractProgressTrack = this.scene.add.graphics();
    this.extractProgressFill = this.scene.add.graphics();
    this.extractProgressLabel = this.scene.add.text(width / 2, 88, "撤离读条", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "14px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 4
    }).setOrigin(0.5, 1);
    this.extractProgressTrack.setVisible(false);
    this.extractProgressFill.setVisible(false);
    this.extractProgressLabel.setVisible(false);

    this.lowHpOverlay = this.scene.add.rectangle(0, 0, width, height, GAMEPLAY_THEME.colors.danger, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(160);

    this.controlsHint = this.scene.add.text(width - 20, height - 20, "WASD 移动 | 空格 攻击 | Q 技能 | E 交互 | I 背包", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#7d745e",
      backgroundColor: "rgba(18, 14, 11, 0.82)",
      padding: { x: 10, y: 6 }
    }).setOrigin(1, 1);
    this.controlsHint.setVisible(!this.isTouchDevice);

    this.container.add([
      statusPanel,
      callsignText,
      this.hpBar.fill,
      hpLabel,
      this.weaponNameText,
      timerPanel,
      timerCaption,
      this.timerText,
      this.roomCodeText,
      this.skillStatusText,
      this.killsText,
      commandPanel,
      objectiveLabel,
      this.combatText,
      this.controlsHint,
      this.extractProgressTrack,
      this.extractProgressFill,
      this.extractProgressLabel,
      this.lowHpOverlay
    ]);
  }

  sync(context: HudSyncContext): void {
    const { state, extractState, skillCooldownEndsAt, skillWindupEndsAt } = context;
    const player = state.players.find((candidate) => candidate.id === state.selfPlayerId);
    if (this.hpBar && player && this.layout) {
      const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);

      let color: number = GAMEPLAY_THEME.colors.confirm;
      if (hpRatio < 0.3) color = GAMEPLAY_THEME.colors.danger;
      else if (hpRatio < 0.6) color = GAMEPLAY_THEME.colors.caution;

      const hpLabel = `生命 ${player.hp} / ${player.maxHp}`;
      if (Math.abs(this.lastSelfHpRatio - hpRatio) > 0.005 || this.lastHudHpColor !== color) {
        this.hpBar.fill.clear();
        this.hpBar.fill.fillStyle(0x201711, 0.88);
        this.hpBar.fill.fillRoundedRect(this.layout.hpBarX, this.layout.hpBarY, this.layout.hpBarW, 12, 6);
        this.hpBar.fill.fillStyle(color, 1);
        this.hpBar.fill.fillRoundedRect(this.layout.hpBarX, this.layout.hpBarY, this.layout.hpBarW * hpRatio, 12, 6);
        this.hpBar.fill.lineStyle(1, GAMEPLAY_THEME.colors.bone, 0.18);
        this.hpBar.fill.strokeRoundedRect(this.layout.hpBarX, this.layout.hpBarY, this.layout.hpBarW, 12, 6);
        this.lastSelfHpRatio = hpRatio;
        this.lastHudHpColor = color;
      }
      if (this.lastHudHpLabel !== hpLabel) {
        this.hpBar.label.setText(hpLabel);
        this.lastHudHpLabel = hpLabel;
      }
      this.syncLowHpOverlay(hpRatio);
    } else {
      this.syncLowHpOverlay(1);
    }

    if (this.weaponNameText && player) {
      const weaponLabel = `武器 ${getWeaponLabel(player.weaponType)}`;
      if (this.lastWeaponLabel !== weaponLabel) {
        this.weaponNameText.setText(weaponLabel);
        this.lastWeaponLabel = weaponLabel;
      }
    }

    if (this.killsText) {
      const deadMonsters = state.monsters.filter((monster) => !monster.isAlive).length;
      const killsLabel = `压制 ${deadMonsters}/${state.monsters.length}`;
      if (this.lastKillsLabel !== killsLabel) {
        this.killsText.setText(killsLabel);
        this.lastKillsLabel = killsLabel;
      }
    }

    if (this.timerText) {
      const timerLabel = state.secondsRemaining == null ? "--:--" : formatSeconds(state.secondsRemaining);
      if (this.lastTimerLabel !== timerLabel) {
        this.timerText.setText(timerLabel);
        this.lastTimerLabel = timerLabel;
      }
    }

    if (this.roomCodeText) {
      const roomCodeLabel = `频道 ${state.code || "------"}`;
      if (this.lastRoomCodeLabel !== roomCodeLabel) {
        this.roomCodeText.setText(roomCodeLabel);
        this.lastRoomCodeLabel = roomCodeLabel;
      }
    }

    if (this.skillStatusText) {
      const skillId = resolvePrimarySkill(state);
      const now = Date.now();
      let skillStatusLabel = "Q 技能 未配置";
      if (skillId) {
        if (now < skillWindupEndsAt) skillStatusLabel = `Q ${getPrimarySkillLabel(skillId)} 蓄力 ${formatTenths((skillWindupEndsAt - now) / 1000)}s`;
        else if (now < skillCooldownEndsAt) skillStatusLabel = `Q ${getPrimarySkillLabel(skillId)} 冷却 ${formatTenths((skillCooldownEndsAt - now) / 1000)}s`;
        else skillStatusLabel = `Q ${getPrimarySkillLabel(skillId)} 就绪`;
      }
      if (this.lastSkillStatusLabel !== skillStatusLabel) {
        this.skillStatusText.setText(skillStatusLabel);
        this.lastSkillStatusLabel = skillStatusLabel;
      }
    }

    if (this.combatText) {
      const combatLabel = extractState.message || "向中心废土推进，搜刮战利品，然后撤离。";
      if (this.lastCombatLabel !== combatLabel) {
        this.combatText.setText(combatLabel);
        this.lastCombatLabel = combatLabel;
      }
    }

    this.syncExtractProgress(extractState);
  }

  pinToCamera(): void {
    if (!this.container) return;
    const nextX = 0;
    const nextY = 0;
    const nextScale = 1;

    if (this.lastHudPinX !== nextX || this.lastHudPinY !== nextY) {
      this.container.setPosition(nextX, nextY);
      this.lastHudPinX = nextX;
      this.lastHudPinY = nextY;
    }
    if (this.lastHudPinScale !== nextScale) {
      this.container.setScale(nextScale);
      this.lastHudPinScale = nextScale;
    }
  }

  showPickupFeedback(itemName: string): void {
    const { width, height } = this.scene.scale;
    this.pickupToastTween?.stop();
    this.pickupToast?.destroy();

    this.pickupToast = this.scene.add.text(width / 2, height - 132, `回收 ${itemName}`, {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "13px",
      color: "#e8dfc8",
      backgroundColor: "rgba(22,19,15,0.92)",
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    this.pickupToast.setAlpha(0);
    this.pickupToastTween = this.scene.tweens.add({
      targets: this.pickupToast,
      y: height - 154,
      alpha: { from: 0, to: 1 },
      duration: 220,
      ease: "Cubic.out",
      hold: 1200,
      yoyo: true,
      onComplete: () => {
        this.pickupToast?.destroy();
        this.pickupToast = undefined;
        this.pickupToastTween = undefined;
      }
    });
  }

  destroy(): void {
    this.pickupToastTween?.stop();
    this.pickupToastTween = undefined;
    this.pickupToast?.destroy();
    this.pickupToast = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }

  private syncLowHpOverlay(hpRatio: number): void {
    if (!this.lowHpOverlay) return;
    const targetAlpha = hpRatio < 0.28 ? 0.18 : hpRatio < 0.48 ? 0.08 : 0;
    this.lowHpOverlay.setAlpha(targetAlpha);
  }

  private syncExtractProgress(extractState: ExtractUiState): void {
    if (!this.extractProgressTrack || !this.extractProgressFill || !this.extractProgressLabel) return;

    const active = extractState.isExtracting && extractState.progress !== null;
    if (this.lastExtractProgressActive !== active) {
      this.extractProgressTrack.setVisible(active);
      this.extractProgressFill.setVisible(active);
      this.extractProgressLabel.setVisible(active);
      this.lastExtractProgressActive = active;
    }

    if (!active) {
      return;
    }

    const width = this.scene.scale.width;
    const progress = Phaser.Math.Clamp(extractState.progress ?? 0, 0, 1);
    if (Math.abs(this.lastExtractProgressValue - progress) > 0.005) {
      this.extractProgressTrack.clear();
      this.extractProgressTrack.fillStyle(0x120d0a, 0.88);
      this.extractProgressTrack.fillRoundedRect(width / 2 - 174, 96, 348, 24, 8);
      this.extractProgressTrack.lineStyle(2, GAMEPLAY_THEME.colors.signal, 0.45);
      this.extractProgressTrack.strokeRoundedRect(width / 2 - 174, 96, 348, 24, 8);
      this.extractProgressFill.clear();
      this.extractProgressFill.fillStyle(GAMEPLAY_THEME.colors.signal, 1);
      this.extractProgressFill.fillRoundedRect(width / 2 - 162, 104, 324 * progress, 8, 4);
      this.lastExtractProgressValue = progress;
    }
    const seconds = extractState.secondsRemaining == null ? "" : ` ${Math.ceil(extractState.secondsRemaining)}s`;
    const label = `撤离读条${seconds}`;
    if (this.lastExtractProgressLabel !== label) {
      this.extractProgressLabel.setText(label);
      this.lastExtractProgressLabel = label;
    }
  }
}

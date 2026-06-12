import Phaser from "phaser";
import { MATCH_DURATION_SEC, resolveExtractionPressurePhase } from "@gamer/shared";
import type { MatchViewState } from "../../game";
import type { ExtractUiState } from "../createGameClient";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";
import { anchorScreenSpace } from "./renderConfig";
import {
  formatSeconds,
  formatTenths,
  getHudSkillSlotLabel,
  getPrimarySkillLabel,
  getWeaponLabel,
  resolvePrimarySkill,
  resolveSkillBySlot
} from "./skillHelpers";

const HUD_ASSETS = {
  status: "hud_status",
  objective: "hud_objective",
  timer: "hud_timer",
  command: "hud_command",
  skills: "hud_skills"
} as const;

const SKILL_SLOT_CENTER_Y_RATIO = 0.5;
const SKILL_NAME_LABEL_Y_RATIO = -0.05;
const SKILL_KEY_LABEL_Y_RATIO = 0.32;

type HudLayout = {
  status: Phaser.Geom.Rectangle;
  hpBar: Phaser.Geom.Rectangle;
  objective: Phaser.Geom.Rectangle;
  timer: Phaser.Geom.Rectangle;
  command: Phaser.Geom.Rectangle;
  skills: Phaser.Geom.Rectangle;
  commandAnchorY: number;
  skillSlots: Array<{ x: number; y: number; width: number; height: number }>;
};

export interface HudSyncContext {
  state: MatchViewState;
  extractState: ExtractUiState;
  skillCooldownEndsAt: number;
  skillWindupEndsAt: number;
  skillCooldowns: Array<{ endsAt: number; durationMs: number }>;
}

export class GameHudOverlay {
  private readonly scene: Phaser.Scene;
  private readonly isTouchDevice: boolean;
  private container?: Phaser.GameObjects.Container;
  private layout?: HudLayout;
  private hpFill?: Phaser.GameObjects.Graphics;
  private hpValueText?: Phaser.GameObjects.Text;
  private hpSlashText?: Phaser.GameObjects.Text;
  private hpMaxText?: Phaser.GameObjects.Text;
  private hpMetaText?: Phaser.GameObjects.Text;
  private weaponText?: Phaser.GameObjects.Text;
  private skillStateText?: Phaser.GameObjects.Text;
  private objectiveText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private roomCodeText?: Phaser.GameObjects.Text;
  private extractText?: Phaser.GameObjects.Text;
  private killsText?: Phaser.GameObjects.Text;
  private inventoryText?: Phaser.GameObjects.Text;
  private combatText?: Phaser.GameObjects.Text;
  private skillKeyTexts: Phaser.GameObjects.Text[] = [];
  private skillNameTexts: Phaser.GameObjects.Text[] = [];
  private skillCooldownTexts: Phaser.GameObjects.Text[] = [];
  private skillCooldownGraphics: Phaser.GameObjects.Graphics[] = [];
  private extractProgressTrack?: Phaser.GameObjects.Graphics;
  private extractProgressFill?: Phaser.GameObjects.Graphics;
  private extractProgressLabel?: Phaser.GameObjects.Text;
  private chestProgressTrack?: Phaser.GameObjects.Graphics;
  private chestProgressFill?: Phaser.GameObjects.Graphics;
  private chestProgressLabel?: Phaser.GameObjects.Text;
  private lowHpOverlay?: Phaser.GameObjects.Rectangle;
  private pickupToast?: Phaser.GameObjects.Container;
  private pickupToastTween?: Phaser.Tweens.Tween;
  private lockAssistToast?: Phaser.GameObjects.Container;
  private lockAssistToastTween?: Phaser.Tweens.Tween;
  private lastLockAssistToastKey = "";
  private lastLockAssistToastAt = 0;

  private lastSelfHpRatio = -1;
  private lastHudHpColor = -1;
  private lastHpValue = -1;
  private lastHpMax = -1;
  private lastHudHpMetaLabel = "";
  private lastWeaponLabel = "";
  private lastSkillStateLabel = "";
  private lastObjectiveLabel = "";
  private lastTimerLabel = "";
  private lastRoomCodeLabel = "";
  private lastExtractLabel = "";
  private lastKillsLabel = "";
  private lastInventoryLabel = "";
  private lastCombatLabel = "";
  private lastSkillNameLabels = ["", "", "", ""];
  private lastExtractProgressValue = -1;
  private lastExtractProgressLabel = "";
  private lastExtractProgressActive: boolean | null = null;
  private lastExtractProgressExposed: boolean | null = null;
  private lastChestProgressValue = -1;
  private lastChestProgressLabel = "";
  private lastChestProgressActive: boolean | null = null;

  constructor(scene: Phaser.Scene, isTouchDevice: boolean) {
    this.scene = scene;
    this.isTouchDevice = isTouchDevice;
  }

  mount(): void {
    const { width, height } = this.scene.scale;
    this.layout = buildHudLayout(width, height, this.isTouchDevice);
    this.container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(10000);
    this.pinToCamera();

    const statusPanel = addHudImage(this.scene, HUD_ASSETS.status, this.layout.status, 0.98);
    const objectivePanel = addHudImage(this.scene, HUD_ASSETS.objective, this.layout.objective, 0.96);
    const timerPanel = addHudImage(this.scene, HUD_ASSETS.timer, this.layout.timer, 0.96);
    const commandPanel = addHudImage(this.scene, HUD_ASSETS.command, this.layout.command, 0.96);
    const skillPanel = addHudImage(this.scene, HUD_ASSETS.skills, this.layout.skills, 0.98);

    const status = this.layout.status;
    this.hpMetaText = this.scene.add.text(status.x + status.width * 0.29, status.y + status.height * 0.15, "生命线", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "10px" : "11px",
      color: "#6f5534",
      letterSpacing: 0
    });
    
    // HP Display: Split into 3 parts for subtle slash and specific sizing
    const hpY = status.y + status.height * 0.22;
    const hpBaseSize = this.isTouchDevice ? 18 : 20;
    this.hpValueText = this.scene.add.text(status.x + status.width * 0.29, hpY, "--", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: `${hpBaseSize}px`,
      color: "#2a1d13",
      stroke: "#efe3c5",
      strokeThickness: 2
    });
    this.hpSlashText = this.scene.add.text(this.hpValueText.getBounds().right + 2, hpY + 2, "/", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: `${hpBaseSize - 4}px`,
      color: "#8a7a6a", // Subtle gray slash
      stroke: "#efe3c5",
      strokeThickness: 1
    });
    this.hpMaxText = this.scene.add.text(this.hpSlashText.getBounds().right + 2, hpY + 2, "--", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: `${hpBaseSize - 2}px`,
      color: "#4a3d33",
      stroke: "#efe3c5",
      strokeThickness: 1
    });

    this.weaponText = this.scene.add.text(status.x + status.width * 0.29, status.y + status.height * 0.63, "武器 · --", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "11px" : "12px",
      color: "#4e2c18"
    });
    this.skillStateText = this.scene.add.text(status.x + status.width * 0.72, status.y + status.height * 0.63, "战技 · 待命", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "11px" : "12px",
      color: "#284854"
      }).setOrigin(0.5, 0);
    this.weaponText
      .setPosition(status.x + status.width * 0.29, status.y + status.height * 0.61);
    this.skillStateText
      .setPosition(status.x + status.width * 0.86, status.y + status.height * 0.61)
      .setOrigin(1, 0);
    this.hpFill = this.scene.add.graphics();

    const objective = this.layout.objective;
    this.objectiveText = this.scene.add.text(objective.centerX, objective.y + objective.height * 0.52, "搜刮战利品\n等待归营石阵点燃", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "12px" : "13px",
      color: "#2a1d13",
      align: "center",
      lineSpacing: 2,
      wordWrap: { width: Math.max(160, objective.width - 110), useAdvancedWrap: true }
    }).setOrigin(0.5);

    const timer = this.layout.timer;
    this.timerText = this.scene.add.text(timer.x + timer.width * 0.62, timer.y + timer.height * 0.27, "00:00", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: this.isTouchDevice ? "22px" : "26px",
      color: "#4d3517",
      stroke: "#f3e6c6",
      strokeThickness: 2
    }).setOrigin(0.5, 0);
    this.roomCodeText = this.scene.add.text(timer.x + timer.width * 0.26, timer.y + timer.height * 0.36, "战令 · ------", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "10px" : "11px",
      color: "#342416"
    });
    this.extractText = this.scene.add.text(timer.x + timer.width * 0.26, timer.y + timer.height * 0.56, "队撤 · 未点燃", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "10px" : "11px",
      color: "#284854"
    });
    this.killsText = this.scene.add.text(timer.x + timer.width * 0.26, timer.y + timer.height * 0.74, "清怪 · 0/0", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "10px" : "11px",
      color: "#5a2519"
    });
    this.inventoryText = this.scene.add.text(timer.x + timer.width * 0.63, timer.y + timer.height * 0.74, "载荷 · --/--", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "10px" : "11px",
      color: "#342416"
    });

    this.objectiveText
      .setPosition(objective.centerX, objective.y + objective.height * 0.48)
      .setWordWrapWidth(Math.max(160, objective.width - 120));
    const timerPrimaryRight = timer.right - timer.width * 0.12;
    const timerInfoLeft = timer.x + timer.width * 0.15;
    const timerBottomY = timer.y + timer.height * 0.74;
    this.timerText
      .setPosition(timerPrimaryRight, timer.y + timer.height * 0.12)
      .setOrigin(1, 0);
    this.roomCodeText
      .setPosition(timerInfoLeft, timer.y + timer.height * 0.28);
    this.extractText
      .setPosition(timerInfoLeft, timer.y + timer.height * 0.48);
    this.killsText
      .setPosition(timerInfoLeft, timerBottomY);
    this.inventoryText
      .setPosition(timerPrimaryRight, timerBottomY)
      .setOrigin(1, 0);

    const command = this.layout.command;
    this.combatText = this.scene.add.text(command.centerX, command.centerY + 2, "", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "12px" : "13px",
      color: "#2a1d13",
      align: "center",
      lineSpacing: 2,
      wordWrap: { width: Math.max(220, command.width - 140), useAdvancedWrap: true }
    }).setOrigin(0.5);

    // Skill Bar: Name above (prominent), Key below (subtle)
    this.skillNameTexts = this.layout.skillSlots.map((slot, index) => this.scene.add.text(slot.x, slot.y + slot.height * -0.05, index === 3 ? "闪避" : "--", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "12px" : "13px",
      color: "#251a12",
      align: "center",
      wordWrap: { width: slot.width - 4, useAdvancedWrap: true },
      maxLines: 2
    }).setOrigin(0.5));
    
    this.skillKeyTexts = this.layout.skillSlots.map((slot, index) => this.scene.add.text(slot.x, slot.y + slot.height * 0.32, index === 3 ? "SHIFT" : ["Q", "R", "T"][index] ?? "--", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: this.isTouchDevice ? "9px" : "10px",
      color: "#8a7a6a", // Subtle key label
      align: "center"
    }).setOrigin(0.5));

    this.skillCooldownTexts = this.layout.skillSlots.map((slot) => this.scene.add.text(slot.x, slot.y - 1, "", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: this.isTouchDevice ? "17px" : "19px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 2,
      align: "center"
    }).setOrigin(0.5).setVisible(false));

    this.skillCooldownGraphics = this.layout.skillSlots.map(() => this.scene.add.graphics());

    this.extractProgressTrack = this.scene.add.graphics();
    this.extractProgressFill = this.scene.add.graphics();
    this.extractProgressLabel = this.scene.add.text(width / 2, Math.max(112, this.layout.objective.bottom + 18), "撤离读条", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: this.isTouchDevice ? "17px" : "19px",
      color: "#f1e3c4",
      stroke: "#120d0a",
      strokeThickness: 4
    }).setOrigin(0.5, 1);
    this.extractProgressTrack.setVisible(false);
    this.extractProgressFill.setVisible(false);
    this.extractProgressLabel.setVisible(false);

    this.chestProgressTrack = this.scene.add.graphics();
    this.chestProgressFill = this.scene.add.graphics();
    this.chestProgressLabel = this.scene.add.text(width / 2, Math.max(112, this.layout.objective.bottom + 18), "开启宝箱", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: this.isTouchDevice ? "17px" : "19px",
      color: "#4ade80",
      stroke: "#120d0a",
      strokeThickness: 4
    }).setOrigin(0.5, 1);
    this.chestProgressTrack.setVisible(false);
    this.chestProgressFill.setVisible(false);
    this.chestProgressLabel.setVisible(false);

    this.lowHpOverlay = this.scene.add.rectangle(0, 0, width, height, GAMEPLAY_THEME.colors.danger, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(9900);

    this.container.add([
      statusPanel,
      objectivePanel,
      timerPanel,
      commandPanel,
      skillPanel,
      this.hpFill,
      this.hpMetaText,
      this.hpValueText,
      this.hpSlashText,
      this.hpMaxText,
      this.weaponText,
      this.skillStateText,
      this.objectiveText,
      this.timerText,
      this.roomCodeText,
      this.extractText,
      this.killsText,
      this.inventoryText,
      this.combatText,
      ...this.skillCooldownGraphics,
      ...this.skillKeyTexts,
      ...this.skillNameTexts,
      ...this.skillCooldownTexts,
      this.extractProgressTrack,
      this.extractProgressFill,
      this.extractProgressLabel,
      this.chestProgressTrack,
      this.chestProgressFill,
      this.chestProgressLabel
    ]);
  }

  sync(context: HudSyncContext): void {
    const { state, extractState, skillCooldownEndsAt, skillWindupEndsAt, skillCooldowns } = context;
    const player = state.players.find((candidate) => candidate.id === state.selfPlayerId);

    if (this.hpFill && this.hpValueText && this.hpSlashText && this.hpMaxText && player && this.layout) {
      const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);
      let color: number = 0x4f8a35;
      if (hpRatio < 0.3) color = 0xb8371f;
      else if (hpRatio < 0.6) color = 0xd4a13a;

      if (Math.abs(this.lastSelfHpRatio - hpRatio) > 0.005 || this.lastHudHpColor !== color) {
        const bar = this.layout.hpBar;
        this.hpFill.clear();
        this.hpFill.fillStyle(0x1b120c, 0.88);
        this.hpFill.fillRoundedRect(bar.x, bar.y, bar.width, bar.height, 6);
        this.hpFill.fillStyle(color, 1);
        this.hpFill.fillRoundedRect(bar.x, bar.y, bar.width * hpRatio, bar.height, 6);
        this.hpFill.lineStyle(2, 0x382211, 0.55);
        this.hpFill.strokeRoundedRect(bar.x, bar.y, bar.width, bar.height, 6);
        this.lastSelfHpRatio = hpRatio;
        this.lastHudHpColor = color;
      }

      const hpValue = Math.max(0, Math.ceil(player.hp));
      if (this.lastHpValue !== hpValue) {
        this.hpValueText.setText(hpValue.toString());
        this.hpSlashText.setX(this.hpValueText.getBounds().right + 2);
        this.hpMaxText.setX(this.hpSlashText.getBounds().right + 2);
        this.lastHpValue = hpValue;
      }
      if (this.lastHpMax !== player.maxHp) {
        this.hpMaxText.setText(player.maxHp.toString());
        this.lastHpMax = player.maxHp;
      }

      const hpMetaLabel = hpRatio < 0.3 ? "生命线 · 危险" : hpRatio < 0.6 ? "生命线 · 受压" : "生命线 · 稳定";
      if (this.hpMetaText && this.lastHudHpMetaLabel !== hpMetaLabel) {
        this.hpMetaText.setText(hpMetaLabel);
        this.lastHudHpMetaLabel = hpMetaLabel;
      }
      this.syncLowHpOverlay(hpRatio);
    } else {
      this.syncLowHpOverlay(1);
    }

    if (this.weaponText && player) {
      const weaponLabel = `武器 · ${getWeaponLabel(player.weaponType)}`;
      if (this.lastWeaponLabel !== weaponLabel) {
        this.weaponText.setText(weaponLabel);
        this.lastWeaponLabel = weaponLabel;
      }
    }

    if (this.skillStateText) {
      const skillId = resolvePrimarySkill(state);
      const now = Date.now();
      let skillStateLabel = "战技 · 未配置";
      if (skillId) {
        if (now < skillWindupEndsAt) skillStateLabel = `${getPrimarySkillLabel(skillId)} · 蓄力 ${formatTenths((skillWindupEndsAt - now) / 1000)}s`;
        else if (now < skillCooldownEndsAt) skillStateLabel = `${getPrimarySkillLabel(skillId)} · 冷却 ${formatTenths((skillCooldownEndsAt - now) / 1000)}s`;
        else skillStateLabel = `${getPrimarySkillLabel(skillId)} · 可用`;
      }
      if (this.lastSkillStateLabel !== skillStateLabel) {
        this.skillStateText.setText(skillStateLabel);
        this.lastSkillStateLabel = skillStateLabel;
      }
    }

    if (this.objectiveText) {
      const objectiveLabel = resolveObjectiveLabel(extractState, state);
      if (this.lastObjectiveLabel !== objectiveLabel) {
        this.objectiveText.setText(objectiveLabel);
        this.lastObjectiveLabel = objectiveLabel;
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
      const roomCodeLabel = `战令 · ${state.code || "------"}`;
      if (this.lastRoomCodeLabel !== roomCodeLabel) {
        this.roomCodeText.setText(roomCodeLabel);
        this.lastRoomCodeLabel = roomCodeLabel;
      }
    }

    if (this.extractText) {
      const extractLabel = resolveExtractStateLabel(extractState);
      if (this.lastExtractLabel !== extractLabel) {
        this.extractText.setText(extractLabel);
        this.extractText.setColor(extractState.isOpen ? "#28515b" : "#684018");
        this.lastExtractLabel = extractLabel;
      }
    }

    if (this.killsText) {
      const deadMonsters = state.monsters.filter((monster) => !monster.isAlive).length;
      const killsLabel = `清怪 · ${deadMonsters}/${state.monsters.length}`;
      if (this.lastKillsLabel !== killsLabel) {
        this.killsText.setText(killsLabel);
        this.lastKillsLabel = killsLabel;
      }
    }

    if (this.inventoryText) {
      const inventoryLabel = resolveInventoryLabel(state);
      if (this.lastInventoryLabel !== inventoryLabel) {
        this.inventoryText.setText(inventoryLabel);
        this.lastInventoryLabel = inventoryLabel;
      }
    }

    if (this.combatText) {
      const combatLabel = extractState.message || resolvePressureHint(state, extractState);
      if (this.lastCombatLabel !== combatLabel) {
        this.combatText.setText(combatLabel);
        this.lastCombatLabel = combatLabel;
      }
    }

    this.syncSkillSlots(state, skillCooldowns);
    this.syncExtractProgress(extractState);
  }

  pinToCamera(): void {
    const anchor = anchorScreenSpace(this.scene.cameras.main, 0, 0);
    this.container?.setPosition(anchor.x, anchor.y).setScale(anchor.scale).setDepth(10000);
  }

  showPickupFeedback(itemName: string): void {
    const { width, height } = this.scene.scale;
    this.pickupToastTween?.stop();
    this.pickupToast?.destroy();

    const w = Math.min(320, width - 48); // More compact pickup toast
    const h = 42;
    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1a120d, 0.92);
    panel.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    panel.lineStyle(2, 0xfbbf24, 0.85); // Warm gold border
    panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

    const text = this.scene.add.text(0, 0, `回收 ${itemName}`, {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: "14px",
      color: "#fbbf24", // Warm gold text
      align: "center",
      stroke: "#000000",
      strokeThickness: 2,
      wordWrap: { width: w - 40, useAdvancedWrap: true }
    }).setOrigin(0.5);

    const toastFrom = anchorScreenSpace(this.scene.cameras.main, width / 2, height - 160);
    const toastTo = anchorScreenSpace(this.scene.cameras.main, width / 2, height - 182);
    this.pickupToast = this.scene.add.container(toastFrom.x, toastFrom.y, [panel, text])
      .setScale(toastFrom.scale)
      .setScrollFactor(0)
      .setDepth(10020)
      .setAlpha(0);

    this.pickupToastTween = this.scene.tweens.add({
      targets: this.pickupToast,
      y: toastTo.y,
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

  showLockAssistFeedback(text: string, tone: "info" | "warn", key?: string, visibleMs?: number): void {
    const now = Date.now();
    const dedupeKey = key ?? `${tone}:${text}`;
    if (dedupeKey === this.lastLockAssistToastKey && now - this.lastLockAssistToastAt < 850) {
      return;
    }
    this.lastLockAssistToastKey = dedupeKey;
    this.lastLockAssistToastAt = now;

    const { width, height } = this.scene.scale;
    this.lockAssistToastTween?.stop();
    this.lockAssistToast?.destroy();

    const panelWidth = Math.min(360, width - 60);
    const accent = tone === "warn" ? 0xb8371f : 0x28515b;
    const background = tone === "warn" ? 0x24120f : 0x101919;
    const panel = this.scene.add.graphics();
    panel.fillStyle(background, 0.94);
    panel.fillRoundedRect(-panelWidth / 2, -26, panelWidth, 52, 10);
    panel.lineStyle(2, accent, 0.95);
    panel.strokeRoundedRect(-panelWidth / 2, -26, panelWidth, 52, 10);

    const textNode = this.scene.add.text(0, 0, text, {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "15px" : "16px",
      color: tone === "warn" ? "#ffd2c3" : "#d7f2ef",
      align: "center",
      wordWrap: { width: panelWidth - 36, useAdvancedWrap: true }
    }).setOrigin(0.5);

    const assistFrom = anchorScreenSpace(this.scene.cameras.main, width / 2, height - 228);
    const assistTo = anchorScreenSpace(this.scene.cameras.main, width / 2, height - 246);
    this.lockAssistToast = this.scene.add.container(assistFrom.x, assistFrom.y, [panel, textNode])
      .setScale(assistFrom.scale)
      .setScrollFactor(0)
      .setDepth(10030)
      .setAlpha(0);

    this.lockAssistToastTween = this.scene.tweens.add({
      targets: this.lockAssistToast,
      y: assistTo.y,
      alpha: { from: 0, to: 1 },
      duration: 150,
      ease: "Cubic.out",
      hold: visibleMs ?? (tone === "warn" ? 1100 : 700),
      yoyo: true,
      onComplete: () => {
        this.lockAssistToast?.destroy();
        this.lockAssistToast = undefined;
        this.lockAssistToastTween = undefined;
      }
    });
  }

  destroy(): void {
    this.pickupToastTween?.stop();
    this.pickupToastTween = undefined;
    this.pickupToast?.destroy();
    this.pickupToast = undefined;
    this.lockAssistToastTween?.stop();
    this.lockAssistToastTween = undefined;
    this.lockAssistToast?.destroy();
    this.lockAssistToast = undefined;
    this.lowHpOverlay?.destroy();
    this.lowHpOverlay = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }

  private syncSkillSlots(state: MatchViewState, cooldowns: Array<{ endsAt: number; durationMs: number }>): void {
    const labels = [
      buildSkillSlotLabel(resolveSkillBySlot(state, 0)),
      buildSkillSlotLabel(resolveSkillBySlot(state, 1)),
      buildSkillSlotLabel(resolveSkillBySlot(state, 2)),
      getHudSkillSlotLabel("common_dodge")
    ];

    labels.forEach((label, index) => {
      const text = this.skillNameTexts[index];
      if (!text || this.lastSkillNameLabels[index] === label) return;
      text.setText(label);
      this.lastSkillNameLabels[index] = label;
    });

    this.syncSkillCooldowns(cooldowns);
  }

  private syncSkillCooldowns(cooldowns: Array<{ endsAt: number; durationMs: number }>): void {
    if (!this.layout) return;
    const now = Date.now();
    this.layout.skillSlots.forEach((slot, index) => {
      const graphic = this.skillCooldownGraphics[index];
      const nameText = this.skillNameTexts[index];
      const cooldownText = this.skillCooldownTexts[index];
      if (!graphic || !nameText || !cooldownText) return;

      const cooldown = cooldowns[index] ?? { endsAt: 0, durationMs: 0 };
      const remainingMs = Math.max(0, cooldown.endsAt - now);
      const durationMs = Math.max(1, cooldown.durationMs);
      const ratio = Phaser.Math.Clamp(remainingMs / durationMs, 0, 1);
      const x = slot.x - slot.width / 2;
      const y = slot.y - slot.height / 2;

      graphic.clear();
      if (remainingMs > 0) {
        graphic.fillStyle(0x0e0b08, 0.7);
        graphic.fillRoundedRect(x, y, slot.width, slot.height, 6);
        graphic.fillStyle(0xd4b24c, 0.3);
        graphic.fillRoundedRect(
          x + 4,
          y + 4 + (slot.height - 8) * (1 - ratio),
          slot.width - 8,
          (slot.height - 8) * ratio,
          4
        );
        graphic.lineStyle(2, GAMEPLAY_THEME.colors.caution, 0.86);
        graphic.strokeRoundedRect(x + 1, y + 1, slot.width - 2, slot.height - 2, 6);
        nameText.setAlpha(0.3);
        cooldownText.setVisible(true).setAlpha(1);
        cooldownText.setText(Math.ceil(remainingMs / 1000).toString());
      } else {
        nameText.setAlpha(1);
        cooldownText.setVisible(false);
        cooldownText.setText("");
      }
    });
  }

  private syncChestProgress(chestProgress?: { progress: number; remainingMs: number; lane?: "starter" | "contested"; noiseRadius?: number } | null): void {
    if (!this.chestProgressTrack || !this.chestProgressFill || !this.chestProgressLabel || !this.layout) return;

    const active = Boolean(chestProgress && chestProgress.progress > 0 && chestProgress.progress < 1);
    if (this.lastChestProgressActive !== active) {
      this.chestProgressTrack.setVisible(active);
      this.chestProgressFill.setVisible(active);
      this.chestProgressLabel.setVisible(active);
      this.lastChestProgressActive = active;
    }
    if (!active || !chestProgress) return;

    const progress = Phaser.Math.Clamp(chestProgress.progress, 0, 1);
    const isContested = chestProgress.lane === "contested";
    const barWidth = Math.min(420, this.scene.scale.width - 120);
    const x = this.scene.scale.width / 2 - barWidth / 2;
    const y = Math.max(116, this.layout.objective.bottom + 18);

    if (Math.abs(this.lastChestProgressValue - progress) > 0.005) {
      this.chestProgressTrack.clear();
      this.chestProgressTrack.fillStyle(0x130e0a, 0.9);
      this.chestProgressTrack.fillRoundedRect(x, y, barWidth, 20, 6);
      this.chestProgressTrack.lineStyle(2, isContested ? 0xfb923c : 0x4ade80, 0.82);
      this.chestProgressTrack.strokeRoundedRect(x, y, barWidth, 20, 6);
      this.chestProgressFill.clear();
      this.chestProgressFill.fillStyle(isContested ? 0xfb923c : 0x4ade80, 1);
      this.chestProgressFill.fillRoundedRect(x + 6, y + 6, (barWidth - 12) * progress, 8, 3);
      this.lastChestProgressValue = progress;
    }

    const seconds = ` ${Math.ceil(chestProgress.remainingMs / 1000)}s`;
    const label = `开启宝箱${seconds}`;
    const displayLabel = isContested
      ? `\u9ad8\u5371\u5b9d\u7bb1\u00b7\u5b88\u536b\u5df2\u8b66\u89c9${seconds}`
      : label.replace(/.*/, `\u5f00\u542f\u5b9d\u7bb1${seconds}`);
    if (this.lastChestProgressLabel !== displayLabel) {
      this.chestProgressLabel.setText(displayLabel);
      this.lastChestProgressLabel = displayLabel;
    }
  }

  private syncLowHpOverlay(hpRatio: number): void {
    if (!this.lowHpOverlay) return;
    const targetAlpha = hpRatio < 0.28 ? 0.16 : hpRatio < 0.48 ? 0.07 : 0;
    this.lowHpOverlay.setAlpha(targetAlpha);
  }

  private syncExtractProgress(extractState: ExtractUiState): void {
    if (!this.extractProgressTrack || !this.extractProgressFill || !this.extractProgressLabel || !this.layout) return;

    const active = extractState.isExtracting && extractState.progress !== null;
    if (this.lastExtractProgressActive !== active) {
      this.extractProgressTrack.setVisible(active);
      this.extractProgressFill.setVisible(active);
      this.extractProgressLabel.setVisible(active);
      this.lastExtractProgressActive = active;
    }
    if (!active) {
      this.lastExtractProgressExposed = null;
      return;
    }

    const progress = Phaser.Math.Clamp(extractState.progress ?? 0, 0, 1);
    const exposed = Boolean(extractState.pressure);
    const barWidth = Math.min(520, this.scene.scale.width - 80);
    const x = this.scene.scale.width / 2 - barWidth / 2;
    const y = Math.max(116, this.layout.objective.bottom + 18);

    if (Math.abs(this.lastExtractProgressValue - progress) > 0.005 || this.lastExtractProgressExposed !== exposed) {
      this.extractProgressTrack.clear();
      this.extractProgressTrack.fillStyle(0x130e0a, 0.9);
      this.extractProgressTrack.fillRoundedRect(x, y, barWidth, 24, 8);
      this.extractProgressTrack.lineStyle(2, exposed ? 0xfb923c : 0xd4b24c, 0.82);
      this.extractProgressTrack.strokeRoundedRect(x, y, barWidth, 24, 8);
      this.extractProgressFill.clear();
      this.extractProgressFill.fillStyle(exposed ? 0xfb923c : 0xd4b24c, 1);
      this.extractProgressFill.fillRoundedRect(x + 8, y + 8, (barWidth - 16) * progress, 8, 4);
      this.lastExtractProgressValue = progress;
      this.lastExtractProgressExposed = exposed;
    }

    const seconds = extractState.secondsRemaining == null ? "" : ` ${Math.ceil(extractState.secondsRemaining)}s`;
    const label = `撤离读条${seconds}`;
    const displayLabel = exposed ? `\u5f52\u8425\u706b\u58f0\u5df2\u66b4\u9732${seconds}` : label;
    if (this.lastExtractProgressLabel !== displayLabel) {
      this.extractProgressLabel.setText(displayLabel);
      this.lastExtractProgressLabel = displayLabel;
    }
  }
}

function buildHudLayout(width: number, height: number, isTouchDevice: boolean): HudLayout {
  const margin = 12; // [待人工调优] 12 px margin from viewport edges minimum
  const gap = 6; // [待人工调优] 6 px gap between adjacent panels
  
  // Status panel: max 320 px wide on desktop, scale down for narrow screens
  const statusW = Math.min(320, width * (isTouchDevice ? 0.3 : 0.35)); // [待人工调优] Reduced % on mobile
  const statusH = Math.round(statusW / 4.16); // [待人工调优] Ratio from existing code
  
  // Timer panel: max 280 px wide
  const timerW = Math.min(280, width * (isTouchDevice ? 0.25 : 0.3)); // [待人工调优] Reduced % on mobile
  const timerH = Math.round(timerW / 2.82); // [待人工调优] Ratio from existing code
  
  // Objective panel: max 260 px wide
  const objectiveW = Math.min(260, width - statusW - timerW - margin * 4); // [待人工调优]
  const objectiveH = Math.round(objectiveW / (isTouchDevice ? 3.15 : 2.72)); // [待人工调优] Ratio from existing code
  
  // Skills panel (bottom): centered, max 480 px wide
  const skillsW = Math.min(480, width - margin * 2); // [待人工调优]
  const skillsH = Math.round(skillsW / 5.46); // [待人工调优] Ratio from existing code
  
  // Command panel
  const commandW = isTouchDevice ? Math.min(500, width - margin * 2) : 360; // [待人工调优] Narrower on desktop to avoid overlap
  const commandH = Math.round(commandW / 7.2); // [待人工调优] Ratio from existing code

  const status = new Phaser.Geom.Rectangle(margin, margin, statusW, statusH);
  const timer = new Phaser.Geom.Rectangle(width - timerW - margin, margin, timerW, timerH);
  
  // Center objective between status and timer if space allows, otherwise below
  let objectiveX = Math.round(width / 2 - objectiveW / 2);
  let objectiveY = margin;
  if (width < statusW + timerW + objectiveW + margin * 4) {
    objectiveY = Math.max(status.bottom, timer.bottom) + gap;
  }
  const objective = new Phaser.Geom.Rectangle(objectiveX, objectiveY, objectiveW, objectiveH);
  
  const skills = new Phaser.Geom.Rectangle(Math.round(width / 2 - skillsW / 2), height - skillsH - margin, skillsW, skillsH);
  
  const commandAnchorY = isTouchDevice ? height - margin - 92 : height - margin - 48; // [待人工调优]
  const commandX = isTouchDevice
    ? Math.round(width / 2 - commandW / 2)
    : width - margin - commandW; // [待人工调优] Pin to right on desktop to avoid centered skills
  const command = new Phaser.Geom.Rectangle(commandX, Math.round(commandAnchorY - commandH), commandW, commandH);

  const slotW = Math.round(skills.width * 0.112); // [待人工调优]
  const slotH = Math.round(skills.height * 0.56); // [待人工调优]

  return {
    status,
    hpBar: new Phaser.Geom.Rectangle(status.x + status.width * 0.31, status.y + status.height * 0.5, status.width * 0.54, Math.max(12, status.height * 0.12)),
    objective,
    timer,
    command,
    skills,
    commandAnchorY,
    skillSlots: [
      { x: skills.x + skills.width * 0.26, y: skills.y + skills.height * SKILL_SLOT_CENTER_Y_RATIO, width: slotW, height: slotH },
      { x: skills.x + skills.width * 0.43, y: skills.y + skills.height * SKILL_SLOT_CENTER_Y_RATIO, width: slotW, height: slotH },
      { x: skills.x + skills.width * 0.60, y: skills.y + skills.height * SKILL_SLOT_CENTER_Y_RATIO, width: slotW, height: slotH },
      { x: skills.x + skills.width * 0.77, y: skills.y + skills.height * SKILL_SLOT_CENTER_Y_RATIO, width: slotW, height: slotH }
    ]
  };
}

function addHudImage(scene: Phaser.Scene, key: string, rect: Phaser.Geom.Rectangle, alpha: number): Phaser.GameObjects.Image {
  return scene.add.image(rect.x, rect.y, key)
    .setOrigin(0)
    .setDisplaySize(rect.width, rect.height)
    .setAlpha(alpha);
}

function buildSkillSlotLabel(skillId: ReturnType<typeof resolveSkillBySlot>): string {
  return skillId ? getHudSkillSlotLabel(skillId) : "--";
}

function resolveObjectiveLabel(extractState: ExtractUiState, state: MatchViewState): string {
  const members = extractState.squadStatus?.members ?? [];
  const aliveMembers = members.filter((member) => member.isAlive && !member.isSettled);
  const insideCount = aliveMembers.filter((member) => member.isInsideZone).length;
  const waitingCount = Math.max(0, aliveMembers.length - insideCount);
  const cargoValue = resolveInventoryCargoValue(state);
  const cargoLabel = formatCompactValue(cargoValue);
  const pressurePhase = resolveExtractionPressurePhase(resolveMatchElapsedSeconds(state));

  if (extractState.isExtracting) {
    const seconds = extractState.secondsRemaining == null ? "" : ` ${Math.ceil(extractState.secondsRemaining)}s`;
    if (extractState.pressure) {
      return `\u5f52\u8425\u706b\u58f0\u5df2\u66b4\u9732${seconds}\n\u5b88\u5708\uff1a\u654c\u4eba\u4f1a\u5411\u8fd9\u91cc\u6536\u7f29`;
    }
    return waitingCount > 0
      ? `撤离读条${seconds}\n等 ${waitingCount} 名队友进圈`
      : `撤离读条${seconds}\n守住圈内别掉点`;
  }

  if (extractState.didSucceed) {
    return "已脱离封锁区\n等待清点收益";
  }

  if (extractState.isOpen && waitingCount > 0) {
    return `队伍归营火已点燃\n圈内 ${insideCount}/${aliveMembers.length} 人，等待队友`;
  }

  if (cargoValue > 0 && pressurePhase.kind === "intensified") {
    return `估值 ${cargoLabel} 正在报废\n尸雾加剧，立刻进圈`;
  }

  if (cargoValue > 0 && pressurePhase.kind === "counterattack") {
    return extractState.isOpen
      ? `估值 ${cargoLabel} 正在折损\n别再贪箱，直接进圈`
      : `估值 ${cargoLabel} 已入包\n尸毒已起，提前回撤`;
  }

  if (cargoValue > 0) {
    return extractState.isOpen
      ? `估值 ${cargoLabel} 可带出\n向归营火撤离`
      : `估值 ${cargoLabel} 已入包\n等火点燃就别恋战`;
  }

  if (pressurePhase.kind === "intensified") {
    return "尸雾加剧\n视野与生命都在流失";
  }

  if (pressurePhase.kind === "counterattack") {
    return "尸毒反噬已起\n生命会持续流失";
  }

  if (state.secondsRemaining !== null && state.secondsRemaining <= 60) {
    return "封锁将尽\n立刻转向归营火";
  }

  if (extractState.isOpen) {
    return hasBackpackCargo(state) ? "队伍归营火已点燃\n带货者进圈即走" : "队伍归营火已点燃\n进圈完成会合撤离";
  }

  if (pressurePhase.kind === "preopen" && pressurePhase.secondsUntilExtractOpen <= 90) {
    return "归营火即将点燃\n清路线，别再深压";
  }

  return hasBackpackCargo(state) ? "已有收益入包\n别为贪点硬换血" : "先清外围资源\n再压向中圈高价值点";
}

function resolveExtractStateLabel(extractState: ExtractUiState): string {
  const members = extractState.squadStatus?.members ?? [];
  const aliveMembers = members.filter((member) => member.isAlive && !member.isSettled);
  const insideCount = aliveMembers.filter((member) => member.isInsideZone).length;
  if (extractState.isExtracting) return `队撤 ${insideCount}/${aliveMembers.length || 0} 读条中`;
  if (extractState.didSucceed) return "队撤 已完成";
  return extractState.isOpen ? `队撤 ${insideCount}/${aliveMembers.length || 0} 可撤离` : "归营火 待点燃";
}

function resolveInventoryLabel(state: MatchViewState): string {
  const inventory = state.inventory;
  if (!inventory) return "背包 --/--";

  const total = Math.max(0, inventory.width * inventory.height);
  const used = inventory.items.reduce((sum, item) => {
    return sum + Math.max(1, item.width ?? 1) * Math.max(1, item.height ?? 1);
  }, 0);

  const cargoValue = resolveInventoryCargoValue(state);
  if (cargoValue > 0) {
    return `载荷 ${used}/${total} · 估值 ${formatCompactValue(cargoValue)}`;
  }

  return hasBackpackCargo(state) ? `载荷 ${used}/${total}` : `背包 ${used}/${total}`;
}

function resolveInventoryCargoValue(state: MatchViewState): number {
  return (state.inventory?.items ?? []).reduce((sum, item) => {
    return sum + Math.max(0, item.goldValue ?? 0) + Math.max(0, item.treasureValue ?? 0);
  }, 0);
}

function formatCompactValue(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}k`;
  }

  return Math.round(value).toString();
}

function resolvePressureHint(state: MatchViewState, extractState: ExtractUiState): string {
  const members = extractState.squadStatus?.members ?? [];
  const aliveMembers = members.filter((member) => member.isAlive && !member.isSettled);
  const insideCount = aliveMembers.filter((member) => member.isInsideZone).length;
  const waitingCount = Math.max(0, aliveMembers.length - insideCount);
  const pressurePhase = resolveExtractionPressurePhase(resolveMatchElapsedSeconds(state));

  const player = state.players.find((entry) => entry.id === state.selfPlayerId);
  const hpRatio = player && player.maxHp > 0 ? player.hp / player.maxHp : 1;

  if (hpRatio <= 0.28) {
    return extractState.isOpen
      ? "低血高风险，优先脱战\n进入撤离圈。"
      : "低血状态，先拉开怪群\n稳住交战线。";
  }

  if (pressurePhase.kind === "intensified") {
    return extractState.isOpen
      ? "加剧期 5hp/s，别再换血\n进圈完成读条。"
      : "尸雾已加剧\n放弃外圈资源。";
  }

  if (pressurePhase.kind === "counterattack") {
    return extractState.isOpen
      ? "尸毒已开始扣血\n继续贪收益会折损战利品。"
      : "尸毒正在逼近\n提前规划回撤路线。";
  }

  if (pressurePhase.kind === "preopen" && pressurePhase.secondsUntilExtractOpen <= 90) {
    return `距归营火 ${formatSeconds(pressurePhase.secondsUntilExtractOpen)}\n带货就向中圈收缩。`;
  }

  if (hasBackpackCargo(state)) {
    return "高价值携带会吸引围堵\n别带着满包硬换血。";
  }

  if (extractState.isOpen && waitingCount > 0) {
    return `仍有 ${waitingCount} 名队友未进圈\n别让敌队拖住会合。`;
  }

  return "压怪拿货，短换即退\n给撤离留体力。";
}

function hasBackpackCargo(state: MatchViewState): boolean {
  return (state.inventory?.items.length ?? 0) > 0;
}

function isCorpseFogCounterattacking(state: MatchViewState): boolean {
  return resolveExtractionPressurePhase(resolveMatchElapsedSeconds(state)).kind !== "preopen";
}

function getElapsedSeconds(startedAt: number): number {
  return startedAt > 0 ? Math.max(0, (Date.now() - startedAt) / 1000) : 0;
}

function resolveMatchElapsedSeconds(state: MatchViewState): number {
  if (state.secondsRemaining !== null) {
    return Math.max(0, MATCH_DURATION_SEC - state.secondsRemaining);
  }

  return getElapsedSeconds(state.startedAt);
}

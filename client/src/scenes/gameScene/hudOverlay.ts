import Phaser from "phaser";
import type { MatchViewState } from "../../game";
import type { ExtractUiState } from "../createGameClient";
import { GAMEPLAY_THEME } from "../../ui/gameplayTheme";
import {
  formatSeconds,
  formatTenths,
  getPrimarySkillLabel,
  getWeaponLabel,
  resolvePrimarySkill,
  resolveSkillBySlot
} from "./skillHelpers";

const HUD_ASSETS = {
  status: "hud_panel_status",
  objective: "hud_panel_objective",
  timer: "hud_panel_timer",
  command: "hud_panel_command",
  skills: "hud_panel_skills"
} as const;

type HudLayout = {
  status: Phaser.Geom.Rectangle;
  hpBar: Phaser.Geom.Rectangle;
  objective: Phaser.Geom.Rectangle;
  timer: Phaser.Geom.Rectangle;
  command: Phaser.Geom.Rectangle;
  skills: Phaser.Geom.Rectangle;
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
  private hpLabel?: Phaser.GameObjects.Text;
  private weaponText?: Phaser.GameObjects.Text;
  private skillStateText?: Phaser.GameObjects.Text;
  private objectiveText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private roomCodeText?: Phaser.GameObjects.Text;
  private extractText?: Phaser.GameObjects.Text;
  private killsText?: Phaser.GameObjects.Text;
  private inventoryText?: Phaser.GameObjects.Text;
  private combatText?: Phaser.GameObjects.Text;
  private skillTexts: Phaser.GameObjects.Text[] = [];
  private skillCooldownGraphics: Phaser.GameObjects.Graphics[] = [];
  private extractProgressTrack?: Phaser.GameObjects.Graphics;
  private extractProgressFill?: Phaser.GameObjects.Graphics;
  private extractProgressLabel?: Phaser.GameObjects.Text;
  private lowHpOverlay?: Phaser.GameObjects.Rectangle;
  private pickupToast?: Phaser.GameObjects.Container;
  private pickupToastTween?: Phaser.Tweens.Tween;

  private lastSelfHpRatio = -1;
  private lastHudHpColor = -1;
  private lastHudHpLabel = "";
  private lastWeaponLabel = "";
  private lastSkillStateLabel = "";
  private lastObjectiveLabel = "";
  private lastTimerLabel = "";
  private lastRoomCodeLabel = "";
  private lastExtractLabel = "";
  private lastKillsLabel = "";
  private lastInventoryLabel = "";
  private lastCombatLabel = "";
  private lastSkillLabels = ["", "", "", ""];
  private lastExtractProgressValue = -1;
  private lastExtractProgressLabel = "";
  private lastExtractProgressActive: boolean | null = null;

  constructor(scene: Phaser.Scene, isTouchDevice: boolean) {
    this.scene = scene;
    this.isTouchDevice = isTouchDevice;
  }

  mount(): void {
    const { width, height } = this.scene.scale;
    this.layout = buildHudLayout(width, height, this.isTouchDevice);
    this.container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(10000);

    const statusPanel = addHudImage(this.scene, HUD_ASSETS.status, this.layout.status, 0.98);
    const objectivePanel = addHudImage(this.scene, HUD_ASSETS.objective, this.layout.objective, 0.96);
    const timerPanel = addHudImage(this.scene, HUD_ASSETS.timer, this.layout.timer, 0.96);
    const commandPanel = addHudImage(this.scene, HUD_ASSETS.command, this.layout.command, 0.96);
    const skillPanel = addHudImage(this.scene, HUD_ASSETS.skills, this.layout.skills, 0.98);

    const status = this.layout.status;
    this.hpLabel = this.scene.add.text(status.x + status.width * 0.29, status.y + status.height * 0.26, "生命 -- / --", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: this.isTouchDevice ? "17px" : "20px",
      color: "#2a1d13",
      stroke: "#efe3c5",
      strokeThickness: 2
    });
    this.weaponText = this.scene.add.text(status.x + status.width * 0.29, status.y + status.height * 0.61, "武器 --", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "12px" : "13px",
      color: "#4e2c18"
    });
    this.skillStateText = this.scene.add.text(status.x + status.width * 0.66, status.y + status.height * 0.61, "技能 待命", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "12px" : "13px",
      color: "#284854"
    });
    this.hpFill = this.scene.add.graphics();

    const objective = this.layout.objective;
    this.objectiveText = this.scene.add.text(objective.centerX, objective.y + objective.height * 0.52, "搜刮战利品，等待归营石阵点燃", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "15px" : "17px",
      color: "#2a1d13",
      align: "center",
      wordWrap: { width: Math.max(180, objective.width - 92), useAdvancedWrap: true }
    }).setOrigin(0.5);

    const timer = this.layout.timer;
    this.timerText = this.scene.add.text(timer.x + timer.width * 0.62, timer.y + timer.height * 0.27, "00:00", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: this.isTouchDevice ? "25px" : "30px",
      color: "#4d3517",
      stroke: "#f3e6c6",
      strokeThickness: 2
    }).setOrigin(0.5, 0);
    this.roomCodeText = this.scene.add.text(timer.x + timer.width * 0.26, timer.y + timer.height * 0.36, "战令 ------", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "11px" : "12px",
      color: "#342416"
    });
    this.extractText = this.scene.add.text(timer.x + timer.width * 0.26, timer.y + timer.height * 0.56, "撤离 未点燃", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "11px" : "12px",
      color: "#284854"
    });
    this.killsText = this.scene.add.text(timer.x + timer.width * 0.26, timer.y + timer.height * 0.74, "压制 0/0", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "11px" : "12px",
      color: "#5a2519"
    });
    this.inventoryText = this.scene.add.text(timer.x + timer.width * 0.63, timer.y + timer.height * 0.74, "背包 --/--", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "11px" : "12px",
      color: "#342416"
    });

    const command = this.layout.command;
    this.combatText = this.scene.add.text(command.centerX, command.centerY + 2, "", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: this.isTouchDevice ? "15px" : "17px",
      color: "#2a1d13",
      align: "center",
      wordWrap: { width: Math.max(240, command.width - 130), useAdvancedWrap: true }
    }).setOrigin(0.5);

    this.skillTexts = this.layout.skillSlots.map((slot, index) => this.scene.add.text(slot.x, slot.y, index === 3 ? "Shift\n翻滚" : "--", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: this.isTouchDevice ? "12px" : "13px",
      color: "#251a12",
      align: "center",
      lineSpacing: 2,
      wordWrap: { width: 78, useAdvancedWrap: true }
    }).setOrigin(0.5));

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
      this.hpLabel,
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
      ...this.skillTexts,
      this.extractProgressTrack,
      this.extractProgressFill,
      this.extractProgressLabel
    ]);
  }

  sync(context: HudSyncContext): void {
    const { state, extractState, skillCooldownEndsAt, skillWindupEndsAt, skillCooldowns } = context;
    const player = state.players.find((candidate) => candidate.id === state.selfPlayerId);

    if (this.hpFill && this.hpLabel && player && this.layout) {
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

      const hpLabel = `生命 ${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`;
      if (this.lastHudHpLabel !== hpLabel) {
        this.hpLabel.setText(hpLabel);
        this.lastHudHpLabel = hpLabel;
      }
      this.syncLowHpOverlay(hpRatio);
    } else {
      this.syncLowHpOverlay(1);
    }

    if (this.weaponText && player) {
      const weaponLabel = `武器 ${getWeaponLabel(player.weaponType)}`;
      if (this.lastWeaponLabel !== weaponLabel) {
        this.weaponText.setText(weaponLabel);
        this.lastWeaponLabel = weaponLabel;
      }
    }

    if (this.skillStateText) {
      const skillId = resolvePrimarySkill(state);
      const now = Date.now();
      let skillStateLabel = "技能 未配置";
      if (skillId) {
        if (now < skillWindupEndsAt) skillStateLabel = `${getPrimarySkillLabel(skillId)} 蓄力 ${formatTenths((skillWindupEndsAt - now) / 1000)}s`;
        else if (now < skillCooldownEndsAt) skillStateLabel = `${getPrimarySkillLabel(skillId)} 冷却 ${formatTenths((skillCooldownEndsAt - now) / 1000)}s`;
        else skillStateLabel = `${getPrimarySkillLabel(skillId)} 可用`;
      }
      if (this.lastSkillStateLabel !== skillStateLabel) {
        this.skillStateText.setText(skillStateLabel);
        this.lastSkillStateLabel = skillStateLabel;
      }
    }

    if (this.objectiveText) {
      const objectiveLabel = resolveObjectiveLabel(extractState, state.secondsRemaining);
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
      const roomCodeLabel = `战令 ${state.code || "------"}`;
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
      const killsLabel = `压制 ${deadMonsters}/${state.monsters.length}`;
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
      const combatLabel = extractState.message || "穿过腐土荒岗，搜刮战利品，活着回营。";
      if (this.lastCombatLabel !== combatLabel) {
        this.combatText.setText(combatLabel);
        this.lastCombatLabel = combatLabel;
      }
    }

    this.syncSkillSlots(state, skillCooldowns);
    this.syncExtractProgress(extractState);
  }

  pinToCamera(): void {
    this.container?.setPosition(0, 0).setScale(1).setDepth(10000);
  }

  showPickupFeedback(itemName: string): void {
    const { width, height } = this.scene.scale;
    this.pickupToastTween?.stop();
    this.pickupToast?.destroy();

    const w = Math.min(520, width - 48);
    const panel = this.scene.add.image(0, 0, HUD_ASSETS.command)
      .setOrigin(0.5)
      .setDisplaySize(w, 82)
      .setAlpha(0.98);
    const text = this.scene.add.text(0, 0, `回收 ${itemName}`, {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: "18px",
      color: "#2a1d13",
      align: "center",
      wordWrap: { width: w - 110, useAdvancedWrap: true }
    }).setOrigin(0.5);

    this.pickupToast = this.scene.add.container(width / 2, height - 160, [panel, text])
      .setScrollFactor(0)
      .setDepth(10020)
      .setAlpha(0);

    this.pickupToastTween = this.scene.tweens.add({
      targets: this.pickupToast,
      y: height - 182,
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
    this.lowHpOverlay?.destroy();
    this.lowHpOverlay = undefined;
    this.container?.destroy(true);
    this.container = undefined;
  }

  private syncSkillSlots(state: MatchViewState, cooldowns: Array<{ endsAt: number; durationMs: number }>): void {
    const labels = [
      buildSkillSlotLabel("Q", resolveSkillBySlot(state, 0)),
      buildSkillSlotLabel("R", resolveSkillBySlot(state, 1)),
      buildSkillSlotLabel("T", resolveSkillBySlot(state, 2)),
      "Shift\n翻滚"
    ];

    labels.forEach((label, index) => {
      const text = this.skillTexts[index];
      if (!text || this.lastSkillLabels[index] === label) return;
      text.setText(label);
      this.lastSkillLabels[index] = label;
    });

    this.syncSkillCooldowns(cooldowns);
  }

  private syncSkillCooldowns(cooldowns: Array<{ endsAt: number; durationMs: number }>): void {
    if (!this.layout) return;
    const now = Date.now();
    this.layout.skillSlots.forEach((slot, index) => {
      const graphic = this.skillCooldownGraphics[index];
      const text = this.skillTexts[index];
      if (!graphic || !text) return;

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
        text.setFontSize(this.isTouchDevice ? 17 : 19);
        text.setFontStyle("bold");
        text.setColor("#f7ead0");
        text.setStroke("#130e0a", 4);
        text.setVisible(true).setAlpha(1);
        text.setText(Math.ceil(remainingMs / 1000).toString());
      } else {
        text.setFontSize(this.isTouchDevice ? 12 : 13);
        text.setFontStyle("");
        text.setColor("#251a12");
        text.setStroke("#130e0a", 0);
        text.setVisible(true).setAlpha(1);
        text.setText(this.lastSkillLabels[index] ?? "");
      }
    });
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
    if (!active) return;

    const progress = Phaser.Math.Clamp(extractState.progress ?? 0, 0, 1);
    const barWidth = Math.min(520, this.scene.scale.width - 80);
    const x = this.scene.scale.width / 2 - barWidth / 2;
    const y = Math.max(116, this.layout.objective.bottom + 18);

    if (Math.abs(this.lastExtractProgressValue - progress) > 0.005) {
      this.extractProgressTrack.clear();
      this.extractProgressTrack.fillStyle(0x130e0a, 0.9);
      this.extractProgressTrack.fillRoundedRect(x, y, barWidth, 24, 8);
      this.extractProgressTrack.lineStyle(2, 0xd4b24c, 0.82);
      this.extractProgressTrack.strokeRoundedRect(x, y, barWidth, 24, 8);
      this.extractProgressFill.clear();
      this.extractProgressFill.fillStyle(0xd4b24c, 1);
      this.extractProgressFill.fillRoundedRect(x + 8, y + 8, (barWidth - 16) * progress, 8, 4);
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

function buildHudLayout(width: number, height: number, isTouchDevice: boolean): HudLayout {
  const margin = isTouchDevice ? 12 : 24;
  const statusW = isTouchDevice ? Math.min(width - margin * 2, 430) : Math.min(540, Math.max(430, width * 0.28));
  const statusH = Math.round(statusW / 4.05);
  const timerW = isTouchDevice ? Math.min(width - margin * 2, 350) : 370;
  const timerH = Math.round(timerW / 2.67);
  const objectiveW = isTouchDevice ? Math.min(width - margin * 2, 420) : Math.min(470, Math.max(360, width - statusW - timerW - margin * 6));
  const objectiveH = Math.round(objectiveW / 2.65);
  const skillsW = isTouchDevice ? Math.min(width - margin * 2, 440) : 520;
  const skillsH = Math.round(skillsW / 5.21);
  const commandW = isTouchDevice ? Math.min(width - margin * 2, 560) : Math.min(700, width - 160);
  const commandH = Math.round(commandW / 6.28);

  const status = new Phaser.Geom.Rectangle(margin, margin, statusW, statusH);
  const timer = new Phaser.Geom.Rectangle(width - timerW - margin, margin, timerW, timerH);
  const objectiveY = width < 1180 ? status.bottom + 8 : margin;
  const objective = new Phaser.Geom.Rectangle(Math.round(width / 2 - objectiveW / 2), objectiveY, objectiveW, objectiveH);
  const command = new Phaser.Geom.Rectangle(Math.round(width / 2 - commandW / 2), height - commandH - margin, commandW, commandH);
  const skills = new Phaser.Geom.Rectangle(margin, Math.max(status.bottom + 16, height - skillsH - margin), skillsW, skillsH);

  const slotW = Math.round(skills.width * 0.096);
  const slotH = Math.round(skills.height * 0.56);

  return {
    status,
    hpBar: new Phaser.Geom.Rectangle(status.x + status.width * 0.31, status.y + status.height * 0.5, status.width * 0.54, Math.max(12, status.height * 0.12)),
    objective,
    timer,
    command,
    skills,
    skillSlots: [
      { x: skills.x + skills.width * 0.26, y: skills.y + skills.height * 0.54, width: slotW, height: slotH },
      { x: skills.x + skills.width * 0.43, y: skills.y + skills.height * 0.54, width: slotW, height: slotH },
      { x: skills.x + skills.width * 0.60, y: skills.y + skills.height * 0.54, width: slotW, height: slotH },
      { x: skills.x + skills.width * 0.77, y: skills.y + skills.height * 0.54, width: slotW, height: slotH }
    ]
  };
}

function addHudImage(scene: Phaser.Scene, key: string, rect: Phaser.Geom.Rectangle, alpha: number): Phaser.GameObjects.Image {
  return scene.add.image(rect.x, rect.y, key)
    .setOrigin(0)
    .setDisplaySize(rect.width, rect.height)
    .setAlpha(alpha);
}

function buildSkillSlotLabel(key: string, skillId: ReturnType<typeof resolveSkillBySlot>): string {
  return skillId ? `${key}\n${getPrimarySkillLabel(skillId)}` : `${key}\n--`;
}

function resolveObjectiveLabel(extractState: ExtractUiState, secondsRemaining: number | null): string {
  if (extractState.isExtracting) {
    const seconds = extractState.secondsRemaining == null ? "" : ` ${Math.ceil(extractState.secondsRemaining)}s`;
    return `守住归营石阵，读条中${seconds}`;
  }

  if (extractState.didSucceed) {
    return "已踏上归营路，等待清点";
  }

  if (extractState.isOpen) {
    return "归营石阵已点燃，带着战利品撤出";
  }

  if (secondsRemaining !== null && secondsRemaining <= 60) {
    return "暮鼓将尽，立刻奔向归营石阵";
  }

  return "搜刮遗物，避开围杀，等待归营火起";
}

function resolveExtractStateLabel(extractState: ExtractUiState): string {
  if (extractState.isExtracting) return "撤离 读条中";
  if (extractState.didSucceed) return "撤离 成功";
  return extractState.isOpen ? "撤离 已点燃" : "撤离 未点燃";
}

function resolveInventoryLabel(state: MatchViewState): string {
  const inventory = state.inventory;
  if (!inventory) return "背包 --/--";

  const total = Math.max(0, inventory.width * inventory.height);
  const used = inventory.items.reduce((sum, item) => {
    return sum + Math.max(1, item.width ?? 1) * Math.max(1, item.height ?? 1);
  }, 0);

  return `背包 ${used}/${total}`;
}

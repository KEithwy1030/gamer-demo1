import type { CombatEventPayload, SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import { DropMarker } from "../game/entities/DropMarker";
import { MonsterMarker } from "../game/entities/MonsterMarker";
import { PlayerMarker } from "../game/entities/PlayerMarker";
import { MatchRuntimeStore, type MatchViewState } from "../game";
import type { ChestOpenedPayload, ChestState } from "../network/socketClient";
import type { ExtractUiState } from "./createGameClient";
import {
  createWorldBackdropRefs,
  rebuildWorldBackdrop,
  syncExtractBackdrop,
  type WorldBackdropRefs
} from "./gameScene/worldBackdrop";
import { GameHudOverlay } from "./gameScene/hudOverlay";
import { GameSceneInputBridge, shouldUseTouchLayout } from "./gameScene/inputBridge";
import { GameSceneInteractions } from "./gameScene/interactions";
import { GameSceneFeedbackFx } from "./gameScene/feedbackFx";
import {
  getPrimarySkillCooldownMs,
  getPrimarySkillWindupMs,
  resolveSkillSlots
} from "./gameScene/skillHelpers";

export interface GameSceneInitData {
  runtime: MatchRuntimeStore;
  extractState?: ExtractUiState;
  onMoveInput?: (direction: Vector2) => void;
  onAttack?: () => void;
  onSkill?: (skillId: SkillId) => void;
  onPickup?: () => void;
  onStartExtract?: () => void;
  onCombatResult?: (payload: CombatEventPayload) => void;
  onPlayerAttack?: (payload: { playerId: string; attackId: string }) => void;
  onOpenChest?: (chestId: string) => void;
  onToggleInventory?: () => void;
  subscribeChestsInit?: (callback: (chests: ChestState[]) => void) => () => void;
  subscribeChestOpened?: (callback: (payload: ChestOpenedPayload) => void) => () => void;
}

export class GameScene extends Phaser.Scene {
  static readonly KEY = "GameScene";

  private runtime!: MatchRuntimeStore;
  private unsubscribeRuntime: (() => void) | null = null;
  private readonly playerMarkers = new Map<string, PlayerMarker>();
  private readonly monsterMarkers = new Map<string, MonsterMarker>();
  private readonly dropMarkers = new Map<string, DropMarker>();
  private worldBackdrop: WorldBackdropRefs = createWorldBackdropRefs();
  private extractPulseTween?: Phaser.Tweens.Tween;
  private hudOverlay?: GameHudOverlay;
  private inputBridge?: GameSceneInputBridge;
  private interactions?: GameSceneInteractions;
  private feedbackFx?: GameSceneFeedbackFx;
  private latestState: MatchViewState | null = null;
  private worldSignature = "";
  private followedPlayerId: string | null = null;
  private extractState: ExtractUiState = {
    isOpen: false,
    isExtracting: false,
    progress: null,
    secondsRemaining: null,
    message: "撤离点将在后期开启。",
    didSucceed: false
  };
  private onMoveInput?: (direction: Vector2) => void;
  private onAttack?: () => void;
  private onSkill?: (skillId: SkillId) => void;
  private onPickup?: () => void;
  private onStartExtract?: () => void;
  public onCombatResult?: (payload: CombatEventPayload) => void;
  public onPlayerAttack?: (payload: { playerId: string; attackId: string }) => void;
  private onOpenChest?: (chestId: string) => void;
  private onToggleInventory?: () => void;
  private subscribeChestsInit?: (callback: (chests: ChestState[]) => void) => () => void;
  private subscribeChestOpened?: (callback: (payload: ChestOpenedPayload) => void) => () => void;
  private localSkillCooldownEndsAtBySlot = [0, 0, 0];
  private localSkillWindupEndsAtBySlot = [0, 0, 0];
  private pendingSkillCast?: Phaser.Time.TimerEvent;

  constructor() {
    super(GameScene.KEY);
  }

  preload(): void {
    this.load.image("terrain_wasteland", "assets/wasteland-ground.png");
    this.load.image("hud_status_panel", "assets/hud/runtime-hp.png");
    this.load.image("hud_timer_panel", "assets/hud/asset-timer.png");
    this.load.image("hud_command_panel", "assets/hud/asset-command.png");

    // Spitesheets and textures generation...
    const pCanvas = document.createElement("canvas");
    pCanvas.width = 192; pCanvas.height = 192;
    const pCtx = pCanvas.getContext("2d")!;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 48 + 24; const y = row * 48 + 24;
        let leftLegY = 12; let rightLegY = 12;
        if (col === 1) leftLegY += 3;
        if (col === 3) rightLegY += 3;
        pCtx.fillStyle = "#16130f"; pCtx.fillRect(x - 6, y + leftLegY, 4, 8); pCtx.fillRect(x + 2, y + rightLegY, 4, 8);
        pCtx.fillStyle = "#2b2519"; pCtx.fillRect(x - 6, y - 4, 12, 16);
        pCtx.fillStyle = "#e8dfc8"; pCtx.fillRect(x - 5, y - 14, 10, 10);
        pCtx.fillStyle = "#e8602c";
        if (row === 0) { pCtx.fillRect(x - 3, y - 10, 2, 2); pCtx.fillRect(x + 1, y - 10, 2, 2); }
        else if (row === 1) { pCtx.fillRect(x - 5, y - 10, 2, 2); }
        else if (row === 2) { pCtx.fillRect(x + 3, y - 10, 2, 2); }
      }
    }
    this.textures.addSpriteSheet("player", pCanvas as any, { frameWidth: 48, frameHeight: 48 });

    const mCanvas = document.createElement("canvas");
    mCanvas.width = 128; mCanvas.height = 32;
    const mCtx = mCanvas.getContext("2d")!;
    for (let f = 0; f < 4; f++) {
      const x = f * 32 + 16; const y = 16;
      mCtx.fillStyle = "#6f2a1b"; mCtx.beginPath(); mCtx.arc(x, y, 10, 0, Math.PI * 2); mCtx.fill();
      mCtx.fillStyle = "#16130f"; mCtx.fillRect(x - 4, y - 2, 2, 2); mCtx.fillRect(x + 2, y - 2, 2, 2);
    }
    this.textures.addSpriteSheet("monster", mCanvas as any, { frameWidth: 32, frameHeight: 32 });

    const eCanvas = document.createElement("canvas");
    eCanvas.width = 64; eCanvas.height = 64;
    const eCtx = eCanvas.getContext("2d")!;
    eCtx.fillStyle = "#b8371f"; eCtx.beginPath(); eCtx.moveTo(32, 8); eCtx.lineTo(56, 32); eCtx.lineTo(32, 56); eCtx.lineTo(8, 32); eCtx.closePath(); eCtx.fill();
    eCtx.strokeStyle = "#e8602c"; eCtx.lineWidth = 4; eCtx.stroke();
    this.textures.addCanvas("elite", eCanvas);

    const dCanvas = document.createElement("canvas");
    dCanvas.width = 16; dCanvas.height = 16;
    const dCtx = dCanvas.getContext("2d")!;
    dCtx.fillStyle = "#e8602c"; dCtx.fillRect(2, 2, 12, 12);
    dCtx.strokeStyle = "#e8dfc8"; dCtx.lineWidth = 1; dCtx.strokeRect(2.5, 2.5, 11, 11);
    this.textures.addCanvas("drop", dCanvas);

    const bCanvas = document.createElement("canvas");
    bCanvas.width = 64; bCanvas.height = 64;
    const bCtx = bCanvas.getContext("2d")!;
    bCtx.fillStyle = "#e8602c"; bCtx.fillRect(16, 16, 32, 32);
    bCtx.fillStyle = "#e8dfc8"; bCtx.fillRect(28, 6, 8, 52);
    this.textures.addCanvas("beacon", bCanvas);

    const ccCanvas = document.createElement("canvas");
    ccCanvas.width = 32; ccCanvas.height = 32;
    const ccCtx = ccCanvas.getContext("2d")!;
    ccCtx.fillStyle = "#8B4513"; ccCtx.fillRect(2, 8, 28, 22);
    this.textures.addCanvas("chest_closed", ccCanvas);

    const coCanvas = document.createElement("canvas");
    coCanvas.width = 32; coCanvas.height = 32;
    const coCtx = coCanvas.getContext("2d")!;
    coCtx.fillStyle = "#8B4513"; coCtx.fillRect(2, 12, 28, 18);
    this.textures.addCanvas("chest_open", coCanvas);
  }

  init(data: GameSceneInitData): void {
    this.runtime = data.runtime;
    this.extractState = data.extractState ?? this.extractState;
    this.onMoveInput = data.onMoveInput;
    this.onAttack = data.onAttack;
    this.onSkill = data.onSkill;
    this.onPickup = data.onPickup;
    this.onStartExtract = data.onStartExtract;
    this.onOpenChest = data.onOpenChest;
    this.onToggleInventory = data.onToggleInventory;
    this.subscribeChestsInit = data.subscribeChestsInit;
    this.subscribeChestOpened = data.subscribeChestOpened;
    this.onCombatResult = (payload) => this.handleCombatResult(payload);
    this.onPlayerAttack = (payload) => this.handleServerPlayerAttack(payload);

    // The in-game HUD carries objectives now; keep the first combat view unobstructed.
  }

  private handleServerPlayerAttack(payload: { playerId: string; attackId: string }): void {
    this.feedbackFx?.handleServerPlayerAttack(
      payload,
      this.latestState,
      this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 },
      this.playerMarkers
    );
  }

  private handleCombatResult(payload: CombatEventPayload): void {
    this.feedbackFx?.handleCombatResult(payload, this.latestState, this.playerMarkers, this.monsterMarkers);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0e0b08");
    const touchLayout = shouldUseTouchLayout();
    this.cameras.main.setZoom(touchLayout ? 0.68 : 0.52);
    this.anims.create({ key: "player-walk-down", frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "player-walk-left", frames: this.anims.generateFrameNumbers("player", { start: 4, end: 7 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "player-walk-right", frames: this.anims.generateFrameNumbers("player", { start: 8, end: 11 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "player-walk-up", frames: this.anims.generateFrameNumbers("player", { start: 12, end: 15 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "monster-sway", frames: this.anims.generateFrameNumbers("monster", { start: 0, end: 3 }), frameRate: 8, repeat: -1 });

    this.hudOverlay = new GameHudOverlay(this, touchLayout);
    this.hudOverlay.mount();
    this.feedbackFx = new GameSceneFeedbackFx(this);
    this.interactions = new GameSceneInteractions(this);
    this.interactions.mount(this.subscribeChestsInit, this.subscribeChestOpened);
    this.inputBridge = new GameSceneInputBridge(this, {
      touchLayout,
      onMoveInput: this.onMoveInput,
      onAttack: () => this.handleAttack(),
      onSkill: (slotIndex) => this.handleSkill(slotIndex),
      onPickup: () => this.handleInteract(),
      onExtract: () => this.onStartExtract?.(),
      onInventory: () => this.handleToggleInventory()
    });
    this.inputBridge.mount();

    this.unsubscribeRuntime = this.runtime.subscribe((state) => {
      this.latestState = state;
      this.syncWorld(state);
      this.syncPlayers(state);
      this.syncMonsters(state);
      this.syncDrops(state);
      this.hudOverlay?.sync({
        state,
        extractState: this.extractState,
        skillCooldownEndsAtBySlot: this.localSkillCooldownEndsAtBySlot,
        skillWindupEndsAtBySlot: this.localSkillWindupEndsAtBySlot
      });
    });
  }

  private handleAttack(): void {
    this.feedbackFx?.playLocalAttack(
      this.latestState,
      this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 }
    );
    this.onAttack?.();
  }

  private handleSkill(slotIndex = 0): void {
    const sid = resolveSkillSlots(this.latestState)[slotIndex];
    if (!sid) return;

    const now = Date.now();
    if (now < this.localSkillWindupEndsAtBySlot[slotIndex] || now < this.localSkillCooldownEndsAtBySlot[slotIndex]) return;

    const windupMs = getPrimarySkillWindupMs(sid);
    this.localSkillWindupEndsAtBySlot[slotIndex] = now + windupMs;
    this.localSkillCooldownEndsAtBySlot[slotIndex] = now + windupMs + getPrimarySkillCooldownMs(sid);
    this.pendingSkillCast?.remove(false);
    this.feedbackFx?.playLocalSkill(
      sid,
      windupMs > 0 ? "windup" : "cast",
      this.latestState,
      this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 }
    );

    if (windupMs > 0) {
      this.pendingSkillCast = this.time.delayedCall(windupMs, () => {
        this.feedbackFx?.playLocalSkill(
          sid,
          "cast",
          this.latestState,
          this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 }
        );
        this.onSkill?.(sid);
        this.pendingSkillCast = undefined;
      });
      return;
    }

    this.onSkill?.(sid);
  }

  private handleInteract(): void {
    this.interactions?.handleInteract(this.onOpenChest, this.onPickup);
  }

  private handleToggleInventory(): void {
    this.onToggleInventory?.();
  }

  update(time: number, delta: number): void {
    const alpha = Phaser.Math.Clamp(delta / 120, 0.08, 0.22);
    for (const m of this.playerMarkers.values()) { m.step(alpha); }
    for (const m of this.monsterMarkers.values()) { m.step(alpha); }
    for (const m of this.dropMarkers.values()) {
      if (Math.abs(m.root.depth - m.root.y) > 0.5) {
        m.root.setDepth(m.root.y);
      }
    }

    this.inputBridge?.update(time);
    this.tickExtractBeacon(time);
    this.hudOverlay?.pinToCamera();

    const sid = this.latestState?.selfPlayerId;
    if (sid) {
      const sm = this.playerMarkers.get(sid);
      if (sm) {
        if (this.followedPlayerId !== sid) {
          this.cameras.main.startFollow(sm.root, true, 0.12, 0.12);
          this.followedPlayerId = sid;
        }
        this.interactions?.updateChestPrompt(sm);
        this.interactions?.updateAutoExtract(sm, this.extractState, this.onStartExtract);
      }
    }
  }

  setExtractState(s: ExtractUiState): void {
    this.extractState = s;
    if (this.latestState) {
      this.hudOverlay?.sync({
        state: this.latestState,
        extractState: this.extractState,
        skillCooldownEndsAtBySlot: this.localSkillCooldownEndsAtBySlot,
        skillWindupEndsAtBySlot: this.localSkillWindupEndsAtBySlot
      });
      this.syncWorld(this.latestState);
    }
  }

  shutdown(): void {
    this.unsubscribeRuntime?.();
    this.interactions?.destroy();
    this.interactions = undefined;
    this.inputBridge?.destroy();
    this.inputBridge = undefined;
    this.hudOverlay?.destroy();
    this.hudOverlay = undefined;
  }

  private syncWorld(state: MatchViewState): void {
    const nextSignature = `${state.width}x${state.height}`;
    if (this.worldSignature !== nextSignature) {
      this.worldBackdrop = rebuildWorldBackdrop(this, this.worldBackdrop, state);
      this.worldSignature = nextSignature;
    }
    this.worldBackdrop = syncExtractBackdrop(this, this.worldBackdrop, state, this.extractState);
  }

  private syncPlayers(state: MatchViewState): void {
    state.players.forEach(p => {
      const m = this.playerMarkers.get(p.id);
      if (m) m.sync(p, p.id === state.selfPlayerId);
      else this.playerMarkers.set(p.id, new PlayerMarker(this, p, p.id === state.selfPlayerId));
    });
  }

  private syncMonsters(state: MatchViewState): void {
    const currentIds = new Set<string>();
    for (const monster of state.monsters) {
      currentIds.add(monster.id);
      const existing = this.monsterMarkers.get(monster.id);
      if (existing) {
        existing.sync(monster);
      } else {
        this.monsterMarkers.set(monster.id, new MonsterMarker(this, monster));
      }
    }

    // Remove monsters that are no longer in the state (corpses that have been cleaned up)
    for (const [id, marker] of this.monsterMarkers.entries()) {
      if (!currentIds.has(id)) {
        marker.destroy();
        this.monsterMarkers.delete(id);
      }
    }
  }

  private syncDrops(state: MatchViewState): void {
    const ids = new Set(state.drops.map(d => d.id));
    state.drops.forEach(d => { if (!this.dropMarkers.has(d.id)) this.dropMarkers.set(d.id, new DropMarker(this, d)); });
    for (const [id, m] of this.dropMarkers.entries()) if (!ids.has(id)) { m.destroy(); this.dropMarkers.delete(id); }
  }

  public showPickupFeedback(itemName: string): void {
    this.hudOverlay?.showPickupFeedback(itemName);
  }

  private showTutorial(): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setScrollFactor(0).setDepth(1000);
    const bg = this.add.graphics().fillStyle(0x0f172a, 0.95).fillRoundedRect(-160, -120, 320, 240, 12);
    const title = this.add.text(0, -100, "任务目标", { fontFamily: "monospace", fontSize: "20px", color: "#f8fafc" }).setOrigin(0.5);
    const hint = navigator.maxTouchPoints > 0 ? "• 移动: 虚拟摇杆\n• 攻击: 攻\n• 技能: 技\n• 交互: 拾" : "• 移动: WASD\n• 攻击: 空格\n• 技能: Q\n• 交互: E";
    const content = this.add.text(0, 0, hint + "\n\n目标: 击杀怪物，收集战利品\n前往中心区域撤离。", { fontFamily: "monospace", fontSize: "16px", color: "#cbd5e1", align: "center" }).setOrigin(0.5);
    const footer = this.add.text(0, 100, "按任意键或点击关闭", { fontFamily: "monospace", fontSize: "12px", color: "#64748b" }).setOrigin(0.5);
    panel.add([bg, title, content, footer]);
    const close = () => { panel.destroy(); this.input.keyboard?.off("keydown"); this.input.off("pointerdown"); };
    this.input.keyboard?.once("keydown", close); this.input.once("pointerdown", close);
  }

  private tickExtractBeacon(time: number): void {
    const glow = this.worldBackdrop.extractBeacon?.list[0] as Phaser.GameObjects.Arc | undefined;
    glow?.setScale(1 + Math.sin(time / 360) * 0.05);
  }
}

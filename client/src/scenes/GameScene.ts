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
  resolveSkillBySlot,
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
  private corpseFogImage?: Phaser.GameObjects.Image;
  private corpseFogTexture?: Phaser.Textures.CanvasTexture;
  private corpseFogSignature = "";
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
  private localSkillCooldownEndsAt = 0;
  private localSkillWindupEndsAt = 0;
  private readonly localSkillCooldowns = [
    { endsAt: 0, durationMs: 0 },
    { endsAt: 0, durationMs: 0 },
    { endsAt: 0, durationMs: 0 },
    { endsAt: 0, durationMs: 0 }
  ];
  private pendingSkillCast?: Phaser.Time.TimerEvent;

  constructor() {
    super(GameScene.KEY);
  }

  preload(): void {
    this.load.image("terrain_wasteland", "assets/generated/medieval-battlefield-ground-cpa-image2-20260501.png");
    this.load.image("extract_beacon_asset", "assets/generated/medieval-extract-marker-cpa-image2-256-20260501.png");
    this.load.spritesheet("unit_player_sword", "assets/generated/image2_processed/characters/unit_player_sword_sheet_8x4.png", { frameWidth: 222, frameHeight: 222 });
    this.load.spritesheet("unit_player_blade", "assets/generated/image2_processed/characters/unit_player_blade_sheet_8x4.png", { frameWidth: 222, frameHeight: 222 });
    this.load.spritesheet("unit_player_spear", "assets/generated/image2_processed/characters/unit_player_spear_sheet_8x4.png", { frameWidth: 222, frameHeight: 222 });
    this.load.spritesheet("unit_enemy_raider", "assets/generated/image2_processed/characters/unit_enemy_raider_sheet_4x4.png", { frameWidth: 314, frameHeight: 314 });
    this.load.spritesheet("monster_normal_sheet", "assets/generated/image2_processed/monsters/monster_normal_sheet_4x4.png", { frameWidth: 314, frameHeight: 314 });
    this.load.spritesheet("monster_elite_sheet", "assets/generated/image2_processed/monsters/monster_elite_sheet_4x4.png", { frameWidth: 314, frameHeight: 314 });
    this.load.spritesheet("world_structures", "assets/generated/image2_processed/atlases/atlas_world_structures_3x3.png", { frameWidth: 418, frameHeight: 418 });
    this.load.image("drop", "assets/generated/image2_processed/items/loot_drop_bag.png");
    this.load.image("chest_closed", "assets/generated/image2_processed/items/loot_chest_closed.png");
    this.load.image("chest_open", "assets/generated/image2_processed/items/loot_chest_open.png");
    this.load.image("icon_weapon_sword", "assets/generated/image2_processed/items/icon_weapon_sword.png");
    this.load.image("icon_weapon_blade", "assets/generated/image2_processed/items/icon_weapon_blade.png");
    this.load.image("icon_weapon_spear", "assets/generated/image2_processed/items/icon_weapon_spear.png");
    this.load.image("hud_panel_status", "assets/generated/hud_single/medieval-hud-status-cpa-image2-20260501.png");
    this.load.image("hud_panel_objective", "assets/generated/hud_single/medieval-hud-objective-cpa-image2-20260501.png");
    this.load.image("hud_panel_timer", "assets/generated/hud_single/medieval-hud-timer-cpa-image2-20260501.png");
    this.load.image("hud_panel_command", "assets/generated/hud_single/medieval-hud-command-cpa-image2-20260501.png");
    this.load.image("hud_panel_skills", "assets/generated/hud_single/medieval-hud-skills-cpa-image2-20260501.png");
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
    const player = this.latestState?.players.find((entry) => entry.id === payload.playerId);
    this.playerMarkers.get(payload.playerId)?.playAction("attack", player?.direction);
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

  private createUnitAnimations(): void {
    const directions = ["down", "left", "right", "up"] as const;
    const playerSheets: WeaponType[] = ["sword", "blade", "spear"];

    for (const weaponType of playerSheets) {
      for (const [row, direction] of directions.entries()) {
        const base = row * 8;
        this.createAnimation(`player-${weaponType}-idle-${direction}`, `unit_player_${weaponType}`, [base, base + 1, base + 2, base + 1], 4, -1);
        this.createAnimation(`player-${weaponType}-move-${direction}`, `unit_player_${weaponType}`, [base, base + 1, base + 2, base + 1], 8, -1);
        this.createAnimation(`player-${weaponType}-attack-${direction}`, `unit_player_${weaponType}`, [base + 3, base + 4], 14, 0);
        this.createAnimation(`player-${weaponType}-skill-${direction}`, `unit_player_${weaponType}`, [base + 5, base + 6], 12, 0);
        this.createAnimation(`player-${weaponType}-dodge-${direction}`, `unit_player_${weaponType}`, [base + 6, base + 7], 16, 0);
        this.createAnimation(`player-${weaponType}-hurt-${direction}`, `unit_player_${weaponType}`, [base + 7, base + 6], 12, 0);
        this.createAnimation(`player-${weaponType}-die-${direction}`, `unit_player_${weaponType}`, [base + 7], 1, 0);
      }
    }

    this.createAnimation("monster-normal-sway", "monster_normal_sheet", [0, 1, 2, 3, 2, 1], 6, -1);
    this.createAnimation("monster-elite-sway", "monster_elite_sheet", [0, 1, 2, 3, 2, 1], 5, -1);
  }

  private createAnimation(key: string, textureKey: string, frames: number[], frameRate: number, repeat: number): void {
    if (this.anims.exists(key)) return;
    this.anims.create({
      key,
      frames: frames.map((frame) => ({ key: textureKey, frame })),
      frameRate,
      repeat
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0e0b08");
    const touchLayout = shouldUseTouchLayout();
    this.cameras.main.setZoom(touchLayout ? 0.86 : 0.96);
    this.createUnitAnimations();

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
      onDodge: () => this.handleDodge(),
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
      this.syncCorpseFog(state);
      this.hudOverlay?.sync({
        state,
        extractState: this.extractState,
        skillCooldownEndsAt: this.localSkillCooldownEndsAt,
        skillWindupEndsAt: this.localSkillWindupEndsAt,
        skillCooldowns: this.localSkillCooldowns
      });
    });
  }

  private handleAttack(): void {
    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    const direction = this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 };
    if (self) this.playerMarkers.get(self.id)?.playAction("attack", direction);
    this.feedbackFx?.playLocalAttack(
      this.latestState,
      direction
    );
    this.onAttack?.();
  }

  private handleSkill(slotIndex = 0): void {
    const sid = resolveSkillBySlot(this.latestState, slotIndex);
    if (!sid) return;

    const now = Date.now();
    const slot = Math.max(0, Math.min(2, slotIndex));
    const slotCooldown = this.localSkillCooldowns[slot];
    if (now < this.localSkillWindupEndsAt || now < slotCooldown.endsAt) return;

    const windupMs = getPrimarySkillWindupMs(sid);
    const cooldownMs = getPrimarySkillCooldownMs(sid);
    this.localSkillWindupEndsAt = now + windupMs;
    this.localSkillCooldownEndsAt = now + windupMs + cooldownMs;
    this.localSkillCooldowns[slot] = { endsAt: this.localSkillCooldownEndsAt, durationMs: cooldownMs };
    this.pendingSkillCast?.remove(false);
    const direction = this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 };
    this.feedbackFx?.playLocalSkill(
      sid,
      windupMs > 0 ? "windup" : "cast",
      this.latestState,
      direction
    );

    if (windupMs > 0) {
      this.pendingSkillCast = this.time.delayedCall(windupMs, () => {
        const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
        const castDirection = this.inputBridge?.getLastFacingDirection() ?? direction;
        if (self) this.playerMarkers.get(self.id)?.playAction("skill", castDirection);
        this.feedbackFx?.playLocalSkill(
          sid,
          "cast",
          this.latestState,
          castDirection
        );
        this.onSkill?.(sid);
        this.pendingSkillCast = undefined;
      });
      return;
    }

    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    if (self) this.playerMarkers.get(self.id)?.playAction("skill", direction);
    this.onSkill?.(sid);
  }

  private handleDodge(): void {
    const now = Date.now();
    const cooldownMs = getPrimarySkillCooldownMs("common_dodge");
    if (now < this.localSkillWindupEndsAt || now < this.localSkillCooldowns[3].endsAt) return;
    this.localSkillCooldownEndsAt = now + cooldownMs;
    this.localSkillCooldowns[3] = { endsAt: this.localSkillCooldownEndsAt, durationMs: cooldownMs };
    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    const direction = this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 };
    if (self) this.playerMarkers.get(self.id)?.playAction("dodge", direction);
    this.feedbackFx?.playLocalSkill(
      "common_dodge",
      "cast",
      this.latestState,
      direction
    );
    this.onSkill?.("common_dodge");
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
    if (this.latestState) {
      this.hudOverlay?.sync({
        state: this.latestState,
        extractState: this.extractState,
        skillCooldownEndsAt: this.localSkillCooldownEndsAt,
        skillWindupEndsAt: this.localSkillWindupEndsAt,
        skillCooldowns: this.localSkillCooldowns
      });
    }
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
        skillCooldownEndsAt: this.localSkillCooldownEndsAt,
        skillWindupEndsAt: this.localSkillWindupEndsAt,
        skillCooldowns: this.localSkillCooldowns
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
    this.corpseFogImage?.destroy();
    this.corpseFogImage = undefined;
    this.corpseFogTexture?.destroy();
    this.corpseFogTexture = undefined;
  }

  private syncWorld(state: MatchViewState): void {
    const layoutSignature = state.layout
      ? [
        state.layout.templateId,
        ...state.layout.riverHazards.map((entry) => `${entry.hazardId}:${entry.x},${entry.y},${entry.width},${entry.height}`),
        ...state.layout.safeCrossings.map((entry) => `${entry.crossingId}:${entry.x},${entry.y},${entry.width},${entry.height}`)
      ].join("|")
      : "no-layout";
    const nextSignature = `${state.width}x${state.height}:${layoutSignature}`;
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

  private syncCorpseFog(state: MatchViewState): void {
    if (!state.startedAt) return;

    const { width, height } = this.scale;
    const fogState = resolveCorpseFogVisualState(state.startedAt);
    const bucket = Math.round(fogState.visibilityPercent * 1000);
    const signature = `${width}x${height}:${bucket}`;
    if (this.corpseFogSignature === signature && this.corpseFogImage) {
      return;
    }

    this.corpseFogSignature = signature;
    if (!this.corpseFogTexture || this.corpseFogTexture.width !== width || this.corpseFogTexture.height !== height) {
      this.corpseFogTexture?.destroy();
      this.corpseFogTexture = this.textures.createCanvas("corpse_fog_mask", width, height) ?? undefined;
    }

    const texture = this.corpseFogTexture;
    if (!texture) return;
    const context = texture.getContext();
    context.clearRect(0, 0, width, height);

    const density = Phaser.Math.Clamp(1 - fogState.visibilityPercent, 0, 0.92);
    context.fillStyle = `rgba(74, 93, 58, ${0.10 + density * 0.46})`;
    context.fillRect(0, 0, width, height);
    context.fillStyle = `rgba(107, 91, 58, ${0.06 + density * 0.28})`;
    context.fillRect(0, 0, width, height);
    context.fillStyle = `rgba(6, 8, 5, ${Math.max(0, density - 0.45) * 0.55})`;
    context.fillRect(0, 0, width, height);

    const radius = Math.max(80, Math.max(width, height) * 0.78 * fogState.visibilityPercent);
    const gradient = context.createRadialGradient(width / 2, height / 2, radius * 0.48, width / 2, height / 2, radius);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(0.68, "rgba(0,0,0,0.72)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    texture.refresh();

    if (!this.corpseFogImage) {
      this.corpseFogImage = this.add.image(0, 0, "corpse_fog_mask")
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(165);
    }
    this.corpseFogImage.setTexture("corpse_fog_mask");
    this.corpseFogImage.setDisplaySize(width, height);
  }
}

function resolveCorpseFogVisualState(startedAt: number): { visibilityPercent: number } {
  const elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000);
  if (elapsedSec <= 480) {
    return { visibilityPercent: lerp(1, 0.5, elapsedSec / 480) };
  }
  if (elapsedSec <= 720) {
    return { visibilityPercent: lerp(0.5, 0.25, (elapsedSec - 480) / 240) };
  }
  return { visibilityPercent: lerp(0.25, 0.1, Math.min(1, (elapsedSec - 720) / 180)) };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Phaser.Math.Clamp(t, 0, 1);
}

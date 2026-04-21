import type { CombatEventPayload, SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import { DropMarker } from "../game/entities/DropMarker";
import { MonsterMarker } from "../game/entities/MonsterMarker";
import { PlayerMarker } from "../game/entities/PlayerMarker";
import {
  createKeyboardControls,
  type KeyboardControlsApi
} from "../input/keyboardControls";
import {
  createMobileControls,
  type MobileControlsApi
} from "../input/mobileControls";
import { MatchRuntimeStore, type MatchViewState } from "../game";
import type { ChestOpenedPayload, ChestState } from "../network/socketClient";
import type { ExtractUiState } from "./createGameClient";
import { Minimap } from "../ui/Minimap";

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

type TerrainPalette = {
  ground: number;
  path: number;
  pathEdge: number;
  scrub: number;
  wetland: number;
  plaza: number;
  frame: number;
};

type ObstacleKind = "crate" | "rock" | "barricade" | "brush";

type ObstacleLayout = {
  x: number;
  y: number;
  width: number; height: number;
  kind: ObstacleKind;
  rotation?: number;
};

export class GameScene extends Phaser.Scene {
  static readonly KEY = "GameScene";

  private runtime!: MatchRuntimeStore;
  private unsubscribeRuntime: (() => void) | null = null;
  private readonly playerMarkers = new Map<string, PlayerMarker>();
  private readonly monsterMarkers = new Map<string, MonsterMarker>();
  private readonly dropMarkers = new Map<string, DropMarker>();
  private readonly chestSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly chestLabels = new Map<string, Phaser.GameObjects.Text>();
  private terrainLayer?: Phaser.GameObjects.TileSprite;
  private detailLayer?: Phaser.GameObjects.Graphics;
  private obstacleLayer?: Phaser.GameObjects.Container;
  private worldFrame?: Phaser.GameObjects.Rectangle;
  private extractOuterRing?: Phaser.GameObjects.Arc;
  private extractInnerRing?: Phaser.GameObjects.Arc;
  private extractBeacon?: Phaser.GameObjects.Container;
  private extractLabel?: Phaser.GameObjects.Text;
  private extractPulseTween?: Phaser.Tweens.Tween;
  private hudContainer?: Phaser.GameObjects.Container;
  private minimap?: Minimap;
  private hpBar?: { track: Phaser.GameObjects.Graphics; fill: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text };
  private timerText?: Phaser.GameObjects.Text;
  private roomCodeText?: Phaser.GameObjects.Text;
  private weaponNameText?: Phaser.GameObjects.Text;
  private combatText?: Phaser.GameObjects.Text;
  private controlsHint?: Phaser.GameObjects.Text;
  private regionLabels: Phaser.GameObjects.Text[] = [];
  private latestState: MatchViewState | null = null;
  private worldSignature = "";
  private extractState: ExtractUiState = {
    isOpen: false,
    isExtracting: false,
    progress: null,
    secondsRemaining: null,
    message: "撤离点将在后期开启。",
    didSucceed: false
  };
  private keyboardControls?: KeyboardControlsApi | null;
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
  private chestUnsubscribes: (() => void)[] = [];
  private interactionPrompt?: Phaser.GameObjects.Text;
  private lastMoveDirection: Vector2 = { x: 0, y: 0 };
  private lastFacingDirection: Vector2 = { x: 0, y: 1 };
  private lastMoveSentAt = 0;
  private extractAutoStarted = false;

  private static readonly MOBILE_SPEED_SCALE = 0.5;

  private currentMoveDirection: Vector2 = { x: 0, y: 0 };

  private mobileControls?: MobileControlsApi | null;
  private joystickVector: Vector2 = { x: 0, y: 0 };
  private joystickContainer?: HTMLElement;
  private joystickKnobEl?: HTMLElement;
  private joystickTouchId: number | null = null;
  private joystickBaseCenter: { x: number; y: number } = { x: 0, y: 0 };
  private mobileOverlay?: HTMLElement;
  private domTouchStart?: (e: TouchEvent) => void;
  private domTouchMove?: (e: TouchEvent) => void;
  private domTouchEnd?: (e: TouchEvent) => void;

  constructor() {
    super(GameScene.KEY);
  }

  preload(): void {
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
        pCtx.fillStyle = "#1e293b"; pCtx.fillRect(x - 6, y + leftLegY, 4, 8); pCtx.fillRect(x + 2, y + rightLegY, 4, 8);
        pCtx.fillStyle = "#2563eb"; pCtx.fillRect(x - 6, y - 4, 12, 16);
        pCtx.fillStyle = "#ffdbac"; pCtx.fillRect(x - 5, y - 14, 10, 10);
        pCtx.fillStyle = "#000000";
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
      mCtx.fillStyle = "#f43f5e"; mCtx.beginPath(); mCtx.arc(x, y, 10, 0, Math.PI * 2); mCtx.fill();
      mCtx.fillStyle = "#000000"; mCtx.fillRect(x - 4, y - 2, 2, 2); mCtx.fillRect(x + 2, y - 2, 2, 2);
    }
    this.textures.addSpriteSheet("monster", mCanvas as any, { frameWidth: 32, frameHeight: 32 });

    const eCanvas = document.createElement("canvas");
    eCanvas.width = 64; eCanvas.height = 64;
    const eCtx = eCanvas.getContext("2d")!;
    eCtx.fillStyle = "#7e22ce"; eCtx.beginPath(); eCtx.moveTo(32, 8); eCtx.lineTo(56, 32); eCtx.lineTo(32, 56); eCtx.lineTo(8, 32); eCtx.closePath(); eCtx.fill();
    this.textures.addCanvas("elite", eCanvas);

    const dCanvas = document.createElement("canvas");
    dCanvas.width = 16; dCanvas.height = 16;
    const dCtx = dCanvas.getContext("2d")!;
    dCtx.fillStyle = "#facc15"; dCtx.fillRect(2, 2, 12, 12);
    this.textures.addCanvas("drop", dCanvas);

    const gCanvas = document.createElement("canvas");
    gCanvas.width = 64; gCanvas.height = 64;
    const gCtx = gCanvas.getContext("2d")!;
    gCtx.fillStyle = "#4a7c3f"; gCtx.fillRect(0, 0, 64, 64);
    this.textures.addCanvas("ground_pixel", gCanvas);

    const crateCanvas = document.createElement("canvas");
    crateCanvas.width = 48; crateCanvas.height = 48;
    const crateCtx = crateCanvas.getContext("2d")!;
    crateCtx.fillStyle = "#8B6914"; crateCtx.fillRect(2, 2, 44, 44);
    this.textures.addCanvas("crate", crateCanvas);

    const rockCanvas = document.createElement("canvas");
    rockCanvas.width = 48; rockCanvas.height = 48;
    const rockCtx = rockCanvas.getContext("2d")!;
    rockCtx.fillStyle = "#71717a"; rockCtx.beginPath(); rockCtx.arc(24, 24, 20, 0, Math.PI * 2); rockCtx.fill();
    this.textures.addCanvas("rock", rockCanvas);

    const brushCanvas = document.createElement("canvas");
    brushCanvas.width = 48; brushCanvas.height = 48;
    const brushCtx = brushCanvas.getContext("2d")!;
    brushCtx.fillStyle = "#166534"; brushCtx.beginPath(); brushCtx.arc(24, 24, 20, 0, Math.PI * 2); brushCtx.fill();
    this.textures.addCanvas("brush", brushCanvas);

    const bCanvas = document.createElement("canvas");
    bCanvas.width = 64; bCanvas.height = 64;
    const bCtx = bCanvas.getContext("2d")!;
    bCtx.fillStyle = "#2dd4bf"; bCtx.fillRect(16, 16, 32, 32);
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
    
    this.time.delayedCall(500, () => this.showTutorial());
  }

  private handleServerPlayerAttack(payload: { playerId: string; attackId: string }): void {
    const player = this.latestState?.players.find(p => p.id === payload.playerId);
    if (!player) return;
    const weaponType = player.weaponType || "sword";
    let direction = player.direction;
    if (payload.playerId === this.latestState?.selfPlayerId) {
      direction = this.lastFacingDirection;
    } else {
      const mag = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
      if (mag > 0) direction = { x: direction.x / mag, y: direction.y / mag };
      else direction = { x: 0, y: 1 };
    }
    this.createWeaponVfx(player.x, player.y, weaponType, direction);
    if (payload.playerId === this.latestState?.selfPlayerId) this.shakeCamera(0.005, 100);
  }

  private handleCombatResult(payload: CombatEventPayload): void {
    const target = this.playerMarkers.get(payload.targetId) || this.monsterMarkers.get(payload.targetId);
    if (!target) return;
    const color = payload.isCritical ? "#fbbf24" : "#ef4444";
    const text = this.add.text(target.root.x, target.root.y - 30, `-${payload.amount}`, {
      fontFamily: "monospace", fontSize: payload.isCritical ? "24px" : "18px", fontStyle: "bold", color, stroke: "#000000", strokeThickness: 4
    }).setOrigin(0.5).setDepth(3000);
    this.tweens.add({ targets: text, y: text.y - 40, alpha: 0, duration: 800, ease: "Cubic.out", onComplete: () => text.destroy() });
    this.flashEffect(target.root);
    if (payload.targetId === this.latestState?.selfPlayerId) {
      this.cameras.main.shake(100, 3 / this.scale.width);
      this.applyHitStop(50);
    }
    const attackerMonster = this.monsterMarkers.get(payload.attackerId);
    if (attackerMonster && payload.targetId === this.latestState?.selfPlayerId) {
      this.showMonsterAttackVfx(attackerMonster.root.x, attackerMonster.root.y, target.root.x, target.root.y, attackerMonster.root.depth);
    }
  }

  private showMonsterAttackVfx(mx: number, my: number, tx: number, ty: number, depth: number): void {
    const danger = this.add.graphics();
    danger.lineStyle(4, 0xff0000, 1); danger.strokeCircle(0, 0, 24);
    danger.fillStyle(0xff0000, 0.25); danger.fillCircle(0, 0, 24);
    danger.setPosition(mx, my).setDepth(depth + 5);
    this.tweens.add({ targets: danger, alpha: 0, scale: 1.6, duration: 280, onComplete: () => danger.destroy() });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#040814");
    this.cameras.main.setZoom(0.75);
    this.anims.create({ key: "player-walk-down", frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "player-walk-left", frames: this.anims.generateFrameNumbers("player", { start: 4, end: 7 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "player-walk-right", frames: this.anims.generateFrameNumbers("player", { start: 8, end: 11 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "player-walk-up", frames: this.anims.generateFrameNumbers("player", { start: 12, end: 15 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "monster-sway", frames: this.anims.generateFrameNumbers("monster", { start: 0, end: 3 }), frameRate: 8, repeat: -1 });

    this.unsubscribeRuntime = this.runtime.subscribe((state) => {
      this.latestState = state;
      this.syncWorld(state);
      this.syncPlayers(state);
      this.syncMonsters(state);
      this.syncDrops(state);
      this.syncHud(state);
    });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keyboardControls = createKeyboardControls(keyboard);
    }

    this.initHud();
    this.initChests();
    this.initTouchControls();
  }

  private initChests(): void {
    this.subscribeChestsInit?.((chests) => {
      chests.forEach(chest => {
        if (!this.chestSprites.has(chest.id)) {
          const sprite = this.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed").setDepth(chest.y);
          this.chestSprites.set(chest.id, sprite);
          if (!chest.isOpen) {
            const label = this.add.text(chest.x, chest.y - 30, "宝箱", { fontFamily: "monospace", fontSize: "14px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setDepth(chest.y + 1);
            this.chestLabels.set(chest.id, label);
          }
        }
      });
    });
    this.subscribeChestOpened?.((p) => {
      const s = this.chestSprites.get(p.chestId);
      if (s) { s.setTexture("chest_open"); this.chestLabels.get(p.chestId)?.destroy(); this.chestLabels.delete(p.chestId); }
    });
    this.interactionPrompt = this.add.text(0, 0, "按 E 开箱", { fontFamily: "monospace", fontSize: "16px", color: "#facc15", stroke: "#000000", strokeThickness: 4 }).setOrigin(0.5).setDepth(4000).setVisible(false);
  }

  private initTouchControls(): void {
    if (navigator.maxTouchPoints <= 0) return;
    this.mobileControls?.destroy();
    this.mobileControls = createMobileControls({
      root: document.body,
      speedScale: GameScene.MOBILE_SPEED_SCALE,
      onMove: (vector) => {
        this.joystickVector = vector;
      },
      onAttack: () => this.handleAttack(),
      onSkill: () => this.handleSkill(),
      onPickup: () => this.handleInteract(),
      onInventory: () => this.handleToggleInventory()
    });
  }

  private handleAttack(): void { this.onAttack?.(); }
  private handleSkill(): void {
    const sid = resolvePrimarySkill(this.latestState);
    if (sid) {
      this.onSkill?.(sid); this.shakeCamera(0.008, 150);
      const p = this.latestState?.players.find(pp => pp.id === this.latestState?.selfPlayerId);
      if (p) this.createSkillVfx(p.x, p.y, 0x38bdf8);
    }
  }
  private handleInteract(): void { if (this.interactionPrompt?.visible) { const id = this.interactionPrompt.getData("chestId"); if (id) this.onOpenChest?.(id); } else this.onPickup?.(); }

  private handleToggleInventory(): void {
    // Call the controller's toggle inventory method
    this.onToggleInventory?.();
  }

  private createWeaponVfx(x: number, y: number, type: WeaponType, dir: Vector2): void {
    const angle = Math.atan2(dir.y, dir.x);
    const g = this.add.graphics().setPosition(x, y).setDepth(y + 100);
    if (type === "sword") { g.lineStyle(3, 0xe2e8f0).beginPath().moveTo(0, 0).lineTo(Math.cos(angle) * 80, Math.sin(angle) * 80).strokePath(); }
    else if (type === "blade") { [angle - 0.5, angle, angle + 0.5].forEach(a => { g.lineStyle(3, 0xf97316).beginPath().moveTo(0, 0).lineTo(Math.cos(a) * 60, Math.sin(a) * 60).strokePath(); }); }
    else { g.lineStyle(4, 0xef4444).strokeCircle(0, 0, 40); }
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  private createSkillVfx(x: number, y: number, color: number): void {
    const r = this.add.graphics().lineStyle(4, color).strokeCircle(0, 0, 30).setPosition(x, y).setDepth(y + 100);
    this.tweens.add({ targets: r, alpha: 0, scale: 2, duration: 350, onComplete: () => r.destroy() });
  }

  update(time: number, delta: number): void {
    const alpha = Phaser.Math.Clamp(delta / 120, 0.08, 0.22);
    for (const m of this.playerMarkers.values()) { m.step(alpha); m.root.setDepth(m.root.y); }
    for (const m of this.monsterMarkers.values()) { m.step(alpha); m.root.setDepth(m.root.y); }
    for (const m of this.dropMarkers.values()) { m.root.setDepth(m.root.y); }

    this.emitMoveInput(time); this.emitActionInput(); this.updateChests(); this.tickExtractBeacon(time);

    const sid = this.latestState?.selfPlayerId;
    if (sid) {
      const sm = this.playerMarkers.get(sid);
      if (sm) {
        this.cameras.main.startFollow(sm.root, true, 0.12, 0.12);
        this.minimap?.revealAt(sm.root.x, sm.root.y);
        this.minimap?.updatePlayer(sm.root.x, sm.root.y);
        if (this.extractState.isOpen) {
          const dist = Phaser.Math.Distance.Between(sm.root.x, sm.root.y, this.extractState.x ?? 0, this.extractState.y ?? 0);
          if (dist <= (this.extractState.radius ?? 96) && !this.extractAutoStarted && !this.extractState.isExtracting) {
            this.onStartExtract?.(); this.extractAutoStarted = true;
          } else if (dist > (this.extractState.radius ?? 96)) this.extractAutoStarted = false;
        }
      }
    }
  }

  private updateChests(): void {
    const sid = this.latestState?.selfPlayerId; const sm = sid ? this.playerMarkers.get(sid) : null;
    if (!sm || !this.interactionPrompt) return;
    let nearest: string | null = null; let minDist = 80;
    for (const [id, s] of this.chestSprites.entries()) {
      if (s.texture.key === "chest_closed") {
        const d = Phaser.Math.Distance.Between(sm.root.x, sm.root.y, s.x, s.y);
        if (d < minDist) { minDist = d; nearest = id; }
      }
    }
    if (nearest) { const c = this.chestSprites.get(nearest)!; this.interactionPrompt.setPosition(c.x, c.y - 50).setVisible(true).setData("chestId", nearest); }
    else this.interactionPrompt.setVisible(false);
  }

  setExtractState(s: ExtractUiState): void { this.extractState = s; if (this.latestState) { this.syncHud(this.latestState); this.syncWorld(this.latestState); } }

  shutdown(): void {
    this.unsubscribeRuntime?.(); this.chestUnsubscribes.forEach(u => u());
    this.keyboardControls?.destroy();
    this.keyboardControls = undefined;
    this.mobileControls?.destroy();
    this.mobileControls = undefined;
    this.minimap?.destroy();
    this.minimap = undefined;
    this.joystickVector = { x: 0, y: 0 };
  }

  private emitMoveInput(time: number): void {
    if (!this.onMoveInput) return;

    let h = 0;
    let v = 0;
    const keyboardVector = this.keyboardControls?.getVector();
    if (keyboardVector) {
      h = keyboardVector.x;
      v = keyboardVector.y;
    }

    if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
      h = this.joystickVector.x;
      v = this.joystickVector.y;
    }

    let dir: Vector2 = { x: h, y: v };
    const isJoystickActive = this.joystickVector.x !== 0 || this.joystickVector.y !== 0;
    if (isJoystickActive) {
      // Keep joystick magnitude 1:1 with the stick to avoid turn-time speed spikes.
      dir = { x: this.joystickVector.x, y: this.joystickVector.y };
    }

    this.currentMoveDirection = dir;
    const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (mag > 0) {
      this.lastFacingDirection = { x: dir.x / mag, y: dir.y / mag };
    }

    if (
      Math.abs(dir.x - this.lastMoveDirection.x) < 0.01
      && Math.abs(dir.y - this.lastMoveDirection.y) < 0.01
      && time - this.lastMoveSentAt < 60
    ) {
      return;
    }

    this.lastMoveDirection = dir;
    this.lastMoveSentAt = time;
    this.onMoveInput?.(dir);
  }

  private emitActionInput(): void {
    this.keyboardControls?.consumeActions({
      onAttack: () => this.handleAttack(),
      onSkill: () => this.handleSkill(),
      onPickup: () => this.handleInteract(),
      onExtract: () => this.onStartExtract?.(),
      onInventory: () => this.handleToggleInventory()
    });
  }

  private syncWorld(state: MatchViewState): void {
    this.minimap?.syncWorldBounds(state.width, state.height);
    const centerX = state.width / 2; const centerY = state.height / 2;
    if (!this.terrainLayer) {
      this.terrainLayer = this.add.tileSprite(centerX, centerY, state.width, state.height, "ground_pixel").setDepth(-40);
      this.add.text(centerX, centerY + 112, "撤离点", { fontFamily: "monospace", fontSize: "20px", color: "#f8fafc" }).setOrigin(0.5).setDepth(-4);
    }
    if (!this.extractLabel) {
       this.extractLabel = this.add.text(centerX, centerY + 140, "", { fontFamily: "monospace", fontSize: "16px", color: "#2dd4bf" }).setOrigin(0.5).setDepth(-4);
    }
    this.extractLabel.setText(this.extractState.isOpen ? "撤离点已开启" : "撤离点未开启");
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

  private syncHud(state: MatchViewState): void {
    const p = state.players.find(pp => pp.id === state.selfPlayerId);
    if (this.hpBar && p) {
      const hpRatio = Phaser.Math.Clamp(p.maxHp > 0 ? p.hp / p.maxHp : 0, 0, 1);
      this.hpBar.track.clear();
      this.hpBar.track.fillStyle(0x120e0b, 0.84);
      this.hpBar.track.fillRoundedRect(20, 18, 272, 44, 10);
      this.hpBar.track.lineStyle(2, 0x4d4330, 1);
      this.hpBar.track.strokeRoundedRect(20, 18, 272, 44, 10);
      this.hpBar.track.lineStyle(1, 0xe8602c, 0.16);
      this.hpBar.track.strokeRoundedRect(26, 24, 260, 32, 8);

      this.hpBar.fill.clear();
      this.hpBar.fill.fillStyle(0x2b2519, 1);
      this.hpBar.fill.fillRoundedRect(30, 34, 208, 10, 5);

      let color = 0x7fa14a;
      if (hpRatio < 0.3) color = 0xb8371f;
      else if (hpRatio < 0.6) color = 0xd4b24c;

      this.hpBar.fill.fillStyle(color, 1);
      this.hpBar.fill.fillRoundedRect(30, 34, 208 * hpRatio, 10, 5);
      this.hpBar.label.setText(`生命值 ${p.hp} / ${p.maxHp}`);
    }
    if (this.timerText) this.timerText.setText(state.secondsRemaining == null ? "--:--" : formatSeconds(state.secondsRemaining));
    if (this.roomCodeText) this.roomCodeText.setText(`频道 ${state.code || "------"}`);
    if (this.combatText) this.combatText.setText(state.lastCombatText || "向中心废土推进，搜刮战利品，然后撤离。");
  }

  private initHud(): void {
    const { width, height } = this.scale;
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const hpLabel = this.add.text(34, 24, "生命值 -- / --", {
      fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
      fontSize: "11px",
      color: "#e8dfc8",
      letterSpacing: 1
    });
    this.hpBar = { track: this.add.graphics(), fill: this.add.graphics(), label: hpLabel };

    const rightPlate = this.add.graphics();
    rightPlate.fillStyle(0x120e0b, 0.84);
    rightPlate.fillRoundedRect(width - 220, 18, 200, 52, 10);
    rightPlate.lineStyle(2, 0x4d4330, 1);
    rightPlate.strokeRoundedRect(width - 220, 18, 200, 52, 10);
    rightPlate.lineStyle(1, 0xe8602c, 0.16);
    rightPlate.strokeRoundedRect(width - 214, 24, 188, 40, 8);

    this.timerText = this.add.text(width - 32, 22, "00:00", {
      fontFamily: '"Noto Serif SC", "Noto Sans SC", serif',
      fontSize: "24px",
      color: "#d4b24c"
    }).setOrigin(1, 0);
    this.roomCodeText = this.add.text(width - 32, 49, "频道 ------", {
      fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
      fontSize: "10px",
      color: "#b8ae96",
      letterSpacing: 1
    }).setOrigin(1, 0);

    const combatPlate = this.add.graphics();
    combatPlate.fillStyle(0x120e0b, 0.84);
    combatPlate.fillRoundedRect(width / 2 - 260, height - 86, 520, 42, 10);
    combatPlate.lineStyle(1, 0x4d4330, 1);
    combatPlate.strokeRoundedRect(width / 2 - 260, height - 86, 520, 42, 10);
    this.combatText = this.add.text(width / 2, height - 55, "", {
      fontFamily: '"Noto Sans SC", "Inter Tight", sans-serif',
      fontSize: "15px",
      color: "#e8dfc8",
      align: "center"
    }).setOrigin(0.5, 1);

    const hintText = navigator.maxTouchPoints > 0
      ? "摇杆移动 | 攻 进攻 | 技 技能 | 包 背囊"
      : "WASD 移动 | 空格 进攻 | Q 技能 | E 交互 | I 背囊";
    this.controlsHint = this.add.text(width - 20, height - 20, hintText, {
      fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
      fontSize: "10px",
      color: "#7d745e",
      backgroundColor: "rgba(18, 14, 11, 0.82)",
      padding: { x: 10, y: 6 }
    }).setOrigin(1, 1);
    this.hudContainer.add([this.hpBar.track, this.hpBar.fill, hpLabel, rightPlate, this.timerText, this.roomCodeText, combatPlate, this.combatText, this.controlsHint]);
    if (navigator.maxTouchPoints <= 0) {
      this.minimap = new Minimap({
        scene: this,
        parent: this.hudContainer,
        x: 20,
        y: 76
      });
    }
  }

  private showTutorial(): void {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setScrollFactor(0).setDepth(1000);
    const bg = this.add.graphics().fillStyle(0x0f172a, 0.95).fillRoundedRect(-160, -120, 320, 240, 12);
    const title = this.add.text(0, -100, "任务目标", { fontFamily: "monospace", fontSize: "20px", color: "#f8fafc" }).setOrigin(0.5);
    const hint = navigator.maxTouchPoints > 0 ? "● 移动: 虚拟摇杆\n● 攻击: 攻 | 技能: 技\n● 交互: 捡" : "● 移动: WASD\n● 攻击: 空格 | 技能: Q\n● 交互: E";
    const content = this.add.text(0, 0, hint + "\n\n目标: 击杀怪物, 收集战利品\n前往中心区域撤离。", { fontFamily: "monospace", fontSize: "16px", color: "#cbd5e1", align: "center" }).setOrigin(0.5);
    const footer = this.add.text(0, 100, "按任意键或点击关闭", { fontFamily: "monospace", fontSize: "12px", color: "#64748b" }).setOrigin(0.5);
    panel.add([bg, title, content, footer]);
    const close = () => { panel.destroy(); this.input.keyboard?.off("keydown"); this.input.off("pointerdown"); };
    this.input.keyboard?.once("keydown", close); this.input.once("pointerdown", close);
  }

  private tickExtractBeacon(time: number): void { }
  private flashEffect(target: any): void { }
  private applyHitStop(ms: number): void { }
  private shakeCamera(intensity: number, duration: number): void { this.cameras.main.shake(duration, intensity); }
}

function resolvePrimarySkill(state: MatchViewState | null): SkillId | null {
  const self = state?.players.find((p) => p.id === state.selfPlayerId);
  if (self?.weaponType === "sword") return "sword_dashSlash";
  return null;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60); const rs = s % 60;
  return `${m.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`;
}

function getObstacleLayouts(w: number, h: number): ObstacleLayout[] {
  return [{ x: w * 0.18, y: h * 0.16, width: 64, height: 64, kind: "brush" }, { x: w * 0.82, y: h * 0.15, width: 96, height: 96, kind: "rock" }, { x: w * 0.18, y: h * 0.84, width: 64, height: 64, kind: "crate" }, { x: w * 0.84, y: h * 0.84, width: 64, height: 64, kind: "barricade" }];
}

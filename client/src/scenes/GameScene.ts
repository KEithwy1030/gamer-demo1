import type { CombatEventPayload, SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import { DropMarker } from "../game/entities/DropMarker";
import { MonsterMarker } from "../game/entities/MonsterMarker";
import { PlayerMarker } from "../game/entities/PlayerMarker";
import { MatchRuntimeStore, type MatchViewState } from "../game";
import type { ChestOpenedPayload, ChestState } from "../network/socketClient";
import type { ExtractUiState } from "./createGameClient";

export interface GameSceneInitData {
  runtime: MatchRuntimeStore;
  extractState?: ExtractUiState;
  onMoveInput?: (direction: Vector2) => void;
  onAttack?: () => void;
  onSkill?: (skillId: SkillId) => void;
  onPickup?: () => void;
  onStartExtract?: () => void;
  onCombatResult?: (payload: CombatEventPayload) => void;
  onOpenChest?: (chestId: string) => void;
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
  private hpBar?: { track: Phaser.GameObjects.Graphics; fill: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text };
  private timerText?: Phaser.GameObjects.Text;
  private roomCodeText?: Phaser.GameObjects.Text;
  private combatText?: Phaser.GameObjects.Text;
  private controlsHint?: Phaser.GameObjects.Text;
  private tutorialPanel?: Phaser.GameObjects.Container;
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
  private moveKeys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private attackKey?: Phaser.Input.Keyboard.Key;
  private skillKey?: Phaser.Input.Keyboard.Key;
  private pickupKey?: Phaser.Input.Keyboard.Key;
  private extractKey?: Phaser.Input.Keyboard.Key;
  private onMoveInput?: (direction: Vector2) => void;
  private onAttack?: () => void;
  private onSkill?: (skillId: SkillId) => void;
  private onPickup?: () => void;
  private onStartExtract?: () => void;
  public onCombatResult?: (payload: CombatEventPayload) => void;
  private onOpenChest?: (chestId: string) => void;
  private subscribeChestsInit?: (callback: (chests: ChestState[]) => void) => () => void;
  private subscribeChestOpened?: (callback: (payload: ChestOpenedPayload) => void) => () => void;
  private chestUnsubscribes: (() => void)[] = [];
  private interactionPrompt?: Phaser.GameObjects.Text;
  private lastMoveDirection: Vector2 = { x: 0, y: 0 };
  private lastFacingDirection: Vector2 = { x: 0, y: 1 };
  private lastMoveSentAt = 0;

  private static readonly MOBILE_SPEED_SCALE = 0.5;

  private atmosphericOverlay?: Phaser.GameObjects.Graphics;

  // DOM-based joystick state
  private joystickContainer?: HTMLElement;
  private joystickKnobEl?: HTMLElement;
  private joystickVector: Vector2 = { x: 0, y: 0 };
  private joystickTouchId: number | null = null;
  private joystickBaseCenter: { x: number; y: number } = { x: 0, y: 0 };
  private mobileOverlay?: HTMLElement;
  // DOM touch listeners stored for cleanup
  private domTouchStart?: (e: TouchEvent) => void;
  private domTouchMove?: (e: TouchEvent) => void;
  private domTouchEnd?: (e: TouchEvent) => void;

  constructor() {
    super(GameScene.KEY);
  }

  preload(): void {
    // 1. Generate 'player' spritesheet (192x192, 48x48 per frame, 4x4 grid)
    const pCanvas = document.createElement("canvas");
    pCanvas.width = 192;
    pCanvas.height = 192;
    const pCtx = pCanvas.getContext("2d")!;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 48 + 24;
        const y = row * 48 + 24;
        const frame = col;
        
        // Legs animation logic
        let leftLegY = 12;
        let rightLegY = 12;
        if (frame === 1) leftLegY += 3;
        if (frame === 3) rightLegY += 3;
        if (frame === 0 || frame === 2) { leftLegY = 12; rightLegY = 12; }

        // Draw Legs
        pCtx.fillStyle = "#1e293b"; // Dark pants
        pCtx.fillRect(x - 6, y + leftLegY, 4, 8);
        pCtx.fillRect(x + 2, y + rightLegY, 4, 8);

        // Draw Body
        pCtx.fillStyle = "#2563eb"; // Blue shirt
        pCtx.fillRect(x - 6, y - 4, 12, 16);

        // Draw Head
        pCtx.fillStyle = "#ffdbac"; // Skin tone
        pCtx.fillRect(x - 5, y - 14, 10, 10);
        
        // Facing direction (eyes)
        pCtx.fillStyle = "#000000";
        if (row === 0) { // Down
          pCtx.fillRect(x - 3, y - 10, 2, 2);
          pCtx.fillRect(x + 1, y - 10, 2, 2);
        } else if (row === 1) { // Left
          pCtx.fillRect(x - 5, y - 10, 2, 2);
        } else if (row === 2) { // Right
          pCtx.fillRect(x + 3, y - 10, 2, 2);
        } else if (row === 3) { // Up
          // No eyes when facing up
        }
      }
    }
    this.textures.addSpriteSheet("player", pCanvas as any, { frameWidth: 48, frameHeight: 48 });

    // 2. Generate 'monster' spritesheet (128x32, 32x32 per frame, 4x1 grid)
    const mCanvas = document.createElement("canvas");
    mCanvas.width = 128;
    mCanvas.height = 32;
    const mCtx = mCanvas.getContext("2d")!;
    for (let f = 0; f < 4; f++) {
      const x = f * 32 + 16;
      const y = 16;
      const offset = (f % 2 === 0) ? 0 : (f === 1 ? -1 : 1);
      
      mCtx.fillStyle = "#f43f5e"; // Rose red / Orange-red
      mCtx.beginPath();
      mCtx.arc(x + offset, y, 10, 0, Math.PI * 2);
      mCtx.fill();
      
      mCtx.fillStyle = "#000000"; // Eyes
      mCtx.fillRect(x + offset - 4, y - 2, 2, 2);
      mCtx.fillRect(x + offset + 2, y - 2, 2, 2);
    }
    this.textures.addSpriteSheet("monster", mCanvas as any, { frameWidth: 32, frameHeight: 32 });

    // 3. Generate 'elite' texture (64x64)
    const eCanvas = document.createElement("canvas");
    eCanvas.width = 64;
    eCanvas.height = 64;
    const eCtx = eCanvas.getContext("2d")!;
    eCtx.fillStyle = "#7e22ce"; // Purple
    eCtx.beginPath();
    eCtx.moveTo(32, 8);
    eCtx.lineTo(56, 32);
    eCtx.lineTo(32, 56);
    eCtx.lineTo(8, 32);
    eCtx.closePath();
    eCtx.fill();
    eCtx.fillStyle = "#ef4444"; // Red eyes
    eCtx.fillRect(22, 26, 4, 4);
    eCtx.fillRect(38, 26, 4, 4);
    this.textures.addCanvas("elite", eCanvas);

    // 4. Generate 'drop' texture (16x16)
    const dCanvas = document.createElement("canvas");
    dCanvas.width = 16;
    dCanvas.height = 16;
    const dCtx = dCanvas.getContext("2d")!;
    dCtx.fillStyle = "#facc15"; // Gold
    dCtx.fillRect(2, 2, 12, 12);
    dCtx.fillStyle = "#ffffff"; // Highlight
    dCtx.fillRect(4, 4, 2, 2);
    this.textures.addCanvas("drop", dCanvas);

    // 5. Generate 'ground_pixel' (64x64 tiling)
    const gCanvas = document.createElement("canvas");
    gCanvas.width = 64;
    gCanvas.height = 64;
    const gCtx = gCanvas.getContext("2d")!;
    gCtx.fillStyle = "#4a7c3f"; // Grass base
    gCtx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i++) {
      gCtx.fillStyle = Math.random() > 0.5 ? "#3d6b34" : "#5a9e50";
      gCtx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 2, 2);
    }
    this.textures.addCanvas("ground_pixel", gCanvas);

    // 6. Generate 'path_tile' (64x64)
    const pathCanvas = document.createElement("canvas");
    pathCanvas.width = 64;
    pathCanvas.height = 64;
    const pathCtx = pathCanvas.getContext("2d")!;
    pathCtx.fillStyle = "#c4a35a"; // Dirt tan
    pathCtx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) {
      pathCtx.fillStyle = "#a1824a";
      pathCtx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 1, 1);
    }
    this.textures.addCanvas("path_tile", pathCanvas);

    // 7. Generate 'crate' (48x48)
    const crateCanvas = document.createElement("canvas");
    crateCanvas.width = 48;
    crateCanvas.height = 48;
    const crateCtx = crateCanvas.getContext("2d")!;
    crateCtx.fillStyle = "#8B6914"; // Brown
    crateCtx.fillRect(2, 2, 44, 44);
    crateCtx.strokeStyle = "#5C4033"; // Dark brown
    crateCtx.lineWidth = 4;
    crateCtx.strokeRect(4, 4, 40, 40);
    crateCtx.beginPath();
    crateCtx.moveTo(4, 4); crateCtx.lineTo(44, 44);
    crateCtx.moveTo(44, 4); crateCtx.lineTo(4, 44);
    crateCtx.stroke();
    this.textures.addCanvas("crate", crateCanvas);

    // 8. Generate 'rock' (48x48)
    const rockCanvas = document.createElement("canvas");
    rockCanvas.width = 48;
    rockCanvas.height = 48;
    const rockCtx = rockCanvas.getContext("2d")!;
    rockCtx.fillStyle = "#71717a"; // Gray
    rockCtx.beginPath();
    rockCtx.moveTo(24, 4);
    rockCtx.lineTo(44, 20);
    rockCtx.lineTo(40, 40);
    rockCtx.lineTo(10, 44);
    rockCtx.lineTo(4, 24);
    rockCtx.closePath();
    rockCtx.fill();
    this.textures.addCanvas("rock", rockCanvas);

    // 8b. Generate 'brush' (48x48)
    const brushCanvas = document.createElement("canvas");
    brushCanvas.width = 48;
    brushCanvas.height = 48;
    const brushCtx = brushCanvas.getContext("2d")!;
    brushCtx.fillStyle = "#166534"; // Dark green
    brushCtx.beginPath();
    brushCtx.arc(24, 24, 20, 0, Math.PI * 2);
    brushCtx.fill();
    brushCtx.fillStyle = "#22c55e"; // Light green highlight
    brushCtx.beginPath();
    brushCtx.arc(18, 18, 8, 0, Math.PI * 2);
    brushCtx.fill();
    this.textures.addCanvas("brush", brushCanvas);

    // 9. Generate 'beacon' (64x64)
    const bCanvas = document.createElement("canvas");
    bCanvas.width = 64;
    bCanvas.height = 64;
    const bCtx = bCanvas.getContext("2d")!;
    bCtx.strokeStyle = "#2dd4bf"; // Cyan
    bCtx.lineWidth = 2;
    bCtx.beginPath();
    bCtx.arc(32, 32, 28, 0, Math.PI * 2);
    bCtx.stroke();
    bCtx.fillStyle = "#2dd4bf";
    bCtx.beginPath();
    bCtx.moveTo(32, 16);
    bCtx.lineTo(48, 32);
    bCtx.lineTo(40, 32);
    bCtx.lineTo(40, 48);
    bCtx.lineTo(24, 48);
    bCtx.lineTo(24, 32);
    bCtx.lineTo(16, 32);
    bCtx.closePath();
    bCtx.fill();
    this.textures.addCanvas("beacon", bCanvas);

    // 10. Generate 'chest_closed' (32x32)
    const ccCanvas = document.createElement("canvas");
    ccCanvas.width = 32;
    ccCanvas.height = 32;
    const ccCtx = ccCanvas.getContext("2d")!;
    ccCtx.fillStyle = "#8B4513"; // Brown
    ccCtx.fillRect(2, 8, 28, 22);
    ccCtx.strokeStyle = "#5C2E00"; // Dark brown
    ccCtx.lineWidth = 2;
    ccCtx.strokeRect(3, 9, 26, 20);
    ccCtx.fillStyle = "#FFD700"; // Gold latch
    ccCtx.fillRect(14, 18, 4, 6);
    this.textures.addCanvas("chest_closed", ccCanvas);

    // 11. Generate 'chest_open' (32x32)
    const coCanvas = document.createElement("canvas");
    coCanvas.width = 32;
    coCanvas.height = 32;
    const coCtx = coCanvas.getContext("2d")!;
    coCtx.fillStyle = "#8B4513";
    coCtx.fillRect(2, 12, 28, 18); // Smaller body (lid open)
    coCtx.strokeStyle = "#5C2E00";
    coCtx.lineWidth = 2;
    coCtx.strokeRect(3, 13, 26, 16);
    coCtx.fillStyle = "#FFD700"; // Gold glow inside
    coCtx.globalAlpha = 0.6;
    coCtx.fillRect(6, 4, 20, 10);
    coCtx.globalAlpha = 1.0;
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
    this.subscribeChestsInit = data.subscribeChestsInit;
    this.subscribeChestOpened = data.subscribeChestOpened;
    this.onCombatResult = (payload) => this.handleCombatResult(payload);
  }

  private handleCombatResult(payload: CombatEventPayload): void {
    const target = this.playerMarkers.get(payload.targetId) || this.monsterMarkers.get(payload.targetId);
    if (!target) return;

    // 1. Floating Damage Number
    const color = payload.isCritical ? "#fbbf24" : "#ef4444"; // Yellow for crit, Red for normal
    const fontSize = payload.isCritical ? "24px" : "18px";
    const text = this.add.text(target.root.x, target.root.y - 30, `-${payload.amount}`, {
      fontFamily: "monospace",
      fontSize,
      fontStyle: "bold",
      color,
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(3000);

    this.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 800,
      ease: "Cubic.out",
      onComplete: () => text.destroy()
    });

    // 2. Flash Effect — red tint for 100ms (Issue 15)
    this.flashEffect(target.root);

    // 3. Screen shake of 3px for 100ms when local player is hit (Issue 15)
    if (payload.targetId === this.latestState?.selfPlayerId) {
      this.cameras.main.shake(100, 3 / this.scale.width);
      this.applyHitStop(50);
    }

    // 4. Monster attack danger indicator (Issue 14):
    //    When attacker is a monster and target is a player, show red flash at monster + arrow to target
    const attackerMonster = this.monsterMarkers.get(payload.attackerId);
    const targetPlayer = this.playerMarkers.get(payload.targetId);
    if (attackerMonster && targetPlayer) {
      this.showMonsterAttackVfx(
        attackerMonster.root.x,
        attackerMonster.root.y,
        targetPlayer.root.x,
        targetPlayer.root.y,
        attackerMonster.root.depth
      );
    }
  }

  private showMonsterAttackVfx(mx: number, my: number, tx: number, ty: number, depth: number): void {
    // Red danger flash circle at monster position
    const danger = this.add.graphics();
    danger.lineStyle(4, 0xff0000, 1);
    danger.strokeCircle(0, 0, 24);
    danger.fillStyle(0xff0000, 0.25);
    danger.fillCircle(0, 0, 24);
    danger.setPosition(mx, my);
    danger.setDepth(depth + 5);
    this.tweens.add({
      targets: danger,
      alpha: 0,
      scale: 1.6,
      duration: 280,
      ease: "Quad.out",
      onComplete: () => danger.destroy()
    });

    // Short arrow/line pointing from monster toward target
    const dx = tx - mx;
    const dy = ty - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const arrowLen = Math.min(50, dist * 0.45);
    const arrow = this.add.graphics();
    arrow.lineStyle(3, 0xff4444, 0.9);
    arrow.beginPath();
    arrow.moveTo(mx, my);
    arrow.lineTo(mx + nx * arrowLen, my + ny * arrowLen);
    arrow.strokePath();
    // Arrowhead
    const headAngle = Math.atan2(dy, dx);
    const hs = 8;
    const ax = mx + nx * arrowLen;
    const ay = my + ny * arrowLen;
    arrow.beginPath();
    arrow.moveTo(ax, ay);
    arrow.lineTo(ax - Math.cos(headAngle - 0.5) * hs, ay - Math.sin(headAngle - 0.5) * hs);
    arrow.moveTo(ax, ay);
    arrow.lineTo(ax - Math.cos(headAngle + 0.5) * hs, ay - Math.sin(headAngle + 0.5) * hs);
    arrow.strokePath();
    arrow.setDepth(depth + 4);
    this.tweens.add({
      targets: arrow,
      alpha: 0,
      duration: 300,
      ease: "Quad.out",
      onComplete: () => arrow.destroy()
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#040814");
    this.cameras.main.setZoom(1); 
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.shutdown();
    });

    this.anims.create({
      key: "player-walk-down",
      frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
      frameRate: 12, repeat: -1
    });
    this.anims.create({
      key: "player-walk-left",
      frames: this.anims.generateFrameNumbers("player", { start: 4, end: 7 }),
      frameRate: 12, repeat: -1
    });
    this.anims.create({
      key: "player-walk-right",
      frames: this.anims.generateFrameNumbers("player", { start: 8, end: 11 }),
      frameRate: 12, repeat: -1
    });
    this.anims.create({
      key: "player-walk-up",
      frames: this.anims.generateFrameNumbers("player", { start: 12, end: 15 }),
      frameRate: 12, repeat: -1
    });

    this.anims.create({
      key: "monster-sway",
      frames: this.anims.generateFrameNumbers("monster", { start: 0, end: 3 }),
      frameRate: 8, repeat: -1
    });

    this.input.addPointer(3);

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
      const keys = keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,E,F") as Record<string, Phaser.Input.Keyboard.Key>;
      this.moveKeys = { up: keys.W, down: keys.S, left: keys.A, right: keys.D };
      this.attackKey = keys.SPACE;
      this.skillKey = keys.Q;
      this.pickupKey = keys.E;
      this.extractKey = keys.F;
    }

    this.createAtmosphere();
    this.initHud();
    this.initChests();
    this.showTutorial();
    this.initTouchControls();
  }

  private initChests(): void {
    if (this.subscribeChestsInit) {
      this.chestUnsubscribes.push(this.subscribeChestsInit((chests) => {
        chests.forEach(chest => {
          if (!this.chestSprites.has(chest.id)) {
            const sprite = this.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed");
            sprite.setDepth(chest.y);
            this.chestSprites.set(chest.id, sprite);

            if (!chest.isOpen) {
              const label = this.add.text(chest.x, chest.y - 30, "宝箱", {
                fontFamily: "monospace",
                fontSize: "14px",
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 3
              }).setOrigin(0.5).setDepth(chest.y + 1);
              this.chestLabels.set(chest.id, label);

              // Pulsing glow
              this.tweens.add({
                targets: sprite,
                alpha: 0.7,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
              });
            }
          }
        });
      }));
    }

    if (this.subscribeChestOpened) {
      this.chestUnsubscribes.push(this.subscribeChestOpened((payload) => {
        const sprite = this.chestSprites.get(payload.chestId);
        if (sprite) {
          sprite.setTexture("chest_open");
          this.tweens.killTweensOf(sprite);
          sprite.setAlpha(1);
          
          // Brief golden particle burst (using simple circles)
          for (let i = 0; i < 8; i++) {
            const p = this.add.circle(sprite.x, sprite.y, 4, 0xfacc15);
            p.setDepth(sprite.depth + 1);
            this.tweens.add({
              targets: p,
              x: p.x + (Math.random() - 0.5) * 100,
              y: p.y + (Math.random() - 0.5) * 100,
              alpha: 0,
              scale: 0.1,
              duration: 600,
              onComplete: () => p.destroy()
            });
          }
        }
        const label = this.chestLabels.get(payload.chestId);
        if (label) {
          label.destroy();
          this.chestLabels.delete(payload.chestId);
        }
      }));
    }

    this.interactionPrompt = this.add.text(0, 0, "按 E 开箱", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#facc15",
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(4000).setVisible(false);
  }

  private initTouchControls(): void {
    const isTouch = navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    // ── JOYSTICK (pure DOM, left side) ──────────────────────────────────────
    const joystickWrap = document.createElement("div");
    joystickWrap.id = "mobile-joystick-wrap";
    joystickWrap.style.cssText = [
      "position:fixed",
      "left:16px",
      "bottom:16px",
      "width:120px",
      "height:120px",
      "touch-action:none",    // iOS scroll prevention — ONLY on this element
      "z-index:3000",
      "user-select:none",
      "-webkit-user-select:none"
    ].join(";");

    const joystickBase = document.createElement("div");
    joystickBase.style.cssText = [
      "width:120px",
      "height:120px",
      "border-radius:50%",
      "background:rgba(255,255,255,0.15)",
      "border:2px solid rgba(255,255,255,0.4)",
      "position:relative"
    ].join(";");

    const joystickKnob = document.createElement("div");
    joystickKnob.style.cssText = [
      "width:50px",
      "height:50px",
      "border-radius:50%",
      "background:rgba(255,255,255,0.5)",
      "position:absolute",
      "top:35px",           // (120-50)/2
      "left:35px",
      "transition:none",
      "pointer-events:none"
    ].join(";");

    joystickBase.appendChild(joystickKnob);
    joystickWrap.appendChild(joystickBase);
    document.body.appendChild(joystickWrap);
    this.joystickContainer = joystickWrap;
    this.joystickKnobEl = joystickKnob;

    const KNOB_CLAMP = 35; // px from center

    const resetKnob = () => {
      joystickKnob.style.left = "35px";
      joystickKnob.style.top = "35px";
      this.joystickVector = { x: 0, y: 0 };
      this.joystickTouchId = null;
    };

    this.domTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (this.joystickTouchId === null && joystickBase.contains(el as Node)) {
          e.preventDefault();
          this.joystickTouchId = t.identifier;
          const rect = joystickBase.getBoundingClientRect();
          this.joystickBaseCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          };
          break;
        }
      }
    };

    this.domTouchMove = (e: TouchEvent) => {
      if (this.joystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.joystickTouchId) {
          e.preventDefault();
          const dx = t.clientX - this.joystickBaseCenter.x;
          const dy = t.clientY - this.joystickBaseCenter.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const clamped = Math.min(dist, KNOB_CLAMP);
          const nx = dist > 0 ? (dx / dist) * clamped : 0;
          const ny = dist > 0 ? (dy / dist) * clamped : 0;

          joystickKnob.style.left = `${35 + nx}px`;
          joystickKnob.style.top = `${35 + ny}px`;

          // Normalize to 0-1 range then apply mobile speed scale
          const mag = Math.min(1.0, dist / KNOB_CLAMP);
          this.joystickVector = {
            x: dist > 0 ? (dx / dist) * mag * GameScene.MOBILE_SPEED_SCALE : 0,
            y: dist > 0 ? (dy / dist) * mag * GameScene.MOBILE_SPEED_SCALE : 0
          };
          break;
        }
      }
    };

    this.domTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.joystickTouchId) {
          resetKnob();
          break;
        }
      }
    };

    document.addEventListener("touchstart", this.domTouchStart, { passive: false });
    document.addEventListener("touchmove", this.domTouchMove, { passive: false });
    document.addEventListener("touchend", this.domTouchEnd, { passive: false });
    document.addEventListener("touchcancel", this.domTouchEnd, { passive: false });

    // ── ACTION BUTTONS (pure DOM, right side) ────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "mobile-action-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "display:grid",
      "grid-template-columns:repeat(2,70px)",
      "gap:8px",
      "z-index:3000",
      "user-select:none",
      "-webkit-user-select:none"
    ].join(";");

    // Expose game actions on window so DOM buttons can reach them
    (window as any).__gameActions = {
      attack: () => this.handleAttack(),
      skill:  () => this.handleSkill(),
      pickup: () => this.handleInteract(),
      extract: () => this.onStartExtract?.()
    };

    const buttons = [
      { label: "攻", color: "#ef4444", action: "attack"  as const },
      { label: "技", color: "#38bdf8", action: "skill"   as const },
      { label: "捡", color: "#4ade80", action: "pickup"  as const },
      { label: "撤", color: "#facc15", action: "extract" as const },
    ];

    buttons.forEach(btn => {
      const el = document.createElement("div");
      el.style.cssText = [
        "width:70px",
        "height:70px",
        "border-radius:50%",
        "background:rgba(15,23,42,0.85)",
        `border:3px solid ${btn.color}`,
        "display:flex",
        "align-items:center",
        "justify-content:center",
        `color:${btn.color}`,
        "font-weight:bold",
        "font-size:22px",
        "font-family:monospace"
      ].join(";");
      el.textContent = btn.label;

      el.addEventListener("touchstart", (e: TouchEvent) => {
        e.preventDefault();
        el.style.opacity = "0.7";
        (window as any).__gameActions?.[btn.action]?.();
      }, { passive: false });
      el.addEventListener("touchend", () => { el.style.opacity = "1"; });
      el.addEventListener("touchcancel", () => { el.style.opacity = "1"; });

      overlay.appendChild(el);
    });

    document.body.appendChild(overlay);
    this.mobileOverlay = overlay;
  }

  private handleAttack(): void {
    this.onAttack?.();
    this.shakeCamera(0.005, 100);
    const selfPlayerId = this.latestState?.selfPlayerId;
    const selfPlayer = this.latestState?.players.find(p => p.id === selfPlayerId);
    if (selfPlayer) {
      const weaponType = selfPlayer.weaponType || "sword";
      this.createWeaponVfx(selfPlayer.x, selfPlayer.y, weaponType, this.lastFacingDirection);
    }
  }

  private handleSkill(): void {
    const skillId = resolvePrimarySkill(this.latestState);
    if (skillId) {
      this.onSkill?.(skillId);
      this.shakeCamera(0.008, 150);
      const selfPlayerId = this.latestState?.selfPlayerId;
      const selfPlayer = this.latestState?.players.find(p => p.id === selfPlayerId);
      if (selfPlayer) this.createSkillVfx(selfPlayer.x, selfPlayer.y, 0x38bdf8);
      if (selfPlayerId && skillId === "sword_dashSlash") {
        const marker = this.playerMarkers.get(selfPlayerId);
        if (marker) {
          for (let i = 0; i < 3; i++) this.time.delayedCall(i * 50, () => marker.createGhost());
        }
      }
    }
  }

  private createWeaponVfx(x: number, y: number, weaponType: WeaponType, direction: Vector2): void {
    const angle = Math.atan2(direction.y, direction.x);

    if (weaponType === "sword") {
      // Sword: a long thin silver LINE extending 80px forward, fades over 200ms
      const g = this.add.graphics();
      g.setPosition(x, y);
      g.setDepth(y + 100);
      g.lineStyle(3, 0xe2e8f0, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(angle) * 80, Math.sin(angle) * 80);
      g.strokePath();
      // Small perpendicular crossguard
      g.lineStyle(2, 0xc0c0c0, 0.8);
      g.beginPath();
      g.moveTo(Math.cos(angle) * 16 + Math.cos(angle + Math.PI / 2) * 10,
               Math.sin(angle) * 16 + Math.sin(angle + Math.PI / 2) * 10);
      g.lineTo(Math.cos(angle) * 16 + Math.cos(angle - Math.PI / 2) * 10,
               Math.sin(angle) * 16 + Math.sin(angle - Math.PI / 2) * 10);
      g.strokePath();

      this.tweens.add({
        targets: g,
        alpha: 0,
        duration: 200,
        ease: "Quad.out",
        onComplete: () => g.destroy()
      });
    } else if (weaponType === "blade") {
      // Blade: 3 orange slash lines in a 90° fan, each 60px, fades over 250ms
      const g = this.add.graphics();
      g.setPosition(x, y);
      g.setDepth(y + 100);
      const fanAngles = [angle - Math.PI / 4, angle, angle + Math.PI / 4];
      fanAngles.forEach((a, i) => {
        const alpha = i === 1 ? 1 : 0.7;
        g.lineStyle(i === 1 ? 4 : 2, 0xf97316, alpha);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
        g.strokePath();
      });

      this.tweens.add({
        targets: g,
        alpha: 0,
        duration: 250,
        ease: "Quad.out",
        onComplete: () => g.destroy()
      });
    } else if (weaponType === "spear") {
      // Spear: red circle outline expanding from 10px to 120px radius over 300ms
      const ring = this.add.graphics();
      ring.lineStyle(4, 0xef4444, 1);
      ring.strokeCircle(0, 0, 10);
      ring.setPosition(x, y);
      ring.setDepth(y + 100);

      // Also draw a thrust line
      const thrust = this.add.graphics();
      thrust.lineStyle(5, 0xef4444, 0.9);
      thrust.beginPath();
      thrust.moveTo(x, y);
      thrust.lineTo(x + Math.cos(angle) * 70, y + Math.sin(angle) * 70);
      thrust.strokePath();
      thrust.setDepth(y + 101);
      this.tweens.add({
        targets: thrust,
        alpha: 0,
        duration: 150,
        onComplete: () => thrust.destroy()
      });

      const animObj = { r: 10 };
      this.tweens.add({
        targets: animObj,
        r: 120,
        duration: 300,
        ease: "Cubic.out",
        onUpdate: () => {
          ring.clear();
          const progress = (animObj.r - 10) / 110;
          ring.lineStyle(4, 0xef4444, 1 - progress);
          ring.strokeCircle(0, 0, animObj.r);
        },
        onComplete: () => ring.destroy()
      });
    } else {
      this.createSkillVfx(x, y, 0xffffff);
    }

    // Always add a small flash at the player position
    const flashColor = weaponType === "sword" ? 0xe2e8f0 : (weaponType === "blade" ? 0xf97316 : (weaponType === "spear" ? 0xef4444 : 0xffffff));
    const flash = this.add.circle(x, y, 25, flashColor, 0.5);
    flash.setDepth(y + 99);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      duration: 150,
      onComplete: () => flash.destroy()
    });
  }

  update(time: number, delta: number): void {
    const alpha = Phaser.Math.Clamp(delta / 120, 0.08, 0.22);
    for (const marker of this.playerMarkers.values()) {
      marker.step(alpha);
      marker.root.setDepth(marker.root.y);
    }
    for (const marker of this.monsterMarkers.values()) {
      marker.step(alpha);
      marker.root.setDepth(marker.root.y);
    }
    for (const marker of this.dropMarkers.values()) {
      marker.root.setDepth(marker.root.y);
    }

    if (this.obstacleLayer) {
      this.obstacleLayer.list.forEach((obj: any) => {
        if (obj.setDepth) obj.setDepth(obj.y);
      });
    }

    this.emitMoveInput(time);
    this.emitActionInput();
    this.updateChests();
    this.tickExtractBeacon(time);

    const selfPlayerId = this.latestState?.selfPlayerId;
    if (!selfPlayerId) return;

    const selfMarker = this.playerMarkers.get(selfPlayerId);
    if (selfMarker) {
      this.cameras.main.startFollow(selfMarker.root, true, 0.12, 0.12);
    }
  }

  private updateChests(): void {
    if (!this.interactionPrompt) return;

    const selfPlayerId = this.latestState?.selfPlayerId;
    if (!selfPlayerId) {
      this.interactionPrompt.setVisible(false);
      return;
    }

    const selfMarker = this.playerMarkers.get(selfPlayerId);
    if (!selfMarker) {
      this.interactionPrompt.setVisible(false);
      return;
    }

    let nearestChestId: string | null = null;
    let minDistance = 80;

    for (const [id, sprite] of this.chestSprites.entries()) {
      // Only closed chests are interactable
      if (sprite.texture.key === "chest_closed") {
        const dist = Phaser.Math.Distance.Between(selfMarker.root.x, selfMarker.root.y, sprite.x, sprite.y);
        if (dist < minDistance) {
          minDistance = dist;
          nearestChestId = id;
        }
      }
    }

    if (nearestChestId) {
      const chest = this.chestSprites.get(nearestChestId)!;
      this.interactionPrompt.setPosition(chest.x, chest.y - 50);
      this.interactionPrompt.setVisible(true);
      this.interactionPrompt.setData("chestId", nearestChestId);
    } else {
      this.interactionPrompt.setVisible(false);
    }
  }

  setExtractState(nextState: ExtractUiState): void {
    this.extractState = nextState;
    if (this.latestState) {
      this.syncHud(this.latestState);
      this.syncWorld(this.latestState);
    }
  }

  shutdown(): void {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = null;
    this.chestUnsubscribes.forEach(unsub => unsub());
    this.chestUnsubscribes = [];
    this.extractPulseTween?.stop();
    this.extractPulseTween = undefined;

    // Remove DOM mobile controls and listeners
    if (this.joystickContainer) {
      this.joystickContainer.remove();
      this.joystickContainer = undefined;
      this.joystickKnobEl = undefined;
    }
    if (this.mobileOverlay) {
      this.mobileOverlay.remove();
      this.mobileOverlay = undefined;
    }
    if (this.domTouchStart) {
      document.removeEventListener("touchstart", this.domTouchStart);
      this.domTouchStart = undefined;
    }
    if (this.domTouchMove) {
      document.removeEventListener("touchmove", this.domTouchMove);
      this.domTouchMove = undefined;
    }
    if (this.domTouchEnd) {
      document.removeEventListener("touchend", this.domTouchEnd);
      document.removeEventListener("touchcancel", this.domTouchEnd);
      this.domTouchEnd = undefined;
    }
    // Clean up exposed window actions
    delete (window as any).__gameActions;

    for (const marker of this.playerMarkers.values()) marker.destroy();
    for (const marker of this.monsterMarkers.values()) marker.destroy();
    for (const marker of this.dropMarkers.values()) marker.destroy();
    for (const label of this.chestLabels.values()) label.destroy();
    this.chestSprites.clear();
    this.chestLabels.clear();
    this.regionLabels = [];
  }

  shakeCamera(intensity = 0.005, duration = 100): void {
    this.cameras.main.shake(duration, intensity);
  }

  flashEffect(target: Phaser.GameObjects.GameObject): void {
    if (!(target instanceof Phaser.GameObjects.Sprite || target instanceof Phaser.GameObjects.Container)) return;
    // Flash red for damage feedback (Issue 15)
    (target as any).setTint(0xff0000);
    this.time.delayedCall(100, () => {
      if (target.active) (target as any).clearTint();
    });
  }

  applyHitStop(durationMs: number): void {
    const originalScale = this.time.timeScale;
    this.time.timeScale = 0.05;
    this.time.delayedCall(durationMs, () => { this.time.timeScale = originalScale; });
  }

  private emitMoveInput(time: number): void {
    if (!this.onMoveInput) return;
    
    let horizontal = 0;
    let vertical = 0;

    if (this.moveKeys) {
      horizontal = Number(this.moveKeys.right.isDown) - Number(this.moveKeys.left.isDown);
      vertical = Number(this.moveKeys.down.isDown) - Number(this.moveKeys.up.isDown);
    }

    // Combine with joystick input (already scaled by MOBILE_SPEED_SCALE in the DOM handler)
    if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
      horizontal = this.joystickVector.x;
      vertical = this.joystickVector.y;
    }

    const nextDirection = { x: horizontal, y: vertical };
    
    if (horizontal !== 0 || vertical !== 0) {
      const mag = Math.sqrt(horizontal * horizontal + vertical * vertical);
      this.lastFacingDirection = { x: horizontal / mag, y: vertical / mag };
    }

    const changed = Math.abs(nextDirection.x - this.lastMoveDirection.x) > 0.01 || 
                    Math.abs(nextDirection.y - this.lastMoveDirection.y) > 0.01;
    
    if (!changed && time - this.lastMoveSentAt < 60) return;
    
    this.lastMoveDirection = nextDirection;
    this.lastMoveSentAt = time;
    this.onMoveInput(nextDirection);
  }

  private emitActionInput(): void {
    if (this.attackKey && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.handleAttack();
    }
    if (this.skillKey && Phaser.Input.Keyboard.JustDown(this.skillKey)) {
      this.handleSkill();
    }
    if (this.pickupKey && Phaser.Input.Keyboard.JustDown(this.pickupKey)) {
      this.handleInteract();
    }
    if (this.extractKey && Phaser.Input.Keyboard.JustDown(this.extractKey)) {
      this.onStartExtract?.();
    }
  }

  private handleInteract(): void {
    if (this.interactionPrompt?.visible) {
      const chestId = this.interactionPrompt.getData("chestId");
      if (chestId) this.onOpenChest?.(chestId);
    } else {
      this.onPickup?.();
    }
  }

  private createSkillVfx(x: number, y: number, color: number): void {
    const ring = this.add.graphics();
    ring.lineStyle(4, color, 1);
    ring.strokeCircle(0, 0, 30);
    ring.setPosition(x, y);
    ring.setDepth(y + 100);

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 2,
      duration: 350,
      ease: "Cubic.out",
      onComplete: () => ring.destroy()
    });

    const flash = this.add.circle(x, y, 20, color, 0.6);
    flash.setDepth(y + 99);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      duration: 200,
      onComplete: () => flash.destroy()
    });
  }

  private syncWorld(state: MatchViewState): void {
    const nextSignature = `${state.width}x${state.height}`;
    if (this.worldSignature !== nextSignature) {
      this.buildWorldBackdrop(state);
      this.worldSignature = nextSignature;
    }
    const centerX = state.width / 2;
    const centerY = state.height / 2;
    if (this.extractOuterRing) this.extractOuterRing.setPosition(centerX, centerY);
    else {
      this.extractOuterRing = this.add.circle(centerX, centerY, 126, 0x2dd4bf, 0.2);
      this.extractOuterRing.setStrokeStyle(10, 0x99f6e4, 0.5).setDepth(-6);
    }
    if (this.extractInnerRing) this.extractInnerRing.setPosition(centerX, centerY);
    else {
      this.extractInnerRing = this.add.circle(centerX, centerY, 82, 0x2dd4bf, 0.25);
      this.extractInnerRing.setStrokeStyle(5, 0xf8fafc, 0.32).setDepth(-5);
    }
    if (!this.extractBeacon) this.extractBeacon = this.createExtractBeacon(centerX, centerY);
    else this.extractBeacon.setPosition(centerX, centerY - 8);
    if (!this.extractLabel) {
      this.extractLabel = this.add.text(centerX, centerY + 112, "撤离点", { 
        fontFamily: "monospace", 
        fontSize: "20px", 
        fontStyle: "bold",
        color: "#f8fafc", 
        stroke: "#082f49", 
        strokeThickness: 6 
      });
      this.extractLabel.setOrigin(0.5).setDepth(-4);
    }
    this.extractLabel.setText(this.extractState.isOpen ? "撤离点已开启" : "撤离点未开启");
  }

  private buildWorldBackdrop(state: MatchViewState): void {
    this.terrainLayer?.destroy();
    this.detailLayer?.destroy();
    this.obstacleLayer?.destroy(true);
    this.worldFrame?.destroy();
    this.extractOuterRing?.destroy();
    this.extractInnerRing?.destroy();
    this.extractBeacon?.destroy(true);
    this.extractLabel?.destroy();
    this.regionLabels.forEach((label) => label.destroy());
    this.regionLabels = [];

    const width = state.width;
    const height = state.height;
    const centerX = width / 2;
    const centerY = height / 2;

    this.terrainLayer = this.add.tileSprite(centerX, centerY, width, height, "ground_pixel");
    this.terrainLayer.setDepth(-40);

    this.detailLayer = this.add.graphics();
    this.detailLayer.setDepth(-35);
    
    // Center Plaza
    this.detailLayer.fillStyle(0x4b5563, 0.8);
    this.detailLayer.fillCircle(centerX, centerY, 160);
    this.detailLayer.lineStyle(6, 0x1f2937, 1);
    this.detailLayer.strokeCircle(centerX, centerY, 160);

    // Dirt/Path Patches
    for (let i = 0; i < 15; i++) {
      const px = Math.random() * width;
      const py = Math.random() * height;
      this.detailLayer.fillStyle(0xc4a35a, 0.2);
      this.detailLayer.fillEllipse(px, py, 100, 60);
    }

    this.obstacleLayer = this.add.container(0, 0);
    this.obstacleLayer.setDepth(-12);
    for (const obstacle of getObstacleLayouts(width, height)) this.obstacleLayer.add(this.createObstacle(obstacle));

    const wf = this.add.graphics();
    wf.setDepth(-15);
    wf.lineStyle(16, 0x111827, 1);
    wf.strokeRect(0, 0, width, height);
    wf.lineStyle(4, 0x374151, 1);
    wf.strokeRect(8, 8, width - 16, height - 16);
    this.worldFrame = wf as any;

    this.regionLabels = [
      this.createRegionLabel(width * 0.18, height * 0.16, "拾荒者山脊"),
      this.createRegionLabel(width * 0.82, height * 0.15, "淹没之地"),
      this.createRegionLabel(centerX, centerY - 182, "中央中继站"),
      this.createRegionLabel(width * 0.18, height * 0.84, "货运堆场"),
      this.createRegionLabel(width * 0.84, height * 0.84, "破碎低地")
    ];
  }

  private createObstacle(layout: ObstacleLayout): Phaser.GameObjects.Container {
    const container = this.add.container(layout.x, layout.y);
    container.setRotation(layout.rotation ?? 0);
    const assetKey = layout.kind === "barricade" ? "crate" : layout.kind;
    const img = this.add.image(0, 0, assetKey);
    img.setDisplaySize(layout.width, layout.height);
    container.add(img);
    return container;
  }

  private createRegionLabel(x: number, y: number, text: string): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, text, { 
      fontFamily: "monospace", 
      fontSize: "22px", 
      fontStyle: "bold",
      color: "#f1f5f9", 
      stroke: "#0f172a", 
      strokeThickness: 8
    });
    label.setOrigin(0.5).setAlpha(0.4).setDepth(-11);
    return label;
  }

  private createExtractBeacon(x: number, y: number): Phaser.GameObjects.Container {
    const beacon = this.add.container(x, y - 8);
    beacon.setDepth(-4);
    const glow = this.add.circle(0, -12, 32, 0x67e8f9, 0.12);
    const img = this.add.image(0, 0, "beacon");
    img.setDisplaySize(64, 64);
    beacon.add([glow, img]);
    return beacon;
  }

  private tickExtractBeacon(time: number): void {
    if (!this.extractBeacon) return;
    const glow = this.extractBeacon.list[0] as Phaser.GameObjects.Arc;
    if (glow) glow.setScale(1 + Math.sin(time / 360) * 0.05);
  }

  private createAtmosphere(): void {
    const { width, height } = this.scale;
    this.atmosphericOverlay = this.add.graphics();
    this.atmosphericOverlay.setDepth(1000).setScrollFactor(0);
    this.atmosphericOverlay.fillStyle(0x040814, 0.45).fillRect(0, 0, width, height);
    this.atmosphericOverlay.fillStyle(0x000000, 0.3).fillRect(0, 0, width, 120);
    this.atmosphericOverlay.fillRect(0, height - 120, width, 120);
  }

  private syncPlayers(state: MatchViewState): void {
    for (const player of state.players) {
      const existing = this.playerMarkers.get(player.id);
      if (existing) existing.sync(player, player.id === state.selfPlayerId);
      else this.playerMarkers.set(player.id, new PlayerMarker(this, player, player.id === state.selfPlayerId));
    }
  }

  private syncMonsters(state: MatchViewState): void {
    for (const monster of state.monsters) {
      const existing = this.monsterMarkers.get(monster.id);
      if (existing) {
        const wasAlive = existing.isAlive;
        existing.sync(monster);
        if (wasAlive && !monster.isAlive) this.shakeCamera(0.012, 200);
      } else this.monsterMarkers.set(monster.id, new MonsterMarker(this, monster));
    }
  }

  private syncDrops(state: MatchViewState): void {
    const currentIds = new Set<string>();
    for (const drop of state.drops) {
      currentIds.add(drop.id);
      if (!this.dropMarkers.has(drop.id)) {
        this.dropMarkers.set(drop.id, new DropMarker(this, drop));
      }
    }
    for (const [id, marker] of this.dropMarkers.entries()) {
      if (!currentIds.has(id)) {
        marker.destroy();
        this.dropMarkers.delete(id);
      }
    }
  }

  private syncHud(state: MatchViewState): void {
    const selfPlayer = state.players.find((player) => player.id === state.selfPlayerId);
    
    // Update HP Bar
    if (this.hpBar && selfPlayer) {
      const { fill, label } = this.hpBar;
      const hpRatio = Phaser.Math.Clamp(selfPlayer.maxHp > 0 ? selfPlayer.hp / selfPlayer.maxHp : 0, 0, 1);
      
      fill.clear();
      // HP Fill color: Green to Red
      let color = 0x22c55e;
      if (hpRatio < 0.3) color = 0xef4444;
      else if (hpRatio < 0.6) color = 0xeab308;
      
      fill.fillStyle(color, 1);
      fill.fillRect(22, 22, (240 - 4) * hpRatio, 20);
      
      label.setText(`HP: ${selfPlayer.hp} / ${selfPlayer.maxHp}`);
    } else if (this.hpBar) {
      this.hpBar.label.setText("正在部署角色...");
    }

    // Update Timer
    if (this.timerText) {
      const timerLabel = state.secondsRemaining == null ? "--:--" : formatSeconds(state.secondsRemaining);
      this.timerText.setText(timerLabel);
      // Pulse color if time is low
      if (state.secondsRemaining !== null && state.secondsRemaining < 60) {
        this.timerText.setColor("#ef4444");
      } else {
        this.timerText.setColor("#fbbf24");
      }
    }

    // Update Room Code
    if (this.roomCodeText) {
      this.roomCodeText.setText(`终端ID: ${state.code || "------"}`);
    }

    // Update Combat Text
    if (this.combatText) {
      const msg = state.lastCombatText || "向中心广场推进，搜刮战利品，然后撤离。";
      this.combatText.setText(msg);
    }
  }

  private initHud(): void {
    const { width, height } = this.scale;
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);

    // HP Bar (Top Left)
    const hpX = 20;
    const hpY = 20;
    const hpWidth = 240;
    const hpHeight = 24;
    
    const hpTrack = this.add.graphics();
    hpTrack.fillStyle(0x0f172a, 0.8);
    hpTrack.lineStyle(2, 0x334155, 1);
    hpTrack.fillRect(hpX, hpY, hpWidth, hpHeight);
    hpTrack.strokeRect(hpX, hpY, hpWidth, hpHeight);
    
    const hpFill = this.add.graphics();
    
    const hpLabel = this.add.text(hpX + 8, hpY + 4, "HP: -- / --", {
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#f8fafc",
      stroke: "#000",
      strokeThickness: 2
    });

    this.hpBar = { track: hpTrack, fill: hpFill, label: hpLabel };
    this.hudContainer.add([hpTrack, hpFill, hpLabel]);

    // Timer & Room Code (Top Right)
    this.timerText = this.add.text(width - 20, 20, "00:00", {
      fontFamily: "monospace",
      fontSize: "24px",
      fontStyle: "bold",
      color: "#fbbf24",
      stroke: "#451a03",
      strokeThickness: 4
    }).setOrigin(1, 0);

    this.roomCodeText = this.add.text(width - 20, 50, "CODE: ------", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#94a3b8"
    }).setOrigin(1, 0);

    this.hudContainer.add([this.timerText, this.roomCodeText]);

    // Combat Info (Bottom Center)
    this.combatText = this.add.text(width / 2, height - 80, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#fef3c7",
      align: "center",
      stroke: "#78350f",
      strokeThickness: 3,
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5, 1);
    
    this.hudContainer.add(this.combatText);

    // Controls Hint (Bottom Right)
    const isTouch = navigator.maxTouchPoints > 0;
    const hintText = isTouch ? "虚拟摇杆 移动 | A 攻击 | B 技能 | C 拾取 | D 撤离" : "WASD 移动 | 空格 攻击 | Q 技能 | E 拾取 | F 撤离";

    this.controlsHint = this.add.text(width - 20, height - 20, hintText, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#64748b",
      backgroundColor: "rgba(15, 23, 42, 0.6)",
      padding: { x: 8, y: 4 }
    }).setOrigin(1, 1);
    
    this.hudContainer.add(this.controlsHint);
  }

  private showTutorial(): void {
    const panelWidth = 280;
    const panelHeight = 180;
    const x = 20;
    const y = 80; // Below HP bar

    this.tutorialPanel = this.add.container(x, y).setScrollFactor(0).setDepth(300);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f172a, 0.9);
    bg.fillRect(0, 0, panelWidth, panelHeight);
    bg.lineStyle(3, 0x38bdf8, 1);
    bg.strokeRect(0, 0, panelWidth, panelHeight);

    const title = this.add.text(10, 10, "任务目标", {
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#38bdf8"
    });

    const isTouch = navigator.maxTouchPoints > 0;
    const moveHint = isTouch ? "● 移动: 虚拟摇杆" : "● 移动: WASD";
    const actionHint = isTouch ? "● 攻击: A | 技能: B\n● 交互: C | 撤离: D" : "● 攻击: 空格 | 技能: Q\n● 交互: E | 撤离: F";

    const content = this.add.text(10, 40, 
      moveHint + "\n" +
      actionHint + "\n\n" +
      "目标: 击杀怪物, 收集战利品\n前往中心区域撤离。", {
      fontFamily: "monospace",
      fontSize: "13px",
      lineSpacing: 6,
      color: "#f8fafc"
    });

    const footer = this.add.text(panelWidth - 10, panelHeight - 10, "按任意键或点击关闭", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#94a3b8"
    }).setOrigin(1, 1);

    this.tutorialPanel.add([bg, title, content, footer]);

    const dismiss = () => {
      if (!this.tutorialPanel) return;
      this.tweens.add({
        targets: this.tutorialPanel,
        alpha: 0,
        x: x - 20,
        duration: 400,
        onComplete: () => {
          this.tutorialPanel?.destroy();
          this.tutorialPanel = undefined;
        }
      });
      this.input.off("pointerdown", dismiss);
      this.input.keyboard?.off("keydown", dismiss);
    };

    this.input.on("pointerdown", dismiss);
    this.input.keyboard?.once("keydown", dismiss);
    this.time.delayedCall(10000, dismiss);
  }
}

function resolvePrimarySkill(state: MatchViewState | null): SkillId | null {
  const self = state?.players.find((p) => p.id === state.selfPlayerId);
  if (self?.weaponType === "sword") return "sword_dashSlash";
  return null;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`;
}

function getObstacleLayouts(w: number, h: number): ObstacleLayout[] {
  return [
    { x: w * 0.18, y: h * 0.16, width: 64, height: 64, kind: "brush" },
    { x: w * 0.82, y: h * 0.15, width: 96, height: 96, kind: "rock" },
    { x: w * 0.18, y: h * 0.84, width: 64, height: 64, kind: "crate" },
    { x: w * 0.84, y: h * 0.84, width: 64, height: 64, kind: "barricade" }
  ];
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import Phaser from "phaser";
import { DropMarker } from "../game/entities/DropMarker";
import { MonsterMarker } from "../game/entities/MonsterMarker";
import { PlayerMarker } from "../game/entities/PlayerMarker";
import {
  createKeyboardControls
} from "../input/keyboardControls";
import {
  createMobileControls
} from "../input/mobileControls";
import { Minimap } from "../ui/Minimap";
import { drawPanelFrame, GAMEPLAY_THEME } from "../ui/gameplayTheme";
const _GameScene = class _GameScene extends Phaser.Scene {
  constructor() {
    super(_GameScene.KEY);
    __publicField(this, "runtime");
    __publicField(this, "unsubscribeRuntime", null);
    __publicField(this, "playerMarkers", /* @__PURE__ */ new Map());
    __publicField(this, "monsterMarkers", /* @__PURE__ */ new Map());
    __publicField(this, "dropMarkers", /* @__PURE__ */ new Map());
    __publicField(this, "chestSprites", /* @__PURE__ */ new Map());
    __publicField(this, "chestLabels", /* @__PURE__ */ new Map());
    __publicField(this, "terrainLayer");
    __publicField(this, "detailLayer");
    __publicField(this, "obstacleLayer");
    __publicField(this, "worldFrame");
    __publicField(this, "extractOuterRing");
    __publicField(this, "extractInnerRing");
    __publicField(this, "extractBeacon");
    __publicField(this, "extractLabel");
    __publicField(this, "extractPulseTween");
    __publicField(this, "hudContainer");
    __publicField(this, "minimap");
    __publicField(this, "hpBar");
    __publicField(this, "timerText");
    __publicField(this, "roomCodeText");
    __publicField(this, "weaponNameText");
    __publicField(this, "combatText");
    __publicField(this, "controlsHint");
    __publicField(this, "regionLabels", []);
    __publicField(this, "latestState", null);
    __publicField(this, "worldSignature", "");
    __publicField(this, "extractState", {
      isOpen: false,
      isExtracting: false,
      progress: null,
      secondsRemaining: null,
      message: "\u64A4\u79BB\u70B9\u5C06\u5728\u540E\u671F\u5F00\u542F\u3002",
      didSucceed: false
    });
    __publicField(this, "keyboardControls");
    __publicField(this, "onMoveInput");
    __publicField(this, "onAttack");
    __publicField(this, "onSkill");
    __publicField(this, "onPickup");
    __publicField(this, "onStartExtract");
    __publicField(this, "onCombatResult");
    __publicField(this, "onPlayerAttack");
    __publicField(this, "onOpenChest");
    __publicField(this, "onToggleInventory");
    __publicField(this, "subscribeChestsInit");
    __publicField(this, "subscribeChestOpened");
    __publicField(this, "chestUnsubscribes", []);
    __publicField(this, "interactionPrompt");
    __publicField(this, "lastMoveDirection", { x: 0, y: 0 });
    __publicField(this, "lastFacingDirection", { x: 0, y: 1 });
    __publicField(this, "lastMoveSentAt", 0);
    __publicField(this, "extractAutoStarted", false);
    __publicField(this, "currentMoveDirection", { x: 0, y: 0 });
    __publicField(this, "mobileControls");
    __publicField(this, "joystickVector", { x: 0, y: 0 });
    __publicField(this, "joystickContainer");
    __publicField(this, "joystickKnobEl");
    __publicField(this, "joystickTouchId", null);
    __publicField(this, "joystickBaseCenter", { x: 0, y: 0 });
    __publicField(this, "mobileOverlay");
    __publicField(this, "domTouchStart");
    __publicField(this, "domTouchMove");
    __publicField(this, "domTouchEnd");
  }
  preload() {
    const pCanvas = document.createElement("canvas");
    pCanvas.width = 192;
    pCanvas.height = 192;
    const pCtx = pCanvas.getContext("2d");
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 48 + 24;
        const y = row * 48 + 24;
        let leftLegY = 12;
        let rightLegY = 12;
        if (col === 1) leftLegY += 3;
        if (col === 3) rightLegY += 3;
        pCtx.fillStyle = "#1e293b";
        pCtx.fillRect(x - 6, y + leftLegY, 4, 8);
        pCtx.fillRect(x + 2, y + rightLegY, 4, 8);
        pCtx.fillStyle = "#2563eb";
        pCtx.fillRect(x - 6, y - 4, 12, 16);
        pCtx.fillStyle = "#ffdbac";
        pCtx.fillRect(x - 5, y - 14, 10, 10);
        pCtx.fillStyle = "#000000";
        if (row === 0) {
          pCtx.fillRect(x - 3, y - 10, 2, 2);
          pCtx.fillRect(x + 1, y - 10, 2, 2);
        } else if (row === 1) {
          pCtx.fillRect(x - 5, y - 10, 2, 2);
        } else if (row === 2) {
          pCtx.fillRect(x + 3, y - 10, 2, 2);
        }
      }
    }
    this.textures.addSpriteSheet("player", pCanvas, { frameWidth: 48, frameHeight: 48 });
    const mCanvas = document.createElement("canvas");
    mCanvas.width = 128;
    mCanvas.height = 32;
    const mCtx = mCanvas.getContext("2d");
    for (let f = 0; f < 4; f++) {
      const x = f * 32 + 16;
      const y = 16;
      mCtx.fillStyle = "#f43f5e";
      mCtx.beginPath();
      mCtx.arc(x, y, 10, 0, Math.PI * 2);
      mCtx.fill();
      mCtx.fillStyle = "#000000";
      mCtx.fillRect(x - 4, y - 2, 2, 2);
      mCtx.fillRect(x + 2, y - 2, 2, 2);
    }
    this.textures.addSpriteSheet("monster", mCanvas, { frameWidth: 32, frameHeight: 32 });
    const eCanvas = document.createElement("canvas");
    eCanvas.width = 64;
    eCanvas.height = 64;
    const eCtx = eCanvas.getContext("2d");
    eCtx.fillStyle = "#7e22ce";
    eCtx.beginPath();
    eCtx.moveTo(32, 8);
    eCtx.lineTo(56, 32);
    eCtx.lineTo(32, 56);
    eCtx.lineTo(8, 32);
    eCtx.closePath();
    eCtx.fill();
    this.textures.addCanvas("elite", eCanvas);
    const dCanvas = document.createElement("canvas");
    dCanvas.width = 16;
    dCanvas.height = 16;
    const dCtx = dCanvas.getContext("2d");
    dCtx.fillStyle = "#facc15";
    dCtx.fillRect(2, 2, 12, 12);
    this.textures.addCanvas("drop", dCanvas);
    const gCanvas = document.createElement("canvas");
    gCanvas.width = 64;
    gCanvas.height = 64;
    const gCtx = gCanvas.getContext("2d");
    gCtx.fillStyle = "#4a7c3f";
    gCtx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 1) {
      gCtx.fillStyle = Math.random() > 0.5 ? "#3d6b34" : "#5a9e50";
      gCtx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 2, 2);
    }
    this.textures.addCanvas("ground_pixel", gCanvas);
    const crateCanvas = document.createElement("canvas");
    crateCanvas.width = 48;
    crateCanvas.height = 48;
    const crateCtx = crateCanvas.getContext("2d");
    crateCtx.fillStyle = "#8B6914";
    crateCtx.fillRect(2, 2, 44, 44);
    this.textures.addCanvas("crate", crateCanvas);
    const rockCanvas = document.createElement("canvas");
    rockCanvas.width = 48;
    rockCanvas.height = 48;
    const rockCtx = rockCanvas.getContext("2d");
    rockCtx.fillStyle = "#71717a";
    rockCtx.beginPath();
    rockCtx.arc(24, 24, 20, 0, Math.PI * 2);
    rockCtx.fill();
    this.textures.addCanvas("rock", rockCanvas);
    const brushCanvas = document.createElement("canvas");
    brushCanvas.width = 48;
    brushCanvas.height = 48;
    const brushCtx = brushCanvas.getContext("2d");
    brushCtx.fillStyle = "#166534";
    brushCtx.beginPath();
    brushCtx.arc(24, 24, 20, 0, Math.PI * 2);
    brushCtx.fill();
    this.textures.addCanvas("brush", brushCanvas);
    const bCanvas = document.createElement("canvas");
    bCanvas.width = 64;
    bCanvas.height = 64;
    const bCtx = bCanvas.getContext("2d");
    bCtx.fillStyle = "#2dd4bf";
    bCtx.fillRect(16, 16, 32, 32);
    this.textures.addCanvas("beacon", bCanvas);
    const ccCanvas = document.createElement("canvas");
    ccCanvas.width = 32;
    ccCanvas.height = 32;
    const ccCtx = ccCanvas.getContext("2d");
    ccCtx.fillStyle = "#8B4513";
    ccCtx.fillRect(2, 8, 28, 22);
    this.textures.addCanvas("chest_closed", ccCanvas);
    const coCanvas = document.createElement("canvas");
    coCanvas.width = 32;
    coCanvas.height = 32;
    const coCtx = coCanvas.getContext("2d");
    coCtx.fillStyle = "#8B4513";
    coCtx.fillRect(2, 12, 28, 18);
    this.textures.addCanvas("chest_open", coCanvas);
  }
  init(data) {
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
  handleServerPlayerAttack(payload) {
    const player = this.latestState?.players.find((p) => p.id === payload.playerId);
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
    if (payload.playerId === this.latestState?.selfPlayerId) this.shakeCamera(5e-3, 100);
  }
  handleCombatResult(payload) {
    const target = this.playerMarkers.get(payload.targetId) || this.monsterMarkers.get(payload.targetId);
    if (!target) return;
    const color = payload.isCritical ? "#fbbf24" : "#ef4444";
    const text = this.add.text(target.root.x, target.root.y - 30, `-${payload.amount}`, {
      fontFamily: "monospace",
      fontSize: payload.isCritical ? "24px" : "18px",
      fontStyle: "bold",
      color,
      stroke: "#000000",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(3e3);
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
  showMonsterAttackVfx(mx, my, tx, ty, depth) {
    const danger = this.add.graphics();
    danger.lineStyle(4, 16711680, 1);
    danger.strokeCircle(0, 0, 24);
    danger.fillStyle(16711680, 0.25);
    danger.fillCircle(0, 0, 24);
    danger.setPosition(mx, my).setDepth(depth + 5);
    this.tweens.add({ targets: danger, alpha: 0, scale: 1.6, duration: 280, onComplete: () => danger.destroy() });
  }
  create() {
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
  initChests() {
    this.subscribeChestsInit?.((chests) => {
      chests.forEach((chest) => {
        if (!this.chestSprites.has(chest.id)) {
          const sprite = this.add.image(chest.x, chest.y, chest.isOpen ? "chest_open" : "chest_closed").setDepth(chest.y);
          this.chestSprites.set(chest.id, sprite);
          if (!chest.isOpen) {
            const label = this.add.text(chest.x, chest.y - 30, "\u5B9D\u7BB1", { fontFamily: "monospace", fontSize: "14px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 }).setOrigin(0.5).setDepth(chest.y + 1);
            this.chestLabels.set(chest.id, label);
          }
        }
      });
    });
    this.subscribeChestOpened?.((p) => {
      const s = this.chestSprites.get(p.chestId);
      if (s) {
        s.setTexture("chest_open");
        this.chestLabels.get(p.chestId)?.destroy();
        this.chestLabels.delete(p.chestId);
      }
    });
    this.interactionPrompt = this.add.text(0, 0, "\u6309 E \u5F00\u7BB1", { fontFamily: "monospace", fontSize: "16px", color: "#facc15", stroke: "#000000", strokeThickness: 4 }).setOrigin(0.5).setDepth(4e3).setVisible(false);
  }
  initTouchControls() {
    if (navigator.maxTouchPoints <= 0) return;
    this.mobileControls?.destroy();
    this.mobileControls = createMobileControls({
      root: document.body,
      speedScale: _GameScene.MOBILE_SPEED_SCALE,
      onMove: (vector) => {
        this.joystickVector = vector;
      },
      onAttack: () => this.handleAttack(),
      onSkill: () => this.handleSkill(),
      onPickup: () => this.handleInteract(),
      onInventory: () => this.handleToggleInventory()
    });
  }
  handleAttack() {
    this.onAttack?.();
  }
  handleSkill() {
    const sid = resolvePrimarySkill(this.latestState);
    if (sid) {
      this.onSkill?.(sid);
      this.shakeCamera(8e-3, 150);
      const p = this.latestState?.players.find((pp) => pp.id === this.latestState?.selfPlayerId);
      if (p) this.createSkillVfx(p.x, p.y, 3718648);
    }
  }
  handleInteract() {
    if (this.interactionPrompt?.visible) {
      const id = this.interactionPrompt.getData("chestId");
      if (id) this.onOpenChest?.(id);
    } else this.onPickup?.();
  }
  handleToggleInventory() {
    this.onToggleInventory?.();
  }
  createWeaponVfx(x, y, type, dir) {
    const angle = Math.atan2(dir.y, dir.x);
    const g = this.add.graphics().setPosition(x, y).setDepth(y + 100);
    if (type === "sword") {
      g.lineStyle(3, 14870768).beginPath().moveTo(0, 0).lineTo(Math.cos(angle) * 80, Math.sin(angle) * 80).strokePath();
    } else if (type === "blade") {
      [angle - 0.5, angle, angle + 0.5].forEach((a) => {
        g.lineStyle(3, 16347926).beginPath().moveTo(0, 0).lineTo(Math.cos(a) * 60, Math.sin(a) * 60).strokePath();
      });
    } else {
      g.lineStyle(4, 15680580).strokeCircle(0, 0, 40);
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }
  createSkillVfx(x, y, color) {
    const r = this.add.graphics().lineStyle(4, color).strokeCircle(0, 0, 30).setPosition(x, y).setDepth(y + 100);
    this.tweens.add({ targets: r, alpha: 0, scale: 2, duration: 350, onComplete: () => r.destroy() });
  }
  update(time, delta) {
    const alpha = Phaser.Math.Clamp(delta / 120, 0.08, 0.22);
    for (const m of this.playerMarkers.values()) {
      m.step(alpha);
      m.root.setDepth(m.root.y);
    }
    for (const m of this.monsterMarkers.values()) {
      m.step(alpha);
      m.root.setDepth(m.root.y);
    }
    for (const m of this.dropMarkers.values()) {
      m.root.setDepth(m.root.y);
    }
    this.emitMoveInput(time);
    this.emitActionInput();
    this.updateChests();
    this.tickExtractBeacon(time);
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
            this.onStartExtract?.();
            this.extractAutoStarted = true;
          } else if (dist > (this.extractState.radius ?? 96)) this.extractAutoStarted = false;
        }
      }
    }
  }
  updateChests() {
    const sid = this.latestState?.selfPlayerId;
    const sm = sid ? this.playerMarkers.get(sid) : null;
    if (!sm || !this.interactionPrompt) return;
    let nearest = null;
    let minDist = 80;
    for (const [id, s] of this.chestSprites.entries()) {
      if (s.texture.key === "chest_closed") {
        const d = Phaser.Math.Distance.Between(sm.root.x, sm.root.y, s.x, s.y);
        if (d < minDist) {
          minDist = d;
          nearest = id;
        }
      }
    }
    if (nearest) {
      const c = this.chestSprites.get(nearest);
      this.interactionPrompt.setPosition(c.x, c.y - 50).setVisible(true).setData("chestId", nearest);
    } else this.interactionPrompt.setVisible(false);
  }
  setExtractState(s) {
    this.extractState = s;
    if (this.latestState) {
      this.syncHud(this.latestState);
      this.syncWorld(this.latestState);
    }
  }
  shutdown() {
    this.unsubscribeRuntime?.();
    this.chestUnsubscribes.forEach((u) => u());
    this.keyboardControls?.destroy();
    this.keyboardControls = void 0;
    this.mobileControls?.destroy();
    this.mobileControls = void 0;
    this.minimap?.destroy();
    this.minimap = void 0;
    this.joystickVector = { x: 0, y: 0 };
  }
  emitMoveInput(time) {
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
    let dir = { x: h, y: v };
    const isJoystickActive = this.joystickVector.x !== 0 || this.joystickVector.y !== 0;
    if (isJoystickActive) {
      dir = { x: this.joystickVector.x, y: this.joystickVector.y };
    }
    this.currentMoveDirection = dir;
    const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (mag > 0) {
      this.lastFacingDirection = { x: dir.x / mag, y: dir.y / mag };
    }
    if (Math.abs(dir.x - this.lastMoveDirection.x) < 0.01 && Math.abs(dir.y - this.lastMoveDirection.y) < 0.01 && time - this.lastMoveSentAt < 60) {
      return;
    }
    this.lastMoveDirection = dir;
    this.lastMoveSentAt = time;
    this.onMoveInput?.(dir);
  }
  emitActionInput() {
    this.keyboardControls?.consumeActions({
      onAttack: () => this.handleAttack(),
      onSkill: () => this.handleSkill(),
      onPickup: () => this.handleInteract(),
      onExtract: () => this.onStartExtract?.(),
      onInventory: () => this.handleToggleInventory()
    });
  }
  syncWorldLegacy(state) {
    this.minimap?.syncWorldBounds(state.width, state.height);
    const centerX = state.width / 2;
    const centerY = state.height / 2;
    if (!this.terrainLayer) {
      this.terrainLayer = this.add.tileSprite(centerX, centerY, state.width, state.height, "ground_pixel").setDepth(-40);
      this.add.text(centerX, centerY + 112, "\u64A4\u79BB\u70B9", { fontFamily: "monospace", fontSize: "20px", color: "#f8fafc" }).setOrigin(0.5).setDepth(-4);
    }
    if (!this.extractLabel) {
      this.extractLabel = this.add.text(centerX, centerY + 140, "", { fontFamily: "monospace", fontSize: "16px", color: "#2dd4bf" }).setOrigin(0.5).setDepth(-4);
    }
    this.extractLabel.setText(this.extractState.isOpen ? "\u64A4\u79BB\u70B9\u5DF2\u5F00\u542F" : "\u64A4\u79BB\u70B9\u672A\u5F00\u542F");
  }
  syncWorld(state) {
    this.minimap?.syncWorldBounds(state.width, state.height);
    const nextSignature = `${state.width}x${state.height}`;
    if (this.worldSignature !== nextSignature) {
      this.buildWorldBackdrop(state);
      this.worldSignature = nextSignature;
    }
    const centerX = state.width / 2;
    const centerY = state.height / 2;
    if (this.extractOuterRing) {
      this.extractOuterRing.setPosition(centerX, centerY);
    } else {
      this.extractOuterRing = this.add.circle(centerX, centerY, 126, GAMEPLAY_THEME.colors.signal, 0.1);
      this.extractOuterRing.setStrokeStyle(10, GAMEPLAY_THEME.colors.accent, 0.32).setDepth(-6);
    }
    if (this.extractInnerRing) {
      this.extractInnerRing.setPosition(centerX, centerY);
    } else {
      this.extractInnerRing = this.add.circle(centerX, centerY, 82, GAMEPLAY_THEME.colors.signal, 0.08);
      this.extractInnerRing.setStrokeStyle(4, GAMEPLAY_THEME.colors.bone, 0.2).setDepth(-5);
    }
    if (!this.extractBeacon) {
      this.extractBeacon = this.createExtractBeacon(centerX, centerY);
    } else {
      this.extractBeacon.setPosition(centerX, centerY - 8);
    }
    if (!this.extractLabel) {
      this.extractLabel = this.add.text(centerX, centerY + 112, "\u64A4\u79BB\u70B9", {
        fontFamily: GAMEPLAY_THEME.fonts.display,
        fontSize: "20px",
        color: "#e8dfc8",
        stroke: "#16130f",
        strokeThickness: 6
      });
      this.extractLabel.setOrigin(0.5).setDepth(-4);
    }
    this.extractLabel.setText(this.extractState.isOpen ? "\u64A4\u79BB\u70B9\u5DF2\u5F00\u542F" : "\u64A4\u79BB\u70B9\u672A\u5F00\u542F");
  }
  buildWorldBackdrop(state) {
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
    this.detailLayer.fillStyle(4937059, 0.28);
    this.detailLayer.fillCircle(centerX, centerY, 160);
    this.detailLayer.lineStyle(6, 2042167, 0.72);
    this.detailLayer.strokeCircle(centerX, centerY, 160);
    for (let i = 0; i < 26; i += 1) {
      const px = Math.random() * width;
      const py = Math.random() * height;
      const patchWidth = Phaser.Math.Between(72, 132);
      const patchHeight = Phaser.Math.Between(42, 84);
      this.detailLayer.fillStyle(12886874, 0.12);
      this.detailLayer.fillEllipse(px, py, patchWidth, patchHeight);
    }
    this.obstacleLayer = this.add.container(0, 0);
    this.obstacleLayer.setDepth(-12);
    for (const obstacle of getObstacleLayouts(width, height)) {
      this.obstacleLayer.add(this.createObstacle(obstacle));
    }
    const worldFrame = this.add.graphics();
    worldFrame.setDepth(-15);
    worldFrame.lineStyle(16, 1120295, 1);
    worldFrame.strokeRect(0, 0, width, height);
    worldFrame.lineStyle(4, 3621201, 1);
    worldFrame.strokeRect(8, 8, width - 16, height - 16);
    this.worldFrame = worldFrame;
    this.regionLabels = [
      this.createRegionLabel(width * 0.18, height * 0.16, "\u62FE\u8352\u8005\u5C71\u810A"),
      this.createRegionLabel(width * 0.82, height * 0.15, "\u6DF9\u6CA1\u4E4B\u5730"),
      this.createRegionLabel(centerX, centerY - 182, "\u4E2D\u592E\u4E2D\u7EE7\u7AD9"),
      this.createRegionLabel(width * 0.18, height * 0.84, "\u8D27\u8FD0\u5806\u573A"),
      this.createRegionLabel(width * 0.84, height * 0.84, "\u7834\u788E\u4F4E\u5730")
    ];
  }
  createObstacle(layout) {
    const container = this.add.container(layout.x, layout.y);
    container.setRotation(layout.rotation ?? 0);
    const assetKey = layout.kind === "barricade" ? "crate" : layout.kind;
    const img = this.add.image(0, 0, assetKey);
    img.setDisplaySize(layout.width, layout.height);
    container.add(img);
    return container;
  }
  createRegionLabel(x, y, text) {
    const label = this.add.text(x, y, text, {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "22px",
      color: "#e8dfc8",
      stroke: "#16130f",
      strokeThickness: 8
    });
    label.setOrigin(0.5).setAlpha(0.34).setDepth(-11);
    return label;
  }
  createExtractBeacon(x, y) {
    const beacon = this.add.container(x, y - 8);
    beacon.setDepth(-4);
    const glow = this.add.circle(0, -12, 32, GAMEPLAY_THEME.colors.accent, 0.12);
    const img = this.add.image(0, 0, "beacon");
    img.setDisplaySize(64, 64);
    beacon.add([glow, img]);
    return beacon;
  }
  syncPlayers(state) {
    state.players.forEach((p) => {
      const m = this.playerMarkers.get(p.id);
      if (m) m.sync(p, p.id === state.selfPlayerId);
      else this.playerMarkers.set(p.id, new PlayerMarker(this, p, p.id === state.selfPlayerId));
    });
  }
  syncMonsters(state) {
    const currentIds = /* @__PURE__ */ new Set();
    for (const monster of state.monsters) {
      currentIds.add(monster.id);
      const existing = this.monsterMarkers.get(monster.id);
      if (existing) {
        existing.sync(monster);
      } else {
        this.monsterMarkers.set(monster.id, new MonsterMarker(this, monster));
      }
    }
    for (const [id, marker] of this.monsterMarkers.entries()) {
      if (!currentIds.has(id)) {
        marker.destroy();
        this.monsterMarkers.delete(id);
      }
    }
  }
  syncDrops(state) {
    const ids = new Set(state.drops.map((d) => d.id));
    state.drops.forEach((d) => {
      if (!this.dropMarkers.has(d.id)) this.dropMarkers.set(d.id, new DropMarker(this, d));
    });
    for (const [id, m] of this.dropMarkers.entries()) if (!ids.has(id)) {
      m.destroy();
      this.dropMarkers.delete(id);
    }
  }
  syncHudLegacy(state) {
    const p = state.players.find((pp) => pp.id === state.selfPlayerId);
    if (this.hpBar && p) {
      const hpRatio = Phaser.Math.Clamp(p.maxHp > 0 ? p.hp / p.maxHp : 0, 0, 1);
      this.hpBar.track.clear();
      this.hpBar.track.fillStyle(1183243, 0.84);
      this.hpBar.track.fillRoundedRect(20, 18, 272, 44, 10);
      this.hpBar.track.lineStyle(2, 5063472, 1);
      this.hpBar.track.strokeRoundedRect(20, 18, 272, 44, 10);
      this.hpBar.track.lineStyle(1, 15228972, 0.16);
      this.hpBar.track.strokeRoundedRect(26, 24, 260, 32, 8);
      this.hpBar.fill.clear();
      this.hpBar.fill.fillStyle(2827545, 1);
      this.hpBar.fill.fillRoundedRect(30, 34, 208, 10, 5);
      let color = 8364362;
      if (hpRatio < 0.3) color = 12072735;
      else if (hpRatio < 0.6) color = 13939276;
      this.hpBar.fill.fillStyle(color, 1);
      this.hpBar.fill.fillRoundedRect(30, 34, 208 * hpRatio, 10, 5);
      this.hpBar.label.setText(`\u751F\u547D\u503C ${p.hp} / ${p.maxHp}`);
    }
    if (this.timerText) this.timerText.setText(state.secondsRemaining == null ? "--:--" : formatSeconds(state.secondsRemaining));
    if (this.roomCodeText) this.roomCodeText.setText(`\u9891\u9053 ${state.code || "------"}`);
    if (this.combatText) this.combatText.setText(state.lastCombatText || "\u5411\u4E2D\u5FC3\u5E9F\u571F\u63A8\u8FDB\uFF0C\u641C\u522E\u6218\u5229\u54C1\uFF0C\u7136\u540E\u64A4\u79BB\u3002");
  }
  initHudLegacy() {
    const { width, height } = this.scale;
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const hpLabel = this.add.text(34, 24, "\u751F\u547D\u503C -- / --", {
      fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
      fontSize: "11px",
      color: "#e8dfc8",
      letterSpacing: 1
    });
    this.hpBar = { track: this.add.graphics(), fill: this.add.graphics(), label: hpLabel };
    const rightPlate = this.add.graphics();
    rightPlate.fillStyle(1183243, 0.84);
    rightPlate.fillRoundedRect(width - 220, 18, 200, 52, 10);
    rightPlate.lineStyle(2, 5063472, 1);
    rightPlate.strokeRoundedRect(width - 220, 18, 200, 52, 10);
    rightPlate.lineStyle(1, 15228972, 0.16);
    rightPlate.strokeRoundedRect(width - 214, 24, 188, 40, 8);
    this.timerText = this.add.text(width - 32, 22, "00:00", {
      fontFamily: '"Noto Serif SC", "Noto Sans SC", serif',
      fontSize: "24px",
      color: "#d4b24c"
    }).setOrigin(1, 0);
    this.roomCodeText = this.add.text(width - 32, 49, "\u9891\u9053 ------", {
      fontFamily: '"JetBrains Mono", "Noto Sans SC", monospace',
      fontSize: "10px",
      color: "#b8ae96",
      letterSpacing: 1
    }).setOrigin(1, 0);
    const combatPlate = this.add.graphics();
    combatPlate.fillStyle(1183243, 0.84);
    combatPlate.fillRoundedRect(width / 2 - 260, height - 86, 520, 42, 10);
    combatPlate.lineStyle(1, 5063472, 1);
    combatPlate.strokeRoundedRect(width / 2 - 260, height - 86, 520, 42, 10);
    this.combatText = this.add.text(width / 2, height - 55, "", {
      fontFamily: '"Noto Sans SC", "Inter Tight", sans-serif',
      fontSize: "15px",
      color: "#e8dfc8",
      align: "center"
    }).setOrigin(0.5, 1);
    const hintText = navigator.maxTouchPoints > 0 ? "\u6447\u6746\u79FB\u52A8 | \u653B \u8FDB\u653B | \u6280 \u6280\u80FD | \u5305 \u80CC\u56CA" : "WASD \u79FB\u52A8 | \u7A7A\u683C \u8FDB\u653B | Q \u6280\u80FD | E \u4EA4\u4E92 | I \u80CC\u56CA";
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
  syncHud(state) {
    const player = state.players.find((candidate) => candidate.id === state.selfPlayerId);
    if (this.hpBar && player) {
      const hpRatio = Phaser.Math.Clamp(player.maxHp > 0 ? player.hp / player.maxHp : 0, 0, 1);
      drawPanelFrame(this.hpBar.track, 20, 18, 272, 44, 10);
      this.hpBar.fill.clear();
      this.hpBar.fill.fillStyle(GAMEPLAY_THEME.colors.iron600, 1);
      this.hpBar.fill.fillRoundedRect(30, 34, 208, 10, 5);
      let color = GAMEPLAY_THEME.colors.confirm;
      if (hpRatio < 0.3) color = GAMEPLAY_THEME.colors.danger;
      else if (hpRatio < 0.6) color = GAMEPLAY_THEME.colors.caution;
      this.hpBar.fill.fillStyle(color, 1);
      this.hpBar.fill.fillRoundedRect(30, 34, 208 * hpRatio, 10, 5);
      this.hpBar.label.setText(`\u751F\u547D\u503C ${player.hp} / ${player.maxHp}`);
    }
    if (this.timerText) {
      this.timerText.setText(state.secondsRemaining == null ? "--:--" : formatSeconds(state.secondsRemaining));
    }
    if (this.roomCodeText) {
      this.roomCodeText.setText(`\u9891\u9053 ${state.code || "------"}`);
    }
    if (this.combatText) {
      this.combatText.setText(state.lastCombatText || "\u5411\u4E2D\u5FC3\u5E9F\u571F\u63A8\u8FDB\uFF0C\u641C\u522E\u6218\u5229\u54C1\uFF0C\u7136\u540E\u64A4\u79BB\u3002");
    }
  }
  initHud() {
    const { width, height } = this.scale;
    this.hudContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const hpLabel = this.add.text(34, 24, "\u751F\u547D\u503C -- / --", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "11px",
      color: "#e8dfc8",
      letterSpacing: 1
    });
    this.hpBar = { track: this.add.graphics(), fill: this.add.graphics(), label: hpLabel };
    const rightPlate = this.add.graphics();
    drawPanelFrame(rightPlate, width - 220, 18, 200, 52, 10);
    this.timerText = this.add.text(width - 32, 22, "00:00", {
      fontFamily: GAMEPLAY_THEME.fonts.display,
      fontSize: "24px",
      color: "#d4b24c"
    }).setOrigin(1, 0);
    this.roomCodeText = this.add.text(width - 32, 49, "\u9891\u9053 ------", {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#b8ae96",
      letterSpacing: 1
    }).setOrigin(1, 0);
    const combatPlate = this.add.graphics();
    drawPanelFrame(combatPlate, width / 2 - 260, height - 86, 520, 42, 10);
    this.combatText = this.add.text(width / 2, height - 55, "", {
      fontFamily: GAMEPLAY_THEME.fonts.body,
      fontSize: "15px",
      color: "#e8dfc8",
      align: "center"
    }).setOrigin(0.5, 1);
    const hintText = navigator.maxTouchPoints > 0 ? "\u6447\u6746\u79FB\u52A8 | \u653B \u653B\u51FB | \u6280 \u6280\u80FD | \u5305 \u80CC\u5305" : "WASD \u79FB\u52A8 | \u7A7A\u683C \u653B\u51FB | Q \u6280\u80FD | E \u4EA4\u4E92 | I \u80CC\u5305";
    this.controlsHint = this.add.text(width - 20, height - 20, hintText, {
      fontFamily: GAMEPLAY_THEME.fonts.mono,
      fontSize: "10px",
      color: "#7d745e",
      backgroundColor: "rgba(18, 14, 11, 0.82)",
      padding: { x: 10, y: 6 }
    }).setOrigin(1, 1);
    this.hudContainer.add([
      this.hpBar.track,
      this.hpBar.fill,
      hpLabel,
      rightPlate,
      this.timerText,
      this.roomCodeText,
      combatPlate,
      this.combatText,
      this.controlsHint
    ]);
    if (navigator.maxTouchPoints <= 0) {
      this.minimap = new Minimap({
        scene: this,
        parent: this.hudContainer,
        x: 20,
        y: 76
      });
    }
  }
  showTutorial() {
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2).setScrollFactor(0).setDepth(1e3);
    const bg = this.add.graphics().fillStyle(988970, 0.95).fillRoundedRect(-160, -120, 320, 240, 12);
    const title = this.add.text(0, -100, "\u4EFB\u52A1\u76EE\u6807", { fontFamily: "monospace", fontSize: "20px", color: "#f8fafc" }).setOrigin(0.5);
    const hint = navigator.maxTouchPoints > 0 ? "\u25CF \u79FB\u52A8: \u865A\u62DF\u6447\u6746\n\u25CF \u653B\u51FB: \u653B | \u6280\u80FD: \u6280\n\u25CF \u4EA4\u4E92: \u6361" : "\u25CF \u79FB\u52A8: WASD\n\u25CF \u653B\u51FB: \u7A7A\u683C | \u6280\u80FD: Q\n\u25CF \u4EA4\u4E92: E";
    const content = this.add.text(0, 0, hint + "\n\n\u76EE\u6807: \u51FB\u6740\u602A\u7269, \u6536\u96C6\u6218\u5229\u54C1\n\u524D\u5F80\u4E2D\u5FC3\u533A\u57DF\u64A4\u79BB\u3002", { fontFamily: "monospace", fontSize: "16px", color: "#cbd5e1", align: "center" }).setOrigin(0.5);
    const footer = this.add.text(0, 100, "\u6309\u4EFB\u610F\u952E\u6216\u70B9\u51FB\u5173\u95ED", { fontFamily: "monospace", fontSize: "12px", color: "#64748b" }).setOrigin(0.5);
    panel.add([bg, title, content, footer]);
    const close = () => {
      panel.destroy();
      this.input.keyboard?.off("keydown");
      this.input.off("pointerdown");
    };
    this.input.keyboard?.once("keydown", close);
    this.input.once("pointerdown", close);
  }
  tickExtractBeacon(time) {
    if (!this.extractBeacon) return;
    const glow = this.extractBeacon.list[0];
    glow?.setScale(1 + Math.sin(time / 360) * 0.05);
  }
  flashEffect(target) {
    if (!target) return;
    if (typeof target.setTintFill === "function" && typeof target.clearTint === "function") {
      target.setTintFill(16777215);
      this.time.delayedCall(70, () => {
        if (target.scene) target.clearTint();
      });
      return;
    }
    const originalAlpha = typeof target.alpha === "number" ? target.alpha : 1;
    if (typeof target.setAlpha === "function") {
      target.setAlpha(1);
      this.time.delayedCall(70, () => {
        if (target.scene && typeof target.setAlpha === "function") target.setAlpha(originalAlpha);
      });
    }
  }
  applyHitStop(ms) {
    const physicsWorld = this.physics?.world;
    this.anims.pauseAll();
    this.tweens.pauseAll();
    if (physicsWorld) physicsWorld.pause();
    this.time.delayedCall(ms, () => {
      this.anims.resumeAll();
      this.tweens.resumeAll();
      if (physicsWorld) physicsWorld.resume();
    });
  }
  shakeCamera(intensity, duration) {
    this.cameras.main.shake(duration, intensity);
  }
};
__publicField(_GameScene, "KEY", "GameScene");
__publicField(_GameScene, "MOBILE_SPEED_SCALE", 0.5);
let GameScene = _GameScene;
function resolvePrimarySkill(state) {
  const self = state?.players.find((p) => p.id === state.selfPlayerId);
  if (self?.weaponType === "sword") return "sword_dashSlash";
  return null;
}
function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m.toString().padStart(2, "0")}:${rs.toString().padStart(2, "0")}`;
}
function getObstacleLayouts(w, h) {
  return [{ x: w * 0.18, y: h * 0.16, width: 64, height: 64, kind: "brush" }, { x: w * 0.82, y: h * 0.15, width: 96, height: 96, kind: "rock" }, { x: w * 0.18, y: h * 0.84, width: 64, height: 64, kind: "crate" }, { x: w * 0.84, y: h * 0.84, width: 64, height: 64, kind: "barricade" }];
}
export {
  GameScene
};

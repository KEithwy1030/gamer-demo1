import type { SkillId, Vector2, WeaponType } from "@gamer/shared";
import Phaser from "phaser";
import type { AttackRequestPayload } from "@gamer/shared";
import { WEAPON_DEFINITIONS } from "@gamer/shared";
import { DropMarker } from "../game/entities/DropMarker";
import { MonsterMarker } from "../game/entities/MonsterMarker";
import { PlayerMarker, type PlayerMarkerDebugSnapshot } from "../game/entities/PlayerMarker";
import {
  MONSTER_ASSET_CONTRACTS,
  MONSTER_FACINGS,
  getMonsterDirectionalActionFrames,
  getMonsterActionFrameRate,
  getMonsterActionFrames,
  getMonsterAnimationKey,
  getMonsterTextureKey,
  hasMonsterDirectionalCoverage
} from "../game/entities/monsterVisuals";
import { MatchRuntimeStore, type MatchViewState } from "../game";
import type { ChestState } from "../network/socketClient";
import type { ExtractUiState } from "./createGameClient";
import {
  createWorldBackdropRefs,
  rebuildWorldBackdrop,
  syncExtractBackdrop,
  type WorldBackdropRefs
} from "./gameScene/worldBackdrop";
import { resolveCorpseFogVisualState } from "./gameScene/corpseFogVisualState";
import { GameHudOverlay } from "./gameScene/hudOverlay";
import { GameSceneInputBridge, shouldUseTouchLayout } from "./gameScene/inputBridge";
import { GameSceneInteractions } from "./gameScene/interactions";
import { MonsterSkillFxController } from "./gameScene/monsterSkillFx";
import { mountCombatVfx } from "../features/combat/vfx/combatVfx";
import { mountPlayerDeathVfx } from "../features/combat/vfx/playerDeathVfx";
import { mountMonsterVfx } from "../features/monsters/vfx/monsterVfx";
import { mountLootToastVfx } from "../features/inventory/vfx/lootToastVfx";
import { mountRareDropVfx } from "../features/inventory/vfx/rareDropVfx";
import { mountChestVfx } from "../features/chests/vfx/chestVfx";
import { mountExtractVfx } from "../features/extract/vfx/extractVfx";
import { mountWorldLighting, type WorldLightingApi } from "../features/environment/vfx/worldLighting";
import { ColorGradePipeline } from "../features/environment/vfx/colorGradePipeline";
import { resolveArtDirection } from "../features/environment/vfx/artDirectionPresets";
import { clientEventBus } from "../core/event-bus";
import {
  LOCK_ASSIST_CHASE_MAX_DURATION_MS,
  resolveAttackAssist,
  resolveChaseAssistStep,
  type AttackIntentTarget,
  type ChaseAssistState,
  type LockAssistTarget
} from "./gameScene/lockAssist";
import { LockAssistFeedbackController } from "./gameScene/lockAssistFeedback";
import { GAME_CAMERA_CONFIG } from "./gameScene/renderTuning";
import { anchorScreenSpace } from "./gameScene/renderConfig";
import {
  getPrimarySkillCooldownMs,
  getPrimarySkillWindupMs,
  resolveSkillBySlot,
} from "./gameScene/skillHelpers";
import { MiasmaPipeline } from "./gameScene/miasmaPipeline";

export interface GameSceneInitData {
  runtime: MatchRuntimeStore;
  extractState?: ExtractUiState;
  onMoveInput?: (direction: Vector2) => void;
  onAttack?: (payload: AttackRequestPayload) => void;
  onSkill?: (skillId: SkillId) => void;
  onPickup?: () => void;
  onStartExtract?: () => void;
  onOpenChest?: (chestId: string) => void;
  onToggleInventory?: () => void;
  onSceneReady?: () => void;
}

interface SpectateHudRefs {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Graphics;
  titleText: Phaser.GameObjects.Text;
  targetText: Phaser.GameObjects.Text;
  hintText: Phaser.GameObjects.Text;
  cycleButton: Phaser.GameObjects.Text;
}

export interface GameSceneRenderDebugSnapshot {
  scene: string;
  ts: number;
  sceneTimeMs: number;
  selfPlayerId: string | null;
  playerCount: number;
  players: PlayerMarkerDebugSnapshot[];
}

export class GameScene extends Phaser.Scene {
  static readonly KEY = "GameScene";

  private runtime!: MatchRuntimeStore;
  private unsubscribeRuntime: (() => void) | null = null;
  private readonly playerMarkers = new Map<string, PlayerMarker>();
  public readonly monsterMarkers = new Map<string, MonsterMarker>();
  private readonly dropMarkers = new Map<string, DropMarker>();
  private readonly chests = new Map<string, ChestState>();
  private worldBackdrop: WorldBackdropRefs = createWorldBackdropRefs();
  private extractPulseTween?: Phaser.Tweens.Tween;
  private corpseFogImage?: Phaser.GameObjects.Image;
  private corpseFogTexture?: Phaser.Textures.CanvasTexture;
  private corpseFogSignature = "";
  private miasmaPipeline?: MiasmaPipeline;
  private hudOverlay?: GameHudOverlay;
  private inputBridge?: GameSceneInputBridge;
  private interactions?: GameSceneInteractions;
  private monsterSkillFx?: MonsterSkillFxController;
  private lockAssistFeedback?: LockAssistFeedbackController;
  private featureUnsubscribes: Array<() => void> = [];
  private worldLighting?: WorldLightingApi;
  private artDirection = resolveArtDirection();
  private latestState: MatchViewState | null = null;
  private worldSignature = "";
  private followedPlayerId: string | null = null;
  private spectateTargetId: string | null = null;
  private spectateHud?: SpectateHudRefs;
  private extractState: ExtractUiState = {
    phase: "idle",
    isOpen: false,
    isExtracting: false,
    progress: null,
    secondsRemaining: null,
    message: "携带归营火种前往中心归营火，点燃后开始撤离。",
    didSucceed: false
  };
  private onMoveInput?: (direction: Vector2) => void;
  private testMoveOverride?: Vector2;

  /** 测试钩子用：合成移动方向作为自机朝向源（绕过键盘输入桥）。 */
  setTestMoveOverride(v: Vector2): void {
    this.testMoveOverride = v;
  }

  getRenderDebugSnapshot(): GameSceneRenderDebugSnapshot {
    return {
      scene: GameScene.KEY,
      ts: Date.now(),
      sceneTimeMs: Math.round(this.time.now),
      selfPlayerId: this.latestState?.selfPlayerId ?? null,
      playerCount: this.playerMarkers.size,
      players: Array.from(this.playerMarkers.values(), (marker) => marker.getDebugSnapshot())
    };
  }
  private onAttack?: (payload: AttackRequestPayload) => void;
  private onSkill?: (skillId: SkillId) => void;
  private onPickup?: () => void;
  private onStartExtract?: () => void;
  public onPlayerAttack?: (payload: { playerId: string; attackId: string; targetId?: string }) => void;
  private onOpenChest?: (chestId: string) => void;
  private onToggleInventory?: () => void;
  private lastSelfAlive = true;

  private lastLocalAttackAt = 0;
  private lastLocalAttackTargetId?: string;
  private lastSelfDamageAt = 0;
  private onSceneReady?: () => void;
  private localSkillCooldownEndsAt = 0;
  private localSkillWindupEndsAt = 0;
  private readonly localSkillCooldowns = [
    { endsAt: 0, durationMs: 0 },
    { endsAt: 0, durationMs: 0 },
    { endsAt: 0, durationMs: 0 },
    { endsAt: 0, durationMs: 0 }
  ];
  private localBasicAttackEndsAt = 0;
  private pendingBasicAttackFire?: Phaser.Time.TimerEvent;
  private pendingSkillCast?: Phaser.Time.TimerEvent;
  private queuedAttack?: AttackRequestPayload;
  private chaseAssist?: ChaseAssistState;
  private attackIntentTarget?: AttackIntentTarget;

  constructor() {
    super(GameScene.KEY);
  }

  preload(): void {
    this.load.image("terrain_wasteland", "assets/generated/medieval-battlefield-ground-cpa-image2-20260501.png");
    this.load.image("extract_beacon_asset", "assets/generated/medieval-extract-marker-cpa-image2-256-20260501.png");
    // 焊接动作图（冷月圣经，owner 拍板）：每把武器一张 3x2 动作图（人+武器一体）。
    // 帧序 0 待机/1-2 走/3 抬刀/4 挥砍/5 受击。加新武器=多生成一张同布局图。
    // 四方向：侧面图（朝左，frames 0待机/1-2走/3抬手/4挥砍/5受击）+ 正背面图
    // （vert: 0-2 正面朝镜头走 / 3-5 背面远离走）。全部 300px 帧。
    for (const w of ["sword", "blade", "spear"]) {
      this.load.spritesheet(`scavenger_${w}`, `assets/generated/image2_processed/characters/scavenger_${w}_3x2.png`, { frameWidth: 300, frameHeight: 300 });
      this.load.spritesheet(`scavenger_${w}_vert`, `assets/generated/image2_processed/characters/scavenger_${w}_vert_3x2.png`, { frameWidth: 300, frameHeight: 300 });
    }
    this.load.spritesheet("unit_enemy_raider", "assets/generated/image2_processed/characters/unit_enemy_raider_sheet_4x4.png", { frameWidth: 314, frameHeight: 314 });
    for (const contract of Object.values(MONSTER_ASSET_CONTRACTS)) {
      this.load.spritesheet(contract.textureKey, contract.assetPath, {
        frameWidth: contract.frameWidth,
        frameHeight: contract.frameHeight
      });
    }
    this.load.spritesheet("world_structures", "assets/generated/image2_processed/atlases/atlas_world_structures_3x3.png", { frameWidth: 418, frameHeight: 418 });
    this.load.spritesheet("world_decor", "assets/generated/image2_processed/atlases/atlas_world_decor_4x4.png", { frameWidth: 314, frameHeight: 314 });
    this.load.image("drop", "assets/generated/image2_processed/items/loot_drop_bag.png");
    this.load.image("chest_closed", "assets/generated/image2_processed/items/loot_chest_closed.png");
    this.load.image("chest_open", "assets/generated/image2_processed/items/loot_chest_open.png");
    this.load.image("icon_weapon_sword", "assets/generated/image2_processed/items/icon_weapon_sword.png");
    this.load.image("icon_weapon_blade", "assets/generated/image2_processed/items/icon_weapon_blade.png");
    this.load.image("icon_weapon_spear", "assets/generated/image2_processed/items/icon_weapon_spear.png");
    this.load.image("hud_status", "assets/generated/hud/medieval-hud-status-cpa-image2-20260501.png");
    this.load.image("hud_objective", "assets/generated/hud/medieval-hud-objective-cpa-image2-20260501.png");
    this.load.image("hud_timer", "assets/generated/hud/medieval-hud-timer-cpa-image2-20260501.png");
    this.load.image("hud_command", "assets/generated/hud/medieval-hud-command-cpa-image2-20260501.png");
    this.load.image("hud_skills", "assets/generated/hud/medieval-hud-skills-cpa-image2-20260501.png");
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
    this.onSceneReady = data.onSceneReady;
    this.onPlayerAttack = (payload) => this.handleServerPlayerAttack(payload);

    // The in-game HUD carries objectives now; keep the first combat view unobstructed.
  }

  private handleServerPlayerAttack(payload: { playerId: string; attackId: string; targetId?: string }): void {
    const player = this.latestState?.players.find((entry) => entry.id === payload.playerId);
    this.playerMarkers.get(payload.playerId)?.playAction("attack", player?.direction);
  }

  public resolveChestInterruptReason(): "moved" | "damaged" | "died" {
    const selfPlayer = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    if (selfPlayer && !selfPlayer.isAlive) {
      return "died";
    }

    if (Date.now() - this.lastSelfDamageAt <= 600) {
      return "damaged";
    }

    return "moved";
  }

  private createUnitAnimations(): void {
    // 四方向角色动画。侧面图（key）：0待机/1-2走/3抬手/4挥砍/5受击（朝左）。
    // 正背面图（key_vert）：0-2 正面朝镜头走 / 3-5 背面远离走。
    // down=正面, up=背面, left/right=侧面（right 由 PlayerMarker flipX）。
    const weapons: WeaponType[] = ["sword", "blade", "spear"];
    const sideWalkFramesByWeapon: Record<WeaponType, number[]> = {
      // Sword frame 2 currently reads as a reversed side pose, causing visible left-right sway while running.
      sword: [1, 0, 1, 0],
      blade: [1, 0, 2, 0],
      spear: [1, 0, 2, 0]
    };
    for (const weapon of weapons) {
      const side = `scavenger_${weapon}`;
      const vert = `scavenger_${weapon}_vert`;
      // 侧面（左右共用）
      this.createAnimation(`scavenger-${weapon}-idle-side`, side, [0], 1, -1);
      this.createAnimation(`scavenger-${weapon}-walk-side`, side, sideWalkFramesByWeapon[weapon], 7, -1);
      // 正面（向下/朝镜头）
      this.createAnimation(`scavenger-${weapon}-idle-down`, vert, [0], 1, -1);
      this.createAnimation(`scavenger-${weapon}-walk-down`, vert, [1, 0, 2, 0], 7, -1);
      // 背面（向上/远离）
      this.createAnimation(`scavenger-${weapon}-idle-up`, vert, [3], 1, -1);
      this.createAnimation(`scavenger-${weapon}-walk-up`, vert, [4, 3, 5, 3], 7, -1);
      // 攻击/受击统一用侧面图（攻击短暂，朝向瞄准）
      this.createAnimation(`scavenger-${weapon}-attack`, side, [3, 4], getAttackAnimationFrameRate(weapon), 0);
      this.createAnimation(`scavenger-${weapon}-hurt`, side, [5], 1, 0);
    }

    for (const monsterType of Object.keys(MONSTER_ASSET_CONTRACTS) as Array<keyof typeof MONSTER_ASSET_CONTRACTS>) {
      const textureKey = getMonsterTextureKey(monsterType);
      for (const action of ["idle", "move", "attack", "charge", "hurt", "death"] as const) {
        const repeat = action === "idle" || action === "move" ? -1 : 0;
        this.createAnimation(
          getMonsterAnimationKey(monsterType, action),
          textureKey,
          getMonsterActionFrames(monsterType, action),
          getMonsterActionFrameRate(monsterType, action),
          repeat
        );

        if (!hasMonsterDirectionalCoverage(monsterType)) {
          continue;
        }

        for (const facing of MONSTER_FACINGS) {
          this.createAnimation(
            getMonsterAnimationKey(monsterType, action, facing),
            textureKey,
            getMonsterDirectionalActionFrames(monsterType, action, facing),
            getMonsterActionFrameRate(monsterType, action),
            repeat
          );
        }
      }
    }
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);
    this.cameras.main.setBackgroundColor("#0e0b08");
    const touchLayout = shouldUseTouchLayout();
    this.cameras.main.setZoom(touchLayout ? GAME_CAMERA_CONFIG.touchZoom : GAME_CAMERA_CONFIG.desktopZoom);
    this.cameras.main.roundPixels = GAME_CAMERA_CONFIG.roundPixels;
    this.createUnitAnimations();

    this.hudOverlay = new GameHudOverlay(this, touchLayout);
    this.hudOverlay.mount();
    this.monsterSkillFx = new MonsterSkillFxController(this);
    this.lockAssistFeedback = new LockAssistFeedbackController(this);
    this.interactions = new GameSceneInteractions(this);
    this.interactions.mount(undefined, undefined, undefined);
    // 美术方向（?grade=gothic|ember|moonlit 选择，默认 moonlit）：调色 + 光照协同
    this.artDirection = resolveArtDirection();
    this.worldLighting = mountWorldLighting(this, this.artDirection.lighting);
    // 撤离点亮灯：点燃/开放的归营火在夜里是一个真实光源（也是远处的导航信标）
    const litExtractZones = new Set<string>();
    const lightExtractZone = (zoneId: string | undefined, at?: { x: number; y: number }) => {
      const key = zoneId ?? (at ? `${at.x},${at.y}` : "");
      if (!key || litExtractZones.has(key)) return;
      const pos = at ?? this.resolveExtractZonePosition(zoneId);
      if (!pos) return;
      litExtractZones.add(key);
      this.worldLighting?.addStaticLight(pos.x, pos.y, { diameter: 680, color: 0xff9a4d, alpha: 0.4 });
    };
    const onBeaconLit = (p: { extractZoneId: string; position: { x: number; y: number } }) =>
      lightExtractZone(p.extractZoneId, p.position);
    const onExtractOpened = (p: { zoneIds: string[] }) => p.zoneIds.forEach((id) => lightExtractZone(id));
    clientEventBus.on("BeaconLit", onBeaconLit);
    clientEventBus.on("ExtractOpened", onExtractOpened);
    this.featureUnsubscribes = [
      () => {
        clientEventBus.off("BeaconLit", onBeaconLit);
        clientEventBus.off("ExtractOpened", onExtractOpened);
        this.worldLighting?.destroy();
        this.worldLighting = undefined;
      },
      mountCombatVfx({
        scene: this,
        getSelfPlayerId: () => this.latestState?.selfPlayerId ?? null,
        getPlayerMarker: (playerId) => this.playerMarkers.get(playerId),
        getMonsterMarker: (monsterId) => this.monsterMarkers.get(monsterId),
        getPlayerWeapon: (playerId) => this.latestState?.players.find((player) => player.id === playerId)?.weaponType,
        getPlayerDirection: (playerId) => this.latestState?.players.find((player) => player.id === playerId)?.direction
      }),
      mountPlayerDeathVfx({ scene: this, getSelfPlayerId: () => this.latestState?.selfPlayerId ?? null }),
      mountMonsterVfx({ scene: this }),
      mountLootToastVfx({
        scene: this,
        getPlayerMarker: (playerId) => this.playerMarkers.get(playerId)
      }),
      mountRareDropVfx({ scene: this }),
      mountChestVfx({
        scene: this,
        getChest: (chestId) => this.chests.get(chestId),
        getPlayerMarker: (playerId) => this.playerMarkers.get(playerId),
        getMonsterMarkers: () => this.monsterMarkers.values()
      }),
      mountExtractVfx({
        scene: this,
        getZonePosition: (zoneId?: string) => this.resolveExtractZonePosition(zoneId),
        getPlayerMarker: (playerId) => this.playerMarkers.get(playerId)
      })
    ];
    this.inputBridge = new GameSceneInputBridge(this, {
      touchLayout,
      onMoveInput: (direction) => {
        if (!this.isSelfControllable()) return;
        this.onMoveInput?.(direction);
      },
      onPrimaryPointerAttack: (pointer) => {
        if (!this.isSelfControllable()) return;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.attackIntentTarget = { worldX: worldPoint.x, worldY: worldPoint.y };
      },
      onAttack: () => this.handleAttack(),
      onSkill: (slotIndex) => this.handleSkill(slotIndex),
      onDodge: () => this.handleDodge(),
      onPickup: () => this.handleInteract(),
      onExtract: () => {
        if (!this.isSelfControllable()) return;
        this.onStartExtract?.();
      },
      onInventory: () => this.handleToggleInventory()
    });
    this.inputBridge.mount();
    this.miasmaPipeline = this.installMiasmaPipeline();
    this.installColorGrade();

    this.mountSpectateHud();
    this.input.keyboard?.on("keydown", this.handleSpectateKeydown);

    this.unsubscribeRuntime = this.runtime.subscribe((state) => {
      this.latestState = state;
      this.syncWorld(state);
      this.syncPlayers(state);
      this.syncMonsters(state);
      this.syncDrops(state);
      this.interactions?.syncLocalPlayerId(state.selfPlayerId);
      this.interactions?.syncPlayerMarkers(this.playerMarkers);
      this.lockAssistFeedback?.sync({
        state,
        chaseAssist: this.chaseAssist,
        queuedAttackTargetId: this.queuedAttack?.targetId,
        playerMarkers: this.playerMarkers,
        monsterMarkers: this.monsterMarkers
      });
      this.hudOverlay?.sync({
        state,
        extractState: this.extractState,
        skillCooldownEndsAt: this.localSkillCooldownEndsAt,
        skillWindupEndsAt: this.localSkillWindupEndsAt,
        skillCooldowns: this.localSkillCooldowns
      });
      this.inputBridge?.syncMobileButtons(this.localSkillCooldowns);
      this.syncSpectateState();
    });

    this.onSceneReady?.();
  }

  private handleAttack(): void {
    if (!this.isSelfControllable()) {
      return;
    }
    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    if (!self) return;

    const weaponType = self.weaponType ?? "sword";
    const cadence = getBasicAttackCadence(weaponType, self.attackSpeed ?? 0);
    const now = Date.now();

    if (now < this.localBasicAttackEndsAt) return;

    const assisted = this.resolveAttackAssist(self);
    if (!assisted) {
      this.attackIntentTarget = undefined;
      this.clearChaseAssist();
      return;
    }

    const attackPayload = this.buildAttackPayload(assisted.direction, assisted.targetId);
    if (assisted.shouldChase && assisted.targetId && assisted.targetKind) {
      this.startChaseAssist(assisted.targetId, assisted.targetKind, Boolean(this.attackIntentTarget));
      this.queuedAttack = attackPayload;
      this.attackIntentTarget = undefined;
      return;
    }

    this.clearChaseAssist();
    this.queuedAttack = undefined;
    this.attackIntentTarget = undefined;
    this.startLocalBasicAttack(self, cadence, attackPayload);
  }

  private handleSkill(slotIndex = 0): void {
    if (!this.isSelfControllable()) {
      return;
    }
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
    if (windupMs > 0) {
      this.pendingSkillCast = this.time.delayedCall(windupMs, () => {
        if (!this.isSelfControllable()) {
          this.pendingSkillCast = undefined;
          return;
        }
        const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
        const castDirection = this.inputBridge?.getLastFacingDirection() ?? direction;
        if (self) this.playerMarkers.get(self.id)?.playAction("skill", castDirection);
        this.onSkill?.(sid);
        this.pendingSkillCast = undefined;
      });
      return;
    }

    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    if (self) this.playerMarkers.get(self.id)?.playAction("skill", direction);
    this.onSkill?.(sid);
  }

  private startLocalBasicAttack(
    self: NonNullable<MatchViewState["players"]>[number],
    cadence: ReturnType<typeof getBasicAttackCadence>,
    attackPayload: AttackRequestPayload
  ): void {
    const direction = attackPayload.direction ?? this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 };
    const now = Date.now();
    this.localBasicAttackEndsAt = now + cadence.repeatMs;
    this.lastLocalAttackAt = now;
    this.lastLocalAttackTargetId = attackPayload.targetId;

    this.playerMarkers.get(self.id)?.playAction("attack", direction);
    this.pendingBasicAttackFire?.remove(false);
    this.pendingBasicAttackFire = this.time.delayedCall(cadence.startupMs, () => {
      if (!this.isSelfControllable()) {
        this.pendingBasicAttackFire = undefined;
        return;
      }
      this.onAttack?.(attackPayload);
      this.pendingBasicAttackFire = undefined;
    });
  }

  private handleDodge(): void {
    if (!this.isSelfControllable()) {
      return;
    }
    const now = Date.now();
    const cooldownMs = getPrimarySkillCooldownMs("common_dodge");
    if (now < this.localSkillWindupEndsAt || now < this.localSkillCooldowns[3].endsAt) return;
    this.localSkillCooldownEndsAt = now + cooldownMs;
    this.localSkillCooldowns[3] = { endsAt: this.localSkillCooldownEndsAt, durationMs: cooldownMs };
    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    const direction = this.inputBridge?.getLastFacingDirection() ?? { x: 0, y: 1 };
    if (self) this.playerMarkers.get(self.id)?.playAction("dodge", direction);
    this.onSkill?.("common_dodge");
  }

  private handleInteract(): void {
    if (!this.isSelfControllable()) {
      return;
    }
    this.interactions?.handleInteract(this.onOpenChest, this.onPickup);
  }

  applyChests(chests: ChestState[]): void {
    for (const chest of chests) {
      const id = chest.chestId ?? chest.id;
      if (id) this.chests.set(id, chest);
    }
    this.interactions?.applyChests(chests);
  }

  private handleToggleInventory(): void {
    if (!this.isSelfControllable()) {
      return;
    }
    this.onToggleInventory?.();
  }

  private readonly handleSpectateKeydown = (event: KeyboardEvent): void => {
    if (!this.latestState || this.isSelfControllable()) {
      return;
    }

    if (event.key === "[" || event.code === "BracketLeft") {
      event.preventDefault();
      this.shiftSpectateTarget(-1);
    } else if (event.key === "]" || event.code === "BracketRight") {
      event.preventDefault();
      this.shiftSpectateTarget(1);
    }
  };

  private readonly handleSpectateButtonClick = (): void => {
    this.shiftSpectateTarget(1);
  };

  private isSelfControllable(): boolean {
    return this.getSelfPlayer()?.isAlive === true;
  }

  private getSelfPlayer(state: MatchViewState | null = this.latestState): MatchViewState["players"][number] | undefined {
    if (!state?.selfPlayerId) {
      return undefined;
    }

    return state.players.find((player) => player.id === state.selfPlayerId);
  }

  private syncSpectateState(): void {
    const state = this.latestState;
    if (!state) {
      return;
    }

    const self = this.getSelfPlayer(state);
    if (self?.isAlive) {
      this.inputBridge?.setInputEnabled(true);
      this.spectateTargetId = null;
      this.hideSpectateHud();
      this.followPlayer(self);
      this.updateInteractionPrompts(self, true);
      return;
    }

    this.clearDeadCombatState();
    this.inputBridge?.setInputEnabled(false);
    const target = this.resolveSpectateTarget(state);
    this.followPlayer(target);
    this.updateInteractionPrompts(self, false);
    this.showSpectateHud(state, target, self);
  }

  private updateInteractionPrompts(player: MatchViewState["players"][number] | undefined, allowInteract: boolean): void {
    if (!allowInteract) {
      this.interactions?.hidePrompt();
      return;
    }

    if (!player) {
      this.interactions?.hidePrompt();
      return;
    }

    this.interactions?.updateChestPrompt(this.playerMarkers.get(player.id), { x: player.x, y: player.y });
    this.interactions?.updateAutoExtract(this.playerMarkers.get(player.id), this.extractState, this.onStartExtract);
  }

  private resolveSpectateTarget(state: MatchViewState): MatchViewState["players"][number] | undefined {
    const self = this.getSelfPlayer(state);
    const squadPlayers = this.getSpectateCandidates(state, self);
    if (squadPlayers.length === 0) {
      return undefined;
    }

    const aliveCandidates = squadPlayers.filter((player) => player.isAlive);
    const candidates = aliveCandidates.length > 0 ? aliveCandidates : squadPlayers;
    const preferred = this.spectateTargetId
      ? candidates.find((player) => player.id === this.spectateTargetId)
      : undefined;
    const target = preferred ?? candidates.find((player) => player.id === self?.id) ?? candidates[0];
    this.spectateTargetId = target?.id ?? null;
    return target;
  }

  private getSpectateCandidates(
    state: MatchViewState,
    self?: MatchViewState["players"][number]
  ): MatchViewState["players"] {
    if (!self) {
      return [];
    }

    const sameSquad = state.players.filter((player) => player.squadId === self.squadId);
    const aliveSameSquad = sameSquad.filter((player) => player.isAlive);
    return aliveSameSquad.length > 0 ? aliveSameSquad : sameSquad;
  }

  private shiftSpectateTarget(step: number): void {
    const state = this.latestState;
    if (!state) {
      return;
    }

    const self = this.getSelfPlayer(state);
    if (!self || self.isAlive) {
      return;
    }

    const candidates = this.getSpectateCandidates(state, self);
    if (candidates.length === 0) {
      return;
    }

    const currentTarget = this.resolveSpectateTarget(state);
    const currentIndex = currentTarget ? candidates.findIndex((player) => player.id === currentTarget.id) : -1;
    const nextIndex = (currentIndex + step + candidates.length) % candidates.length;
    this.spectateTargetId = candidates[nextIndex]?.id ?? null;
    this.syncSpectateState();
  }

  private clearDeadCombatState(): void {
    this.pendingBasicAttackFire?.remove(false);
    this.pendingBasicAttackFire = undefined;
    this.pendingSkillCast?.remove(false);
    this.pendingSkillCast = undefined;
    this.queuedAttack = undefined;
    this.chaseAssist = undefined;
    this.attackIntentTarget = undefined;
    this.localBasicAttackEndsAt = 0;
    this.lastLocalAttackTargetId = undefined;
    this.inputBridge?.setFacingLockDirection(undefined);
    this.inputBridge?.setAssistMoveOverride(undefined);
  }

  private followPlayer(player: MatchViewState["players"][number] | undefined): void {
    if (!player) {
      return;
    }

    const marker = this.playerMarkers.get(player.id);
    if (!marker) {
      return;
    }

    if (this.followedPlayerId !== player.id) {
      this.cameras.main.startFollow(marker.root, true, 0.12, 0.12);
      this.worldLighting?.setFollowTarget(marker.root);
      this.followedPlayerId = player.id;
    }
  }

  private mountSpectateHud(): void {
    if (this.spectateHud) {
      return;
    }

    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(10040).setVisible(false);
    const background = this.add.graphics();
    const titleText = this.add.text(0, 0, "你已阵亡", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: "#f7e5c5"
    });
    const targetText = this.add.text(0, 0, "正在观看：--", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#ffe8b0",
      wordWrap: { width: 300, useAdvancedWrap: true }
    });
    const hintText = this.add.text(0, 0, "[ / ] 切换同队目标", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#b9d8df"
    });
    const cycleButton = this.add.text(0, 0, "切换队友", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#f9efdc",
      backgroundColor: "rgba(40, 28, 18, 0.9)",
      padding: { x: 10, y: 6 }
    }).setInteractive({ useHandCursor: true });
    cycleButton.on("pointerdown", this.handleSpectateButtonClick);

    container.add([background, titleText, targetText, hintText, cycleButton]);
    this.spectateHud = {
      container,
      background,
      titleText,
      targetText,
      hintText,
      cycleButton
    };
    this.layoutSpectateHud(this.scale.width);
  }

  private layoutSpectateHud(width: number): void {
    if (!this.spectateHud) {
      return;
    }

    const panelWidth = Math.min(540, width - 24);
    const panelHeight = 74;
    const anchor = anchorScreenSpace(this.cameras.main, width / 2, 18);
    const left = -panelWidth / 2;
    const right = panelWidth / 2;

    this.spectateHud.container.setPosition(anchor.x, anchor.y).setScale(anchor.scale).setVisible(true);
    this.spectateHud.background.clear();
    this.spectateHud.background.fillStyle(0x120d0a, 0.9);
    this.spectateHud.background.fillRoundedRect(left, 0, panelWidth, panelHeight, 10);
    this.spectateHud.background.lineStyle(2, 0x5f7e86, 0.7);
    this.spectateHud.background.strokeRoundedRect(left, 0, panelWidth, panelHeight, 10);

    this.spectateHud.titleText
      .setPosition(left + 14, 10)
      .setFontSize("13px");
    this.spectateHud.targetText
      .setPosition(left + 14, 26)
      .setWordWrapWidth(Math.max(180, panelWidth - 160))
      .setFontSize("15px");
    this.spectateHud.hintText
      .setPosition(left + 14, 50)
      .setFontSize("11px");
    this.spectateHud.cycleButton
      .setPosition(right - 14, 23)
      .setOrigin(1, 0)
      .setFontSize("12px");
  }

  private showSpectateHud(
    state: MatchViewState,
    target: MatchViewState["players"][number] | undefined,
    self: MatchViewState["players"][number] | undefined
  ): void {
    this.mountSpectateHud();
    if (!this.spectateHud) {
      return;
    }

    const targetLabel = target
      ? target.id === self?.id
        ? "正在观看：自己的尸体"
        : `正在观看：队友 ${target.name}${target.isAlive ? "" : "（阵亡）"}`
      : "正在观看：暂无同队目标";
    this.spectateHud.container.setVisible(true);
    this.spectateHud.titleText.setText("你已阵亡");
    this.spectateHud.targetText.setText(targetLabel);
    this.spectateHud.hintText.setText(this.getSpectateHintLabel(state));
    this.layoutSpectateHud(this.scale.width);
  }

  private hideSpectateHud(): void {
    this.spectateHud?.container.setVisible(false);
  }

  private destroySpectateHud(): void {
    this.spectateHud?.container.destroy(true);
    this.spectateHud = undefined;
  }

  private getSpectateHintLabel(state: MatchViewState): string {
    const self = this.getSelfPlayer(state);
    const squadPlayers = this.getSpectateCandidates(state, self);
    if (squadPlayers.length <= 1) {
      return "[ / ] 暂无可切换目标";
    }

    return "[ / ] 切换同队目标";
  }

  update(time: number, delta: number): void {
    const alpha = Phaser.Math.Clamp(delta / 120, 0.08, 0.22);
    const selfId = this.latestState?.selfPlayerId;
    // 自机朝向源：真键盘走输入桥，合成测试走 testMoveOverride（同一路径，便于自测）
    const selfMove = this.testMoveOverride ?? this.inputBridge?.getCurrentMoveDirection();
    for (const m of this.playerMarkers.values()) { m.step(alpha, m.id === selfId ? selfMove : undefined); }
    for (const m of this.monsterMarkers.values()) { m.step(alpha); }
    this.monsterSkillFx?.step(this.monsterMarkers);
    for (const m of this.dropMarkers.values()) {
      if (Math.abs(m.root.depth - m.root.y) > 0.5) {
        m.root.setDepth(m.root.y);
      }
    }

    this.updateChaseAssist();
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
      this.inputBridge?.syncMobileButtons(this.localSkillCooldowns);
      this.syncSpectateState();
      this.updateMiasmaShader();
    }
    this.hudOverlay?.pinToCamera();
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
      this.inputBridge?.syncMobileButtons(this.localSkillCooldowns);
      this.syncWorld(this.latestState);
    }
  }

  shutdown(): void {
    this.unsubscribeRuntime?.();
    this.featureUnsubscribes.forEach((unsubscribe) => unsubscribe());
    this.featureUnsubscribes = [];
    this.input.keyboard?.off("keydown", this.handleSpectateKeydown);
    this.interactions?.destroy();
    this.interactions = undefined;
    this.inputBridge?.destroy();
    this.inputBridge = undefined;
    this.hudOverlay?.destroy();
    this.hudOverlay = undefined;
    this.monsterSkillFx?.destroy();
    this.monsterSkillFx = undefined;
    this.lockAssistFeedback?.destroy();
    this.lockAssistFeedback = undefined;
    this.destroySpectateHud();
    this.localBasicAttackEndsAt = 0;
    this.queuedAttack = undefined;
    this.chaseAssist = undefined;
    this.lastSelfDamageAt = 0;
    this.spectateTargetId = null;
    this.corpseFogImage?.destroy();
    this.corpseFogImage = undefined;
    this.corpseFogTexture?.destroy();
    this.corpseFogTexture = undefined;
    this.miasmaPipeline = undefined;
  }

  private syncWorld(state: MatchViewState): void {
    const layoutSignature = state.layout
      ? [
        state.layout.templateId,
        ...state.layout.riverHazards.map((entry) => `${entry.hazardId}:${entry.x},${entry.y},${entry.width},${entry.height}`),
        ...state.layout.safeCrossings.map((entry) => `${entry.crossingId}:${entry.x},${entry.y},${entry.width},${entry.height}`),
        ...(state.layout.obstacleZones ?? []).map((entry) => `${entry.obstacleId}:${entry.x},${entry.y},${entry.width},${entry.height}`),
        ...(state.layout.landmarks ?? []).map((entry) => `${entry.landmarkId}:${entry.x},${entry.y},${entry.kind}`)
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

    const self = state.players.find(p => p.id === state.selfPlayerId);
    this.lastSelfAlive = self?.isAlive ?? true;
  }

  private syncMonsters(state: MatchViewState): void {
    const currentIds = new Set<string>();

    for (const monster of state.monsters) {
      currentIds.add(monster.id);
      const existing = this.monsterMarkers.get(monster.id);

      if (existing) {
        existing.sync(monster);
        this.monsterSkillFx?.sync(monster, existing);
      } else {
        const marker = new MonsterMarker(this, monster);
        this.monsterMarkers.set(monster.id, marker);
        this.monsterSkillFx?.sync(monster, marker);
      }
    }

    // Remove monsters that are no longer in the state (corpses that have been cleaned up)
    for (const [id, marker] of this.monsterMarkers.entries()) {
      if (!currentIds.has(id)) {
        this.monsterSkillFx?.destroy(id);
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

  private updateChaseAssist(): void {
    if (!this.inputBridge) {
      return;
    }

    const self = this.latestState?.players.find((player) => player.id === this.latestState?.selfPlayerId);
    const target = this.chaseAssist
      ? this.findEntityById(this.chaseAssist.targetId, this.chaseAssist.targetKind)
      : undefined;
    const beforeFeedbackState = {
      chaseAssist: this.chaseAssist ? { ...this.chaseAssist } : undefined,
      queuedAttackTargetId: this.queuedAttack?.targetId
    };
    const result = resolveChaseAssistStep({
      self,
      chaseAssist: this.chaseAssist,
      target,
      queuedAttackTargetId: this.queuedAttack?.targetId,
      now: Date.now(),
      lastFacingDirection: this.inputBridge.getLastFacingDirection(),
      currentMoveDirection: this.inputBridge.getCurrentMoveDirection(),
      currentManualMoveDirection: this.inputBridge.getCurrentManualMoveDirection(),
      allowManualAdvance: this.chaseAssist?.allowManualAdvance
    });

    this.inputBridge.setFacingLockDirection(result.facingDirection);
    if (result.clearMoveOverride) {
      this.inputBridge.setAssistMoveOverride(undefined);
    }

    if (result.kind === "clear") {
      this.clearChaseAssist();
      if (result.clearQueuedAttack) {
        this.queuedAttack = undefined;
      }
      this.emitLockAssistFeedback(result, beforeFeedbackState);
      return;
    }

    if (!self) {
      this.clearChaseAssist();
      return;
    }

    if (result.kind === "attack") {
      const cadence = getBasicAttackCadence(self.weaponType ?? "sword", self.attackSpeed ?? 0);
      const attackPayload = this.buildAttackPayload(result.attackDirection ?? this.inputBridge.getLastFacingDirection(), this.queuedAttack?.targetId);
      this.queuedAttack = undefined;
      this.clearChaseAssist();
      this.emitLockAssistFeedback(result, beforeFeedbackState);
      this.startLocalBasicAttack(self, cadence, attackPayload);
      return;
    }

    if (result.moveDirection) {
      this.inputBridge.setAssistMoveOverride(result.moveDirection);
    }
    this.emitLockAssistFeedback(result, beforeFeedbackState);
  }

  private resolveAttackAssist(self: NonNullable<MatchViewState["players"]>[number]): {
    direction: Vector2;
    targetId?: string;
    targetKind?: "player" | "monster";
    shouldChase: boolean;
  } | null {
    return resolveAttackAssist(
      self,
      (this.latestState?.players ?? []) as LockAssistTarget[],
      (this.latestState?.monsters ?? []) as LockAssistTarget[],
      this.inputBridge?.getLastFacingDirection() ?? self.direction ?? { x: 0, y: 1 },
      this.attackIntentTarget
    );
  }

  private buildAttackPayload(direction: Vector2, targetId?: string): AttackRequestPayload {
    return {
      attackId: `atk-${Date.now()}`,
      direction,
      targetId
    };
  }

  private startChaseAssist(targetId: string, targetKind: "player" | "monster", allowManualAdvance: boolean): void {
    const now = Date.now();
    this.chaseAssist = {
      targetId,
      targetKind,
      startedAt: now,
      expiresAt: now + LOCK_ASSIST_CHASE_MAX_DURATION_MS,
      allowManualAdvance
    };
  }

  private clearChaseAssist(): void {
    this.chaseAssist = undefined;
    this.inputBridge?.setFacingLockDirection(undefined);
    this.inputBridge?.setAssistMoveOverride(undefined);
  }

  private emitLockAssistFeedback(
    result: ReturnType<typeof resolveChaseAssistStep>,
    before: { chaseAssist?: ChaseAssistState; queuedAttackTargetId?: string }
  ): void {
    const event = this.lockAssistFeedback?.handleStepResult({
      result,
      before,
      after: {
        chaseAssist: this.chaseAssist ? { ...this.chaseAssist } : undefined,
        queuedAttackTargetId: this.queuedAttack?.targetId
      }
    });
    if (event) {
      this.hudOverlay?.showLockAssistFeedback(event.text, event.tone, event.key, event.visibleMs);
    }
  }

  private findEntityById(targetId: string, kind: "player" | "monster"): { id: string; x: number; y: number; isAlive: boolean } | undefined {
    if (!this.latestState) {
      return undefined;
    }

    if (kind === "player") {
      return this.latestState.players.find((player) => player.id === targetId);
    }

    return this.latestState.monsters.find((monster) => monster.id === targetId);
  }

  public showPickupFeedback(itemName: string): void {
    this.hudOverlay?.showPickupFeedback(itemName);
  }

  public showLootToast(x: number, y: number, amount: number): void {
    void x;
    void y;
    void amount;
  }

  private resolveExtractZonePosition(zoneId?: string): { x: number; y: number; radius: number } | undefined {
    const layoutZones = this.latestState?.layout?.extractZones ?? [];
    const zone = (zoneId ? layoutZones.find((entry) => entry.zoneId === zoneId) : layoutZones[0]) ?? layoutZones[0];
    if (zone) {
      return { x: zone.x, y: zone.y, radius: zone.radius };
    }
    if (
      typeof this.extractState.x === "number"
      && typeof this.extractState.y === "number"
      && typeof this.extractState.radius === "number"
    ) {
      return { x: this.extractState.x, y: this.extractState.y, radius: this.extractState.radius };
    }
    return undefined;
  }

  private showTutorial(): void {
    const { width, height } = this.scale;
    const tutorialAnchor = anchorScreenSpace(this.cameras.main, width / 2, height / 2);
    const panel = this.add.container(tutorialAnchor.x, tutorialAnchor.y)
      .setScale(tutorialAnchor.scale)
      .setScrollFactor(0)
      .setDepth(1000);
    const bg = this.add.graphics().fillStyle(0x0f172a, 0.95).fillRoundedRect(-160, -120, 320, 240, 12);
    const title = this.add.text(0, -100, "任务目标", { fontFamily: "monospace", fontSize: "20px", color: "#f8fafc" }).setOrigin(0.5);
    const hint = navigator.maxTouchPoints > 0 ? "• 移动: 虚拟摇杆\n• 攻击: 攻\n• 技能: 技\n• 交互: 拾" : "• 移动: WASD\n• 攻击: 鼠标左键\n• 技能: Q\n• 闪避: 空格";
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

  private updateMiasmaShader(): void {
    if (!this.latestState?.startedAt) return;
    if (!this.miasmaPipeline) return;

    const fogState = resolveCorpseFogVisualState(this.latestState.startedAt);
    const camera = this.cameras.main;

    const worldX = this.latestState.width / 2;
    const worldY = this.latestState.height / 2;
    // worldView 已含 zoom 围绕视口中心的偏移；直接用 scrollX 在 zoom≠1 时会偏几百像素
    const screenX = (worldX - camera.worldView.x) * camera.zoom;
    const screenY = (worldY - camera.worldView.y) * camera.zoom;

    const radius = Math.max(80, Math.max(this.latestState.width, this.latestState.height) * 0.78 * fogState.visibilityPercent);
    const screenRadius = radius * camera.zoom;
    const elapsedSec = (Date.now() - this.latestState.startedAt) / 1000;
    const intensity = Phaser.Math.Clamp(elapsedSec / 1100, 0.28, 0.68);

    this.miasmaPipeline.setMiasma(screenX, screenY, screenRadius, intensity);
  }

  private installMiasmaPipeline(): MiasmaPipeline | undefined {
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer | Phaser.Renderer.Canvas.CanvasRenderer;
    if (!("pipelines" in renderer) || !renderer.pipelines) {
      return undefined;
    }

    const pipelines = renderer.pipelines;
    if (!pipelines.has("MiasmaPipeline")) {
      pipelines.addPostPipeline("MiasmaPipeline", MiasmaPipeline);
    }
    this.cameras.main.setPostPipeline("MiasmaPipeline");

    const activePipeline = this.cameras.main.getPostPipeline("MiasmaPipeline");
    return Array.isArray(activePipeline) ? activePipeline[0] as MiasmaPipeline | undefined : activePipeline as MiasmaPipeline | undefined;
  }

  /** 颜色分级（最终成片色）；在 miasma 之后加入，作为最后一道后处理运行。 */
  private installColorGrade(): void {
    const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer | Phaser.Renderer.Canvas.CanvasRenderer;
    if (!("pipelines" in renderer) || !renderer.pipelines) {
      return;
    }
    const pipelines = renderer.pipelines;
    if (!pipelines.has("ColorGradePipeline")) {
      pipelines.addPostPipeline("ColorGradePipeline", ColorGradePipeline);
    }
    this.cameras.main.setPostPipeline("ColorGradePipeline");
    const active = this.cameras.main.getPostPipeline("ColorGradePipeline");
    const grade = (Array.isArray(active) ? active[0] : active) as ColorGradePipeline | undefined;
    grade?.setGrade(this.artDirection.grade);
  }
}

function getBasicAttackCooldownMs(weaponType: WeaponType, attackSpeedBonus: number): number {
  const attacksPerSecond = WEAPON_DEFINITIONS[weaponType]?.attacksPerSecond ?? 0.5;
  return Math.round((1000 / Math.max(attacksPerSecond, 0.1)) / Math.max(1 + attackSpeedBonus, 0.1));
}

function getBasicAttackCadence(weaponType: WeaponType, attackSpeedBonus: number): {
  startupMs: number;
  recoveryMs: number;
  repeatMs: number;
  bufferWindowMs: number;
} {
  const speedScale = Math.max(1 + attackSpeedBonus, 0.1);
  const repeatMs = getBasicAttackCooldownMs(weaponType, attackSpeedBonus);
  const startupBaseMs = weaponType === "sword" ? 140 : weaponType === "blade" ? 190 : 250;
  const startupMs = Math.min(
    Math.max(100, Math.round(startupBaseMs / speedScale)),
    Math.max(140, repeatMs - 160)
  );
  const recoveryMs = Math.max(120, repeatMs - startupMs);
  const bufferWindowMs = Math.min(220, Math.max(90, Math.round(recoveryMs * 0.35)));
  return {
    startupMs,
    recoveryMs,
    repeatMs,
    bufferWindowMs
  };
}

function getAttackAnimationFrameRate(weaponType: WeaponType): number {
  const attacksPerSecond = WEAPON_DEFINITIONS[weaponType]?.attacksPerSecond ?? 0.5;
  return Math.max(5, Math.round(attacksPerSecond * 12));
}

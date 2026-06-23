import Phaser from "phaser";
import {
  AttackRequestPayload,
  INVENTORY_HEIGHT,
  INVENTORY_WIDTH,
  type ConsumableEffect,
  MatchStartedPayload,
  MonsterState,
  PlayerState,
  RoomRuntimeSnapshot,
  SettlementItemDetail,
  SettlementPayload,
  type StatusEffectType,
  SkillId,
  Vector2,
  WorldDrop
} from "@gamer/shared";
import type { InventoryUpdateEvent, SettlementEnvelope } from "../network";
import type { ChestState } from "../network/socketClient";
import { GameSocketClient, type GameSocketClientOptions, type Unsubscribe } from "../network";
import { MatchRuntimeStore, type MatchInventoryState } from "../game";
import type { MatchInventoryItem } from "../game/matchRuntime";
import { GameAudioController } from "../audio/gameAudio";
import { clientEventBus } from "../core/event-bus";
import { mountCombatAudio } from "../features/combat/audio/combatAudio";
import { mountChestAudio } from "../features/chests/audio/chestAudio";
import { mountExtractAudio } from "../features/extract/audio/extractAudio";
import { mountMusicDirector } from "../features/music/musicDirector";
import { mountLootAudio } from "../features/inventory/audio/lootAudio";
import { loadAudioSettings, saveAudioSettings } from "../audio/audioSettings";
import { logEvent } from "../dev/runtimeLog";
import { translateItemName } from "../ui/itemPresentation";
import { GameScene, type GameSceneRenderDebugSnapshot } from "./GameScene";
import { applySmoothTextureSampling, GAME_RENDER_CONFIG } from "./gameScene/renderTuning";
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from "./gameScene/renderConfig";
import {
  createInitialExtractState,
  normalizeExtractOpened,
  normalizeExtractProgress,
  resolvePrimaryExtractZone,
  type ExtractUiState
} from "./extractUiState";

export type { ExtractUiState } from "./extractUiState";

export interface GameClientControllerOptions extends GameSocketClientOptions {
  parent: HTMLElement | string;
  onSettlement?: (payload: SettlementPayload) => void;
  onExtractStateChange?: (payload: ExtractUiState) => void;
  onInventoryChange?: (payload: MatchInventoryState | null) => void;
  onToggleInventory?: () => void;
}

export interface GameClientController {
  readonly network: GameSocketClient;
  mount(): void;
  syncViewport(): void;
  connect(): void;
  disconnect(): void;
  destroy(): void;
  enterMatch(payload: MatchStartedPayload): void;
  applyPlayers(players: PlayerState[]): void;
  applyMonsters(monsters: MonsterState[]): void;
  applyDrops(drops: WorldDrop[]): void;
  setInventory(payload: InventoryUpdateEvent): void;
  onPlayerAttack(payload: { playerId: string; attackId: string; targetId?: string }): void;
  setTimer(secondsRemaining: number): void;
  setExtractState(payload: Partial<ExtractUiState>): void;
  toggleInventory(): void;
  getSelfPlayerId(): string | null;
  getMatchSnapshot(): RoomRuntimeSnapshot | null;
  getRenderDebugSnapshot(): GameSceneRenderDebugSnapshot | null;
  sendMoveInput(direction: Vector2): void;
  startExtract(): void;
  setAudioMuted(muted: boolean): void;
  isAudioMuted(): boolean;
}

export function createGameClientController(
  options: GameClientControllerOptions
): GameClientController {
  const runtime = new MatchRuntimeStore();
  const network = new GameSocketClient(options);
  const audio = new GameAudioController();
  const audioSettings = loadAudioSettings();
  audio.setMuted(audioSettings.muted);
  const musicDirector = mountMusicDirector(audioSettings.muted);
  const subscriptions: Unsubscribe[] = [musicDirector.destroy];

  let game: Phaser.Game | null = null;
  let extractState = createInitialExtractState();
  let pendingChestsInit: ChestState[] | null = null;
  let releaseViewportSync: (() => void) | null = null;
  let viewportSyncFrame = 0;
  const chestOpeningCuePlayed = new Set<string>();

  const controller: GameClientController = {
    network,
    mount,
    syncViewport: syncGameViewport,
    connect: () => network.connect(),
    disconnect: () => network.disconnect(),
    destroy,
    enterMatch(payload) {
      runtime.setBootstrap({
        selfPlayerId: payload.selfPlayerId,
        snapshot: payload.room
      });
      chestOpeningCuePlayed.clear();
      extractState = createInitialExtractState();
      const zones = payload.room.layout?.extractZones?.map((zone) => ({ ...zone, isOpen: false })) ?? [];
      const primaryZone = zones[0];
      extractState = {
        ...extractState,
        zones,
        ...(primaryZone
          ? {
              x: primaryZone.x,
              y: primaryZone.y,
              radius: primaryZone.radius
            }
          : {})
      };
      options.onExtractStateChange?.(extractState);
      options.onInventoryChange?.(null);
      mount();
      getScene()?.setExtractState(extractState);
    },
    applyPlayers(players) {
      runtime.updatePlayers(players);
    },
    applyMonsters(monsters) {
      const previousMonsters = new Map(runtime.getState().monsters.map((monster) => [monster.id, monster]));
      for (const monster of monsters) {
        if (!previousMonsters.has(monster.id)) {
          logEvent("COMBAT", "monster.spawn", {
            monsterId: monster.id,
            monsterType: monster.type
          });
          if (monster.archetypeState) {
            logEvent("COMBAT", "monster.archetype_state", {
              monsterId: monster.id,
              monsterType: monster.type,
              state: monster.archetypeState
            });
          }
          continue;
        }
        const previous = previousMonsters.get(monster.id)!;
        if (monster.archetypeState && monster.archetypeState !== previous.archetypeState) {
          logEvent("COMBAT", "monster.archetype_state", {
            monsterId: monster.id,
            monsterType: monster.type,
            state: monster.archetypeState
          });
        }
      }
      for (const previous of previousMonsters.values()) {
        const next = monsters.find((monster) => monster.id === previous.id);
        if (previous.isAlive && next && !next.isAlive) {
          logEvent("COMBAT", "monster.death", {
            monsterId: next.id,
            monsterType: next.type
          });
        }
      }
      runtime.updateMonsters(monsters);
    },
    applyDrops(drops) {
      runtime.updateDrops(normalizeDropsState(drops));
    },
    setInventory(payload) {
      const previousInventory = runtime.getState().inventory;
      const normalized = normalizeInventoryEvent(payload);
      if (previousInventory && normalized) {
        const previousIds = new Set(previousInventory.items.map((item) => item.instanceId));
        const gainedItem = normalized.items.find((item) => !previousIds.has(item.instanceId));
        if (gainedItem) {
          const scene = getScene();
          scene?.showPickupFeedback(gainedItem.name);
          audio.play("pickup");

          const value = (gainedItem.goldValue ?? 0) + (gainedItem.treasureValue ?? 0);
          if (value > 0 && scene) {
            const self = runtime.getState().players.find(p => p.id === runtime.getState().selfPlayerId);
            if (self) {
              scene.showLootToast(self.x, self.y, value);
            }
          }
        }
      }
      runtime.setInventory(normalized);
      options.onInventoryChange?.(normalized);
    },
    onPlayerAttack(payload) {
      // 攻击音效统一由 combatAudio（监听 PlayerAttacked）播放；这里不再重复 play，
      // 否则同一次攻击会叠两遍音（移动中攻击时尤其像"怪声"）。
      getScene()?.onPlayerAttack?.(payload);
    },
    setTimer(secondsRemaining) {
      runtime.setTimer(secondsRemaining);
    },
    setExtractState(payload) {
      const previousPhase = extractState.phase;
      extractState = {
        ...extractState,
        ...payload
      };
      if (previousPhase !== extractState.phase) {
        logEvent("EXTRACT", "phase.changed", {
          from: previousPhase,
          to: extractState.phase
        });
      }
      options.onExtractStateChange?.(extractState);
      getScene()?.setExtractState(extractState);
    },
    toggleInventory() {
      options.onToggleInventory?.();
    },
    getSelfPlayerId() {
      return runtime.getState().selfPlayerId;
    },
    getMatchSnapshot() {
      const state = runtime.getState();
      if (!state.code) return null;
      return {
        code: state.code,
        startedAt: state.startedAt,
        width: state.width,
        height: state.height,
        players: state.players,
        layout: state.layout ?? {
          templateId: "A",
          squadSpawns: [],
          extractZones: [],
          chestZones: [],
          safeZones: [],
          riverHazards: [],
          safeCrossings: [],
          obstacleZones: [],
          landmarks: []
        }
      };
    },
    getRenderDebugSnapshot() {
      return getScene()?.getRenderDebugSnapshot() ?? null;
    },
    sendMoveInput(direction) {
      network.sendMoveInput({ direction });
      // 测试钩子绕过键盘输入桥；同步给场景做自机朝向源，让合成移动走真键盘同一路径
      (getScene() as unknown as { setTestMoveOverride?: (v: Vector2) => void })?.setTestMoveOverride?.(direction);
    },
    startExtract() {
      network.sendStartExtract();
    },
    setAudioMuted(muted) {
      audioSettings.muted = muted;
      audio.setMuted(muted);
      musicDirector.setMuted(muted);
      saveAudioSettings(audioSettings);
    },
    isAudioMuted() {
      return audioSettings.muted;
    }
  };

  const busOn = (type: any, handler: any): Unsubscribe => {
    clientEventBus.on(type, handler);
    return () => clientEventBus.off(type, handler);
  };
  const resolveExtractZone = (zoneId?: string) => {
    const snapshot = controller.getMatchSnapshot();
    const zones = snapshot?.layout?.extractZones ?? [];
    return (zoneId ? zones.find((zone) => zone.zoneId === zoneId) : zones[0]) ?? zones[0];
  };

  subscriptions.push(
    mountCombatAudio(audio, () => controller.getSelfPlayerId()),
    mountChestAudio(audio, () => controller.getSelfPlayerId()),
    mountExtractAudio(audio, () => controller.getSelfPlayerId()),
    mountLootAudio(audio, () => controller.getSelfPlayerId()),
    network.onAny((eventName, payload) => {
      if (typeof eventName !== "string" || !eventName.startsWith("domain:")) {
        return;
      }

      const domainType = eventName.slice("domain:".length) as Parameters<typeof clientEventBus.emit>[0];
      clientEventBus.emit(domainType, payload as never);
    }),
    busOn("PlayerDamaged", (payload: { attackerId: string; targetId: string; amount: number; critMultiplier?: number }) => {
      const attackerMonster = runtime.getState().monsters.find((monster) => monster.id === payload.attackerId);
      logEvent("COMBAT", "damage.received", {
        attackerId: payload.attackerId,
        targetId: payload.targetId,
        amount: payload.amount,
        critMultiplier: payload.critMultiplier ?? 1
      });
      if (attackerMonster && payload.amount > 0) {
        logEvent("COMBAT", "monster.attack_hit", {
          monsterId: attackerMonster.id,
          monsterType: attackerMonster.type,
          targetId: payload.targetId,
          amount: payload.amount
        });
      }
    }),
    busOn("MonsterKilled", (payload: { monsterId: string; monsterType?: string; killerPlayerId: string }) => {
      logEvent("COMBAT", "kill", {
        killerId: payload.killerPlayerId,
        victimId: payload.monsterId,
        victimTier: payload.monsterType ?? "unknown"
      });
    }),
    busOn("MonsterWindupStarted", (payload: { monsterId: string; windupType?: string }) => {
      logEvent("COMBAT", "monster.windup_domain", {
        monsterId: payload.monsterId,
        kind: payload.windupType ?? "attack"
      });
    }),
    busOn("PhaseStarted", (payload: { phase: string; atRunSeconds: number }) => {
      logEvent("COMBAT", "spawn.phase_changed", {
        phase: payload.phase,
        t: payload.atRunSeconds
      });
    }),
    busOn("MusicModeChanged", (payload: { mode: string }) => {
      logEvent("AUDIO", "music.mode_changed", {
        mode: payload.mode,
        ts: Date.now()
      });
    }),
    busOn("MonsterProjectileSpawned", (payload: unknown) => logEvent("COMBAT", "monster.projectile_spawn", payload as Record<string, unknown>)),
    busOn("MonsterProjectileHit", (payload: unknown) => logEvent("COMBAT", "monster.projectile_hit", payload as Record<string, unknown>)),
    busOn("MonsterProjectileDespawned", (payload: unknown) => logEvent("COMBAT", "monster.projectile_despawn", payload as Record<string, unknown>)),
    busOn("ExtractOpened", (payload: { zoneIds?: string[]; pressure?: string }) => {
      const zones = controller.getMatchSnapshot()?.layout?.extractZones ?? [];
      const zone = resolveExtractZone(payload.zoneIds?.[0]);
      const openZoneIds = new Set(payload.zoneIds ?? []);
      controller.setExtractState({
        phase: "idle",
        isOpen: true,
        zones: zones.map((entry) => ({ ...entry, isOpen: openZoneIds.has(entry.zoneId) })),
        message: payload.pressure === "active"
          ? "\u5f52\u8425\u706b\u58f0\u5df2\u66b4\u9732\uff0c\u654c\u4eba\u4f1a\u5411\u8fd9\u91cc\u6536\u7f29\u3002"
          : null,
        x: zone?.x,
        y: zone?.y,
        radius: zone?.radius
      });
    }),
    busOn("ExtractChannelStarted", (payload: { playerId: string; zoneId: string; channelDurationMs: number }) => {
      const zone = resolveExtractZone(payload.zoneId);
      controller.setExtractState({
        phase: "extracting",
        isOpen: true,
        isExtracting: payload.playerId === controller.getSelfPlayerId(),
        progress: 0,
        secondsRemaining: Math.ceil(payload.channelDurationMs / 1000),
        x: zone?.x,
        y: zone?.y,
        radius: zone?.radius
      });
    }),
    busOn("ExtractChannelTicked", (payload: { playerId: string; remainingMs: number }) => {
      if (payload.playerId !== controller.getSelfPlayerId()) return;
      const total = extractState.secondsRemaining ? extractState.secondsRemaining * 1000 : payload.remainingMs;
      controller.setExtractState({
        phase: "extracting",
        isOpen: true,
        isExtracting: true,
        progress: Phaser.Math.Clamp(1 - payload.remainingMs / Math.max(1, total), 0, 1),
        secondsRemaining: Math.ceil(payload.remainingMs / 1000)
      });
    }),
    busOn("ExtractChannelInterrupted", (payload: { playerId: string; reason: string }) => {
      if (payload.playerId !== controller.getSelfPlayerId()) return;
      controller.setExtractState({
        phase: "interrupted",
        isExtracting: false,
        progress: null,
        secondsRemaining: null,
        message: payload.reason === "damaged" ? "\u53d7\u5230\u653b\u51fb\uff0c\u64a4\u79bb\u88ab\u4e2d\u65ad\u3002" : null
      });
    }),
    busOn("ExtractSucceeded", (payload: { playerId: string; zoneId: string; settlement?: SettlementPayload }) => {
      if (payload.playerId !== controller.getSelfPlayerId()) return;
      controller.setExtractState({
        phase: "succeeded",
        isOpen: true,
        isExtracting: false,
        progress: 1,
        secondsRemaining: 0,
        message: "\u64a4\u79bb\u5b8c\u6210\uff0c\u6b63\u5728\u7ed3\u7b97",
        didSucceed: true,
        pressure: undefined
      });
    }),
    busOn("ChestRummageStarted", (payload: { playerId: string; chestId: string; qualityTier?: string; noiseRadius?: number }) => {
      if (payload.playerId !== controller.getSelfPlayerId()) return;
      runtime.setChestProgress({
        progress: 0,
        remainingMs: 0,
        lane: payload.qualityTier === "rich" ? "contested" : undefined,
        noiseRadius: payload.noiseRadius
      });
    }),
    busOn("ChestRummageTicked", (payload: { droppedItemCount: number; remainingItemCount: number }) => {
      const total = payload.droppedItemCount + payload.remainingItemCount;
      runtime.setChestProgress({
        progress: Phaser.Math.Clamp(payload.droppedItemCount / Math.max(1, total), 0, 1),
        remainingMs: 0
      });
    }),
    busOn("ChestRummageInterrupted", (payload: { playerId: string }) => {
      if (payload.playerId !== controller.getSelfPlayerId()) return;
      runtime.setChestProgress(null);
    }),
    busOn("ChestOpened", (payload: { playerId?: string }) => {
      if (!payload.playerId || payload.playerId === controller.getSelfPlayerId()) {
        runtime.setChestProgress(null);
      }
    }),
    network.onRoomError((payload) => {
      logEvent("NET", "room.error", {
        message: payload.message
      });
    }),
    network.onPlayersState((players) => controller.applyPlayers(players)),
    network.onMonstersState((monsters) => controller.applyMonsters(monsters)),
    network.onDropsState((drops) => controller.applyDrops(drops)),
    network.onInventoryUpdate((payload) => controller.setInventory(payload)),
    network.onPlayerAttack((payload) => controller.onPlayerAttack(payload)),
    network.onChestsInit((chests) => {
      pendingChestsInit = chests;
      getScene()?.applyChests(chests);
    }),
    network.onMatchTimer((secondsRemaining) => controller.setTimer(secondsRemaining)),
    network.onSettlement((payload) => {
      const selfPlayerId = controller.getSelfPlayerId();
      if (payload && typeof payload === "object" && "playerId" in payload) {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
        if (playerId && playerId !== selfPlayerId) return;
      }

      const settlement = normalizeSettlementPayload(payload);
      if (settlement.result === "failure") {
        audio.play(settlement.reason === "killed" ? "death" : "warning");
      }
      controller.setExtractState({
        phase: settlement.result === "success" ? "succeeded" : "idle",
        isExtracting: false,
        progress: settlement.result === "success" ? 1 : null,
        secondsRemaining: 0,
        message: settlement.result === "success" ? "已成功带出物资" : `撤离失败：${settlement.reason ?? "未知原因"}`,
        didSucceed: settlement.result === "success",
        pressure: undefined
      });
      options.onSettlement?.(settlement);
    }),
  );

  return controller;

  function mount(): void {
    if (game) {
      syncGameViewport();
      return;
    }

    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: options.parent,
      width: GAME_VIEW_WIDTH,
      height: GAME_VIEW_HEIGHT,
      pixelArt: GAME_RENDER_CONFIG.pixelArt,
      antialias: GAME_RENDER_CONFIG.antialias,
      autoRound: GAME_RENDER_CONFIG.autoRound,
      render: {
        // 动态证据采集（canvas.toDataURL 逐帧抓取）依赖保留绘制缓冲；性能损耗可忽略
        preserveDrawingBuffer: true
      },
      backgroundColor: "#020617",
      scene: [GameScene],
      physics: {
        default: "arcade",
        arcade: {
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });
    ensureViewportSync();
    applySmoothTextureSampling(game);
    game.scene.start(GameScene.KEY, {
      runtime,
      extractState,
      onMoveInput: (direction: Vector2) => network.sendMoveInput({ direction }),
      onAttack: (payload: AttackRequestPayload) => network.sendAttack(payload),
      onSkill: (skillId: SkillId) => network.sendCastSkill({ skillId }),
      onPickup: () => {
        const state = runtime.getState();
        const self = state.players.find((p) => p.id === state.selfPlayerId);
        if (!self) return;
        const nearby = state.drops.find(
          (drop) => Phaser.Math.Distance.Between(drop.x, drop.y, self.x, self.y) <= 150
        );
        if (nearby) network.sendPickup({ dropId: nearby.id });
      },
      onStartExtract: () => network.sendStartExtract(),
      onOpenChest: (chestId: string) => network.sendOpenChest(chestId),
      onToggleInventory: () => controller.toggleInventory(),
      onSceneReady: () => {
        if (pendingChestsInit) {
          getScene()?.applyChests(pendingChestsInit);
        }
      }
    });
    syncGameViewport();
    if (pendingChestsInit) {
      getScene()?.applyChests(pendingChestsInit);
    }
  }

  function destroy(): void {
    for (const unsubscribe of subscriptions) unsubscribe();
    audio.destroy();
    network.destroy();
    releaseViewportSync?.();
    releaseViewportSync = null;
    if (game) {
      game.destroy(true);
      game = null;
    }
  }

  function getScene(): GameScene | null {
    if (!game) return null;
    const scene = game.scene.getScene(GameScene.KEY);
    return scene instanceof GameScene ? scene : null;
  }

  function syncGameViewport(): void {
    if (!game) {
      return;
    }

    const parent = resolveParentElement(options.parent);
    if (parent) {
      parent.style.width = `${GAME_VIEW_WIDTH}px`;
      parent.style.height = `${GAME_VIEW_HEIGHT}px`;
      parent.style.minHeight = `${GAME_VIEW_HEIGHT}px`;
    }

    const canvas = game.canvas;
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    game.scale.resize(GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT);
    game.scale.refresh();
  }

  function ensureViewportSync(): void {
    if (releaseViewportSync || typeof window === "undefined") {
      return;
    }

    const requestSync = () => {
      if (viewportSyncFrame) {
        return;
      }

      viewportSyncFrame = window.requestAnimationFrame(() => {
        viewportSyncFrame = 0;
        syncGameViewport();
      });
    };

    const viewport = window.visualViewport;
    window.addEventListener("resize", requestSync);
    window.addEventListener("orientationchange", requestSync);
    viewport?.addEventListener("resize", requestSync);

    releaseViewportSync = () => {
      if (viewportSyncFrame) {
        window.cancelAnimationFrame(viewportSyncFrame);
        viewportSyncFrame = 0;
      }

      window.removeEventListener("resize", requestSync);
      window.removeEventListener("orientationchange", requestSync);
      viewport?.removeEventListener("resize", requestSync);
    };
  }
}

function resolveParentElement(parent: HTMLElement | string): HTMLElement | null {
  if (typeof parent !== "string") {
    return parent;
  }

  return document.querySelector<HTMLElement>(parent);
}

function normalizeInventoryEvent(payload: InventoryUpdateEvent): MatchInventoryState {
  const inventoryRoot = payload.inventory;
  const inventoryItems = Array.isArray(inventoryRoot.items) ? inventoryRoot.items : [];
  const pouchItems = Array.isArray(inventoryRoot.securePouch) ? inventoryRoot.securePouch : [];
  const rawEquipment = isRecord(inventoryRoot.equipment) ? inventoryRoot.equipment : {};
  const normalizePlacedEntry = (entry: unknown): MatchInventoryItem[] => {
    if (!isRecord(entry) || !isRecord(entry.item)) return [];
    const item = entry.item;
    return [{
      instanceId: asString(item.instanceId, cryptoId()),
      definitionId: asString(item.templateId, asString(item.definitionId, "unknown")),
      name: translateItemName(
        asString(item.name, asString(item.templateId, "未知物品")),
        asString(item.templateId, asString(item.definitionId, "unknown"))
      ),
      kind: asOptionalStringValue(item.kind),
      rarity: asOptionalStringValue(item.rarity),
      tags: normalizeStringArray(item.tags),
      width: asOptionalNumber(item.width),
      height: asOptionalNumber(item.height),
      x: asOptionalNumber(entry.x),
      y: asOptionalNumber(entry.y),
      slot: asOptionalStringValue(item.equipmentSlot) ?? asOptionalStringValue(item.slot),
      equipmentSlot: asOptionalStringValue(item.equipmentSlot) ?? asOptionalStringValue(item.slot),
      goldValue: asNumber(item.goldValue, 0),
      treasureValue: asNumber(item.treasureValue, 0),
      healAmount: asOptionalNumber(item.healAmount),
      consumableEffects: normalizeConsumableEffects(item.consumableEffects),
      modifiers: normalizeItemModifiers(item.modifiers),
      affixes: normalizeAffixes(item.affixes)
    }];
  };
  return {
    width: asNumber(inventoryRoot.width, INVENTORY_WIDTH),
    height: asNumber(inventoryRoot.height, INVENTORY_HEIGHT),
    items: inventoryItems.flatMap(normalizePlacedEntry),
    securePouch: pouchItems.flatMap(normalizePlacedEntry),
    equipment: Object.fromEntries(
      Object.entries(rawEquipment).flatMap(([slot, item]) => {
        if (!isRecord(item)) return [];
        return [[slot, {
          instanceId: asString(item.instanceId, cryptoId()),
          definitionId: asString(item.templateId, asString(item.definitionId, "unknown")),
          name: translateItemName(
            asString(item.name, slot),
            asString(item.templateId, asString(item.definitionId, "unknown"))
          ),
          kind: asOptionalStringValue(item.kind),
          rarity: asOptionalStringValue(item.rarity),
          tags: normalizeStringArray(item.tags),
          width: asOptionalNumber(item.width),
          height: asOptionalNumber(item.height),
          slot: asOptionalStringValue(item.equipmentSlot) ?? asOptionalStringValue(item.slot) ?? slot,
          equipmentSlot: asOptionalStringValue(item.equipmentSlot) ?? asOptionalStringValue(item.slot) ?? slot,
          goldValue: asNumber(item.goldValue, 0),
          treasureValue: asNumber(item.treasureValue, 0),
          healAmount: asOptionalNumber(item.healAmount),
          consumableEffects: normalizeConsumableEffects(item.consumableEffects),
          modifiers: normalizeItemModifiers(item.modifiers),
          affixes: normalizeAffixes(item.affixes)
        }]];
      })
    )
  };
}

function translateSlot(slot: string): string {
  const map: Record<string, string> = {
    "weapon": "武器",
    "head": "头盔",
    "chest": "护甲",
    "hands": "手套",
    "shoes": "鞋子"
  };
  return map[slot] ?? slot;
}

function normalizeItemModifiers(value: unknown): MatchInventoryItem["modifiers"] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    attackPower: asOptionalNumber(value.attackPower),
    attackSpeed: asOptionalNumber(value.attackSpeed),
    maxHp: asOptionalNumber(value.maxHp),
    moveSpeed: asOptionalNumber(value.moveSpeed),
    damageReduction: asOptionalNumber(value.damageReduction),
    critRate: asOptionalNumber(value.critRate),
    critDamage: asOptionalNumber(value.critDamage),
    hpRegen: asOptionalNumber(value.hpRegen),
    dodgeRate: asOptionalNumber(value.dodgeRate)
  };
}

function normalizeConsumableEffects(value: unknown): MatchInventoryItem["consumableEffects"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const effects: ConsumableEffect[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (entry.kind === "cleanse" && Array.isArray(entry.statusTypes)) {
      effects.push({ kind: "cleanse", statusTypes: entry.statusTypes.map(String) as StatusEffectType[] });
      continue;
    }
    if (
      entry.kind === "timedModifier"
      && typeof entry.type === "string"
      && typeof entry.durationMs === "number"
      && typeof entry.magnitude === "number"
    ) {
      effects.push({
        kind: "timedModifier",
        type: entry.type as StatusEffectType,
        durationMs: entry.durationMs,
        magnitude: entry.magnitude,
        attackDamageMultiplier: asOptionalNumber(entry.attackDamageMultiplier),
        attackSpeedMultiplier: asOptionalNumber(entry.attackSpeedMultiplier),
        basicAttackBonusDamage: asOptionalNumber(entry.basicAttackBonusDamage),
        damageReductionBonus: asOptionalNumber(entry.damageReductionBonus),
        moveSpeedMultiplier: asOptionalNumber(entry.moveSpeedMultiplier),
        dodgeRateBonus: asOptionalNumber(entry.dodgeRateBonus)
      });
    }
  }
  return effects.length > 0 ? effects : undefined;
}

function normalizeAffixes(value: unknown): MatchInventoryItem["affixes"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const affixes = value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const key = asOptionalStringValue(entry.key);
    const affixValue = asOptionalNumber(entry.value);
    if (!key || affixValue == null) return [];
    return [{ key, value: affixValue }];
  });
  return affixes.length > 0 ? affixes : undefined;
}

function normalizeDropsState(payload: WorldDrop[] | unknown): WorldDrop[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    
    // Explicitly use server ID if available, otherwise hash coordinates
    const id = typeof entry.id === "string" ? entry.id : `drop-${entry.x}-${entry.y}`;
    const item = isRecord(entry.item) ? entry.item : {};
    
    return [{
      id,
      item: {
        instanceId: asString(item.instanceId, id),
        definitionId: asString(item.definitionId, asString(item.templateId, "unknown")),
        name: translateItemName(
          asString(item.name, asString(item.templateId, "Loot")),
          asString(item.templateId, asString(item.definitionId, "unknown"))
        ),
        kind: asOptionalStringValue(item.kind) as WorldDrop["item"]["kind"],
        rarity: asOptionalStringValue(item.rarity) as WorldDrop["item"]["rarity"],
        goldValue: asNumber(item.goldValue, 0),
        treasureValue: asNumber(item.treasureValue, 0)
      },
      definitionId: asString(entry.definitionId, asString(item.definitionId, asString(item.templateId, "unknown"))),
      x: asNumber(entry.x, 0),
      y: asNumber(entry.y, 0)
    }];
  });
}

function normalizeSettlementPayload(payload: SettlementEnvelope | unknown): SettlementPayload {
  const root = isRecord(payload) ? payload : {};
  const settlement = isRecord(root.settlement) ? root.settlement : root;
  return {
    result: settlement.result === "success" ? "success" : "failure",
    reason: asOptionalString(settlement.reason),
    survivedSeconds: asNumber(settlement.survivedSeconds, 0),
    playerKills: asNumber(settlement.playerKills, 0),
    monsterKills: asNumber(settlement.monsterKills, 0),
    extractedGold: asNumber(settlement.extractedGold, 0),
    extractedTreasureValue: asNumber(settlement.extractedTreasureValue, 0),
    extractedItems: Array.isArray(settlement.extractedItems) ? settlement.extractedItems.map((item) => translateItemName(String(item))) : [],
    extractedItemDetails: normalizeSettlementItems(settlement.extractedItemDetails),
    retainedItems: Array.isArray(settlement.retainedItems) ? settlement.retainedItems.map((item) => translateItemName(String(item))) : [],
    retainedItemDetails: normalizeSettlementItems(settlement.retainedItemDetails),
    lostItems: Array.isArray(settlement.lostItems) ? settlement.lostItems.map((item) => translateItemName(String(item))) : [],
    lostItemDetails: normalizeSettlementItems(settlement.lostItemDetails),
    loadoutLost: settlement.loadoutLost === true,
    profileGoldDelta: asNumber(settlement.profileGoldDelta, 0)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asOptionalString(value: unknown): SettlementPayload["reason"] | undefined {
  return typeof value === "string" ? (value as SettlementPayload["reason"]) : undefined;
}

function normalizeSettlementItems(value: unknown): SettlementItemDetail[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const definitionId = asOptionalStringValue(entry.definitionId);
    const name = asOptionalStringValue(entry.name);
    const kind = asOptionalStringValue(entry.kind);
    if (!definitionId || !name || !kind) return [];
    return [{
      instanceId: asString(entry.instanceId, definitionId),
      definitionId,
      name,
      kind: kind as SettlementItemDetail["kind"],
      rarity: asOptionalStringValue(entry.rarity) as SettlementItemDetail["rarity"],
      goldValue: asNumber(entry.goldValue, 0),
      treasureValue: asNumber(entry.treasureValue, 0)
    }];
  });
  return items.length > 0 ? items : undefined;
}

function asOptionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value.map(String).filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

function cryptoId(): string {
  return `local-${Math.random().toString(36).slice(2, 8)}`;
}

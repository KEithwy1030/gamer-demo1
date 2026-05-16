import Phaser from "phaser";
import {
  AttackRequestPayload,
  INVENTORY_HEIGHT,
  INVENTORY_WIDTH,
  CombatEventPayload,
  MatchStartedPayload,
  MonsterState,
  PlayerState,
  RoomRuntimeSnapshot,
  SettlementPayload,
  SkillId,
  Vector2,
  WorldDrop
} from "@gamer/shared";
import type { InventoryUpdateEvent, SettlementEnvelope } from "../network";
import { GameSocketClient, type GameSocketClientOptions, type Unsubscribe } from "../network";
import { MatchRuntimeStore, type MatchInventoryState } from "../game";
import type { MatchInventoryItem } from "../game/matchRuntime";
import { GameAudioController } from "../audio/gameAudio";
import { translateItemName } from "../ui/itemPresentation";
import { GameScene } from "./GameScene";
import { applySmoothTextureSampling, GAME_RENDER_CONFIG } from "./gameScene/renderTuning";
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
  setCombatResult(payload: CombatEventPayload): void;
  onPlayerAttack(payload: { playerId: string; attackId: string; targetId?: string }): void;
  setTimer(secondsRemaining: number): void;
  setExtractState(payload: Partial<ExtractUiState>): void;
  toggleInventory(): void;
  getSelfPlayerId(): string | null;
  getMatchSnapshot(): RoomRuntimeSnapshot | null;
  sendMoveInput(direction: Vector2): void;
  startExtract(): void;
}

export function createGameClientController(
  options: GameClientControllerOptions
): GameClientController {
  const GAME_VIEW_WIDTH = 1280;
  const GAME_VIEW_HEIGHT = 720;
  const runtime = new MatchRuntimeStore();
  const network = new GameSocketClient(options);
  const audio = new GameAudioController();
  const subscriptions: Unsubscribe[] = [];

  let game: Phaser.Game | null = null;
  let extractState = createInitialExtractState();
  let releaseViewportSync: (() => void) | null = null;
  let viewportSyncFrame = 0;

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
      extractState = createInitialExtractState();
      options.onExtractStateChange?.(extractState);
      options.onInventoryChange?.(null);
      mount();
      getScene()?.setExtractState(extractState);
    },
    applyPlayers(players) {
      runtime.updatePlayers(players);
    },
    applyMonsters(monsters) {
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
          getScene()?.showPickupFeedback(gainedItem.name);
          audio.play("pickup");
        }
      }
      runtime.setInventory(normalized);
      options.onInventoryChange?.(normalized);
    },
    setCombatResult(payload) {
      const selfPlayerId = controller.getSelfPlayerId();
      audio.play(payload.targetId === selfPlayerId ? "hurt" : "hit");
      getScene()?.onCombatResult?.(payload);
    },
    onPlayerAttack(payload) {
      if (payload.playerId === controller.getSelfPlayerId()) {
        audio.play("attack");
      }
      getScene()?.onPlayerAttack?.(payload);
    },
    setTimer(secondsRemaining) {
      runtime.setTimer(secondsRemaining);
    },
    setExtractState(payload) {
      extractState = {
        ...extractState,
        ...payload
      };
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
    sendMoveInput(direction) {
      network.sendMoveInput({ direction });
    },
    startExtract() {
      network.sendStartExtract();
    }
  };

  subscriptions.push(
    network.onPlayersState((players) => controller.applyPlayers(players)),
    network.onMonstersState((monsters) => controller.applyMonsters(monsters)),
    network.onDropsState((drops) => controller.applyDrops(drops)),
    network.onInventoryUpdate((payload) => controller.setInventory(payload)),
    network.onPlayerAttack((payload) => controller.onPlayerAttack(payload)),
    network.onCombatResult((payload) => controller.setCombatResult(payload)),
    network.onMatchTimer((secondsRemaining) => controller.setTimer(secondsRemaining)),
    network.onExtractOpened((payload) => {
      const openedState = normalizeExtractOpened(extractState, payload);
      controller.setExtractState({
        ...openedState,
        carrier: payload?.carrier,
        squadStatus: payload?.squadStatus,
        ...resolvePrimaryExtractZone(payload)
      });
    }),
    network.onExtractProgress((payload) => {
      const selfPlayerId = controller.getSelfPlayerId();
      if (payload && typeof payload === "object" && "playerId" in payload) {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
        if (playerId && playerId !== selfPlayerId) return;
      }
      controller.setExtractState(normalizeExtractProgress(payload));
    }),
    network.onExtractSuccess((payload) => {
      const selfPlayerId = controller.getSelfPlayerId();
      if (payload?.playerId && payload.playerId !== selfPlayerId) return;
      audio.play("extract");
      controller.setExtractState({
        phase: "succeeded",
        isOpen: true,
        isExtracting: false,
        progress: 1,
        secondsRemaining: 0,
        message: "撤离完成，正在结算",
        didSucceed: true,
        squadStatus: payload?.squadStatus
      });
    }),
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
        didSucceed: settlement.result === "success"
      });
      options.onSettlement?.(settlement);
    }),
    network.onChestOpened((payload) => {
      if (!payload || payload.playerId === controller.getSelfPlayerId()) {
        audio.play("chest");
      }
    })
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
      subscribeChestsInit: (cb: any) => network.onChestsInit(cb),
      subscribeChestOpened: (cb: any) => network.onChestOpened(cb)
    });
    syncGameViewport();
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
  const rawEquipment = isRecord(inventoryRoot.equipment) ? inventoryRoot.equipment : {};
  return {
    width: asNumber(inventoryRoot.width, INVENTORY_WIDTH),
    height: asNumber(inventoryRoot.height, INVENTORY_HEIGHT),
    items: inventoryItems.flatMap((entry) => {
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
        healAmount: asOptionalNumber(item.healAmount),
        modifiers: normalizeItemModifiers(item.modifiers),
        affixes: normalizeAffixes(item.affixes)
      }];
    }),
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
          healAmount: asOptionalNumber(item.healAmount),
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
        definitionId: asString(item.definitionId, asString(item.templateId, "unknown"))
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
    retainedItems: Array.isArray(settlement.retainedItems) ? settlement.retainedItems.map((item) => translateItemName(String(item))) : [],
    lostItems: Array.isArray(settlement.lostItems) ? settlement.lostItems.map((item) => translateItemName(String(item))) : [],
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

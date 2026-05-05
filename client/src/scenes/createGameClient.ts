import Phaser from "phaser";
import {
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
import type { ExtractOpenedPayload, ExtractProgressPayload, InventoryUpdateEvent, SettlementEnvelope } from "../network";
import { GameSocketClient, type GameSocketClientOptions, type Unsubscribe } from "../network";
import { MatchRuntimeStore, type MatchInventoryState } from "../game";
import type { MatchInventoryItem } from "../game/matchRuntime";
import { translateItemName } from "../ui/itemPresentation";
import { GameScene } from "./GameScene";

export interface GameClientControllerOptions extends GameSocketClientOptions {
  parent: HTMLElement | string;
  onSettlement?: (payload: SettlementPayload) => void;
  onExtractStateChange?: (payload: ExtractUiState) => void;
  onInventoryChange?: (payload: MatchInventoryState | null) => void;
  onToggleInventory?: () => void;
}

export interface ExtractUiState {
  phase: "idle" | "extracting" | "interrupted" | "succeeded";
  isOpen: boolean;
  isExtracting: boolean;
  progress: number | null;
  secondsRemaining: number | null;
  message: string | null;
  didSucceed: boolean;
  x?: number;
  y?: number;
  radius?: number;
}

export interface GameClientController {
  readonly network: GameSocketClient;
  mount(): void;
  connect(): void;
  disconnect(): void;
  destroy(): void;
  enterMatch(payload: MatchStartedPayload): void;
  applyPlayers(players: PlayerState[]): void;
  applyMonsters(monsters: MonsterState[]): void;
  applyDrops(drops: WorldDrop[]): void;
  setInventory(payload: InventoryUpdateEvent): void;
  setCombatResult(payload: CombatEventPayload): void;
  onPlayerAttack(payload: { playerId: string; attackId: string }): void;
  setTimer(secondsRemaining: number): void;
  setExtractState(payload: Partial<ExtractUiState>): void;
  toggleInventory(): void;
  getSelfPlayerId(): string | null;
  getMatchSnapshot(): RoomRuntimeSnapshot | null;
}

export function createGameClientController(
  options: GameClientControllerOptions
): GameClientController {
  const runtime = new MatchRuntimeStore();
  const network = new GameSocketClient(options);
  const subscriptions: Unsubscribe[] = [];

  let game: Phaser.Game | null = null;
  let lastViewportWidth = 0;
  let lastViewportHeight = 0;
  let extractState = createInitialExtractState();

  const controller: GameClientController = {
    network,
    mount,
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
        }
      }
      runtime.setInventory(normalized);
      options.onInventoryChange?.(normalized);
    },
    setCombatResult(payload) {
      runtime.setCombatText(
        `战斗: ${payload.attackerId.slice(0, 4)} -> ${payload.targetId.slice(0, 4)} -${payload.amount}`
      );
      getScene()?.onCombatResult?.(payload);
    },
    onPlayerAttack(payload) {
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
          safeCrossings: []
        }
      };
    }
  };

  subscriptions.push(
    network.onMatchStarted((payload) => controller.enterMatch(payload)),
    network.onPlayersState((players) => controller.applyPlayers(players)),
    network.onMonstersState((monsters) => controller.applyMonsters(monsters)),
    network.onDropsState((drops) => controller.applyDrops(drops)),
    network.onInventoryUpdate((payload) => controller.setInventory(payload)),
    network.onPlayerAttack((payload) => controller.onPlayerAttack(payload)),
    network.onCombatResult((payload) => controller.setCombatResult(payload)),
    network.onMatchTimer((secondsRemaining) => controller.setTimer(secondsRemaining)),
    network.onExtractOpened((payload) => {
      controller.setExtractState({
        phase: "idle",
        isOpen: resolveExtractOpen(payload),
        isExtracting: false,
        progress: null,
        secondsRemaining: resolveCountdownSeconds(payload),
        message: buildExtractMessage(payload),
        didSucceed: false,
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
      controller.setExtractState({
        phase: "succeeded",
        isOpen: true,
        isExtracting: false,
        progress: 1,
        secondsRemaining: 0,
        message: "撤离完成，正在结算",
        didSucceed: true
      });
    }),
    network.onSettlement((payload) => {
      const selfPlayerId = controller.getSelfPlayerId();
      if (payload && typeof payload === "object" && "playerId" in payload) {
        const playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
        if (playerId && playerId !== selfPlayerId) return;
      }

      const settlement = normalizeSettlementPayload(payload);
      controller.setExtractState({
        phase: settlement.result === "success" ? "succeeded" : "idle",
        isExtracting: false,
        progress: settlement.result === "success" ? 1 : null,
        secondsRemaining: 0,
        message: settlement.result === "success" ? "已成功带出物资" : `撤离失败：${settlement.reason ?? "未知原因"}`,
        didSucceed: settlement.result === "success"
      });
      options.onSettlement?.(settlement);
    })
  );

  return controller;

  function mount(): void {
    if (game) {
      syncGameViewport();
      return;
    }

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: options.parent,
      width: 1280,
      height: 720,
      pixelArt: true,
      antialias: false,
      autoRound: true,
      backgroundColor: "#020617",
      scene: [GameScene],
      physics: {
        default: "arcade",
        arcade: {
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    });
    syncGameViewport();
    game.scene.start(GameScene.KEY, {
      runtime,
      extractState,
      onMoveInput: (direction: Vector2) => network.sendMoveInput({ direction }),
      onAttack: () => network.sendAttack({ attackId: `atk-${Date.now()}` }),
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
  }

  function destroy(): void {
    for (const unsubscribe of subscriptions) unsubscribe();
    network.destroy();
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
    if (!game) return;
    const parent = typeof options.parent === "string" ? document.querySelector<HTMLElement>(options.parent) : options.parent;
    if (!parent) return;
    const resize = () => {
      const width = Math.max(1, Math.round(parent.clientWidth));
      const height = Math.max(1, Math.round(parent.clientHeight));
      if (width === lastViewportWidth && height === lastViewportHeight) {
        return;
      }
      lastViewportWidth = width;
      lastViewportHeight = height;
      game?.scale.resize(width, height);
    };
    resize();
  }
}

function createInitialExtractState(): ExtractUiState {
  return {
    phase: "idle",
    isOpen: false,
    isExtracting: false,
    progress: null,
    secondsRemaining: null,
    message: "8分钟后开放中心撤离点，先搜再收束。",
    didSucceed: false
  };
}

function resolveExtractOpen(payload: ExtractOpenedPayload | undefined): boolean {
  if (!payload) return true;
  return payload.zones.some((zone) => zone.isOpen);
}

function resolveCountdownSeconds(payload: ExtractOpenedPayload | undefined): number | null {
  const openZones = payload?.zones.filter((zone) => zone.isOpen) ?? [];
  if (openZones.length === 0) return null;
  return Math.max(0, Math.ceil(openZones[0]!.channelDurationMs / 1000));
}

function resolvePrimaryExtractZone(payload: ExtractOpenedPayload | undefined): { x?: number; y?: number; radius?: number } {
  const zone = payload?.zones.find((entry) => entry.isOpen) ?? payload?.zones[0];
  if (!zone) {
    return {};
  }
  return {
    x: zone.x,
    y: zone.y,
    radius: zone.radius
  };
}

function buildExtractMessage(payload: ExtractOpenedPayload | undefined): string {
  const zoneCount = payload?.zones.filter((zone) => zone.isOpen).length ?? 0;
  if (zoneCount > 1) {
    return `撤离通道已开 ${zoneCount} 处，高价值携带者优先撤离。`;
  }
  return "中心撤离点已开放，尸毒会持续加压。";
}

function normalizeExtractProgress(payload: ExtractProgressPayload | number | undefined): Partial<ExtractUiState> {
  if (typeof payload === "number") {
      return {
        phase: payload >= 1 ? "succeeded" : (payload > 0 && payload < 1 ? "extracting" : "idle"),
        isOpen: true,
        isExtracting: payload > 0 && payload < 1,
        progress: Phaser.Math.Clamp(payload, 0, 1),
        secondsRemaining: null,
        message: payload >= 1 ? "撤离完成，收益结算中。" : "撤离读条中，受击会中断。"
      };
  }

  const rawProgress = typeof payload?.durationMs === "number" && typeof payload?.remainingMs === "number"
    ? 1 - payload.remainingMs / Math.max(1, payload.durationMs)
    : null;
  const progress = rawProgress == null ? null : Phaser.Math.Clamp(rawProgress, 0, 1);
  const secondsRemaining = typeof payload?.remainingMs === "number" ? Math.max(0, Math.ceil(payload.remainingMs / 1000)) : null;
  const interrupted = payload?.status === "interrupted";
  const active = !interrupted && (payload?.status === "started" || payload?.status === "progress");

  return {
    phase: interrupted ? "interrupted" : (progress === 1 ? "succeeded" : (active ? "extracting" : "idle")),
    isOpen: true,
    isExtracting: active,
    progress: interrupted ? null : progress,
    secondsRemaining,
    message: interrupted ? "撤离被打断，立即拉开重进。" : (active ? "撤离读条中，受击会中断。" : (progress === 1 ? "撤离完成，收益结算中。" : "撤离点待命")),
    didSucceed: progress === 1
  };
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

function cryptoId(): string {
  return `local-${Math.random().toString(36).slice(2, 8)}`;
}

import Phaser from "phaser";
import type {
  CombatEventPayload,
  MatchStartedPayload,
  MonsterState,
  PlayerState,
  RoomRuntimeSnapshot,
  SettlementPayload,
  SkillId,
  Vector2,
  WorldDrop
} from "../../../shared/src/index";
import type { InventoryUpdateEvent, SettlementEnvelope } from "../network";
import { GameSocketClient, type ExtractProgressPayload, type GameSocketClientOptions, type Unsubscribe } from "../network";
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
      const normalized = normalizeInventoryEvent(payload);
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
        players: state.players
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
        isOpen: resolveExtractOpen(payload),
        isExtracting: false,
        progress: null,
        secondsRemaining: resolveCountdownSeconds(payload),
        message: payload?.message ?? "撤离点现已开启。",
        didSucceed: false,
        x: payload?.x,
        y: payload?.y,
        radius: payload?.radius
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
        isOpen: true,
        isExtracting: false,
        progress: 1,
        secondsRemaining: 0,
        message: payload?.message ?? "撤离完成，等待结算。",
        didSucceed: true
      });
    }),
    network.onSettlement((payload) => {
      const settlement = normalizeSettlementPayload(payload);
      controller.setExtractState({
        isExtracting: false,
        progress: settlement.result === "success" ? 1 : null,
        secondsRemaining: 0,
        message: settlement.result === "success" ? "结算已收到。" : `游戏结束: ${settlement.reason ?? "未知"}。`,
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

    // Detect if mobile portrait mode
    const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
    const baseWidth = isMobilePortrait ? 720 : 1280;  // Swap dimensions for portrait
    const baseHeight = isMobilePortrait ? 1280 : 720;

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: options.parent,
      width: baseWidth,
      height: baseHeight,
      backgroundColor: "#020617",
      scene: [GameScene],
      input: {
        activePointers: 3
      },
      physics: {
        default: "arcade",
        arcade: {
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        resizeInterval: 100
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
      game?.scale.resize(width, height);
    };
    resize();
    requestAnimationFrame(resize);
    setTimeout(resize, 50);
  }
}

function createInitialExtractState(): ExtractUiState {
  return {
    isOpen: false,
    isExtracting: false,
    progress: null,
    secondsRemaining: null,
    message: "撤离点将在后期开启。",
    didSucceed: false
  };
}

function resolveExtractOpen(payload: { opened?: boolean; available?: boolean } | undefined): boolean {
  if (!payload) return true;
  return payload.opened ?? payload.available ?? true;
}

function resolveCountdownSeconds(payload: { remainingMs?: number } | undefined): number | null {
  if (typeof payload?.remainingMs === "number") return Math.max(0, Math.ceil(payload.remainingMs / 1000));
  return null;
}

function normalizeExtractProgress(payload: ExtractProgressPayload | number | undefined): Partial<ExtractUiState> {
  if (typeof payload === "number") {
    return {
      isOpen: true,
      isExtracting: payload > 0 && payload < 1,
      progress: Phaser.Math.Clamp(payload, 0, 1),
      secondsRemaining: null,
      message: payload >= 1 ? "撤离完成。" : "正在撤离..."
    };
  }
  const rawProgress = typeof payload?.progress === "number" ? payload.progress : (typeof payload?.ratio === "number" ? payload.ratio : (typeof payload?.percent === "number" ? payload.percent / 100 : (typeof payload?.durationMs === "number" && typeof payload?.remainingMs === "number" ? 1 - payload.remainingMs / Math.max(1, payload.durationMs) : null)));
  const progress = rawProgress == null ? null : Phaser.Math.Clamp(rawProgress, 0, 1);
  const secondsRemaining = typeof payload?.remainingSeconds === "number" ? Math.max(0, payload.remainingSeconds) : (typeof payload?.remainingMs === "number" ? Math.max(0, Math.ceil(payload.remainingMs / 1000)) : null);
  const interrupted = payload?.interrupted === true || payload?.cancelled === true || payload?.status === "interrupted";
  const active = interrupted === true ? false : (typeof payload?.active === "boolean" ? payload.active : (payload?.status === "started" || payload?.status === "progress" ? true : (progress != null ? progress > 0 && progress < 1 : false)));
  return {
    isOpen: true,
    isExtracting: active,
    progress: interrupted ? null : progress,
    secondsRemaining,
    message: typeof payload?.message === "string" ? payload.message : (interrupted ? "撤离被打断。" : (active ? "正在撤离..." : (progress === 1 ? "撤离完成。" : "准备撤离。"))),
    didSucceed: progress === 1
  };
}

function normalizeInventoryEvent(payload: InventoryUpdateEvent): MatchInventoryState {
  const inventoryRoot = isRecord(payload.inventory) ? payload.inventory : {};
  const inventoryItems = Array.isArray(inventoryRoot.items) ? inventoryRoot.items : [];
  const rawEquipment = isRecord(payload.equipment) ? payload.equipment : (isRecord(inventoryRoot.equipment) ? inventoryRoot.equipment : {});
  return {
    width: asNumber(inventoryRoot.width, 10),
    height: asNumber(inventoryRoot.height, 6),
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
        x: asOptionalNumber(entry.x),
        y: asOptionalNumber(entry.y),
        slot: asOptionalStringValue(item.equipmentSlot) ?? asOptionalStringValue(item.slot),
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
          slot: asOptionalStringValue(item.equipmentSlot) ?? asOptionalStringValue(item.slot) ?? slot,
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
    extractedItems: Array.isArray(settlement.extractedItems) ? settlement.extractedItems.map((item) => translateItemName(String(item))) : []
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

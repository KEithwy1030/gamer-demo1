import { io, type Socket } from "socket.io-client";
import {
  type AttackRequestPayload,
  type CombatEventPayload,
  type CreateRoomPayload,
  type ExtractCarrierState,
  type ExtractSquadStatus,
  type InventorySnapshotPayload,
  type MatchStartedPayload,
  type MonsterState,
  type PlayerInputMovePayload,
  type PlayerState,
  type RoomErrorPayload,
  type RoomStartPayload,
  type RoomSummary,
  type SettlementPayload,
  SocketEvent,
  type WorldDrop
} from "@gamer/shared";
import { resolveServerUrl } from "./serverUrl";

export interface GameSocketClientOptions {
  serverUrl?: string;
  autoConnect?: boolean;
}

export type Unsubscribe = () => void;

export interface ExtractOpenedPayload {
  roomCode: string;
  carrier?: ExtractCarrierState;
  squadStatus?: ExtractSquadStatus;
  zones: Array<{
    zoneId: string;
    x: number;
    y: number;
    radius: number;
    channelDurationMs: number;
    openAtSec: number;
    isOpen: boolean;
  }>;
}

export interface ExtractProgressPayload {
  roomCode: string;
  playerId: string;
  zoneId: string;
  status: "started" | "progress" | "interrupted";
  remainingMs: number;
  durationMs: number;
  reason?: "damaged" | "left_zone" | "dead" | "timeout";
  squadStatus?: ExtractSquadStatus;
}

export interface ExtractSuccessPayload {
  roomCode: string;
  playerId: string;
  zoneId: string;
  extractedAt: number;
  settlement: SettlementPayload;
  squadStatus?: ExtractSquadStatus;
}

export interface ChestState {
  chestId: string;
  x: number;
  y: number;
  isOpen: boolean;
}

export interface ChestOpenedPayload {
  chestId: string;
  playerId: string;
  loot: InventorySnapshotPayload["inventory"]["items"];
}

export interface InventoryUpdateEvent {
  playerId: string;
  inventory: {
    width: number;
    height: number;
    items: Array<{ item: Record<string, unknown>; x: number; y: number }>;
    equipment?: Record<string, Record<string, unknown> | undefined>;
  };
}

export interface SettlementEnvelope {
  roomCode: string;
  playerId: string;
  settlement: SettlementPayload;
}

const DEFAULT_SERVER_PORT = "3000";

export class GameSocketClient {
  private readonly socket: Socket;

  constructor(options: GameSocketClientOptions = {}) {
    this.socket = io(options.serverUrl ?? resolveServerUrl(), {
      autoConnect: options.autoConnect ?? false,
      transports: ["websocket", "polling"]
    });
  }

  connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  disconnect(): void {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  destroy(): void {
    this.socket.removeAllListeners();
    this.socket.close();
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  get id(): string | undefined {
    return this.socket.id;
  }

  onConnect(listener: () => void): Unsubscribe {
    return this.on("connect", listener);
  }

  onDisconnect(listener: (reason: Socket.DisconnectReason) => void): Unsubscribe {
    return this.on("disconnect", listener);
  }

  onRoomState(listener: (room: RoomSummary) => void): Unsubscribe {
    return this.on(SocketEvent.RoomState, listener);
  }

  onRoomError(listener: (payload: RoomErrorPayload) => void): Unsubscribe {
    return this.on(SocketEvent.RoomError, listener);
  }

  onMatchStarted(listener: (payload: MatchStartedPayload) => void): Unsubscribe {
    return this.on(SocketEvent.MatchStarted, listener);
  }

  onMatchTimer(listener: (secondsRemaining: number) => void): Unsubscribe {
    return this.on(SocketEvent.MatchTimer, listener);
  }

  onPlayersState(listener: (players: PlayerState[]) => void): Unsubscribe {
    return this.on(SocketEvent.StatePlayers, listener);
  }

  onMonstersState(listener: (monsters: MonsterState[]) => void): Unsubscribe {
    return this.on(SocketEvent.StateMonsters, listener);
  }

  onDropsState(listener: (drops: WorldDrop[]) => void): Unsubscribe {
    return this.on(SocketEvent.StateDrops, listener);
  }

  onInventoryUpdate(listener: (payload: InventoryUpdateEvent) => void): Unsubscribe {
    return this.on(SocketEvent.InventoryUpdate, listener);
  }

  onPlayerAttack(listener: (payload: { playerId: string; attackId: string; targetId?: string }) => void): Unsubscribe {
    return this.on(SocketEvent.PlayerAttack, listener);
  }

  onCombatResult(listener: (payload: CombatEventPayload) => void): Unsubscribe {
    return this.on(SocketEvent.CombatResult, listener);
  }

  onExtractOpened(listener: (payload: ExtractOpenedPayload | undefined) => void): Unsubscribe {
    return this.on(SocketEvent.ExtractOpened, listener);
  }

  onExtractProgress(listener: (payload: ExtractProgressPayload | number | undefined) => void): Unsubscribe {
    return this.on(SocketEvent.ExtractProgress, listener);
  }

  onExtractSuccess(listener: (payload: ExtractSuccessPayload | undefined) => void): Unsubscribe {
    return this.on(SocketEvent.ExtractSuccess, listener);
  }

  onChestsInit(listener: (chests: ChestState[]) => void): Unsubscribe {
    return this.on(SocketEvent.ChestsInit, listener);
  }

  onChestOpened(listener: (payload: ChestOpenedPayload) => void): Unsubscribe {
    return this.on(SocketEvent.ChestOpened, listener);
  }

  onSettlement(listener: (payload: SettlementEnvelope | unknown) => void): Unsubscribe {
    return this.on(SocketEvent.MatchSettlement, listener);
  }

  createRoom(payload: CreateRoomPayload): void {
    this.socket.emit(SocketEvent.RoomCreate, payload);
  }

  joinRoom(payload: { code: string; playerName: string; profileId?: string; loadout?: InventorySnapshotPayload }): void {
    this.socket.emit(SocketEvent.RoomJoin, payload);
  }

  leaveRoom(payload?: { code?: string }): void {
    this.socket.emit(SocketEvent.RoomLeave, payload);
  }

  setCapacity(payload: { code: string; capacity: number }): void {
    this.socket.emit(SocketEvent.RoomSetCapacity, payload);
  }

  startRoom(payload?: RoomStartPayload): void {
    this.socket.emit(SocketEvent.RoomStart, payload);
  }

  sendMoveInput(payload: PlayerInputMovePayload): void {
    this.socket.emit(SocketEvent.PlayerInputMove, payload);
  }

  sendAttack(payload: AttackRequestPayload): void {
    this.socket.emit(SocketEvent.PlayerAttack, payload);
  }

  sendCastSkill(payload: { skillId: string }): void {
    this.socket.emit(SocketEvent.PlayerCastSkill, payload);
  }

  sendPickup(payload: { dropId: string }): void {
    this.socket.emit(SocketEvent.PlayerPickup, payload);
  }

  sendEquipItem(payload: { itemInstanceId: string }): void {
    this.socket.emit(SocketEvent.PlayerEquipItem, payload);
  }

  sendUnequipItem(payload: { itemInstanceId: string }): void {
    this.socket.emit("player:unequipItem", payload);
  }

  sendDropItem(payload: { itemInstanceId: string }): void {
    this.socket.emit(SocketEvent.PlayerDropItem, payload);
  }

  sendMoveItem(payload: { itemInstanceId: string; targetArea: "grid" | "equipment"; slot?: string; swapItemInstanceId?: string; x?: number; y?: number }): void {
    this.socket.emit(SocketEvent.PlayerMoveItem, payload);
  }

  sendUseItem(payload: { itemInstanceId: string }): void {
    this.socket.emit(SocketEvent.PlayerUseItem, payload);
  }

  sendStartExtract(): void {
    this.socket.emit(SocketEvent.PlayerStartExtract);
  }

  sendOpenChest(chestId: string): void {
    this.socket.emit(SocketEvent.PlayerOpenChest, { chestId });
  }

  private on<TPayload>(event: string, listener: (payload: TPayload) => void): Unsubscribe {
    this.socket.on(event, listener);
    return () => {
      this.socket.off(event, listener);
    };
  }
}

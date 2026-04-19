import { io, type Socket } from "socket.io-client";
import {
  type CombatEventPayload,
  SocketEvent,
  type MatchStartedPayload,
  type MonsterState,
  type PlayerInputMovePayload,
  type PlayerState,
  type RoomErrorPayload,
  type RoomSummary,
  type WorldDrop
} from "../../../shared/src/index";

export interface GameSocketClientOptions {
  serverUrl?: string;
  autoConnect?: boolean;
}

export type Unsubscribe = () => void;

export interface ExtractOpenedPayload {
  opened?: boolean;
  available?: boolean;
  availableAtMs?: number;
  remainingMs?: number;
  message?: string;
  roomCode?: string;
  x?: number;
  y?: number;
  radius?: number;
  channelDurationMs?: number;
}

export interface ExtractProgressPayload {
  playerId?: string;
  progress?: number;
  ratio?: number;
  percent?: number;
  remainingMs?: number;
  remainingSeconds?: number;
  active?: boolean;
  interrupted?: boolean;
  cancelled?: boolean;
  message?: string;
  status?: "started" | "progress" | "interrupted";
  durationMs?: number;
  reason?: string;
}

export interface ExtractSuccessPayload {
  playerId?: string;
  roomCode?: string;
  message?: string;
  extractedAt?: number;
  settlement?: unknown;
}

export interface InventoryUpdateEvent {
  playerId?: string;
  inventory?: unknown;
  equipment?: unknown;
}

export interface SettlementEnvelope {
  roomCode?: string;
  playerId?: string;
  settlement?: unknown;
}

export interface ChestState {
  id: string;
  x: number;
  y: number;
  isOpen: boolean;
}

export interface ChestOpenedPayload {
  chestId: string;
  playerId: string;
  loot: any[];
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

  createRoom(payload: { playerName: string }): void {
    this.socket.emit(SocketEvent.RoomCreate, payload);
  }

  joinRoom(payload: { code: string; playerName: string }): void {
    this.socket.emit(SocketEvent.RoomJoin, payload);
  }

  leaveRoom(payload?: { code?: string }): void {
    this.socket.emit(SocketEvent.RoomLeave, payload);
  }

  setCapacity(payload: { code: string; capacity: number }): void {
    this.socket.emit(SocketEvent.RoomSetCapacity, payload);
  }

  startRoom(payload?: { code?: string }): void {
    this.socket.emit(SocketEvent.RoomStart, payload);
  }

  sendMoveInput(payload: PlayerInputMovePayload): void {
    this.socket.emit(SocketEvent.PlayerInputMove, payload);
  }

  sendAttack(payload: { attackId: string }): void {
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

function resolveServerUrl(): string {
  const explicit = import.meta.env.VITE_SERVER_URL;
  if (explicit) {
    return explicit;
  }

  if (typeof window === "undefined") {
    return `http://localhost:${DEFAULT_SERVER_PORT}`;
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:${DEFAULT_SERVER_PORT}`;
}

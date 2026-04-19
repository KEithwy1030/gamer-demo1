import { io } from "socket.io-client";
import { SocketEvent } from "../../../shared/src/index";
const DEFAULT_SERVER_PORT = "3000";
export class GameSocketClient {
    socket;
    constructor(options = {}) {
        this.socket = io(options.serverUrl ?? resolveServerUrl(), {
            autoConnect: options.autoConnect ?? false,
            transports: ["websocket", "polling"]
        });
    }
    connect() {
        if (!this.socket.connected) {
            this.socket.connect();
        }
    }
    disconnect() {
        if (this.socket.connected) {
            this.socket.disconnect();
        }
    }
    destroy() {
        this.socket.removeAllListeners();
        this.socket.close();
    }
    get connected() {
        return this.socket.connected;
    }
    get id() {
        return this.socket.id;
    }
    onConnect(listener) {
        return this.on("connect", listener);
    }
    onDisconnect(listener) {
        return this.on("disconnect", listener);
    }
    onRoomState(listener) {
        return this.on(SocketEvent.RoomState, listener);
    }
    onRoomError(listener) {
        return this.on(SocketEvent.RoomError, listener);
    }
    onMatchStarted(listener) {
        return this.on(SocketEvent.MatchStarted, listener);
    }
    onMatchTimer(listener) {
        return this.on(SocketEvent.MatchTimer, listener);
    }
    onPlayersState(listener) {
        return this.on(SocketEvent.StatePlayers, listener);
    }
    onMonstersState(listener) {
        return this.on(SocketEvent.StateMonsters, listener);
    }
    onDropsState(listener) {
        return this.on(SocketEvent.StateDrops, listener);
    }
    onInventoryUpdate(listener) {
        return this.on(SocketEvent.InventoryUpdate, listener);
    }
    onCombatResult(listener) {
        return this.on(SocketEvent.CombatResult, listener);
    }
    onExtractOpened(listener) {
        return this.on(SocketEvent.ExtractOpened, listener);
    }
    onExtractProgress(listener) {
        return this.on(SocketEvent.ExtractProgress, listener);
    }
    onExtractSuccess(listener) {
        return this.on(SocketEvent.ExtractSuccess, listener);
    }
    onChestsInit(listener) {
        return this.on(SocketEvent.ChestsInit, listener);
    }
    onChestOpened(listener) {
        return this.on(SocketEvent.ChestOpened, listener);
    }
    onSettlement(listener) {
        return this.on(SocketEvent.MatchSettlement, listener);
    }
    createRoom(payload) {
        this.socket.emit(SocketEvent.RoomCreate, payload);
    }
    joinRoom(payload) {
        this.socket.emit(SocketEvent.RoomJoin, payload);
    }
    leaveRoom(payload) {
        this.socket.emit(SocketEvent.RoomLeave, payload);
    }
    setCapacity(payload) {
        this.socket.emit(SocketEvent.RoomSetCapacity, payload);
    }
    startRoom(payload) {
        this.socket.emit(SocketEvent.RoomStart, payload);
    }
    sendMoveInput(payload) {
        this.socket.emit(SocketEvent.PlayerInputMove, payload);
    }
    sendAttack(payload) {
        this.socket.emit(SocketEvent.PlayerAttack, payload);
    }
    sendCastSkill(payload) {
        this.socket.emit(SocketEvent.PlayerCastSkill, payload);
    }
    sendPickup(payload) {
        this.socket.emit(SocketEvent.PlayerPickup, payload);
    }
    sendEquipItem(payload) {
        this.socket.emit(SocketEvent.PlayerEquipItem, payload);
    }
    sendUnequipItem(payload) {
        this.socket.emit("player:unequipItem", payload);
    }
    sendDropItem(payload) {
        this.socket.emit(SocketEvent.PlayerDropItem, payload);
    }
    sendUseItem(payload) {
        this.socket.emit(SocketEvent.PlayerUseItem, payload);
    }
    sendStartExtract() {
        this.socket.emit(SocketEvent.PlayerStartExtract);
    }
    sendOpenChest(chestId) {
        this.socket.emit(SocketEvent.PlayerOpenChest, { chestId });
    }
    on(event, listener) {
        this.socket.on(event, listener);
        return () => {
            this.socket.off(event, listener);
        };
    }
}
function resolveServerUrl() {
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

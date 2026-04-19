import "../styles/lobby.css";
import { MockLobbyController } from "./mockLobbyController";
import { LobbyView } from "../ui/lobbyView";
const normalizeName = (value) => value.trim().slice(0, 18);
const normalizeRoomCode = (value) => value.trim().replace(/\s+/g, "").slice(0, 6).toUpperCase();
const createInitialState = (initialState) => ({
    screen: "lobby",
    playerName: "",
    roomCodeInput: "",
    currentRoom: null,
    errorMessage: null,
    infoMessage: "你可以先用本地 mock 控制器试玩 UI，后续主会话只需接入网络层。",
    isBusy: false,
    ...initialState,
});
export class LobbyApp {
    root;
    controller;
    onEnterGame;
    runtimeApi;
    view;
    state;
    constructor(options) {
        this.root = options.root;
        this.controller = options.controller ?? new MockLobbyController();
        this.onEnterGame = options.onEnterGame;
        this.state = createInitialState(options.initialState);
        this.runtimeApi = {
            getState: () => this.state,
            setState: (nextState) => {
                this.state = {
                    ...this.state,
                    ...nextState,
                };
                this.render();
            },
            setRoomState: (roomState) => {
                this.state = {
                    ...this.state,
                    currentRoom: roomState,
                    screen: roomState ? "room" : "lobby",
                    errorMessage: null,
                };
                this.render();
            },
            enterGame: (transition) => {
                this.onEnterGame?.(transition);
            },
        };
        this.view = new LobbyView(this.controller, this.runtimeApi, {
            onPlayerNameChange: (value) => {
                this.patchState({
                    playerName: value,
                    errorMessage: null,
                });
            },
            onRoomCodeInputChange: (value) => {
                this.patchState({
                    roomCodeInput: normalizeRoomCode(value),
                    errorMessage: null,
                });
            },
            onCreateRoom: () => {
                void this.handleCreateRoom();
            },
            onJoinRoom: () => {
                void this.handleJoinRoom();
            },
            onLeaveRoom: () => {
                void this.handleLeaveRoom();
            },
            onCapacityChange: (capacity) => {
                void this.handleCapacityChange(capacity);
            },
            onStartMatch: () => {
                void this.handleStartMatch();
            },
        });
    }
    async mount() {
        this.root.replaceChildren(this.view.element);
        this.render();
        if (this.controller.initialize) {
            await this.controller.initialize(this.runtimeApi);
        }
    }
    destroy() {
        this.view.destroy();
    }
    render() {
        this.view.render(this.state);
    }
    patchState(nextState) {
        this.state = {
            ...this.state,
            ...nextState,
        };
        this.render();
    }
    requirePlayerName() {
        const playerName = normalizeName(this.state.playerName);
        if (!playerName) {
            throw new Error("请输入玩家名后再继续。");
        }
        return playerName;
    }
    requireRoomState() {
        const roomState = this.state.currentRoom;
        if (!roomState) {
            throw new Error("当前不在房间中。");
        }
        return roomState;
    }
    async runTask(task) {
        this.patchState({
            isBusy: true,
            errorMessage: null,
        });
        try {
            await task();
        }
        catch (error) {
            this.patchState({
                errorMessage: error instanceof Error ? error.message : "发生未知错误。",
            });
        }
        finally {
            this.patchState({
                isBusy: false,
            });
        }
    }
    async handleCreateRoom() {
        await this.runTask(async () => {
            const playerName = this.requirePlayerName();
            const roomState = await this.controller.createRoom(playerName);
            this.consumeRoomState(roomState, "房间已创建，等待其他玩家加入。");
        });
    }
    async handleJoinRoom() {
        await this.runTask(async () => {
            const playerName = this.requirePlayerName();
            const roomCode = normalizeRoomCode(this.state.roomCodeInput);
            if (!roomCode) {
                throw new Error("请输入 6 位房间号。");
            }
            const roomState = await this.controller.joinRoom(playerName, roomCode);
            this.consumeRoomState(roomState, `已加入房间 ${roomState.roomCode}。`);
        });
    }
    async handleLeaveRoom() {
        await this.runTask(async () => {
            const roomState = this.requireRoomState();
            await this.controller.leaveRoom(roomState.roomCode, roomState.localPlayerId);
            this.patchState({
                currentRoom: null,
                screen: "lobby",
                roomCodeInput: "",
                infoMessage: "你已离开房间。",
            });
        });
    }
    async handleCapacityChange(capacity) {
        if (!this.controller.updateCapacity) {
            return;
        }
        await this.runTask(async () => {
            const roomState = this.requireRoomState();
            const nextRoomState = await this.controller.updateCapacity(roomState.roomCode, roomState.localPlayerId, capacity);
            this.consumeRoomState(nextRoomState, `人数上限已调整到 ${capacity} 人。`);
        });
    }
    async handleStartMatch() {
        if (!this.controller.startMatch) {
            return;
        }
        await this.runTask(async () => {
            const roomState = this.requireRoomState();
            this.patchState({
                currentRoom: {
                    ...roomState,
                    status: "starting",
                },
            });
            await this.controller.startMatch(roomState.roomCode, roomState.localPlayerId);
        });
    }
    consumeRoomState(roomState, infoMessage) {
        this.patchState({
            currentRoom: roomState,
            screen: "room",
            roomCodeInput: roomState.roomCode,
            infoMessage,
            errorMessage: null,
        });
    }
}
export const bootstrapLobbyApp = async (options) => {
    const app = new LobbyApp(options);
    await app.mount();
    return app;
};

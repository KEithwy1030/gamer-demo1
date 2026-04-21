import "../styles/lobby.css";

import { MockLobbyController } from "./mockLobbyController";
import type {
  LobbyController,
  LobbyGameTransition,
  LobbyRuntimeApi,
  LobbyRuntimeOptions,
  LobbyState,
  RoomState,
} from "./lobbyTypes";
import { LobbyView } from "../ui/lobbyView";

const normalizeName = (value: string) => value.trim().slice(0, 18);
const normalizeRoomCode = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.\uFF0E\u3002\u30FB路]/g, "·")
    .slice(0, 8)
    .toUpperCase();

const createInitialState = (initialState?: Partial<LobbyState>): LobbyState => ({
  screen: "lobby",
  playerName: "",
  roomCodeInput: "",
  currentRoom: null,
  errorMessage: null,
  infoMessage: "大厅壳层已切到新版设计，已开发流程继续使用真实房间逻辑。",
  isBusy: false,
  ...initialState,
});

export class LobbyApp {
  private readonly root: HTMLElement;
  private readonly controller: LobbyController;
  private readonly onEnterGame?: (transition: LobbyGameTransition) => void;
  private readonly runtimeApi: LobbyRuntimeApi;
  private readonly view: LobbyView;
  private state: LobbyState;

  constructor(options: LobbyRuntimeOptions) {
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

  private render() {
    this.view.render(this.state);
  }

  private patchState(nextState: Partial<LobbyState>) {
    this.state = {
      ...this.state,
      ...nextState,
    };
    this.render();
  }

  private requirePlayerName() {
    const playerName = normalizeName(this.state.playerName);
    if (!playerName) {
      throw new Error("请先输入玩家代号。");
    }
    return playerName;
  }

  private requireRoomState() {
    const roomState = this.state.currentRoom;
    if (!roomState) {
      throw new Error("当前不在任何频道中。");
    }
    return roomState;
  }

  private async runTask(task: () => Promise<void>) {
    this.patchState({
      isBusy: true,
      errorMessage: null,
    });

    try {
      await task();
    } catch (error) {
      this.patchState({
        errorMessage: error instanceof Error ? error.message : "发生未知错误。",
      });
    } finally {
      this.patchState({
        isBusy: false,
      });
    }
  }

  private async handleCreateRoom() {
    await this.runTask(async () => {
      const playerName = this.requirePlayerName();
      const roomState = await this.controller.createRoom(playerName);
      this.consumeRoomState(roomState, "频道已创建，等待其他玩家加入。");
    });
  }

  private async handleJoinRoom() {
    await this.runTask(async () => {
      const playerName = this.requirePlayerName();
      const roomCode = normalizeRoomCode(this.state.roomCodeInput);

      if (!roomCode) {
        throw new Error("请输入 6 位频道代码。");
      }

      const roomState = await this.controller.joinRoom(playerName, roomCode);
      this.consumeRoomState(roomState, `已加入频道 ${roomState.roomCode}。`);
    });
  }

  private async handleLeaveRoom() {
    await this.runTask(async () => {
      const roomState = this.requireRoomState();
      await this.controller.leaveRoom(roomState.roomCode, roomState.localPlayerId);
      this.patchState({
        currentRoom: null,
        screen: "lobby",
        roomCodeInput: "",
        infoMessage: "你已离开频道。",
      });
    });
  }

  private async handleCapacityChange(capacity: number) {
    if (!this.controller.updateCapacity) {
      return;
    }

    await this.runTask(async () => {
      const roomState = this.requireRoomState();
      const nextRoomState = await this.controller.updateCapacity!(
        roomState.roomCode,
        roomState.localPlayerId,
        capacity,
      );
      this.consumeRoomState(nextRoomState, `人数上限已调整到 ${capacity} 人。`);
    });
  }

  private async handleStartMatch() {
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
      await this.controller.startMatch!(roomState.roomCode, roomState.localPlayerId);
    });
  }

  private consumeRoomState(roomState: RoomState, infoMessage: string) {
    this.patchState({
      currentRoom: roomState,
      screen: "room",
      roomCodeInput: roomState.roomCode,
      infoMessage,
      errorMessage: null,
    });
  }
}

export const bootstrapLobbyApp = async (options: LobbyRuntimeOptions) => {
  const app = new LobbyApp(options);
  await app.mount();
  return app;
};

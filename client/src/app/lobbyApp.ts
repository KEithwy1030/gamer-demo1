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
import { buildProfileLoadoutSnapshot, moveProfileItem, updateProfilePreference } from "../profile/localProfile";

const normalizeName = (value: string) => value.trim().slice(0, 18);
const normalizeRoomCode = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.\uFF0E\u3002\u30FB路]/g, "·")
    .slice(0, 8)
    .toUpperCase();

const createInitialState = (options: LobbyRuntimeOptions): LobbyState => ({
  screen: "lobby",
  activeTab: "hall",
  playerName: options.profile.displayName,
  roomCodeInput: "",
  currentRoom: null,
  errorMessage: null,
  infoMessage: "输入代号后创建频道，或用频道代码加入队伍。",
  isBusy: false,
  botDifficulty: options.profile.botDifficulty,
  profile: options.profile,
  ...options.initialState,
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
    this.state = createInitialState(options);

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
        const nextProfile = updateProfilePreference(this.state.profile, { displayName: normalizeName(value) });
        options.onProfileChange?.(nextProfile);
        this.patchState({
          playerName: value,
          profile: nextProfile,
          errorMessage: null,
        });
      },
      onTabChange: (activeTab: LobbyState["activeTab"]) => {
        this.patchState({ activeTab });
      },
      onBotDifficultyChange: (botDifficulty) => {
        const nextProfile = updateProfilePreference(this.state.profile, { botDifficulty });
        options.onProfileChange?.(nextProfile);
        this.patchState({
          botDifficulty,
          profile: nextProfile,
          errorMessage: null,
          infoMessage: `Bot强度已切换为 ${formatBotDifficulty(botDifficulty)}。`,
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
      onStashMoveItem: (payload) => {
        try {
          const nextProfile = moveProfileItem(this.state.profile, payload);
          options.onProfileChange?.(nextProfile);
          this.patchState({
            profile: nextProfile,
            errorMessage: null,
            infoMessage: "行囊已整理。"
          });
        } catch (error) {
          this.patchState({
            errorMessage: error instanceof Error ? error.message : "行囊整理失败。"
          });
        }
      }
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
      const roomState = await this.controller.createRoom(
        playerName,
        this.state.botDifficulty,
        buildProfileLoadoutSnapshot(this.state.profile)
      );
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

      const roomState = await this.controller.joinRoom(
        playerName,
        roomCode,
        buildProfileLoadoutSnapshot(this.state.profile)
      );
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
      await this.controller.startMatch!(
        roomState.roomCode,
        roomState.localPlayerId,
        this.state.botDifficulty,
        buildProfileLoadoutSnapshot(this.state.profile)
      );
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

function formatBotDifficulty(value: LobbyState["botDifficulty"]): string {
  if (value === "easy") return "简易";
  if (value === "hard") return "困难";
  return "中等";
}

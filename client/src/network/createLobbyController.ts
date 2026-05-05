import type { BotDifficulty, InventorySnapshotPayload, MatchStartedPayload, RoomSummary } from "@gamer/shared";
import type {
  LobbyController,
  RoomState
} from "../app";
import type { LobbyRuntimeApi } from "../app/lobbyTypes";
import { GameSocketClient } from "./socketClient";

function resolveDevRoomPreset(): "boss" | "extract" | "inventory" | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const preset = new URLSearchParams(window.location.search).get("devRoomPreset");
  return preset === "boss" || preset === "extract" || preset === "inventory"
    ? preset
    : undefined;
}

type PendingRoomAction = {
  resolve: (room: RoomState) => void;
  reject: (error: Error) => void;
};

type PendingVoidAction = {
  resolve: () => void;
  reject: (error: Error) => void;
};

export function createNetworkLobbyController(
  socket: GameSocketClient,
  onMatchStarted?: (payload: MatchStartedPayload) => void
): LobbyController {
  const devRoomPreset = resolveDevRoomPreset();
  let runtimeApi: LobbyRuntimeApi | null = null;
  let localPlayerId = "";
  let pendingRoomAction: PendingRoomAction | null = null;
  let pendingVoidAction: PendingVoidAction | null = null;

  return {
    initialize(api) {
      runtimeApi = api;
      socket.connect();

      socket.onRoomState((room) => {
        localPlayerId = resolveLocalPlayerId(room, socket.id, localPlayerId);
        const mappedRoom = mapRoomState(room, localPlayerId);
        runtimeApi?.setRoomState(mappedRoom);

        pendingRoomAction?.resolve(mappedRoom);
        pendingRoomAction = null;
      });

      socket.onRoomError((payload) => {
        const error = new Error(payload.message);
        pendingRoomAction?.reject(error);
        pendingRoomAction = null;
        pendingVoidAction?.reject(error);
        pendingVoidAction = null;
      });

      socket.onMatchStarted((payload) => {
        pendingVoidAction?.resolve();
        pendingVoidAction = null;
        runtimeApi?.setState({
          screen: "transitioning",
          infoMessage: "鍖归厤宸插紑濮嬶紝姝ｅ湪杩涘叆浣滄垬鍦板浘...",
          errorMessage: null
        });
        onMatchStarted?.(payload);
      });
    },
    createRoom(playerName, botDifficulty, profileId, loadout) {
      return waitForRoomState(() => {
        socket.createRoom({ playerName, botDifficulty, profileId, loadout });
      });
    },
    joinRoom(playerName, roomCode, profileId, loadout) {
      return waitForRoomState(() => {
        socket.joinRoom({ code: roomCode, playerName, profileId, loadout });
      });
    },
    async leaveRoom(roomCode) {
      socket.leaveRoom({ code: roomCode });
    },
    updateCapacity(roomCode, _playerId, capacity) {
      return waitForRoomState(() => {
        socket.setCapacity({ code: roomCode, capacity });
      });
    },
    startMatch(roomCode, _playerId, botDifficulty, profileId, loadout) {
      return waitForVoid(() => {
        socket.startRoom({ code: roomCode, botDifficulty, profileId, loadout, devRoomPreset });
      });
    }
  };

  function waitForRoomState(request: () => void): Promise<RoomState> {
    return new Promise<RoomState>((resolve, reject) => {
      pendingRoomAction = { resolve, reject };
      request();
    });
  }

  function waitForVoid(request: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      pendingVoidAction = { resolve, reject };
      request();
    });
  }
}

function resolveLocalPlayerId(room: RoomSummary, socketId: string | undefined, previousPlayerId: string): string {
  if (!socketId) {
    return previousPlayerId;
  }

  const localPlayer = room.players.find((player) => player.socketId === socketId);
  return localPlayer?.id ?? previousPlayerId;
}

function mapRoomState(room: RoomSummary, localPlayerId: string): RoomState {
  return {
    roomCode: room.code,
    capacity: room.capacity,
    botDifficulty: room.botDifficulty,
    localPlayerId,
    status: room.status === "started" ? "starting" : "waiting",
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      isReady: player.ready
    }))
  };
}

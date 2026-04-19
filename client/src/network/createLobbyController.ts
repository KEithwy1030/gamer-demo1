import type { MatchStartedPayload, RoomSummary } from "@gamer/shared";
import type {
  LobbyController,
  RoomState
} from "../app";
import type { LobbyRuntimeApi } from "../app/lobbyTypes";
import { GameSocketClient } from "./socketClient";

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
  let runtimeApi: LobbyRuntimeApi | null = null;
  let localPlayerId = "";
  let pendingRoomAction: PendingRoomAction | null = null;
  let pendingVoidAction: PendingVoidAction | null = null;

  return {
    initialize(api) {
      runtimeApi = api;
      socket.connect();

      socket.onRoomState((room) => {
        const mappedRoom = mapRoomState(room, localPlayerId);
        runtimeApi?.setRoomState(mappedRoom);

        pendingRoomAction?.resolve(mappedRoom);
        pendingRoomAction = null;

        pendingVoidAction?.resolve();
        pendingVoidAction = null;
      });

      socket.onRoomError((payload) => {
        const error = new Error(payload.message);
        pendingRoomAction?.reject(error);
        pendingRoomAction = null;
        pendingVoidAction?.reject(error);
        pendingVoidAction = null;
      });

      socket.onMatchStarted((payload) => {
        runtimeApi?.setState({
          screen: "transitioning",
          infoMessage: "Match starting. Entering the arena...",
          errorMessage: null
        });
        onMatchStarted?.(payload);
      });
    },
    createRoom(playerName) {
      socket.createRoom({ playerName });
      return waitForRoomState(socket);
    },
    joinRoom(playerName, roomCode) {
      socket.joinRoom({ code: roomCode, playerName });
      return waitForRoomState(socket);
    },
    async leaveRoom(roomCode) {
      socket.leaveRoom({ code: roomCode });
    },
    updateCapacity(roomCode, _playerId, capacity) {
      socket.setCapacity({ code: roomCode, capacity });
      return waitForRoomState(socket);
    },
    startMatch(roomCode) {
      socket.startRoom({ code: roomCode });
      return waitForVoid(socket);
    }
  };

  function waitForRoomState(_: GameSocketClient): Promise<RoomState> {
    localPlayerId = socket.id ?? localPlayerId;
    return new Promise<RoomState>((resolve, reject) => {
      pendingRoomAction = { resolve, reject };
    });
  }

  function waitForVoid(_: GameSocketClient): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      pendingVoidAction = { resolve, reject };
    });
  }
}

function mapRoomState(room: RoomSummary, localPlayerId: string): RoomState {
  return {
    roomCode: room.code,
    capacity: room.capacity,
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

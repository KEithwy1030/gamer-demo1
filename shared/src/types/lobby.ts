export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  socketId: string;
}

export interface RoomSummary {
  code: string;
  capacity: number;
  status: "waiting" | "started";
  players: LobbyPlayer[];
  hostPlayerId: string;
}

export interface RoomErrorPayload {
  message: string;
}

export interface CreateRoomPayload {
  playerName: string;
}

export interface JoinRoomPayload {
  code: string;
  playerName: string;
}

export interface SetCapacityPayload {
  code: string;
  capacity: number;
}

export interface LeaveRoomPayload {
  code: string;
}

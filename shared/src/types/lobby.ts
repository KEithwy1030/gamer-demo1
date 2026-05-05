import type { BotDifficulty } from "./game";
import type { InventorySnapshotPayload } from "./inventory";

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  socketId: string;
  squadId?: string;
  isBot?: boolean;
}

export interface RoomSummary {
  code: string;
  capacity: number;
  humanCapacity: number;
  squadCount: number;
  botDifficulty: BotDifficulty;
  status: "waiting" | "started";
  players: LobbyPlayer[];
  hostPlayerId: string;
}

export interface RoomErrorPayload {
  message: string;
}

export interface CreateRoomPayload {
  playerName: string;
  profileId?: string;
  botDifficulty?: BotDifficulty;
  loadout?: InventorySnapshotPayload;
}

export interface JoinRoomPayload {
  code: string;
  playerName: string;
  profileId?: string;
  loadout?: InventorySnapshotPayload;
}

export interface SetCapacityPayload {
  code: string;
  capacity: number;
}

export interface LeaveRoomPayload {
  code: string;
}

export interface RoomStartPayload {
  code?: string;
  profileId?: string;
  botDifficulty?: BotDifficulty;
  loadout?: InventorySnapshotPayload;
  devRoomPreset?: "boss" | "extract" | "inventory";
}

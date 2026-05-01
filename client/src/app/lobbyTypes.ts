import type { BotDifficulty, InventorySnapshotPayload } from "@gamer/shared";
import type { LocalProfile } from "../profile/localProfile";

export type LobbyScreen = "lobby" | "room" | "transitioning";
export type LobbyTab = "hall" | "stash" | "market";

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isReady?: boolean;
}

export interface RoomState {
  roomCode: string;
  capacity: number;
  players: LobbyPlayer[];
  localPlayerId: string;
  status: "waiting" | "starting";
  botDifficulty: BotDifficulty;
}

export interface LobbyState {
  screen: LobbyScreen;
  activeTab: LobbyTab;
  playerName: string;
  roomCodeInput: string;
  currentRoom: RoomState | null;
  errorMessage: string | null;
  infoMessage: string | null;
  isBusy: boolean;
  botDifficulty: BotDifficulty;
  profile: LocalProfile;
}

export interface LobbyGameTransition {
  roomCode: string;
  playerId: string;
}

export interface LobbyController {
  initialize?(api: LobbyRuntimeApi): void | Promise<void>;
  createRoom(playerName: string, botDifficulty: BotDifficulty, loadout?: InventorySnapshotPayload): Promise<RoomState>;
  joinRoom(playerName: string, roomCode: string, loadout?: InventorySnapshotPayload): Promise<RoomState>;
  leaveRoom(roomCode: string, playerId: string): Promise<void>;
  updateCapacity?(roomCode: string, playerId: string, capacity: number): Promise<RoomState>;
  startMatch?(roomCode: string, playerId: string, botDifficulty: BotDifficulty, loadout?: InventorySnapshotPayload): Promise<void>;
}

export interface LobbyRuntimeOptions {
  root: HTMLElement;
  controller?: LobbyController;
  initialState?: Partial<LobbyState>;
  onEnterGame?: (transition: LobbyGameTransition) => void;
  profile: LocalProfile;
  onProfileChange?: (profile: LocalProfile) => void;
}

export interface LobbyRuntimeApi {
  setState(nextState: Partial<LobbyState>): void;
  getState(): LobbyState;
  setRoomState(roomState: RoomState | null): void;
  enterGame(transition: LobbyGameTransition): void;
}

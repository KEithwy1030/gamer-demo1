export type LobbyScreen = "lobby" | "room" | "transitioning";

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
}

export interface LobbyState {
  screen: LobbyScreen;
  playerName: string;
  roomCodeInput: string;
  currentRoom: RoomState | null;
  errorMessage: string | null;
  infoMessage: string | null;
  isBusy: boolean;
}

export interface LobbyGameTransition {
  roomCode: string;
  playerId: string;
}

export interface LobbyController {
  initialize?(api: LobbyRuntimeApi): void | Promise<void>;
  createRoom(playerName: string): Promise<RoomState>;
  joinRoom(playerName: string, roomCode: string): Promise<RoomState>;
  leaveRoom(roomCode: string, playerId: string): Promise<void>;
  updateCapacity?(roomCode: string, playerId: string, capacity: number): Promise<RoomState>;
  startMatch?(roomCode: string, playerId: string): Promise<void>;
}

export interface LobbyRuntimeOptions {
  root: HTMLElement;
  controller?: LobbyController;
  initialState?: Partial<LobbyState>;
  onEnterGame?: (transition: LobbyGameTransition) => void;
}

export interface LobbyRuntimeApi {
  setState(nextState: Partial<LobbyState>): void;
  getState(): LobbyState;
  setRoomState(roomState: RoomState | null): void;
  enterGame(transition: LobbyGameTransition): void;
}

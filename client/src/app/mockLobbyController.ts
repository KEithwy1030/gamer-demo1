import type {
  LobbyController,
  LobbyPlayer,
  LobbyRuntimeApi,
  RoomState,
} from "./lobbyTypes";

interface MockRoom {
  roomCode: string;
  capacity: number;
  players: LobbyPlayer[];
}

const mockRooms = new Map<string, MockRoom>();

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const PLACE_WORDS = [
  "南岭",
  "北坞",
  "西浮",
  "灰湾",
  "旧港",
  "朔桥",
  "荒岗",
  "雾泽",
  "石堡",
  "长汀",
];

const normalizeRoomCode = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.\uFF0E\u3002\u30FB路]/g, "·")
    .slice(0, 8)
    .toUpperCase();

const makeRoomCode = () => {
  const place = PLACE_WORDS[Math.floor(Math.random() * PLACE_WORDS.length)];
  const number = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${place}·${number}`;
};

const cloneRoomState = (room: MockRoom, localPlayerId: string, status: RoomState["status"] = "waiting"): RoomState => ({
  roomCode: room.roomCode,
  capacity: room.capacity,
  players: room.players.map((player) => ({ ...player })),
  localPlayerId,
  status,
});

export class MockLobbyController implements LobbyController {
  private runtimeApi: LobbyRuntimeApi | null = null;

  initialize(api: LobbyRuntimeApi) {
    this.runtimeApi = api;
  }

  async createRoom(playerName: string): Promise<RoomState> {
    await wait(240);

    const roomCode = makeRoomCode();
    const playerId = makeId("player");
    const hostPlayer: LobbyPlayer = {
      id: playerId,
      name: playerName,
      isHost: true,
    };

    mockRooms.set(roomCode, {
      roomCode,
      capacity: 4,
      players: [hostPlayer],
    });

    return cloneRoomState(mockRooms.get(roomCode)!, playerId);
  }

  async joinRoom(playerName: string, roomCode: string): Promise<RoomState> {
    await wait(240);

    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);

    if (!room) {
      throw new Error("频道不存在，请检查蜡印编号。");
    }

    if (room.players.length >= room.capacity) {
      throw new Error("频道已满，暂时无法加入。");
    }

    const playerId = makeId("player");
    room.players.push({
      id: playerId,
      name: playerName,
      isHost: false,
    });

    return cloneRoomState(room, playerId);
  }

  async leaveRoom(roomCode: string, playerId: string): Promise<void> {
    await wait(120);

    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);
    if (!room) {
      return;
    }

    room.players = room.players.filter((player) => player.id !== playerId);

    if (room.players.length === 0) {
      mockRooms.delete(normalizedCode);
      return;
    }

    if (!room.players.some((player) => player.isHost)) {
      room.players[0] = {
        ...room.players[0],
        isHost: true,
      };
    }

    if (this.runtimeApi?.getState().currentRoom?.roomCode === normalizedCode) {
      this.runtimeApi.setRoomState(null);
      this.runtimeApi.setState({
        screen: "lobby",
        infoMessage: "你已离开频道。",
      });
    }
  }

  async updateCapacity(roomCode: string, playerId: string, capacity: number): Promise<RoomState> {
    await wait(120);

    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);
    if (!room) {
      throw new Error("频道不存在。");
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player?.isHost) {
      throw new Error("只有领队可以修改队伍上限。");
    }

    if (capacity < room.players.length) {
      throw new Error("人数上限不能低于当前队伍人数。");
    }

    room.capacity = capacity;
    return cloneRoomState(room, playerId);
  }

  async startMatch(roomCode: string, playerId: string): Promise<void> {
    await wait(360);

    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);
    if (!room) {
      throw new Error("频道不存在。");
    }

    const player = room.players.find((entry) => entry.id === playerId);
    if (!player?.isHost) {
      throw new Error("只有领队可以发起部署。");
    }

    this.runtimeApi?.setState({
      screen: "transitioning",
      infoMessage: "频道已封存，正在切入战场。",
    });

    await wait(500);
    this.runtimeApi?.enterGame({
      roomCode: normalizedCode,
      playerId,
    });
  }
}

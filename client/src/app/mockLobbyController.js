var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const mockRooms = /* @__PURE__ */ new Map();
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const makeId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const PLACE_WORDS = [
  "\u5357\u5CAD",
  "\u5317\u575E",
  "\u897F\u6D6E",
  "\u7070\u6E7E",
  "\u65E7\u6E2F",
  "\u6714\u6865",
  "\u8352\u5C97",
  "\u96FE\u6CFD",
  "\u77F3\u5821",
  "\u957F\u6C40"
];
const normalizeRoomCode = (value) => value.trim().replace(/\s+/g, "").replace(/[.\uFF0E\u3002\u30FB路]/g, "\xB7").slice(0, 8).toUpperCase();
const makeRoomCode = () => {
  const place = PLACE_WORDS[Math.floor(Math.random() * PLACE_WORDS.length)];
  const number = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `${place}\xB7${number}`;
};
const cloneRoomState = (room, localPlayerId, status = "waiting") => ({
  roomCode: room.roomCode,
  capacity: room.capacity,
  players: room.players.map((player) => ({ ...player })),
  localPlayerId,
  status
});
class MockLobbyController {
  constructor() {
    __publicField(this, "runtimeApi", null);
  }
  initialize(api) {
    this.runtimeApi = api;
  }
  async createRoom(playerName) {
    await wait(240);
    const roomCode = makeRoomCode();
    const playerId = makeId("player");
    const hostPlayer = {
      id: playerId,
      name: playerName,
      isHost: true
    };
    mockRooms.set(roomCode, {
      roomCode,
      capacity: 4,
      players: [hostPlayer]
    });
    return cloneRoomState(mockRooms.get(roomCode), playerId);
  }
  async joinRoom(playerName, roomCode) {
    await wait(240);
    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);
    if (!room) {
      throw new Error("\u9891\u9053\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5\u8721\u5370\u7F16\u53F7\u3002");
    }
    if (room.players.length >= room.capacity) {
      throw new Error("\u9891\u9053\u5DF2\u6EE1\uFF0C\u6682\u65F6\u65E0\u6CD5\u52A0\u5165\u3002");
    }
    const playerId = makeId("player");
    room.players.push({
      id: playerId,
      name: playerName,
      isHost: false
    });
    return cloneRoomState(room, playerId);
  }
  async leaveRoom(roomCode, playerId) {
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
        isHost: true
      };
    }
    if (this.runtimeApi?.getState().currentRoom?.roomCode === normalizedCode) {
      this.runtimeApi.setRoomState(null);
      this.runtimeApi.setState({
        screen: "lobby",
        infoMessage: "\u4F60\u5DF2\u79BB\u5F00\u9891\u9053\u3002"
      });
    }
  }
  async updateCapacity(roomCode, playerId, capacity) {
    await wait(120);
    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);
    if (!room) {
      throw new Error("\u9891\u9053\u4E0D\u5B58\u5728\u3002");
    }
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player?.isHost) {
      throw new Error("\u53EA\u6709\u9886\u961F\u53EF\u4EE5\u4FEE\u6539\u961F\u4F0D\u4E0A\u9650\u3002");
    }
    if (capacity < room.players.length) {
      throw new Error("\u4EBA\u6570\u4E0A\u9650\u4E0D\u80FD\u4F4E\u4E8E\u5F53\u524D\u961F\u4F0D\u4EBA\u6570\u3002");
    }
    room.capacity = capacity;
    return cloneRoomState(room, playerId);
  }
  async startMatch(roomCode, playerId) {
    await wait(360);
    const normalizedCode = normalizeRoomCode(roomCode);
    const room = mockRooms.get(normalizedCode);
    if (!room) {
      throw new Error("\u9891\u9053\u4E0D\u5B58\u5728\u3002");
    }
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player?.isHost) {
      throw new Error("\u53EA\u6709\u9886\u961F\u53EF\u4EE5\u53D1\u8D77\u90E8\u7F72\u3002");
    }
    this.runtimeApi?.setState({
      screen: "transitioning",
      infoMessage: "\u9891\u9053\u5DF2\u5C01\u5B58\uFF0C\u6B63\u5728\u5207\u5165\u6218\u573A\u3002"
    });
    await wait(500);
    this.runtimeApi?.enterGame({
      roomCode: normalizedCode,
      playerId
    });
  }
}
export {
  MockLobbyController
};

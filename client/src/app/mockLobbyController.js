const mockRooms = new Map();
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const makeId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const makeRoomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const cloneRoomState = (room, localPlayerId, status = "waiting") => ({
    roomCode: room.roomCode,
    capacity: room.capacity,
    players: room.players.map((player) => ({ ...player })),
    localPlayerId,
    status,
});
export class MockLobbyController {
    runtimeApi = null;
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
            isHost: true,
        };
        mockRooms.set(roomCode, {
            roomCode,
            capacity: 4,
            players: [hostPlayer],
        });
        return cloneRoomState(mockRooms.get(roomCode), playerId);
    }
    async joinRoom(playerName, roomCode) {
        await wait(240);
        const normalizedCode = roomCode.trim().toUpperCase();
        const room = mockRooms.get(normalizedCode);
        if (!room) {
            throw new Error("房间不存在，请检查房间号。");
        }
        if (room.players.length >= room.capacity) {
            throw new Error("房间已满，无法加入。");
        }
        const playerId = makeId("player");
        room.players.push({
            id: playerId,
            name: playerName,
            isHost: false,
        });
        return cloneRoomState(room, playerId);
    }
    async leaveRoom(roomCode, playerId) {
        await wait(120);
        const room = mockRooms.get(roomCode);
        if (!room) {
            return;
        }
        room.players = room.players.filter((player) => player.id !== playerId);
        if (room.players.length === 0) {
            mockRooms.delete(roomCode);
            return;
        }
        if (!room.players.some((player) => player.isHost)) {
            room.players[0] = {
                ...room.players[0],
                isHost: true,
            };
        }
        if (this.runtimeApi?.getState().currentRoom?.roomCode === roomCode) {
            this.runtimeApi.setRoomState(null);
            this.runtimeApi.setState({
                screen: "lobby",
                infoMessage: "你已离开房间。",
            });
        }
    }
    async updateCapacity(roomCode, playerId, capacity) {
        await wait(120);
        const room = mockRooms.get(roomCode);
        if (!room) {
            throw new Error("房间不存在。");
        }
        const player = room.players.find((entry) => entry.id === playerId);
        if (!player?.isHost) {
            throw new Error("只有房主可以修改人数上限。");
        }
        if (capacity < room.players.length) {
            throw new Error("人数上限不能小于当前玩家数。");
        }
        room.capacity = capacity;
        return cloneRoomState(room, playerId);
    }
    async startMatch(roomCode, playerId) {
        await wait(360);
        const room = mockRooms.get(roomCode);
        if (!room) {
            throw new Error("房间不存在。");
        }
        const player = room.players.find((entry) => entry.id === playerId);
        if (!player?.isHost) {
            throw new Error("只有房主可以开始游戏。");
        }
        this.runtimeApi?.setState({
            screen: "transitioning",
            infoMessage: "房间已锁定，正在切换到游戏场景…",
        });
        await wait(500);
        this.runtimeApi?.enterGame({
            roomCode,
            playerId,
        });
    }
}

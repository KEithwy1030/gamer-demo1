import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";
import { SocketEvent } from "@gamer/shared";

const SERVER_URL = process.env.SERVER_URL ?? "http://127.0.0.1:5289";
const ROOM_CODE = process.env.ROOM_CODE;
const PLAYER_NAME = process.env.PLAYER_NAME ?? "CodexWingman";
const BOT_DIFFICULTY = process.env.BOT_DIFFICULTY ?? "normal";

if (!ROOM_CODE) {
  console.error("ROOM_CODE is required");
  process.exit(1);
}

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"]
});

let selfId = "";
let roomStatus = "waiting";
let players = [];
let monsters = [];
let moveLoopActive = true;
let attackCounter = 0;

socket.on("connect", () => {
  socket.emit(SocketEvent.RoomJoin, {
    code: ROOM_CODE,
    playerName: PLAYER_NAME
  });
});

socket.on(SocketEvent.RoomState, (room) => {
  roomStatus = room.status;
  const self = room.players.find((player) => player.socketId === socket.id);
  if (self) {
    selfId = self.id;
  }
});

socket.on(SocketEvent.MatchStarted, (payload) => {
  selfId = payload.selfPlayerId;
});

socket.on(SocketEvent.StatePlayers, (payload) => {
  players = payload;
});

socket.on(SocketEvent.StateMonsters, (payload) => {
  monsters = payload;
});

socket.on(SocketEvent.RoomError, (payload) => {
  console.error("room:error", payload);
});

socket.on("disconnect", (reason) => {
  console.error("socket disconnected", reason);
  moveLoopActive = false;
});

await waitFor(() => selfId && roomStatus === "waiting", 10_000, "failed to join waiting room");

while (moveLoopActive) {
  const self = players.find((player) => player.id === selfId && player.isAlive);
  const liveMonsters = monsters.filter((monster) => monster.isAlive && monster.type !== "boss");

  if (!self) {
    await delay(100);
    continue;
  }

  const target = pickTarget(self, liveMonsters);
  if (!target) {
    socket.emit(SocketEvent.PlayerInputMove, { direction: { x: 0, y: 0 } });
    await delay(120);
    continue;
  }

  const direction = normalize({
    x: target.x - self.x,
    y: target.y - self.y
  });
  socket.emit(SocketEvent.PlayerInputMove, { direction });

  const distance = Math.hypot(target.x - self.x, target.y - self.y);
  if (distance <= 150) {
    socket.emit(SocketEvent.PlayerAttack, {
      attackId: `wingman_${Date.now()}_${attackCounter += 1}`,
      targetId: target.id,
      direction
    });
  }

  await delay(110);
}

function pickTarget(self, entries) {
  return [...entries].sort((left, right) => {
    const leftDistance = Math.hypot(left.x - self.x, left.y - self.y);
    const rightDistance = Math.hypot(right.x - self.x, right.y - self.y);
    return leftDistance - rightDistance;
  })[0];
}

function normalize(direction) {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 0, y: 1 };
  }
  return {
    x: direction.x / length,
    y: direction.y / length
  };
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(50);
  }
  throw new Error(label);
}

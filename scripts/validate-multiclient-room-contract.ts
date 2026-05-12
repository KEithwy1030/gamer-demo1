import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { SocketEvent } from "../shared/src/protocol/events.js";
import type { RoomSummary } from "../shared/src/types/lobby.js";

const serverUrl = process.env.MULTICLIENT_SERVER_URL ?? "http://127.0.0.1:3210";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const host = io(serverUrl, { transports: ["websocket"], forceNew: true, reconnection: false });
  const guest = io(serverUrl, { transports: ["websocket"], forceNew: true, reconnection: false });

  try {
    await Promise.all([waitForConnect(host), waitForConnect(guest)]);

    const hostRoom = await emitAndWaitForRoomState(host, SocketEvent.RoomCreate, {
      playerName: "HostContract",
      botDifficulty: "normal"
    });
    assert.equal(hostRoom.players.length, 1, "created room should contain host");
    assert.equal(hostRoom.players[0]!.name, "HostContract", "created room should preserve host name");

    const hostRebroadcastPromise = waitForRoomState(host, (room) => (
      room.code === hostRoom.code && room.players.some((player) => player.name === "GuestContract")
    ));
    const browserNormalizedCode = hostRoom.code.replace(/\u8DEF/g, "\u00B7");
    const guestRoom = await emitAndWaitForRoomState(guest, SocketEvent.RoomJoin, {
      code: browserNormalizedCode,
      playerName: "GuestContract"
    });
    assert.equal(guestRoom.code, hostRoom.code, "guest should join the host room code");
    assert.equal(guestRoom.players.length, 2, "joined room should contain both clients");
    assert.ok(guestRoom.players.some((player) => player.name === "HostContract"), "guest room state should include host");
    assert.ok(guestRoom.players.some((player) => player.name === "GuestContract"), "guest room state should include guest");

    const rebroadcastHostRoom = await hostRebroadcastPromise;
    assert.equal(rebroadcastHostRoom.players.length, 2, "host should receive guest join rebroadcast");

    console.log(`[multiclient-room-contract] PASS serverUrl=${serverUrl} room=${hostRoom.code} players=${rebroadcastHostRoom.players.map((player) => player.name).join(",")}`);
  } finally {
    host.disconnect();
    guest.disconnect();
  }
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for socket connect")), 5_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function emitAndWaitForRoomState(socket: Socket, eventName: string, payload: unknown): Promise<RoomSummary> {
  const promise = waitForRoomState(socket);
  socket.emit(eventName, payload);
  return promise;
}

function waitForRoomState(socket: Socket, predicate: (room: RoomSummary) => boolean = () => true): Promise<RoomSummary> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for room state"));
    }, 5_000);
    const onState = (room: RoomSummary) => {
      if (!predicate(room)) {
        return;
      }
      cleanup();
      resolve(room);
    };
    const onError = (payload: { message?: string }) => {
      cleanup();
      reject(new Error(payload.message ?? "Room error"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(SocketEvent.RoomState, onState);
      socket.off(SocketEvent.RoomError, onError);
    };
    socket.on(SocketEvent.RoomState, onState);
    socket.on(SocketEvent.RoomError, onError);
  });
}

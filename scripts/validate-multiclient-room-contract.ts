import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { io, type Socket } from "socket.io-client";
import { SocketEvent } from "../shared/src/protocol/events.js";
import type { RoomSummary } from "../shared/src/types/lobby.js";

const serverUrl = process.env.MULTICLIENT_SERVER_URL ?? "http://127.0.0.1:3210";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  assertRoomCodeUxContract();

  const exactRoomCode = await validateTwoClientJoin({
    hostName: "HostExact",
    guestName: "GuestExact",
    joinCode: (code) => code
  });
  const aliasRoomCode = await validateTwoClientJoin({
    hostName: "HostAlias",
    guestName: "GuestAlias",
    joinCode: (code) => code.replace(/\u8DEF/g, "\u00B7")
  });

  console.log(`[multiclient-room-contract] PASS serverUrl=${serverUrl} exact=${exactRoomCode} alias=${aliasRoomCode}`);
}

function assertRoomCodeUxContract(): void {
  const lobbyApp = readFileSync(new URL("../client/src/app/lobbyApp.ts", import.meta.url), "utf8");
  const mockLobbyController = readFileSync(new URL("../client/src/app/mockLobbyController.ts", import.meta.url), "utf8");
  const lobbyView = readFileSync(new URL("../client/src/ui/lobbyView.ts", import.meta.url), "utf8");

  const canonicalSeparatorRule = '.replace(/[.\\uFF0E\\u3002\\u00B7\\u30FB\\u8DEF]/g, "\\u8DEF")';
  assert.ok(lobbyApp.includes(canonicalSeparatorRule), "browser lobby should preserve the displayed room-code separator");
  assert.ok(mockLobbyController.includes(canonicalSeparatorRule), "mock lobby should preserve the displayed room-code separator");
  assert.ok(lobbyApp.includes(".slice(0, 16)"), "browser lobby should not truncate current generated room codes");
  assert.ok(mockLobbyController.includes(".slice(0, 16)"), "mock lobby should not truncate current generated room codes");
  assert.ok(lobbyView.includes("this.roomCodeInput.maxLength = 16;"), "room-code input should allow current generated room codes");
  assert.ok(lobbyView.includes('this.roomCodeInput.placeholder = "例如 STONE路89";'), "room-code placeholder should match server-generated format");
}

async function validateTwoClientJoin(options: {
  hostName: string;
  guestName: string;
  joinCode: (code: string) => string;
}): Promise<string> {
  const host = io(serverUrl, { transports: ["websocket"], forceNew: true, reconnection: false });
  const guest = io(serverUrl, { transports: ["websocket"], forceNew: true, reconnection: false });

  try {
    await Promise.all([waitForConnect(host), waitForConnect(guest)]);

    const hostRoom = await emitAndWaitForRoomState(host, SocketEvent.RoomCreate, {
      playerName: options.hostName,
      botDifficulty: "normal"
    });
    assert.equal(hostRoom.players.length, 1, "created room should contain host");
    assert.equal(hostRoom.players[0]!.name, options.hostName, "created room should preserve host name");

    const hostRebroadcastPromise = waitForRoomState(host, (room) => (
      room.code === hostRoom.code && room.players.some((player) => player.name === options.guestName)
    ));
    const guestRoom = await emitAndWaitForRoomState(guest, SocketEvent.RoomJoin, {
      code: options.joinCode(hostRoom.code),
      playerName: options.guestName
    });
    assert.equal(guestRoom.code, hostRoom.code, "guest should join the host room code");
    assert.equal(guestRoom.players.length, 2, "joined room should contain both clients");
    assert.ok(guestRoom.players.some((player) => player.name === options.hostName), "guest room state should include host");
    assert.ok(guestRoom.players.some((player) => player.name === options.guestName), "guest room state should include guest");

    const rebroadcastHostRoom = await hostRebroadcastPromise;
    assert.equal(rebroadcastHostRoom.players.length, 2, "host should receive guest join rebroadcast");

    return hostRoom.code;
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

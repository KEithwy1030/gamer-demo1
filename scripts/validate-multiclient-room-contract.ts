import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { io, type Socket } from "socket.io-client";
import { SocketEvent } from "../shared/src/protocol/events.js";
import type { MatchStartedPayload } from "../shared/src/types/game.js";
import type { RoomSummary } from "../shared/src/types/lobby.js";

const MANAGED_SERVER_PORT = "5203";
const serverUrl = process.env.MULTICLIENT_SERVER_URL ?? `http://127.0.0.1:${MANAGED_SERVER_PORT}`;
const ownsServer = !process.env.MULTICLIENT_SERVER_URL;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const managedServer = ownsServer ? await startManagedServer() : null;
  try {
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
  } finally {
    await stopManagedServer(managedServer);
  }
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

async function startManagedServer(): Promise<ChildProcessWithoutNullStreams> {
  runNpm(["run", "build", "--workspace", "shared"]);
  runNpm(["run", "build", "--workspace", "server"]);

  const server = spawn("node", ["dist/index.js"], {
    cwd: "server",
    env: {
      ...process.env,
      PORT: MANAGED_SERVER_PORT
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const logs: string[] = [];
  server.stdout.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr.on("data", (chunk) => logs.push(String(chunk)));

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Managed multiclient server exited early.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${serverUrl}/health`);
      if (response.ok) {
        return server;
      }
    } catch {
      // Keep waiting until the server binds.
    }
    await delay(250);
  }

  server.kill();
  throw new Error(`Timed out waiting for managed multiclient server.\n${logs.join("")}`);
}

function runNpm(args: string[]): void {
  const npmCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const npmArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(npmCommand, npmArgs, {
    cwd: process.cwd(),
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with status ${result.status ?? "unknown"}`);
  }
}

async function stopManagedServer(server: ChildProcessWithoutNullStreams | null): Promise<void> {
  if (!server || server.exitCode !== null) {
    return;
  }
  server.kill();
  await Promise.race([
    new Promise<void>((resolve) => server.once("close", () => resolve())),
    delay(2_000).then(() => undefined)
  ]);
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

    const hostMatchPromise = waitForMatchStarted(host);
    const guestMatchPromise = waitForMatchStarted(guest);
    const hostPlayersPromise = waitForSocketEvent<Array<{ id: string; name: string }>>(host, SocketEvent.StatePlayers, "host state players");
    const guestPlayersPromise = waitForSocketEvent<Array<{ id: string; name: string }>>(guest, SocketEvent.StatePlayers, "guest state players");
    const monstersPromise = waitForSocketEvent<unknown[]>(host, SocketEvent.StateMonsters, "state monsters");
    const dropsPromise = waitForSocketEvent<unknown[]>(host, SocketEvent.StateDrops, "state drops");
    const timerPromise = waitForSocketEvent<number>(host, SocketEvent.MatchTimer, "match timer");
    const chestsPromise = waitForSocketEvent<unknown[]>(host, SocketEvent.ChestsInit, "chests init");
    host.emit(SocketEvent.RoomStart, { botDifficulty: "normal" });
    const [hostMatch, guestMatch] = await Promise.all([hostMatchPromise, guestMatchPromise]);
    assert.equal(hostMatch.room.code, hostRoom.code, "host match payload should preserve room code");
    assert.equal(guestMatch.room.code, hostRoom.code, "guest match payload should preserve room code");
    assert.ok(hostMatch.room.players.some((player) => player.name === options.hostName), "host match payload should include host");
    assert.ok(hostMatch.room.players.some((player) => player.name === options.guestName), "host match payload should include guest");
    assert.ok(guestMatch.room.players.some((player) => player.name === options.hostName), "guest match payload should include host");
    assert.ok(guestMatch.room.players.some((player) => player.name === options.guestName), "guest match payload should include guest");
    assert.ok(hostMatch.room.players.some((player) => player.isBot && player.squadId === "bot_alpha"), "match payload should include bot opposition");
    assert.equal(hostMatch.selfPlayerId, host.id, "host should receive a host-specific match payload");
    assert.equal(guestMatch.selfPlayerId, guest.id, "guest should receive a guest-specific match payload");

    const [hostPlayers, guestPlayers, monsters, drops, timer, chests] = await Promise.all([
      hostPlayersPromise,
      guestPlayersPromise,
      monstersPromise,
      dropsPromise,
      timerPromise,
      chestsPromise
    ]);
    assert.ok(hostPlayers.some((player) => player.name === options.hostName), "host should receive started player state stream");
    assert.ok(guestPlayers.some((player) => player.name === options.guestName), "guest should receive started player state stream");
    assert.ok(monsters.length > 0, "started match should broadcast initial monsters");
    assert.ok(Array.isArray(drops), "started match should broadcast initial drop state");
    assert.ok(Number.isFinite(timer) && timer > 0, "started match should broadcast remaining timer");
    assert.ok(chests.length > 0, "started match should broadcast initial chest state");

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

function waitForSocketEvent<T>(socket: Socket, eventName: string, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}`));
    }, 5_000);
    const onEvent = (payload: T) => {
      cleanup();
      resolve(payload);
    };
    const onError = (payload: { message?: string }) => {
      cleanup();
      reject(new Error(payload.message ?? "Room error"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(eventName, onEvent);
      socket.off(SocketEvent.RoomError, onError);
    };
    socket.on(eventName, onEvent);
    socket.on(SocketEvent.RoomError, onError);
  });
}

function waitForMatchStarted(socket: Socket): Promise<MatchStartedPayload> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for match started"));
    }, 5_000);
    const onStarted = (payload: MatchStartedPayload) => {
      cleanup();
      resolve(payload);
    };
    const onError = (payload: { message?: string }) => {
      cleanup();
      reject(new Error(payload.message ?? "Room error"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(SocketEvent.MatchStarted, onStarted);
      socket.off(SocketEvent.RoomError, onError);
    };
    socket.on(SocketEvent.MatchStarted, onStarted);
    socket.on(SocketEvent.RoomError, onError);
  });
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

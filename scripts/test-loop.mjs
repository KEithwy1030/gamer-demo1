import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { io } from "socket.io-client";

const SERVER_PORT = Number.parseInt(process.env.TEST_SERVER_PORT ?? "5290", 10);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_DIR = fileURLToPath(new URL("../server/", import.meta.url));
const SERVER_SRC_DIR = fileURLToPath(new URL("../server/src/", import.meta.url));
const SERVER_DIST_DIR = fileURLToPath(new URL("../server/dist/", import.meta.url));
const SHARED_DIR = fileURLToPath(new URL("../shared/", import.meta.url));
const SHARED_SRC_DIR = fileURLToPath(new URL("../shared/src/", import.meta.url));
const SHARED_DIST_DIR = fileURLToPath(new URL("../shared/dist/", import.meta.url));
const DIST_ENTRY = fileURLToPath(new URL("../server/dist/index.js", import.meta.url));
const SHARED_DIST_ENTRY = fileURLToPath(new URL("../shared/dist/index.js", import.meta.url));
const FORCE_SERVER_BUILD = process.env.TEST_LOOP_FORCE_BUILD === "1";
const ALLOW_EXTERNAL_SERVER = process.env.TEST_LOOP_ALLOW_EXTERNAL_SERVER === "1";

const MOVE_STEP_PER_INPUT = 28;
const PICKUP_RADIUS = 140;
const POSITION_TOLERANCE = 36;
const EXTRACT_THREAT_RADIUS = 260;
const EXPECTED_HUMAN_CLIENT_COUNT = 2;

const STEP_TIMEOUTS = {
  1: 5_000,
  2: 5_000,
  3: 5_000,
  4: 5_000,
  5: 60_000,
  6: 8_000,
  // 击杀的怪可能不产新掉落，此时 pickup 目标是最近的预置世界掉落，可能在
  // 1000px+ 外还要绕障碍——10s 不够走完（实测 alive 满速仍超时）。
  7: 25_000,
  8: 15_000,
  9: 12_000,
  10: 70_000
};

let shuttingDown = false;
let activeServerMonitor;
const activeClients = new Set();

function logStepResult(step, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] Step ${step}: ${detail}`);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function withTimeout(factory, timeoutMs, errorMessage) {
  return await Promise.race([
    factory(),
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
      timer.unref?.();
    })
  ]);
}

function describeClientState(client) {
  const state = client.state;
  const room = state.roomState;
  const selfPlayerId = state.matchStarted?.selfPlayerId;
  const self = selfPlayerId ? state.players.find((player) => player.id === selfPlayerId) : undefined;
  return [
    `${state.label}: connected=${client.socket.connected}`,
    `room=${room?.code ?? "n/a"}/${room?.status ?? "n/a"}`,
    `roomPlayers=${room?.players?.length ?? 0}`,
    `match=${state.matchStarted ? "yes" : "no"}`,
    `players=${state.players.length}`,
    `monsters=${state.monsters.length}`,
    `drops=${state.drops.length}`,
    self ? `self=${self.id}@${Math.round(self.x)},${Math.round(self.y)} hp=${self.hp}/${self.maxHp} alive=${self.isAlive}` : "self=n/a",
    `errors=${state.roomErrors.length}`,
    `disconnect=${state.disconnectReason ?? "none"}`
  ].join(" ");
}

function describeValidationState() {
  const clients = [...activeClients].map(describeClientState);
  const server = activeServerMonitor
    ? `serverFailures=${activeServerMonitor.failures.length}`
    : "serverFailures=n/a";
  return [server, ...clients].join("\n");
}

function assertNoRuntimeFailures() {
  if (activeServerMonitor?.failures.length) {
    throw new Error(`Server failure detected:\n${activeServerMonitor.failures.join("\n")}\n${describeValidationState()}`);
  }

  for (const client of activeClients) {
    const roomError = client.state.roomErrors[0];
    if (roomError) {
      throw new Error(`room:error from ${client.state.label}: ${roomError.message ?? JSON.stringify(roomError)}\n${describeValidationState()}`);
    }

    const reason = client.state.disconnectReason;
    if (reason && !shuttingDown && reason !== "io client disconnect") {
      throw new Error(`Socket disconnected for ${client.state.label}: ${reason}\n${describeValidationState()}`);
    }
  }
}

async function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\nstdout:\n${stdout}\nstderr:\n${stderr}`
    );
  }

  return { stdout, stderr };
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function ensureServerBuild() {
  const { readdir, stat } = await import("node:fs/promises");

  async function getNewestMtimeMs(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    let newestMtimeMs = 0;

    for (const entry of entries) {
      const entryPath = `${dirPath}${entry.name}`;
      if (entry.isDirectory()) {
        newestMtimeMs = Math.max(newestMtimeMs, await getNewestMtimeMs(`${entryPath}/`));
        continue;
      }

      const entryStat = await stat(entryPath);
      newestMtimeMs = Math.max(newestMtimeMs, entryStat.mtimeMs);
    }

    return newestMtimeMs;
  }

  async function getBuildMtimeMs(filePath) {
    try {
      return (await stat(filePath)).mtimeMs;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return 0;
      }
      throw error;
    }
  }

  const latestServerSrcMtimeMs = await getNewestMtimeMs(SERVER_SRC_DIR);
  const latestSharedSrcMtimeMs = await getNewestMtimeMs(SHARED_SRC_DIR);
  const serverDistMtimeMs = Math.max(await getBuildMtimeMs(DIST_ENTRY), await getNewestMtimeMs(SERVER_DIST_DIR));
  const sharedDistMtimeMs = Math.max(await getBuildMtimeMs(SHARED_DIST_ENTRY), await getNewestMtimeMs(SHARED_DIST_DIR));

  const buildReasons = [];
  if (FORCE_SERVER_BUILD) {
    buildReasons.push("TEST_LOOP_FORCE_BUILD=1");
  }
  if (sharedDistMtimeMs === 0) {
    buildReasons.push("shared/dist/index.js is missing");
  } else if (latestSharedSrcMtimeMs > sharedDistMtimeMs) {
    buildReasons.push("shared/src is newer than shared/dist/index.js");
  }
  if (serverDistMtimeMs === 0) {
    buildReasons.push("server/dist/index.js is missing");
  } else if (latestServerSrcMtimeMs > serverDistMtimeMs) {
    buildReasons.push("server/src is newer than server/dist/index.js");
  }

  if (buildReasons.length === 0) {
    console.log("[info] validation will use current shared/server builds");
    return;
  }

  console.log(`[info] rebuilding validation server because ${buildReasons.join("; ")}`);
  await runCommand(getNpmCommand(), ["run", "build"], {
    cwd: SHARED_DIR
  });
  await runCommand(getNpmCommand(), ["run", "build"], {
    cwd: SERVER_DIR
  });

  const verifiedSharedDistMtimeMs = Math.max(await getBuildMtimeMs(SHARED_DIST_ENTRY), await getNewestMtimeMs(SHARED_DIST_DIR));
  const verifiedServerDistMtimeMs = Math.max(await getBuildMtimeMs(DIST_ENTRY), await getNewestMtimeMs(SERVER_DIST_DIR));
  if (verifiedSharedDistMtimeMs < latestSharedSrcMtimeMs) {
    throw new Error("shared build completed but shared/dist is still older than shared/src");
  }
  if (verifiedServerDistMtimeMs < latestServerSrcMtimeMs) {
    throw new Error("server build completed but server/dist is still older than server/src");
  }
}

async function waitForServerReady(serverProcess, timeoutMs = 15_000) {
  const ready = createDeferred();
  const onStdout = (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[server] ${text}`);
    if (text.includes("[server] listening on")) {
      ready.resolve();
    }
  };
  const onStderr = (chunk) => {
    const text = String(chunk);
    process.stderr.write(`[server:err] ${text}`);
    ready.reject(new Error(`Server wrote stderr before ready:\n${text}`));
  };
  const onExit = (code, signal) => {
    ready.reject(new Error(`Server exited early with code=${code} signal=${signal}`));
  };

  serverProcess.stdout.on("data", onStdout);
  serverProcess.stderr.on("data", onStderr);
  serverProcess.once("exit", onExit);

  try {
    await withTimeout(
      () => ready.promise,
      timeoutMs,
      `Server did not become ready within ${timeoutMs}ms`
    );
    activeServerMonitor = attachServerFailureMonitor(serverProcess);
  } finally {
    serverProcess.stdout.off("data", onStdout);
    serverProcess.stderr.off("data", onStderr);
    serverProcess.off("exit", onExit);
  }
}

function attachServerFailureMonitor(serverProcess) {
  const monitor = {
    failures: [],
    active: true
  };
  const onStderr = (chunk) => {
    const text = String(chunk);
    process.stderr.write(`[server:err] ${text}`);
    if (monitor.active) {
      monitor.failures.push(`stderr: ${text.trim() || "(empty)"}`);
    }
  };
  const onExit = (code, signal) => {
    if (monitor.active && !shuttingDown) {
      monitor.failures.push(`exit: code=${code} signal=${signal}`);
    }
  };
  serverProcess.stderr.on("data", onStderr);
  serverProcess.once("exit", onExit);
  monitor.detach = () => {
    monitor.active = false;
    serverProcess.stderr.off("data", onStderr);
    serverProcess.off("exit", onExit);
  };
  return monitor;
}

function startServer() {
  return spawn(
    "node",
    ["--experimental-specifier-resolution=node", "dist/index.js"],
    {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        BOT_AI_DISABLED: "true",
        MONSTER_AI_DISABLED: "true",
        EXTRACT_OPEN_SEC: "8",
        EXTRACT_CHANNEL_DURATION_MS: "1000",
        MATCH_DURATION_SEC: "180"
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

async function waitForHealthcheck(timeoutMs = 10_000) {
  await withTimeout(
    async () => {
      while (true) {
        try {
          const response = await fetch(`${SERVER_URL}/health`);
          if (response.ok) {
            return;
          }
        } catch {
          // Retry until timeout.
        }

        await delay(250);
      }
    },
    timeoutMs,
    `Server healthcheck did not pass within ${timeoutMs}ms`
  );
}

function attachClientState(socket, label) {
  const state = {
    label,
    socket,
    roomState: undefined,
    matchStarted: undefined,
    players: [],
    monsters: [],
    drops: [],
    inventory: undefined,
    lootSpawned: [],
    lootPicked: [],
    extractOpened: undefined,
    extractProgress: undefined,
    extractSuccess: undefined,
    settlement: undefined,
    roomErrors: [],
    disconnectReason: undefined
  };

  socket.on("room:state", (payload) => {
    state.roomState = payload;
  });
  socket.on("match:started", (payload) => {
    state.matchStarted = payload;
  });
  socket.on("state:players", (payload) => {
    state.players = payload;
  });
  socket.on("state:monsters", (payload) => {
    state.monsters = payload;
  });
  socket.on("state:drops", (payload) => {
    state.drops = payload;
  });
  socket.on("inventory:update", (payload) => {
    state.inventory = payload;
  });
  socket.on("loot:spawned", (payload) => {
    state.lootSpawned = payload;
  });
  socket.on("loot:picked", (payload) => {
    state.lootPicked.push(payload);
  });
  socket.on("extract:opened", (payload) => {
    state.extractOpened = payload;
  });
  socket.on("domain:ExtractOpened", (payload) => {
    const zones = state.matchStarted?.room?.layout?.extractZones?.map((zone) => ({
      ...zone,
      isOpen: payload.zoneIds?.includes(zone.zoneId) ?? false
    })) ?? [];
    state.extractOpened = {
      ...payload,
      zones
    };
  });
  socket.on("extract:progress", (payload) => {
    state.extractProgress = payload;
  });
  socket.on("domain:ExtractChannelStarted", (payload) => {
    state.extractProgress = {
      ...payload,
      status: "started",
      remainingMs: payload.channelDurationMs,
      durationMs: payload.channelDurationMs
    };
  });
  socket.on("domain:ExtractChannelTicked", (payload) => {
    state.extractProgress = {
      ...state.extractProgress,
      ...payload,
      status: "progress"
    };
  });
  socket.on("extract:success", (payload) => {
    state.extractSuccess = payload;
  });
  socket.on("domain:ExtractSucceeded", (payload) => {
    state.extractSuccess = payload;
  });
  socket.on("match:settlement", (payload) => {
    state.settlement = payload;
  });
  socket.on("room:error", (payload) => {
    state.roomErrors.push(payload);
  });
  socket.on("disconnect", (reason) => {
    state.disconnectReason = reason;
  });

  return state;
}

function createClient(label) {
  const socket = io(SERVER_URL, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    timeout: 5_000
  });

  const state = attachClientState(socket, label);
  const client = { socket, state };
  activeClients.add(client);
  return client;
}

async function waitForSocketConnect(socket, label) {
  if (socket.connected) {
    return;
  }

  await withTimeout(
    () =>
      new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      }),
    5_000,
    `${label} connect timeout`
  );
}

async function waitForCondition(check, timeoutMs, message, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertNoRuntimeFailures();
    const value = check();
    if (value) {
      return value;
    }
    await delay(intervalMs);
  }

  assertNoRuntimeFailures();
  throw new Error(message);
}

function getSelfPlayer(clientState) {
  const selfPlayerId = clientState.matchStarted?.selfPlayerId;
  if (!selfPlayerId) {
    return undefined;
  }

  return clientState.players.find((player) => player.id === selfPlayerId);
}

function summarizeSquads(players) {
  return players.reduce((summary, player) => {
    summary[player.squadId] = (summary[player.squadId] ?? 0) + 1;
    return summary;
  }, {});
}

function assertFullSquads(players, roomState) {
  if (!roomState) {
    throw new Error("Missing started room:state payload");
  }

  if (players.length !== roomState.capacity) {
    throw new Error(`Expected match payload to fill room capacity ${roomState.capacity}, got ${players.length}`);
  }

  const squadSummary = summarizeSquads(players);
  const squads = Object.keys(squadSummary);
  if (squads.length !== roomState.squadCount) {
    throw new Error(`Expected ${roomState.squadCount} active squads, got ${squads.length}: ${JSON.stringify(squadSummary)}`);
  }

  const playerSquad = players.filter((player) => player.squadId === "player");
  if (playerSquad.length !== EXPECTED_HUMAN_CLIENT_COUNT) {
    throw new Error(
      `Expected player squad to keep ${EXPECTED_HUMAN_CLIENT_COUNT} human clients, got ${playerSquad.length}`
    );
  }

  const playerSquadBot = playerSquad.find((player) => player.isBot);
  if (playerSquadBot) {
    throw new Error(`Expected player squad to have no bots, but found ${playerSquadBot.id}`);
  }

  for (const [squadId, count] of Object.entries(squadSummary)) {
    if (squadId === "player") {
      continue;
    }
    const botPlayers = players.filter((player) => player.squadId === squadId);
    if (botPlayers.some((player) => !player.isBot)) {
      throw new Error(`Expected squad ${squadId} to contain only bots`);
    }
    if (count === 0) {
      throw new Error(`Expected squad ${squadId} to contain at least one bot`);
    }
  }

  return squadSummary;
}

function assertHumanLobbyPlayers(roomState, expectedCount) {
  if (!roomState) {
    throw new Error("Missing room:state payload");
  }

  if (roomState.players.length !== expectedCount) {
    throw new Error(`Expected lobby room:state to show ${expectedCount} humans, got ${roomState.players.length}`);
  }

  const botEntry = roomState.players.find((player) => player.isBot);
  if (botEntry) {
    throw new Error(`Lobby room:state leaked bot player ${botEntry.id}`);
  }
}

function getOpenExtractZones(clientState) {
  const openedZones = clientState.extractOpened?.zones?.filter((zone) => zone.isOpen);
  if (openedZones && openedZones.length > 0) {
    return openedZones;
  }

  const layoutZones = clientState.matchStarted?.room?.layout?.extractZones;
  if (layoutZones && layoutZones.length > 0) {
    return layoutZones;
  }

  return [];
}

function getNearestExtractZone(clientState) {
  const self = getSelfPlayer(clientState);
  if (!self) {
    return undefined;
  }

  const zones = getOpenExtractZones(clientState);
  if (zones.length === 0) {
    return undefined;
  }

  return [...zones].sort((left, right) => distance(self, left) - distance(self, right))[0];
}

function getPreferredExtractZone(clientState) {
  const self = getSelfPlayer(clientState);
  if (!self) {
    return undefined;
  }

  const zones = getOpenExtractZones(clientState);
  if (zones.length === 0) {
    return undefined;
  }

  const aliveMonsters = clientState.monsters.filter((monster) => monster.isAlive);
  return [...zones]
    .map((zone) => {
      const nearbyThreats = aliveMonsters.filter(
        (monster) => distance(monster, zone) <= EXTRACT_THREAT_RADIUS
      );
      const threatScore = nearbyThreats.reduce(
        (sum, monster) => sum + (monster.type === 'elite' ? 3 : 1),
        0
      );
      return {
        zone,
        threatScore,
        distanceFromSelf: distance(self, zone)
      };
    })
    .sort((left, right) => {
      if (left.threatScore !== right.threatScore) {
        return left.threatScore - right.threatScore;
      }
      return left.distanceFromSelf - right.distanceFromSelf;
    })[0]?.zone;
}

// ---------------------------------------------------------------------------
// 网格 BFS 路由
//
// 旧实现是"直线 + 几何绕行补丁"：直线路径在服务端只能沿轴滑动的碰撞模型下，
// 垂直顶墙时滑动分量为零，玩家会顶着障碍/河岸永久卡死（kill / reach / pickup
// 阶段随机超时的共同病灶）。改为对布局做 60px 网格 BFS：障碍 + 河（扣除桥、
// 安全区、撤离区干岛——服务端 pointInsideRiverHazardShape 的同款规则）视为
// 不可走，得到的路径再做视线平滑。
// ---------------------------------------------------------------------------

const ROUTE_CELL_PX = 60;
const ROUTE_OBSTACLE_CLEARANCE = 42;
const ROUTE_SMOOTH_CLEARANCE = 34;
// 服务端河伤害的撤离区豁免半径是 zone.radius + 120；取 110 留余量。
const ROUTE_EXTRACT_DRY_PADDING = 110;
const routeGridCache = new WeakMap();

function isRoutePointWalkable(clientState, x, y, clearance = ROUTE_OBSTACLE_CLEARANCE) {
  const layout = clientState.matchStarted?.room?.layout;
  if (!layout) {
    return true;
  }

  const point = { x, y };
  if ((layout.obstacleZones ?? []).some((rect) => pointInRectWithPadding(point, rect, clearance))) {
    return false;
  }

  if ((layout.riverHazards ?? []).some((rect) => pointInRectWithPadding(point, rect, 0))) {
    const inCrossing = (layout.safeCrossings ?? []).some((rect) => pointInRectWithPadding(point, rect, -10));
    const inExtractDryIsland = (layout.extractZones ?? []).some(
      (zone) => distance(zone, point) < (zone.radius ?? 96) + ROUTE_EXTRACT_DRY_PADDING
    );
    const inSafeZone = (layout.safeZones ?? []).some(
      (zone) => distance(zone, point) < zone.radius
    );
    if (!inCrossing && !inExtractDryIsland && !inSafeZone) {
      return false;
    }
  }

  return true;
}

function getRouteGrid(clientState) {
  const matchStarted = clientState.matchStarted;
  if (!matchStarted?.room?.layout) {
    return undefined;
  }

  const cached = routeGridCache.get(matchStarted);
  if (cached) {
    return cached;
  }

  const width = matchStarted.room.width ?? 4800;
  const height = matchStarted.room.height ?? 4800;
  const cols = Math.max(1, Math.ceil(width / ROUTE_CELL_PX));
  const rows = Math.max(1, Math.ceil(height / ROUTE_CELL_PX));
  const blocked = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const center = {
        x: cx * ROUTE_CELL_PX + ROUTE_CELL_PX / 2,
        y: cy * ROUTE_CELL_PX + ROUTE_CELL_PX / 2
      };
      if (!isRoutePointWalkable(clientState, center.x, center.y)) {
        blocked[cy * cols + cx] = 1;
      }
    }
  }

  const grid = { cols, rows, blocked };
  routeGridCache.set(matchStarted, grid);
  return grid;
}

function findNearestWalkableCell(grid, cx, cy) {
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < grid.cols && y < grid.rows;
  if (inBounds(cx, cy) && !grid.blocked[cy * grid.cols + cx]) {
    return { cx, cy };
  }

  for (let radius = 1; radius <= 10; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const nx = cx + dx;
        const ny = cy + dy;
        if (inBounds(nx, ny) && !grid.blocked[ny * grid.cols + nx]) {
          return { cx: nx, cy: ny };
        }
      }
    }
  }

  return undefined;
}

function isRouteSegmentWalkable(clientState, from, to) {
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / 24));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (!isRoutePointWalkable(clientState, x, y, ROUTE_SMOOTH_CLEARANCE)) {
      return false;
    }
  }
  return true;
}

function computeGridRoute(clientState, from, to) {
  const grid = getRouteGrid(clientState);
  if (!grid) {
    return undefined;
  }

  const toCell = (point) => ({
    cx: Math.min(grid.cols - 1, Math.max(0, Math.floor(point.x / ROUTE_CELL_PX))),
    cy: Math.min(grid.rows - 1, Math.max(0, Math.floor(point.y / ROUTE_CELL_PX)))
  });
  const cellCenter = (cell) => ({
    x: cell.cx * ROUTE_CELL_PX + ROUTE_CELL_PX / 2,
    y: cell.cy * ROUTE_CELL_PX + ROUTE_CELL_PX / 2
  });

  const start = findNearestWalkableCell(grid, toCell(from).cx, toCell(from).cy);
  const goal = findNearestWalkableCell(grid, toCell(to).cx, toCell(to).cy);
  if (!start || !goal) {
    return undefined;
  }

  const startIndex = start.cy * grid.cols + start.cx;
  const goalIndex = goal.cy * grid.cols + goal.cx;
  if (startIndex !== goalIndex) {
    const cameFrom = new Int32Array(grid.cols * grid.rows).fill(-1);
    cameFrom[startIndex] = startIndex;
    const queue = [startIndex];
    let found = false;

    for (let head = 0; head < queue.length && !found; head += 1) {
      const current = queue[head];
      const cx = current % grid.cols;
      const cy = Math.floor(current / grid.cols);
      for (let dy = -1; dy <= 1 && !found; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) {
            continue;
          }
          const next = ny * grid.cols + nx;
          if (grid.blocked[next] || cameFrom[next] !== -1) {
            continue;
          }
          // 斜向移动不允许切角：两个正交邻格都必须可走。
          if (dx !== 0 && dy !== 0) {
            if (grid.blocked[cy * grid.cols + nx] || grid.blocked[ny * grid.cols + cx]) {
              continue;
            }
          }
          cameFrom[next] = current;
          if (next === goalIndex) {
            found = true;
            break;
          }
          queue.push(next);
        }
      }
    }

    if (!found) {
      return undefined;
    }

    const cells = [];
    for (let index = goalIndex; index !== startIndex; index = cameFrom[index]) {
      cells.push({ cx: index % grid.cols, cy: Math.floor(index / grid.cols) });
    }
    cells.reverse();

    const rawPoints = cells.map(cellCenter);
    const smoothed = [];
    let anchor = from;
    let cursor = 0;
    while (cursor < rawPoints.length) {
      let reach = cursor;
      for (let probe = rawPoints.length - 1; probe > cursor; probe -= 1) {
        if (isRouteSegmentWalkable(clientState, anchor, rawPoints[probe])) {
          reach = probe;
          break;
        }
      }
      smoothed.push(rawPoints[reach]);
      anchor = rawPoints[reach];
      cursor = reach + 1;
    }
    return smoothed;
  }

  return [];
}

function getBridgeAwareWaypoints(clientState, from, to) {
  const route = computeGridRoute(clientState, from, to);
  if (!route) {
    // 布局缺失或找不到可走格：退回直线，让行走层的 stopDistance 兜底。
    return [to];
  }

  // 终点本体可能在不可走区（贴墙的掉落、河边读条点），永远保留真实目标，
  // 行走层按 stopDistance 提前停。
  route.push(to);
  return route;
}

function pointInRectWithPadding(point, rect, padding = 0) {
  return point.x >= rect.x - padding
    && point.x <= rect.x + rect.width + padding
    && point.y >= rect.y - padding
    && point.y <= rect.y + rect.height + padding;
}

function segmentIntersectsSegmentForRoute(a1, a2, b1, b2) {
  const subtract = (left, right) => ({ x: left.x - right.x, y: left.y - right.y });
  const cross = (left, right) => (left.x * right.y) - (left.y * right.x);
  const pointOnSegment = (start, point, end) => (
    point.x >= Math.min(start.x, end.x)
    && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y)
    && point.y <= Math.max(start.y, end.y)
  );

  const d1 = cross(subtract(a2, a1), subtract(b1, a1));
  const d2 = cross(subtract(a2, a1), subtract(b2, a1));
  const d3 = cross(subtract(b2, b1), subtract(a1, b1));
  const d4 = cross(subtract(b2, b1), subtract(a2, b1));

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return (d1 === 0 && pointOnSegment(a1, b1, a2))
    || (d2 === 0 && pointOnSegment(a1, b2, a2))
    || (d3 === 0 && pointOnSegment(b1, a1, b2))
    || (d4 === 0 && pointOnSegment(b1, a2, b2));
}

function segmentIntersectsRectForRoute(start, end, rect, padding = 0) {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };

  if (pointInRectWithPadding(start, expanded) || pointInRectWithPadding(end, expanded)) {
    return true;
  }

  const minX = expanded.x;
  const maxX = expanded.x + expanded.width;
  const minY = expanded.y;
  const maxY = expanded.y + expanded.height;
  return segmentIntersectsSegmentForRoute(start, end, { x: minX, y: minY }, { x: maxX, y: minY })
    || segmentIntersectsSegmentForRoute(start, end, { x: maxX, y: minY }, { x: maxX, y: maxY })
    || segmentIntersectsSegmentForRoute(start, end, { x: maxX, y: maxY }, { x: minX, y: maxY })
    || segmentIntersectsSegmentForRoute(start, end, { x: minX, y: maxY }, { x: minX, y: minY });
}

function pointInRiverHazard(clientState, point) {
  const layout = clientState.matchStarted?.room?.layout;
  return (layout?.riverHazards ?? []).some((hazard) => pointInRectWithPadding(point, hazard))
    && !(layout?.safeCrossings ?? []).some((crossing) => pointInRectWithPadding(point, crossing));
}

function routeBlockScore(clientState, from, to) {
  const layout = clientState.matchStarted?.room?.layout;
  if (!layout) {
    return 0;
  }

  let score = 0;
  if (pointInRiverHazard(clientState, from) || pointInRiverHazard(clientState, to)) {
    score += 4;
  }
  if ((layout.riverHazards ?? []).some((hazard) => segmentIntersectsRectForRoute(from, to, hazard, 110))) {
    score += 2;
  }
  if ((layout.obstacleZones ?? []).some((obstacle) => segmentIntersectsRectForRoute(from, to, obstacle, 42))) {
    score += 8;
  }
  return score;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeDirection(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return { x: dx / length, y: dy / length };
}

// BFS 路径的拐角点不能用 BRIDGE_APPROACH_RADIUS(96) 这种大半径跳过/提前
// 截断——跳过拐角直奔下一个 waypoint 会斜穿障碍角。36px 与行走层的到达
// 判定一致。
const ROUTE_WAYPOINT_REACH = 36;

function getNextSafeWaypoint(clientState, from, to) {
  const waypoints = getBridgeAwareWaypoints(clientState, from, to);
  return waypoints.find((waypoint) => distance(from, waypoint) > ROUTE_WAYPOINT_REACH) ?? to;
}

function getAttackIntervalMs(player) {
  const attacksPerSecondByWeapon = {
    sword: 1.01,
    blade: 0.72,
    spear: 0.43
  };
  const attacksPerSecond = attacksPerSecondByWeapon[player.weaponType] ?? attacksPerSecondByWeapon.sword;
  const cooldownMs = Math.round((1000 / attacksPerSecond) / Math.max(1 + (player.attackSpeed ?? 0), 0.1));
  return cooldownMs + 260;
}

function getAttackRangePx(player) {
  const rangeByWeapon = {
    sword: 116,
    blade: 128,
    spear: 180
  };
  return rangeByWeapon[player.weaponType] ?? rangeByWeapon.sword;
}

async function movePlayerTowards(client, target, stopDistance, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastProgressPosition;
  let lastProgressAt = Date.now();
  while (Date.now() < deadline) {
    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error(`${client.state.label} player state unavailable`);
    }

    const remaining = distance(self, target);
    if (remaining <= stopDistance) {
      client.socket.emit("player:inputMove", {
        direction: { x: 0, y: 0 }
      });
      return;
    }

    // 卡死早抛：1.5s 没挪动就别烧预算，抛给上层用当前位置重新路由。
    if (!lastProgressPosition || distance(self, lastProgressPosition) > 6) {
      lastProgressPosition = { x: self.x, y: self.y };
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt > 1_500) {
      client.socket.emit("player:inputMove", {
        direction: { x: 0, y: 0 }
      });
      throw new Error(
        `${client.state.label} stuck while moving `
        + `(self=${Math.round(self.x)},${Math.round(self.y)} target=${Math.round(target.x)},${Math.round(target.y)} remaining=${Math.round(remaining)})`
      );
    }

    client.socket.emit("player:inputMove", {
      direction: normalizeDirection(self, target)
    });
    await delay(70);
  }

  client.socket.emit("player:inputMove", {
    direction: { x: 0, y: 0 }
  });
  const lastSelf = getSelfPlayer(client.state);
  throw new Error(
    `${client.state.label} failed to reach target position `
    + `(self=${lastSelf ? `${Math.round(lastSelf.x)},${Math.round(lastSelf.y)}` : "n/a"} `
    + `target=${Math.round(target.x)},${Math.round(target.y)} `
    + `remaining=${lastSelf ? Math.round(distance(lastSelf, target)) : "n/a"} stop=${Math.round(stopDistance)} budgetMs=${Math.round(timeoutMs)})`
  );
}

async function movePlayerAlongSafeRoute(client, target, stopDistance, timeoutMs) {
  const self = getSelfPlayer(client.state);
  if (!self) {
    throw new Error(`${client.state.label} player state unavailable`);
  }

  const deadline = Date.now() + timeoutMs;
  const waypoints = getBridgeAwareWaypoints(client.state, self, target);
  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index];
    const waypointStopDistance = index === waypoints.length - 1 ? stopDistance : ROUTE_WAYPOINT_REACH;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `${client.state.label} route budget exhausted at waypoint ${index + 1}/${waypoints.length} `
        + `route=[${waypoints.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" -> ")}]`
      );
    }
    try {
      await movePlayerTowards(client, waypoint, waypointStopDistance, remainingMs);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} `
        + `[waypoint ${index + 1}/${waypoints.length} route=[${waypoints.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" -> ")}]]`
      );
    }
  }
}

function pickNearestAliveMonster(client) {
  return pickNearestAliveMonsterExcept(client, new Set());
}

// 杀怪取掉落的预算只够打小怪。boss 260hp / 精英 2 倍血会把 STEP_TIMEOUTS[5]
// 整个耗光——历史版本判 type === "normal"，但基础怪的运行时 type 是 "basic"，
// 重命名后比较器失效，boss 反而常被选中（carry-loop 超时的根因）。
function monsterTierScore(type) {
  if (type === "boss") {
    return 2;
  }
  if (type === "elite" || type === "brute") {
    return 1;
  }
  return 0;
}

function pickNearestAliveMonsterExcept(client, excludedIds) {
  const self = getSelfPlayer(client.state);
  if (!self) {
    return undefined;
  }

  const aliveMonsters = client.state.monsters.filter((monster) => monster.isAlive && !excludedIds.has(monster.id));
  aliveMonsters.sort((left, right) => {
    const tierDiff = monsterTierScore(left.type) - monsterTierScore(right.type);
    if (tierDiff !== 0) {
      return tierDiff;
    }
    const leftBlockScore = routeBlockScore(client.state, self, left);
    const rightBlockScore = routeBlockScore(client.state, self, right);
    if (leftBlockScore !== rightBlockScore) {
      return leftBlockScore - rightBlockScore;
    }
    return distance(self, left) - distance(self, right);
  });
  return aliveMonsters[0];
}

async function killOneMonster(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const initialTarget = pickNearestAliveMonster(client);
  if (!initialTarget) {
    throw new Error("No alive monster available");
  }

  let targetMonsterId = initialTarget.id;
  let retargeted = false;
  const initialAliveIds = new Set(
    client.state.monsters.filter((monster) => monster.isAlive).map((monster) => monster.id)
  );
  let lastAttackAt = 0;
  // 路由承诺：getNextSafeWaypoint 在到达半径边界两侧会无滞回地翻转（waypoint
  // 在身后/目标在前方时形成 ±一步的周期 2 振荡，永远走不到怪）。选定
  // waypoint 后坚持走到 32px 内再重新询问路由；卡死超过 1.2s 则强制重路由。
  let committedWaypoint = null;
  let stuckProbePosition = null;
  let stuckProbeAt = Date.now();

  while (Date.now() < deadline) {
    if (!retargeted && Date.now() - (deadline - timeoutMs) >= timeoutMs * 0.5) {
      const nextTarget = pickNearestAliveMonsterExcept(client, new Set([targetMonsterId]));
      if (nextTarget && nextTarget.id !== targetMonsterId) {
        targetMonsterId = nextTarget.id;
        retargeted = true;
        committedWaypoint = null;
        await delay(30);
        continue;
      }
    }

    const anyKilledMonster = client.state.monsters.find(
      (monster) => initialAliveIds.has(monster.id) && !monster.isAlive
    );
    if (anyKilledMonster) {
      return anyKilledMonster;
    }

    const targetMonster = client.state.monsters.find((monster) => monster.id === targetMonsterId);
    if (!targetMonster) {
      throw new Error(`Target monster ${targetMonsterId} disappeared from state`);
    }
    if (!targetMonster.isAlive) {
      return targetMonster;
    }

    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error("PlayerA state unavailable during attack");
    }

    const attackRange = getAttackRangePx(self);
    const rangeToMonster = distance(self, targetMonster);
    if (rangeToMonster > attackRange + 16) {
      if (!stuckProbePosition || distance(self, stuckProbePosition) > 6) {
        stuckProbePosition = { x: self.x, y: self.y };
        stuckProbeAt = Date.now();
      } else if (Date.now() - stuckProbeAt > 1_200) {
        committedWaypoint = null;
        stuckProbePosition = null;
        stuckProbeAt = Date.now();
      }
      if (!committedWaypoint || distance(self, committedWaypoint) <= 32) {
        committedWaypoint = getNextSafeWaypoint(client.state, self, targetMonster);
      }
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, committedWaypoint)
      });
      await delay(25);
      continue;
    }
    committedWaypoint = null;

    if (rangeToMonster > attackRange - 12) {
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(60);
      continue;
    }

    if (Date.now() - lastAttackAt >= getAttackIntervalMs(self)) {
      client.socket.emit("player:attack", {
        attackId: `attack_${Date.now()}`,
        direction: normalizeDirection(self, targetMonster),
        targetId: targetMonster.id
      });
      lastAttackAt = Date.now();
    }

    await delay(40);

    const killedMonster = client.state.monsters.find((monster) => monster.id === targetMonsterId);
    if (killedMonster && !killedMonster.isAlive) {
      return killedMonster;
    }
  }

  throw new Error(`Timed out waiting for monster ${targetMonsterId} to die`);
}

async function clearMonsterThreatNearPoint(client, targetMonsterId, center, radius, timeoutMs) {
  const initialTargetMonster = client.state.monsters.find((monster) => monster.id === targetMonsterId);
  if (!initialTargetMonster) {
    throw new Error(`Target monster ${targetMonsterId} disappeared from state`);
  }
  const extraTimeoutMs = initialTargetMonster.type === "elite" ? 4_000 : initialTargetMonster.type === "boss" ? 8_000 : 0;
  const totalBudgetMs = timeoutMs + extraTimeoutMs;
  const deadline = Date.now() + totalBudgetMs;
  const retreatAfterMs = Math.floor(totalBudgetMs * 0.6);
  const startedAt = Date.now();
  let lastAttackAt = Date.now();
  let lastKnownDistance = distance(initialTargetMonster, center);
  let lastKnownType = initialTargetMonster.type;
  let threatWaypoint = null;
  let threatStuckPosition = null;
  let threatStuckAt = Date.now();

  while (Date.now() < deadline) {
    const targetMonster = client.state.monsters.find((monster) => monster.id === targetMonsterId);
    if (!targetMonster) {
      throw new Error(`Target monster ${targetMonsterId} disappeared from state`);
    }
    if (!targetMonster.isAlive) {
      return targetMonster;
    }
    if (distance(targetMonster, center) > radius + 80) {
      return targetMonster;
    }
    lastKnownDistance = distance(targetMonster, center);
    lastKnownType = targetMonster.type;

    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error(`${client.state.label} player state unavailable during attack`);
    }

    if (Date.now() - startedAt >= retreatAfterMs) {
      const awayDirection = normalizeDirection(center, self);
      const retreatPoint = {
        x: self.x + awayDirection.x * 260,
        y: self.y + awayDirection.y * 260
      };
      const routeTarget = getNextSafeWaypoint(client.state, self, retreatPoint);
      client.socket.emit('player:inputMove', {
        direction: normalizeDirection(self, routeTarget)
      });
      await delay(70);
      continue;
    }

    const attackRange = getAttackRangePx(self);
    const rangeToMonster = distance(self, targetMonster);
    if (rangeToMonster > attackRange + 16) {
      // 与 killOneMonster 相同的路由承诺 + 卡死强制重路由。
      if (!threatStuckPosition || distance(self, threatStuckPosition) > 6) {
        threatStuckPosition = { x: self.x, y: self.y };
        threatStuckAt = Date.now();
      } else if (Date.now() - threatStuckAt > 1_200) {
        threatWaypoint = null;
        threatStuckPosition = null;
        threatStuckAt = Date.now();
      }
      if (!threatWaypoint || distance(self, threatWaypoint) <= 32) {
        threatWaypoint = getNextSafeWaypoint(client.state, self, targetMonster);
      }
      client.socket.emit('player:inputMove', {
        direction: normalizeDirection(self, threatWaypoint)
      });
      await delay(25);
      continue;
    }
    threatWaypoint = null;

    if (rangeToMonster > attackRange - 12) {
      client.socket.emit('player:inputMove', {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(60);
      continue;
    }

    if (Date.now() - lastAttackAt >= getAttackIntervalMs(self)) {
      client.socket.emit('player:attack', {
        attackId: `attack_${Date.now()}`,
        direction: normalizeDirection(self, targetMonster),
        targetId: targetMonster.id
      });
      lastAttackAt = Date.now();
    }

    await delay(40);
  }

  throw new Error(`Timed out waiting for ${lastKnownType} monster ${targetMonsterId} at distance ${Math.round(lastKnownDistance)} to die or leave threat radius`);
}

function getNearbyAliveMonsters(clientState, center, radius) {
  return clientState.monsters
    .filter((monster) => monster.isAlive && distance(monster, center) <= radius)
    .sort((left, right) => distance(left, center) - distance(right, center));
}

async function clearThreatsNearPoint(client, center, radius, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const threats = getNearbyAliveMonsters(client.state, center, radius);
    if (threats.length === 0) {
      return;
    }

    await clearMonsterThreatNearPoint(client, threats[0].id, center, radius, Math.min(8_000, deadline - Date.now()));
    await delay(120);
  }

  throw new Error(`${client.state.label} failed to clear nearby monsters before extract`);
}

async function pickupNearestDrop(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const positionTrace = [];
  // 目标承诺：每帧重选"最近掉落"在多掉落场景下会在两个近距目标间振荡；
  // 选定后坚持到捡到或目标消失。waypoint 承诺与 killOneMonster 同理。
  let committedDropId = null;
  let pickupWaypoint = null;
  let pickupStuckPosition = null;
  let pickupStuckAt = Date.now();
  while (Date.now() < deadline) {
    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error("PlayerA state unavailable during pickup");
    }
    if (!self.isAlive) {
      throw new Error(
        `${client.state.label} died during pickup (self=${Math.round(self.x)},${Math.round(self.y)} hp=${self.hp}/${self.maxHp})`
      );
    }
    const lastTrace = positionTrace[positionTrace.length - 1];
    if (!lastTrace || distance(self, lastTrace) > 24) {
      positionTrace.push({ x: Math.round(self.x), y: Math.round(self.y), t: Date.now() });
    }

    if (client.state.drops.length === 0) {
      await delay(100);
      continue;
    }

    let targetDrop = committedDropId
      ? client.state.drops.find((drop) => drop.id === committedDropId)
      : undefined;
    if (!targetDrop) {
      targetDrop = [...client.state.drops].sort(
        (left, right) => distance(self, left) - distance(self, right)
      )[0];
      committedDropId = targetDrop.id;
      pickupWaypoint = null;
    }
    const rangeToDrop = distance(self, targetDrop);

    if (rangeToDrop > PICKUP_RADIUS - 4) {
      // 掉落可能在障碍/河对面：走路由，不走直线（直线顶墙会卡到超时）。
      if (!pickupStuckPosition || distance(self, pickupStuckPosition) > 6) {
        pickupStuckPosition = { x: self.x, y: self.y };
        pickupStuckAt = Date.now();
      } else if (Date.now() - pickupStuckAt > 1_200) {
        pickupWaypoint = null;
        pickupStuckPosition = null;
        pickupStuckAt = Date.now();
      }
      if (!pickupWaypoint || distance(self, pickupWaypoint) <= 32) {
        pickupWaypoint = getNextSafeWaypoint(client.state, self, targetDrop);
      }
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, pickupWaypoint)
      });
      await delay(70);
      continue;
    }

    client.socket.emit("player:pickup", { dropId: targetDrop.id });
    const picked = await waitForCondition(
      () => {
        const lootPicked = client.state.lootPicked.find((entry) => entry.dropId === targetDrop.id);
        if (lootPicked) {
          return targetDrop.id;
        }

        const items = client.state.inventory?.inventory?.items ?? [];
        if (items.length > 0 || !client.state.drops.some((drop) => drop.id === targetDrop.id)) {
          return targetDrop.id;
        }

        const outOfRangeError = [...client.state.roomErrors]
          .reverse()
          .find((entry) => entry?.message?.includes("out of pickup range"));
        if (outOfRangeError) {
          return undefined;
        }

        return undefined;
      },
      Math.min(1_500, Math.max(300, deadline - Date.now())),
      "pickup confirmation timeout",
      50
    ).catch(() => undefined);

    if (picked) {
      return picked;
    }

    // 确认失败（如服务端判距离不足）：放开目标承诺，允许换一个掉落重试。
    committedDropId = null;
    await delay(120);
  }

  const lastSelf = getSelfPlayer(client.state);
  const nearestDrop = lastSelf
    ? [...client.state.drops].sort((left, right) => distance(lastSelf, left) - distance(lastSelf, right))[0]
    : undefined;
  throw new Error(
    "Timed out before reaching a drop to pick up "
    + `(self=${lastSelf ? `${Math.round(lastSelf.x)},${Math.round(lastSelf.y)} hp=${lastSelf.hp}/${lastSelf.maxHp} alive=${lastSelf.isAlive}` : "n/a"} `
    + `drops=${client.state.drops.length} `
    + `nearest=${nearestDrop ? `${Math.round(nearestDrop.x)},${Math.round(nearestDrop.y)} dist=${Math.round(distance(lastSelf, nearestDrop))}` : "n/a"} `
    + `routeNext=${lastSelf && nearestDrop ? JSON.stringify(getNextSafeWaypoint(client.state, lastSelf, nearestDrop)) : "n/a"} `
    + `errors=${JSON.stringify(client.state.roomErrors.slice(-3))} `
    + `trace=${JSON.stringify(positionTrace.slice(-6))})`
  );
}

async function cleanup({ clients, serverProcess }) {
  shuttingDown = true;
  for (const client of clients) {
    try {
      client.socket.disconnect();
    } catch {
      // Ignore cleanup errors.
    }
  }

  if (serverProcess && !serverProcess.killed) {
    activeServerMonitor?.detach?.();
    serverProcess.kill();
    await Promise.race([
      new Promise((resolve) => serverProcess.once("exit", resolve)),
      delay(2_000)
    ]);
  }

  for (const client of clients) {
    activeClients.delete(client);
  }
}

async function main() {
  const stepResults = [];
  let serverProcess;
  let ownsServerProcess = false;
  const clients = [];
  shuttingDown = false;
  activeServerMonitor = undefined;

  try {
    await ensureServerBuild();
    try {
      serverProcess = startServer();
      ownsServerProcess = true;
      await waitForServerReady(serverProcess);
      await delay(2_000);
    } catch (error) {
      if (error?.code !== "EPERM") {
        throw error;
      }

      if (!ALLOW_EXTERNAL_SERVER) {
        throw new Error(
          "child_process.spawn is blocked, so test-loop cannot launch its own server. "
          + "Refusing to reuse an already-running server because that would not prove the current build is under test. "
          + "If you intentionally want that fallback, rerun with TEST_LOOP_ALLOW_EXTERNAL_SERVER=1."
        );
      }

      console.log("[warn] child_process.spawn blocked; reusing an already-running server because TEST_LOOP_ALLOW_EXTERNAL_SERVER=1");
      await waitForHealthcheck();
      await delay(2_000);
    }

    const playerA = createClient("PlayerA");
    const playerB = createClient("PlayerB");
    clients.push(playerA, playerB);

    await Promise.all([
      waitForSocketConnect(playerA.socket, "PlayerA"),
      waitForSocketConnect(playerB.socket, "PlayerB")
    ]);

    let roomCode;
    let initialDropCount = 0;

    try {
      playerA.socket.emit("room:create", { playerName: "PlayerA", botDifficulty: "easy" });
      const roomState = await waitForCondition(
        () => playerA.state.roomState?.code ? playerA.state.roomState : undefined,
        STEP_TIMEOUTS[1],
        "PlayerA did not receive room:state with roomCode"
      );
      assertHumanLobbyPlayers(roomState, 1);
      roomCode = roomState.code;
      stepResults.push(true);
      logStepResult(1, true, `Room created: roomCode=${roomCode}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(1, false, error.message);
      throw error;
    }

    try {
      if (!roomCode) {
        throw new Error("Missing roomCode, skipping join");
      }
      playerB.socket.emit("room:join", { code: roomCode, playerName: "PlayerB" });
      await waitForCondition(
        () => {
          const players = playerA.state.roomState?.players ?? [];
          if (players.length >= 2) {
            return playerA.state.roomState;
          }
          return undefined;
        },
        STEP_TIMEOUTS[2],
        "room:state did not show both players"
      );
      assertHumanLobbyPlayers(playerA.state.roomState, 2);
      stepResults.push(true);
      logStepResult(2, true, "PlayerB joined room and room:state shows both humans");
    } catch (error) {
      stepResults.push(false);
      logStepResult(2, false, error.message);
      throw error;
    }

    try {
      playerA.socket.emit("room:start", { botDifficulty: "easy" });
      const [playerAMatch] = await Promise.all([
        waitForCondition(
          () => playerA.state.matchStarted,
          STEP_TIMEOUTS[3],
          "PlayerA did not receive match:started"
        ),
        waitForCondition(
          () => playerB.state.matchStarted,
          STEP_TIMEOUTS[3],
          "PlayerB did not receive match:started"
        )
      ]);
      const startedRoomState = await waitForCondition(
        () => playerA.state.roomState?.status === "started" ? playerA.state.roomState : undefined,
        STEP_TIMEOUTS[3],
        "PlayerA did not receive started room:state"
      );
      assertHumanLobbyPlayers(startedRoomState, 2);
      const squadSummary = assertFullSquads(playerAMatch.room.players, startedRoomState);
      initialDropCount = playerA.state.drops.length;
      stepResults.push(true);
      logStepResult(3, true, `Both clients received match:started, units=${playerAMatch.room.players.length}, squads=${JSON.stringify(squadSummary)}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(3, false, error.message);
      throw error;
    }

    try {
      const monsters = await waitForCondition(
        () => {
          const alive = playerA.state.monsters.filter((monster) => monster.isAlive);
          return alive.length > 0 ? alive : undefined;
        },
        STEP_TIMEOUTS[4],
        "No alive monsters observed in state:monsters"
      );
      stepResults.push(true);
      logStepResult(4, true, `Received state:monsters, alive count=${monsters.length}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(4, false, error.message);
      throw error;
    }

    let killedMonster;
    try {
      killedMonster = await killOneMonster(playerA, STEP_TIMEOUTS[5]);
      stepResults.push(true);
      logStepResult(5, true, `PlayerA killed monster ${killedMonster.id}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(5, false, error.message);
      throw error;
    }

    try {
      const drops = await waitForCondition(
        () => {
          if (playerA.state.lootSpawned.length > 0) {
            return playerA.state.lootSpawned;
          }

          if (playerA.state.drops.length > 0) {
            return playerA.state.drops;
          }

          return undefined;
        },
        STEP_TIMEOUTS[6],
        "No loot or pickup-ready world drops observed after monster kill"
      );
      stepResults.push(true);
      logStepResult(6, true, `Received state:drops, count=${drops.length}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(6, false, error.message);
      throw error;
    }

    let pickedDropId;
    try {
      pickedDropId = await pickupNearestDrop(playerA, STEP_TIMEOUTS[7]);
      const inventoryUpdate = await waitForCondition(
        () => {
          const items = playerA.state.inventory?.inventory?.items ?? [];
          return items.length > 0 ? playerA.state.inventory : undefined;
        },
        STEP_TIMEOUTS[7],
        "inventory:update did not include backpack items"
      );
      const itemCount = inventoryUpdate.inventory.items.length;
      stepResults.push(true);
      logStepResult(7, true, `Picked dropId=${pickedDropId}, inventory items=${itemCount}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(7, false, error.message);
      throw error;
    }

    try {
      const opened = await waitForCondition(
        () => playerA.state.extractOpened,
        STEP_TIMEOUTS[8],
        "extract:opened not received within 15s"
      );
      const zoneCount = opened.zones?.length ?? 0;
      stepResults.push(true);
      logStepResult(8, true, `Extract opened, zones=${zoneCount}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(8, false, error.message);
      throw error;
    }

    try {
      const extractZone = await waitForCondition(
        () => getPreferredExtractZone(playerA.state),
        STEP_TIMEOUTS[9],
        "No extract zone available for movement"
      );
      await movePlayerAlongSafeRoute(playerA, extractZone, extractZone.radius - POSITION_TOLERANCE, 10_000);
      await clearThreatsNearPoint(playerA, extractZone, EXTRACT_THREAT_RADIUS, 20_000);
      await movePlayerAlongSafeRoute(playerA, extractZone, extractZone.radius - POSITION_TOLERANCE, 5_000);
      playerA.socket.emit("player:startExtract");
      const extractEvent = await waitForCondition(
        () => {
          const success = playerA.state.extractSuccess;
          if (success) {
            return { type: "success", payload: success };
          }

          const progress = playerA.state.extractProgress;
          if (
            progress &&
            progress.playerId === playerA.state.matchStarted?.selfPlayerId &&
            (progress.status === "started" || progress.status === "progress")
          ) {
            return { type: progress.status, payload: progress };
          }

          return undefined;
        },
        STEP_TIMEOUTS[9],
        "No extract:success or extract:progress observed within 5s"
      );
      stepResults.push(true);
      logStepResult(9, true, `Received extract event ${extractEvent.type}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(9, false, error.message);
      throw error;
    }

    try {
      const settlement = await waitForCondition(
        () => {
          const payload = playerA.state.settlement;
          return payload?.playerId === playerA.state.matchStarted?.selfPlayerId ? payload : undefined;
        },
        STEP_TIMEOUTS[10],
        "match:settlement not received within 70s"
      );
      if (settlement.settlement?.result !== "success" || settlement.settlement?.reason !== "extracted") {
        throw new Error(`Expected extracted success settlement, got result=${settlement.settlement?.result ?? "unknown"} reason=${settlement.settlement?.reason ?? "n/a"}`);
      }
      stepResults.push(true);
      logStepResult(10, true, `Received settlement, result=${settlement.settlement?.result ?? "unknown"} reason=${settlement.settlement?.reason ?? "n/a"}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(10, false, error.message);
      throw error;
    }
    const passed = stepResults.filter(Boolean).length;
    console.log(`Summary: passed ${passed} / 10 steps`);
    if (passed !== 10) {
      process.exitCode = 1;
    }
  } finally {
    await cleanup({ clients, serverProcess: ownsServerProcess ? serverProcess : undefined });
  }
}

export {
  STEP_TIMEOUTS,
  cleanup,
  clearThreatsNearPoint,
  createClient,
  ensureServerBuild,
  getPreferredExtractZone,
  getSelfPlayer,
  killOneMonster,
  movePlayerAlongSafeRoute,
  pickupNearestDrop,
  startServer,
  waitForCondition,
  waitForHealthcheck,
  waitForServerReady,
  waitForSocketConnect
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[fatal] ${error.stack ?? error.message}`);
    process.exitCode = 1;
  });
}

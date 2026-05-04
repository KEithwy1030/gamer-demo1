import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { io } from "socket.io-client";

const SERVER_PORT = Number.parseInt(process.env.TEST_SERVER_PORT ?? "3100", 10);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_DIR = fileURLToPath(new URL("../server/", import.meta.url));
const SERVER_SRC_DIR = fileURLToPath(new URL("../server/src/", import.meta.url));
const SHARED_DIR = fileURLToPath(new URL("../shared/", import.meta.url));
const SHARED_SRC_DIR = fileURLToPath(new URL("../shared/src/", import.meta.url));
const DIST_ENTRY = fileURLToPath(new URL("../server/dist/index.js", import.meta.url));
const SHARED_DIST_ENTRY = fileURLToPath(new URL("../shared/dist/index.js", import.meta.url));
const FORCE_SERVER_BUILD = process.env.TEST_LOOP_FORCE_BUILD === "1";
const ALLOW_EXTERNAL_SERVER = process.env.TEST_LOOP_ALLOW_EXTERNAL_SERVER === "1";

const MOVE_STEP_PER_INPUT = 28;
const PICKUP_RADIUS = 140;
const POSITION_TOLERANCE = 36;
const EXTRACT_THREAT_RADIUS = 260;
const BRIDGE_APPROACH_RADIUS = 96;
const EXPECTED_HUMAN_CLIENT_COUNT = 2;

const STEP_TIMEOUTS = {
  1: 5_000,
  2: 5_000,
  3: 5_000,
  4: 5_000,
  5: 30_000,
  6: 8_000,
  7: 10_000,
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
    shell: false,
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
  const serverDistMtimeMs = await getBuildMtimeMs(DIST_ENTRY);
  const sharedDistMtimeMs = await getBuildMtimeMs(SHARED_DIST_ENTRY);

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

  const verifiedSharedDistMtimeMs = await getBuildMtimeMs(SHARED_DIST_ENTRY);
  const verifiedServerDistMtimeMs = await getBuildMtimeMs(DIST_ENTRY);
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
        EXTRACT_OPEN_SEC: "8",
        EXTRACT_CHANNEL_DURATION_MS: "1000",
        MATCH_DURATION_SEC: "60"
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
  socket.on("extract:progress", (payload) => {
    state.extractProgress = payload;
  });
  socket.on("extract:success", (payload) => {
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

function getBridgeAwareWaypoints(clientState, from, to) {
  const layout = clientState.matchStarted?.room?.layout;
  const hazard = layout?.riverHazards?.[0];
  const safeCrossings = layout?.safeCrossings ?? [];
  if (!hazard || safeCrossings.length === 0) {
    return [to];
  }

  const leftEdge = hazard.x;
  const rightEdge = hazard.x + hazard.width;
  const pointInRect = (point, rect) => (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );

  const fromInRiver = pointInRect(from, hazard) && !safeCrossings.some((crossing) => pointInRect(from, crossing));
  const toInRiver = pointInRect(to, hazard) && !safeCrossings.some((crossing) => pointInRect(to, crossing));
  const crossesRiver = (from.x < leftEdge && to.x > rightEdge) || (to.x < leftEdge && from.x > rightEdge);

  if (!fromInRiver && !toInRiver && !crossesRiver) {
    return [to];
  }

  const bridgeCenter = [...safeCrossings]
    .map((crossing) => ({
      x: crossing.x + crossing.width / 2,
      y: crossing.y + crossing.height / 2
    }))
    .sort((left, right) => (distance(from, left) + distance(left, to)) - (distance(from, right) + distance(right, to)))[0];

  return bridgeCenter ? [bridgeCenter, to] : [to];
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

function getAttackIntervalMs(player) {
  const attacksPerSecondByWeapon = {
    sword: 1.01,
    blade: 0.72,
    spear: 0.43
  };
  const attacksPerSecond = attacksPerSecondByWeapon[player.weaponType] ?? attacksPerSecondByWeapon.sword;
  const cooldownMs = Math.round((1000 / attacksPerSecond) / Math.max(1 + (player.attackSpeed ?? 0), 0.1));
  return cooldownMs + 120;
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

    client.socket.emit("player:inputMove", {
      direction: normalizeDirection(self, target)
    });
    await delay(70);
  }

  client.socket.emit("player:inputMove", {
    direction: { x: 0, y: 0 }
  });
  throw new Error(`${client.state.label} failed to reach target position`);
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
    const waypointStopDistance = index === waypoints.length - 1 ? stopDistance : BRIDGE_APPROACH_RADIUS;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`${client.state.label} failed to reach target position`);
    }
    await movePlayerTowards(client, waypoint, waypointStopDistance, remainingMs);
  }
}

function pickNearestAliveMonster(client) {
  const self = getSelfPlayer(client.state);
  if (!self) {
    return undefined;
  }

  const aliveMonsters = client.state.monsters.filter((monster) => monster.isAlive);
  aliveMonsters.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "normal" ? -1 : 1;
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

  const targetMonsterId = initialTarget.id;
  const initialAliveIds = new Set(
    client.state.monsters.filter((monster) => monster.isAlive).map((monster) => monster.id)
  );
  let lastAttackAt = 0;

  while (Date.now() < deadline) {
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
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(25);
      continue;
    }

    if (rangeToMonster > attackRange - 12) {
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(60);
      continue;
    }

    if (Date.now() - lastAttackAt >= getAttackIntervalMs(self)) {
      client.socket.emit("player:attack", {
        attackId: `attack_${Date.now()}`
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

async function killMonsterById(client, targetMonsterId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastAttackAt = 0;

  while (Date.now() < deadline) {
    const targetMonster = client.state.monsters.find((monster) => monster.id === targetMonsterId);
    if (!targetMonster) {
      throw new Error(`Target monster ${targetMonsterId} disappeared from state`);
    }
    if (!targetMonster.isAlive) {
      return targetMonster;
    }

    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error(`${client.state.label} player state unavailable during attack`);
    }

    const attackRange = getAttackRangePx(self);
    const rangeToMonster = distance(self, targetMonster);
    if (rangeToMonster > attackRange + 16) {
      client.socket.emit('player:inputMove', {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(25);
      continue;
    }

    if (rangeToMonster > attackRange - 12) {
      client.socket.emit('player:inputMove', {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(60);
      continue;
    }

    if (Date.now() - lastAttackAt >= getAttackIntervalMs(self)) {
      client.socket.emit('player:attack', {
        attackId: `attack_${Date.now()}`
      });
      lastAttackAt = Date.now();
    }

    await delay(40);
  }

  throw new Error(`Timed out waiting for monster ${targetMonsterId} to die`);
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

    await killMonsterById(client, threats[0].id, Math.min(8_000, deadline - Date.now()));
    await delay(120);
  }

  throw new Error(`${client.state.label} failed to clear nearby monsters before extract`);
}

async function pickupNearestDrop(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error("PlayerA state unavailable during pickup");
    }

    if (client.state.drops.length === 0) {
      await delay(100);
      continue;
    }

    const sortedDrops = [...client.state.drops].sort(
      (left, right) => distance(self, left) - distance(self, right)
    );
    const targetDrop = sortedDrops[0];
    const rangeToDrop = distance(self, targetDrop);

    if (rangeToDrop > PICKUP_RADIUS - 4) {
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetDrop)
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

    await delay(120);
  }

  throw new Error("Timed out before reaching a drop to pick up");
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

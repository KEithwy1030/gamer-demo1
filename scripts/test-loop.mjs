import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const SERVER_PORT = 3000;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const SERVER_DIR = fileURLToPath(new URL("../server/", import.meta.url));
const DIST_ENTRY = fileURLToPath(new URL("../server/dist/index.js", import.meta.url));

const MOVE_STEP_PER_INPUT = 28;
const EXTRACT_CENTER = { x: 2400, y: 2400 };
const ATTACK_RANGE = 58;
const PICKUP_RADIUS = 140;
const POSITION_TOLERANCE = 36;

const STEP_TIMEOUTS = {
  1: 5_000,
  2: 5_000,
  3: 5_000,
  4: 5_000,
  5: 10_000,
  6: 5_000,
  7: 5_000,
  8: 15_000,
  9: 5_000,
  10: 70_000
};

function logStepResult(step, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] 步骤${step}: ${detail}`);
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

async function ensureServerBuild() {
  const { access } = await import("node:fs/promises");

  try {
    await access(DIST_ENTRY);
    return;
  } catch {
    console.log("[info] server/dist/index.js 不存在，先执行 server 构建");
  }

  await runCommand("npm", ["run", "build"], {
    cwd: SERVER_DIR
  });
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
    process.stderr.write(`[server:err] ${String(chunk)}`);
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
  } finally {
    serverProcess.stdout.off("data", onStdout);
    serverProcess.stderr.off("data", onStderr);
    serverProcess.off("exit", onExit);
  }
}

function startServer() {
  return spawn(
    "node",
    ["--experimental-specifier-resolution=node", "dist/index.js"],
    {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
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
  return { socket, state };
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
    const value = check();
    if (value) {
      return value;
    }
    await delay(intervalMs);
  }

  throw new Error(message);
}

function getSelfPlayer(clientState) {
  const selfPlayerId = clientState.matchStarted?.selfPlayerId;
  if (!selfPlayerId) {
    return undefined;
  }

  return clientState.players.find((player) => player.id === selfPlayerId);
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

async function movePlayerTowards(client, target, stopDistance, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const self = getSelfPlayer(client.state);
    if (!self) {
      throw new Error(`${client.state.label} player state unavailable`);
    }

    const remaining = distance(self, target);
    if (remaining <= stopDistance) {
      return;
    }

    client.socket.emit("player:inputMove", {
      direction: normalizeDirection(self, target)
    });
    await delay(70);
  }

  throw new Error(`${client.state.label} failed to reach target position`);
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

    const rangeToMonster = distance(self, targetMonster);
    if (rangeToMonster > ATTACK_RANGE + 16) {
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(25);
      continue;
    }

    if (rangeToMonster > ATTACK_RANGE - 6) {
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetMonster)
      });
      await delay(60);
      continue;
    }

    if (Date.now() - lastAttackAt >= 700) {
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

    if (rangeToDrop > PICKUP_RADIUS - 8) {
      client.socket.emit("player:inputMove", {
        direction: normalizeDirection(self, targetDrop)
      });
      await delay(70);
      continue;
    }

    client.socket.emit("player:pickup", { dropId: targetDrop.id });
    return targetDrop.id;
  }

  throw new Error("Timed out before reaching a drop to pick up");
}

async function cleanup({ clients, serverProcess }) {
  for (const client of clients) {
    try {
      client.socket.disconnect();
    } catch {
      // Ignore cleanup errors.
    }
  }

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    await Promise.race([
      new Promise((resolve) => serverProcess.once("exit", resolve)),
      delay(2_000)
    ]);
  }
}

async function main() {
  const stepResults = [];
  let serverProcess;
  let ownsServerProcess = false;
  const clients = [];

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

      console.log("[info] 当前环境禁止 child_process.spawn，改为复用已运行的本地服务");
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
      playerA.socket.emit("room:create", { playerName: "PlayerA" });
      const roomState = await waitForCondition(
        () => playerA.state.roomState?.code ? playerA.state.roomState : undefined,
        STEP_TIMEOUTS[1],
        "PlayerA did not receive room:state with roomCode"
      );
      roomCode = roomState.code;
      stepResults.push(true);
      logStepResult(1, true, `PlayerA 创建房间成功，roomCode=${roomCode}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(1, false, error.message);
    }

    try {
      if (!roomCode) {
        throw new Error("缺少 roomCode，跳过 join");
      }
      playerB.socket.emit("room:join", { code: roomCode, playerName: "PlayerB" });
      await waitForCondition(
        () => {
          const players = playerA.state.roomState?.players ?? [];
          if (players.length >= 2) {
            return players;
          }
          return undefined;
        },
        STEP_TIMEOUTS[2],
        "room:state did not show both players"
      );
      stepResults.push(true);
      logStepResult(2, true, "PlayerB 加入房间成功，room:state 显示两名玩家");
    } catch (error) {
      stepResults.push(false);
      logStepResult(2, false, error.message);
    }

    try {
      playerA.socket.emit("room:start");
      await Promise.all([
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
      initialDropCount = playerA.state.drops.length;
      stepResults.push(true);
      logStepResult(3, true, "双方收到 match:started");
    } catch (error) {
      stepResults.push(false);
      logStepResult(3, false, error.message);
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
      logStepResult(4, true, `收到 state:monsters，存活怪物数=${monsters.length}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(4, false, error.message);
    }

    let killedMonster;
    try {
      killedMonster = await killOneMonster(playerA, STEP_TIMEOUTS[5]);
      stepResults.push(true);
      logStepResult(5, true, `PlayerA 成功击杀怪物 ${killedMonster.id}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(5, false, error.message);
    }

    try {
      const drops = await waitForCondition(
        () => {
          if (playerA.state.lootSpawned.length > 0) {
            return playerA.state.lootSpawned;
          }

          if (playerA.state.drops.length > initialDropCount) {
            return playerA.state.drops;
          }

          return undefined;
        },
        STEP_TIMEOUTS[6],
        "No newly spawned drops observed after monster kill"
      );
      stepResults.push(true);
      logStepResult(6, true, `收到 state:drops，掉落物数=${drops.length}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(6, false, error.message);
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
      logStepResult(7, true, `拾取 dropId=${pickedDropId} 成功，背包物品数=${itemCount}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(7, false, error.message);
    }

    try {
      const opened = await waitForCondition(
        () => playerA.state.extractOpened,
        STEP_TIMEOUTS[8],
        "extract:opened not received within 15s"
      );
      stepResults.push(true);
      logStepResult(8, true, `撤离点已开放，channelDurationMs=${opened.channelDurationMs}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(8, false, error.message);
    }

    try {
      await movePlayerTowards(playerA, EXTRACT_CENTER, POSITION_TOLERANCE, 10_000);
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
      logStepResult(9, true, `收到撤离事件 ${extractEvent.type}`);
    } catch (error) {
      stepResults.push(false);
      logStepResult(9, false, error.message);
    }

    try {
      const settlement = await waitForCondition(
        () => playerA.state.settlement,
        STEP_TIMEOUTS[10],
        "match:settlement not received within 70s"
      );
      stepResults.push(true);
      logStepResult(
        10,
        true,
        `收到结算，result=${settlement.settlement?.result ?? "unknown"} reason=${settlement.settlement?.reason ?? "n/a"}`
      );
    } catch (error) {
      stepResults.push(false);
      logStepResult(10, false, error.message);
    }

    const passed = stepResults.filter(Boolean).length;
    console.log(`汇总：通过 ${passed} 步 / 共 10 步`);
  } finally {
    await cleanup({ clients, serverProcess: ownsServerProcess ? serverProcess : undefined });
  }
}

main().catch((error) => {
  console.error(`[fatal] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});

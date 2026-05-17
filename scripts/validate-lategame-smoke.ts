import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(process.env.LATEGAME_SERVER_PORT ?? "3191", 10);
const RUN_ID = process.env.LATEGAME_RUN_ID ?? `lategame-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const ARTIFACT_DIR = resolve(".codex-artifacts", "lategame-smoke", RUN_ID);
const SERVER_DIR = resolve("server");
const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;
process.env.TEST_SERVER_PORT = String(SERVER_PORT);

let cleanup: typeof import("./test-loop.mjs").cleanup;
let createClient: typeof import("./test-loop.mjs").createClient;
let ensureServerBuild: typeof import("./test-loop.mjs").ensureServerBuild;
let getPreferredExtractZone: typeof import("./test-loop.mjs").getPreferredExtractZone;
let movePlayerAlongSafeRoute: typeof import("./test-loop.mjs").movePlayerAlongSafeRoute;
let waitForCondition: typeof import("./test-loop.mjs").waitForCondition;
let waitForServerReady: typeof import("./test-loop.mjs").waitForServerReady;
let waitForSocketConnect: typeof import("./test-loop.mjs").waitForSocketConnect;

mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  script: "validate-lategame-smoke",
  runId: RUN_ID,
  artifactDir: ARTIFACT_DIR,
  serverUrl: SERVER_URL,
  serverPort: SERVER_PORT,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  result: "fail",
  observations: [] as Array<Record<string, unknown>>
};

function note(message: string, extra: Record<string, unknown> = {}): void {
  summary.observations.push({ ts: new Date().toISOString(), message, ...extra });
}

function writeSummary(): void {
  writeFileSync(join(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function startServer() {
  return spawn("node", ["dist/index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ENABLE_TEST_HOOKS: "1",
      BOT_AI_DISABLED: "true",
      MONSTER_AI_DISABLED: "true"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

async function run() {
  ({
    cleanup,
    createClient,
    ensureServerBuild,
    getPreferredExtractZone,
    movePlayerAlongSafeRoute,
    waitForCondition,
    waitForServerReady,
    waitForSocketConnect
  } = await import("./test-loop.mjs"));

  await ensureServerBuild();
  const serverProcess = startServer();
  const clients: Array<ReturnType<typeof createClient>> = [];

  try {
    await waitForServerReady(serverProcess, 20_000);
    await delay(2_000);

    const playerA = createClient("PlayerA");
    const playerB = createClient("PlayerB");
    clients.push(playerA, playerB);

    await Promise.all([
      waitForSocketConnect(playerA.socket, "PlayerA"),
      waitForSocketConnect(playerB.socket, "PlayerB")
    ]);

    playerA.socket.emit("room:create", { playerName: "PlayerA", botDifficulty: "easy" });
    const roomState = await waitForCondition(
      () => playerA.state.roomState?.code ? playerA.state.roomState : undefined,
      10_000,
      "PlayerA did not receive room state"
    );

    playerB.socket.emit("room:join", { code: roomState.code, playerName: "PlayerB" });
    await waitForCondition(
      () => (playerA.state.roomState?.players?.length ?? 0) >= 2 ? playerA.state.roomState : undefined,
      10_000,
      "Both humans did not join the room"
    );

    playerA.socket.emit("room:start", { botDifficulty: "easy", devRoomPreset: "lategame" });
    await Promise.all([
      waitForCondition(() => playerA.state.matchStarted, 12_000, "PlayerA did not start"),
      waitForCondition(() => playerB.state.matchStarted, 12_000, "PlayerB did not start")
    ]);

    const extractZone = getPreferredExtractZone(playerA.state);
    if (!extractZone) {
      throw new Error("No extract zone available");
    }

    await movePlayerAlongSafeRoute(playerA, extractZone, extractZone.radius - 20, 10_000);
    await movePlayerAlongSafeRoute(playerB, extractZone, extractZone.radius - 20, 15_000);

    playerA.socket.emit("player:startExtract");
    const started = await waitForCondition(
      () => {
        const progress = playerA.state.extractProgress;
        return progress?.status === "started" ? progress : undefined;
      },
      10_000,
      "PlayerA did not begin extract"
    );
    note("extract started", { zoneId: started.zoneId, remainingMs: started.remainingMs });

    await delay(750);
    const progress = playerA.state.extractProgress;
    if (progress) {
      note("extract progress snapshot", { status: progress.status, remainingMs: progress.remainingMs });
    }

    const settlement = await waitForCondition(
      () => {
        const payload = playerA.state.settlement;
        return payload?.playerId === playerA.state.matchStarted?.selfPlayerId ? payload : undefined;
      },
      30_000,
      "PlayerA did not settle"
    );

    if (settlement.settlement?.result !== "success") {
      throw new Error(`Expected extracted success, got ${settlement.settlement?.result ?? "unknown"} / ${settlement.settlement?.reason ?? "n/a"}`);
    }

    summary.result = "pass";
    summary.finishedAt = new Date().toISOString();
    writeSummary();
    console.log("[lategame-smoke] PASS");
  } finally {
    await cleanup({ clients, serverProcess });
    summary.finishedAt ??= new Date().toISOString();
    writeSummary();
  }
}

run().catch((error) => {
  console.error(`[fatal] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});

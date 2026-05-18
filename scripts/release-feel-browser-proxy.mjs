import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(process.env.RELEASE_FEEL_SERVER_PORT ?? "5915", 10);
const CLIENT_PORT = Number.parseInt(process.env.RELEASE_FEEL_CLIENT_PORT ?? "6885", 10);
const DURATION_MS = Number.parseInt(process.env.RELEASE_FEEL_DURATION_MS ?? "600000", 10);
const RUN_ID = sanitizeRunId(
  process.env.RELEASE_FEEL_RUN_ID ?? `release-feel-${new Date().toISOString().replace(/[:.]/g, "-")}`
);
const ARTIFACT_DIR = resolve(".codex-artifacts", "release-feel-browser-proxy", RUN_ID);
const APP_URL = `http://${HOST}:${CLIENT_PORT}/?p0bTestHooks=1`;
const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;
const LAUNCHER_RUN_ID = `${RUN_ID}-launcher`;
const VIEWPORT = { width: 1600, height: 900 };
const MOVE_TICK_MS = 70;
const BURST_TICK_MS = 12_000;
const PHASE_1_MS = 120_000;
const PHASE_2_MS = 300_000;
const PHASE_3_MS = 480_000;
const START_RADIUS_MARGIN = 12;

mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  script: "release-feel-browser-proxy",
  runId: RUN_ID,
  artifactDir: ARTIFACT_DIR,
  appUrl: APP_URL,
  serverUrl: SERVER_URL,
  serverPort: SERVER_PORT,
  clientPort: CLIENT_PORT,
  durationMsRequested: DURATION_MS,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  result: "fail",
  playerName: `Proxy-${Date.now().toString().slice(-6)}`,
  match: {
    roomCode: null,
    selfPlayerId: null
  },
  targets: {
    starterChest: null,
    contestedChest: null,
    roamPoint: null,
    extractZone: null
  },
  checkpoints: {},
  screenshots: {},
  observations: [],
  errors: [],
  cleanup: {
    launcherPid: null,
    browserClosed: false,
    launcherExited: false,
    portsBefore: {},
    portsAfter: {},
    killedPids: []
  },
  eventsPath: join(ARTIFACT_DIR, "events.json"),
  summaryPath: join(ARTIFACT_DIR, "summary.json")
};

let launcher;
let browser;
let context;
let page;
let fatalError = null;
let latestSettlement = null;
let cleanupPromise = null;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function note(message, extra = {}) {
  summary.observations.push({ ts: new Date().toISOString(), message, ...extra });
}

function recordError(message, extra = {}) {
  summary.errors.push({ ts: new Date().toISOString(), message, ...extra });
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function appendFile(path, text) {
  writeFileSync(path, text, { encoding: "utf8", flag: "a" });
}

function getListeningPids(port) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`
    ],
    { encoding: "utf8", windowsHide: true }
  );
  const matches = String(result.stdout).match(/\b\d+\b/g) ?? [];
  return [...new Set(matches)];
}

function killPidTree(pid) {
  if (!pid) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  summary.cleanup.killedPids.push(Number(pid));
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
    } catch {
      // still starting
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startLauncher() {
  summary.cleanup.portsBefore = {
    server: getListeningPids(SERVER_PORT),
    client: getListeningPids(CLIENT_PORT)
  };
  if (summary.cleanup.portsBefore.server.length || summary.cleanup.portsBefore.client.length) {
    throw new Error(
      `target ports already in use server=${summary.cleanup.portsBefore.server.join(",") || "-"} client=${summary.cleanup.portsBefore.client.join(",") || "-"}`
    );
  }

  launcher = spawn(process.execPath, ["scripts/dev-acceptance-launcher.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT),
      DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT),
      DEV_ACCEPT_RUN_ID: LAUNCHER_RUN_ID
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  summary.cleanup.launcherPid = launcher.pid ?? null;
  launcher.stdout?.on("data", (chunk) => appendFile(join(ARTIFACT_DIR, "launcher.stdout.log"), String(chunk)));
  launcher.stderr?.on("data", (chunk) => appendFile(join(ARTIFACT_DIR, "launcher.stderr.log"), String(chunk)));
}

async function installSocketRecorder(targetPage) {
  await targetPage.addInitScript(() => {
    window.__RELEASE_FEEL_EVENTS__ = [];

    const pushEvent = (direction, raw) => {
      const entry = {
        ts: Date.now(),
        direction,
        raw: typeof raw === "string" ? raw : String(raw),
        name: null,
        payload: null
      };
      try {
        if (typeof raw === "string" && raw.startsWith("42")) {
          const parsed = JSON.parse(raw.slice(2));
          if (Array.isArray(parsed) && typeof parsed[0] === "string") {
            entry.name = parsed[0];
            entry.payload = parsed[1] ?? null;
          }
        }
      } catch (error) {
        entry.parseError = String(error);
      }
      window.__RELEASE_FEEL_EVENTS__.push(entry);
    };

    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class ReleaseFeelRecorderWebSocket extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (event) => pushEvent("in", event.data));
      }
      send(data) {
        pushEvent("out", data);
        return super.send(data);
      }
    };
  });
}

async function collectEvents() {
  return await page.evaluate(() => window.__RELEASE_FEEL_EVENTS__ ?? []);
}

async function waitForEvent(name, timeoutMs = 20_000, afterTs = 0) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await collectEvents();
    const match = events.find((entry) => entry.name === name && entry.ts >= afterTs);
    if (match) return match;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${name}`);
}

async function screenshot(name) {
  const path = join(ARTIFACT_DIR, name);
  await page.screenshot({ path, fullPage: true });
  summary.screenshots[name.replace(/\.png$/, "")] = path;
  return path;
}

async function focusGameCanvas() {
  const canvas = page.locator("canvas:not(.lobby-background)").first();
  await canvas.waitFor({ state: "visible", timeout: 20_000 });
  await canvas.click({ position: { x: 24, y: 24 }, force: true, timeout: 10_000 });
  await sleep(100);
}

async function getHooksSnapshot() {
  return await page.evaluate(() => {
    const hooks = window.__P0B_TEST_HOOKS__;
    if (!hooks || typeof hooks.getSnapshot !== "function") return null;
    return hooks.getSnapshot();
  });
}

async function callMoveInput(direction) {
  await page.evaluate((nextDirection) => {
    const hooks = window.__P0B_TEST_HOOKS__;
    if (!hooks || typeof hooks.sendMoveInput !== "function") {
      throw new Error("window.__P0B_TEST_HOOKS__.sendMoveInput is unavailable");
    }
    hooks.sendMoveInput(nextDirection);
  }, direction);
}

async function callStartExtract() {
  await page.evaluate(() => {
    const hooks = window.__P0B_TEST_HOOKS__;
    if (!hooks || typeof hooks.startExtract !== "function") {
      throw new Error("window.__P0B_TEST_HOOKS__.startExtract is unavailable");
    }
    hooks.startExtract();
  });
}

function getSelf(snapshot) {
  if (!snapshot?.selfPlayerId || !Array.isArray(snapshot?.matchSnapshot?.players)) return null;
  return snapshot.matchSnapshot.players.find((player) => player.id === snapshot.selfPlayerId) ?? null;
}

function resolveTargets(snapshot) {
  const self = getSelf(snapshot);
  const layout = snapshot?.matchSnapshot?.layout ?? null;
  if (!layout) return null;

  const starterChest =
    layout.chestZones?.find((zone) => zone.lane === "starter" && zone.squadId === self?.squadId)
    ?? layout.chestZones?.find((zone) => zone.lane === "starter")
    ?? null;
  const contestedChest =
    layout.chestZones?.find((zone) => zone.lane === "contested")
    ?? null;
  const extractZone = layout.extractZones?.[0] ?? null;
  const roamPoint = contestedChest && extractZone
    ? {
        x: Math.round((contestedChest.x + extractZone.x) / 2),
        y: Math.round((contestedChest.y + extractZone.y) / 2)
      }
    : extractZone
      ? { x: extractZone.x, y: extractZone.y }
      : contestedChest
        ? { x: contestedChest.x, y: contestedChest.y }
        : null;

  summary.targets = { starterChest, contestedChest, roamPoint, extractZone };
  if (self) {
    summary.match.selfPlayerId = self.id;
  }
  return { self, starterChest, contestedChest, roamPoint, extractZone };
}

function distance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeDirection(from, to) {
  if (!from || !to) return { x: 0, y: 0 };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.001) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}

async function getCanvasBox() {
  return await page.locator("canvas:not(.lobby-background)").first().boundingBox();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function clickWorldTarget(target, self) {
  const box = await getCanvasBox();
  if (!box) return;
  const zoom = 0.96;
  const screenX = box.x + box.width / 2 + ((target?.x ?? self?.x ?? 0) - (self?.x ?? 0)) * zoom;
  const screenY = box.y + box.height / 2 + ((target?.y ?? self?.y ?? 0) - (self?.y ?? 0)) * zoom;
  await page.mouse.click(
    clamp(screenX, box.x + 8, box.x + box.width - 8),
    clamp(screenY, box.y + 8, box.y + box.height - 8)
  );
}

async function actionBurst(target, self) {
  await focusGameCanvas();
  await clickWorldTarget(target, self);
  for (const key of ["e", "f", "q", "r", "t", "Space"]) {
    await page.keyboard.press(key);
    await sleep(90);
  }
}

function getExtractStartRadius(zoneRadius) {
  const inset = Math.min(16, Math.max(10, zoneRadius * 0.15));
  return Math.max(24, zoneRadius - inset);
}

function pointInRect(point, rect) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function pointInRiverHazard(matchSnapshot, point) {
  return (matchSnapshot?.layout?.riverHazards ?? []).some((hazard) => pointInRect(point, hazard))
    && !(matchSnapshot?.layout?.safeCrossings ?? []).some((crossing) => pointInRect(point, crossing));
}

function getBridgeAwareWaypoints(matchSnapshot, from, to) {
  const hazards = matchSnapshot?.layout?.riverHazards ?? [];
  const safeCrossings = matchSnapshot?.layout?.safeCrossings ?? [];
  if (!from || !to || hazards.length === 0 || safeCrossings.length === 0) {
    return [to];
  }

  const crossesHazard = hazards.some((hazard) => segmentIntersectsRect(from, to, hazard, 110));
  if (!pointInRiverHazard(matchSnapshot, from) && !pointInRiverHazard(matchSnapshot, to) && !crossesHazard) {
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

function segmentIntersectsRect(start, end, rect, padding = 0) {
  const expanded = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };

  if (pointInRect(start, expanded) || pointInRect(end, expanded)) {
    return true;
  }

  const minX = expanded.x;
  const maxX = expanded.x + expanded.width;
  const minY = expanded.y;
  const maxY = expanded.y + expanded.height;
  return segmentIntersectsSegment(start, end, { x: minX, y: minY }, { x: maxX, y: minY })
    || segmentIntersectsSegment(start, end, { x: maxX, y: minY }, { x: maxX, y: maxY })
    || segmentIntersectsSegment(start, end, { x: maxX, y: maxY }, { x: minX, y: maxY })
    || segmentIntersectsSegment(start, end, { x: minX, y: maxY }, { x: minX, y: minY });
}

function segmentIntersectsSegment(a1, a2, b1, b2) {
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

async function moveToward(snapshot, target, self) {
  if (!target || !self) {
    await callMoveInput({ x: 0, y: 0 });
    return;
  }

  const waypoints = getBridgeAwareWaypoints(snapshot?.matchSnapshot ?? null, self, target);
  const waypoint = waypoints.find((point) => distance(self, point) > 72) ?? target;
  await callMoveInput(normalizeDirection(self, waypoint));
}

async function runPhase(name, durationMs, targetSelector, options = {}) {
  const {
    allowExtractStart = false,
    burstIntervalMs = BURST_TICK_MS,
    arrivalRadius = 120
  } = options;

  const phaseStartedAt = Date.now();
  let nextMoveAt = 0;
  let nextBurstAt = phaseStartedAt;
  let extractTriggered = false;

  while (Date.now() - phaseStartedAt < durationMs) {
    const snapshot = await getHooksSnapshot();
    const resolved = resolveTargets(snapshot);
    const self = resolved?.self ?? null;
    const target = targetSelector(resolved) ?? null;

    if (Date.now() >= nextMoveAt) {
      if (target && self && distance(self, target) > arrivalRadius) {
        await moveToward(snapshot, target, self);
      } else {
        await callMoveInput({ x: 0, y: 0 });
      }
      nextMoveAt = Date.now() + MOVE_TICK_MS;
    }

    if (Date.now() >= nextBurstAt) {
      await actionBurst(target ?? self, self);
      nextBurstAt = Date.now() + burstIntervalMs;
    }

    if (allowExtractStart && !extractTriggered && resolved?.extractZone && self) {
      const startRadius = getExtractStartRadius(resolved.extractZone.radius);
      if (distance(self, resolved.extractZone) <= startRadius - START_RADIUS_MARGIN) {
        await callStartExtract();
        extractTriggered = true;
        summary.checkpoints.extractStartedAt = new Date().toISOString();
        note("triggered extract start");
      }
    }

    latestSettlement = await page.evaluate(() => {
      const events = window.__RELEASE_FEEL_EVENTS__ ?? [];
      return [...events].reverse().find((entry) => entry.name === "match:settlement")?.payload ?? null;
    });
    if (latestSettlement?.settlement?.result) {
      summary.checkpoints.settlementReachedAt = new Date().toISOString();
      return;
    }

    await sleep(250);
  }
}

async function createAndStartMatch() {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill(summary.playerName);

  await page.locator("button.btn-primary").first().click();
  const roomState = await Promise.all([
    waitForEvent("room:state", 12_000),
    page.locator("button.code-go").first().click()
  ]).then(([entry]) => entry);
  summary.match.roomCode = roomState.payload?.code ?? null;
  summary.checkpoints.roomCreatedAt = new Date(roomState.ts).toISOString();

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  const matchStarted = await Promise.all([
    waitForEvent("match:started", 20_000, roomState.ts),
    page.locator("button.btn-primary").first().click()
  ]).then(([entry]) => entry);
  summary.checkpoints.matchStartedAt = new Date(matchStarted.ts).toISOString();

  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20_000 });
  await focusGameCanvas();
  summary.screenshots["00"] = await screenshot("00.png");

  return matchStarted;
}

async function runProxyLoop() {
  const startedAt = Date.now();
  const phase1Ms = Math.min(PHASE_1_MS, DURATION_MS);
  const phase2Ms = Math.min(Math.max(DURATION_MS - phase1Ms, 0), PHASE_2_MS - PHASE_1_MS);
  const phase3Ms = Math.min(Math.max(DURATION_MS - phase1Ms - phase2Ms, 0), PHASE_3_MS - PHASE_2_MS);
  const phase4Ms = Math.max(DURATION_MS - phase1Ms - phase2Ms - phase3Ms, 0);

  await runPhase("starter", phase1Ms, (resolved) => resolved?.starterChest, {
    burstIntervalMs: BURST_TICK_MS,
    arrivalRadius: 110
  });
  summary.screenshots["02"] = await screenshot("02.png");
  summary.checkpoints.phase1CompleteAt = new Date().toISOString();

  await runPhase("contested", phase2Ms, (resolved) => resolved?.contestedChest ?? resolved?.roamPoint, {
    burstIntervalMs: BURST_TICK_MS,
    arrivalRadius: 120
  });
  summary.screenshots["05"] = await screenshot("05.png");
  summary.checkpoints.phase2CompleteAt = new Date().toISOString();

  await runPhase("roam", phase3Ms, (resolved) => resolved?.roamPoint ?? resolved?.contestedChest, {
    burstIntervalMs: BURST_TICK_MS,
    arrivalRadius: 140
  });
  summary.screenshots["08"] = await screenshot("08.png");
  summary.checkpoints.phase3CompleteAt = new Date().toISOString();

  if (phase4Ms > 0) {
    await runPhase("extract", phase4Ms, (resolved) => resolved?.extractZone, {
      allowExtractStart: true,
      burstIntervalMs: 8_000,
      arrivalRadius: 140
    });
    summary.checkpoints.startedExtractPhase = true;
  }
}

async function cleanup() {
  if (cleanupPromise) {
    return cleanupPromise;
  }

  cleanupPromise = (async () => {
    try {
      if (page && !page.isClosed()) {
        await page.close({ runBeforeUnload: false }).catch(() => {});
      }
      if (context) {
        await context.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
        summary.cleanup.browserClosed = true;
      }
    } catch (error) {
      recordError("browser cleanup failed", { detail: String(error) });
    }

    if (launcher?.pid) {
      killPidTree(launcher.pid);
    }
    await sleep(1500);

    summary.cleanup.portsAfter = {
      server: getListeningPids(SERVER_PORT),
      client: getListeningPids(CLIENT_PORT)
    };
    summary.cleanup.launcherExited = launcher ? launcher.exitCode !== null || launcher.killed : true;
  })();

  return cleanupPromise;
}

async function shutdownOnSignal(signal) {
  recordError(`received ${signal}, starting cleanup`);
  try {
    await cleanup();
  } finally {
    process.exit(signal === "SIGINT" ? 130 : 143);
  }
}

process.on("SIGINT", () => {
  void shutdownOnSignal("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdownOnSignal("SIGTERM");
});
process.on("uncaughtException", (error) => {
  fatalError = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
  void (async () => {
    try {
      await cleanup();
    } finally {
      process.exit(1);
    }
  })();
});
process.on("unhandledRejection", (reason) => {
  fatalError = {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  };
  void (async () => {
    try {
      await cleanup();
    } finally {
      process.exit(1);
    }
  })();
});

async function main() {
  try {
    startLauncher();
    await waitForHttp(`${SERVER_URL}/health`, 30_000).catch(async () => {
      await waitForHttp(SERVER_URL, 30_000);
    });
    await waitForHttp(APP_URL, 30_000);

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: VIEWPORT });
    page = await context.newPage();
    page.on("console", (msg) => appendFile(join(ARTIFACT_DIR, "browser-console.log"), `[${new Date().toISOString()}] [${msg.type()}] ${msg.text()}\n`));
    page.on("pageerror", (error) => appendFile(join(ARTIFACT_DIR, "page-errors.log"), `[${new Date().toISOString()}] ${String(error)}\n`));

    await installSocketRecorder(page);
    await createAndStartMatch();

    const initialSnapshot = await getHooksSnapshot();
    const resolved = resolveTargets(initialSnapshot);
    note("resolved initial targets", {
      starterChest: resolved?.starterChest ?? null,
      contestedChest: resolved?.contestedChest ?? null,
      extractZone: resolved?.extractZone ?? null
    });

    await runProxyLoop();
    await screenshot("end.png");
    summary.settlement = latestSettlement;
    summary.result = latestSettlement?.settlement?.result === "success" ? "pass" : "fail";
  } catch (error) {
    summary.result = "fail";
    fatalError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
  } finally {
    let events = [];
    try {
      if (page && !page.isClosed()) {
        events = await collectEvents();
      }
    } catch (error) {
      recordError("failed to collect websocket events", { detail: String(error) });
    }

    try {
      writeJson(summary.eventsPath, events);
    } catch (error) {
      recordError("failed to write events.json", { detail: String(error) });
    }

    if (fatalError) {
      recordError(fatalError.message, { stack: fatalError.stack });
      if (summary.result === "fail") {
        summary.checkpoints.failure = new Date().toISOString();
      }
    }

    if (latestSettlement) {
      summary.settlement = latestSettlement;
    }

    await cleanup();
    summary.finishedAt = new Date().toISOString();
    try {
      writeJson(summary.summaryPath, summary);
    } catch (error) {
      console.error(`[FAIL] failed to write summary.json: ${String(error)}`);
    }

    const label = summary.result === "pass" ? "PASS" : "FAIL";
    console.log(`${label} artifactDir=${ARTIFACT_DIR}`);
    console.log(`summary.json=${summary.summaryPath}`);
    process.exitCode = summary.result === "pass" ? 0 : 1;
  }
}

function sanitizeRunId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

await main();

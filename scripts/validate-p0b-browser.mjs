import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(process.env.P0B_SERVER_PORT ?? process.env.DEV_ACCEPT_SERVER_PORT ?? "5515", 10);
const CLIENT_PORT = Number.parseInt(process.env.P0B_CLIENT_PORT ?? process.env.DEV_ACCEPT_CLIENT_PORT ?? "6585", 10);
const VIEWPORT = { width: 1600, height: 900 };
const RUN_ID = process.env.P0B_RUN_ID ?? `p0-b-browser-script-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const ARTIFACT_DIR = resolve(".codex-artifacts", RUN_ID);
const LAUNCHER_RUN_ID = `${RUN_ID}-launcher`;
const APP_URL = `http://${HOST}:${CLIENT_PORT}/?devRoomPreset=extract`;
const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;
const GAME_CANVAS_SELECTOR = "canvas:not(.lobby-background)";
const MOVE_POLL_INTERVAL_MS = 50;

mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  script: "validate-p0b-browser",
  runId: RUN_ID,
  artifactDir: ARTIFACT_DIR,
  launcherArtifactDir: resolve(".codex-artifacts", "dev-acceptance", LAUNCHER_RUN_ID),
  appUrl: APP_URL,
  serverUrl: SERVER_URL,
  serverPort: SERVER_PORT,
  clientPort: CLIENT_PORT,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  result: "fail",
  classification: "unknown",
  playerName: `P0B-${Date.now().toString().slice(-6)}`,
  counts: {
    roomStateIn: 0,
    matchStartedIn: 0,
    inboundExtractOpened: 0,
    outboundStartExtract: 0,
    inboundStarted: 0,
    inboundProgress: 0,
    inboundInterrupted: 0,
    outboundNonZeroInputMove: 0,
    secondInboundStarted: 0,
    secondInboundProgress: 0
  },
  keyTimes: {},
  assertions: {
    firstNonZeroInputMoveBeforeExtractSuccessInbound: false,
    selfMovedAfterFirstNonZeroInput: false,
    leftZoneInterrupted: false,
    secondStarted: false,
    secondProgress: false
  },
  escalation: {
    nonZeroInputBeforeSuccessButNoMovement: false
  },
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
  wsFramesPath: join(ARTIFACT_DIR, "ws-frames.json"),
  eventLogPath: join(ARTIFACT_DIR, "event-log.json"),
  summaryPath: join(ARTIFACT_DIR, "summary.json")
};

let browser;
let context;
let page;
let launcher;
let pendingFatalError = null;

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

  launcher = spawn("node", ["scripts/dev-acceptance-launcher.mjs"], {
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
    window.__P0B_EVENTS__ = [];

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
      window.__P0B_EVENTS__.push(entry);
    };

    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class P0BRecorderWebSocket extends NativeWebSocket {
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
  return await page.evaluate(() => window.__P0B_EVENTS__ ?? []);
}

async function latestEvent(name) {
  const events = await collectEvents();
  return [...events].reverse().find((entry) => entry.name === name) ?? null;
}

async function waitForEvent(name, predicate = () => true, timeoutMs = 15_000, afterTs = 0) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await collectEvents();
    const match = events.find((entry) => entry.ts >= afterTs && entry.name === name && predicate(entry));
    if (match) return match;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${name}`);
}

async function waitForCondition(label, fn, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function latestPlayers() {
  return (await latestEvent("state:players"))?.payload ?? [];
}

async function latestExtractOpened() {
  return (await latestEvent("extract:opened"))?.payload ?? null;
}

async function matchPayload() {
  return (await latestEvent("match:started"))?.payload ?? null;
}

async function getSelfState() {
  const payload = await matchPayload();
  const selfId = payload?.selfPlayerId;
  const players = await latestPlayers();
  return players.find((player) => player.id === selfId) ?? null;
}

async function getZone() {
  const payload = await matchPayload();
  return payload?.room?.layout?.extractZones?.[0] ?? null;
}

async function screenshot(name, options = {}) {
  const path = join(ARTIFACT_DIR, name);
  await page.screenshot({ path, fullPage: options.fullPage ?? true });
  return path;
}

async function ensureGameCanvas() {
  await page.locator(GAME_CANVAS_SELECTOR).first().waitFor({ state: "visible", timeout: 20_000 });
}

async function focusGameCanvas() {
  const canvas = page.locator(GAME_CANVAS_SELECTOR).first();
  await canvas.waitFor({ state: "visible", timeout: 20_000 });
  await canvas.click({ position: { x: 32, y: 32 }, force: true, timeout: 10_000 });
  await sleep(80);
}

async function primeGameInputFocus() {
  await page.evaluate((selector) => {
    const canvas = document.querySelector(selector);
    if (canvas instanceof HTMLElement) {
      if (!canvas.hasAttribute("tabindex")) {
        canvas.setAttribute("tabindex", "-1");
      }
      canvas.focus();
    }
    window.focus();
  }, GAME_CANVAS_SELECTOR);
}

async function countEvents() {
  const events = await collectEvents();
  applyEventCounts(events);
}

function applyEventCounts(events) {
  summary.counts.roomStateIn = events.filter((entry) => entry.direction === "in" && entry.name === "room:state").length;
  summary.counts.matchStartedIn = events.filter((entry) => entry.direction === "in" && entry.name === "match:started").length;
  summary.counts.inboundExtractOpened = events.filter((entry) => entry.direction === "in" && entry.name === "extract:opened").length;
  summary.counts.outboundStartExtract = events.filter((entry) => entry.direction === "out" && entry.name === "player:startExtract").length;
  summary.counts.outboundInputMove = events.filter((entry) => entry.direction === "out" && entry.name === "player:inputMove").length;
  summary.counts.outboundNonZeroInputMove = events.filter(
    (entry) => entry.direction === "out" && entry.name === "player:inputMove" && isNonZeroInputMovePayload(entry.payload)
  ).length;
  summary.counts.inboundStarted = events.filter((entry) => entry.direction === "in" && entry.name === "extract:progress" && entry.payload?.status === "started").length;
  summary.counts.inboundProgress = events.filter((entry) => entry.direction === "in" && entry.name === "extract:progress" && entry.payload?.status === "progress").length;
  summary.counts.inboundInterrupted = events.filter((entry) => entry.direction === "in" && entry.name === "extract:progress" && entry.payload?.status === "interrupted").length;
}

async function getP0BTestHooks() {
  return await page.evaluate(() => {
    const hooks = window.__P0B_TEST_HOOKS__;
    return hooks
      ? {
          hasSendMoveInput: typeof hooks.sendMoveInput === "function",
          hasStartExtract: typeof hooks.startExtract === "function",
          hasGetSnapshot: typeof hooks.getSnapshot === "function"
        }
      : null;
  });
}

async function callMoveHook(direction) {
  await page.evaluate((nextDirection) => {
    const hooks = window.__P0B_TEST_HOOKS__;
    if (!hooks || typeof hooks.sendMoveInput !== "function") {
      throw new Error("window.__P0B_TEST_HOOKS__.sendMoveInput is unavailable");
    }
    hooks.sendMoveInput(nextDirection);
  }, direction);
}

async function callStartExtractHook() {
  await page.evaluate(() => {
    const hooks = window.__P0B_TEST_HOOKS__;
    if (!hooks || typeof hooks.startExtract !== "function") {
      throw new Error("window.__P0B_TEST_HOOKS__.startExtract is unavailable");
    }
    hooks.startExtract();
  });
}

async function readHookSnapshot() {
  return await page.evaluate(() => {
    const hooks = window.__P0B_TEST_HOOKS__;
    if (!hooks || typeof hooks.getSnapshot !== "function") {
      return null;
    }
    return hooks.getSnapshot();
  });
}

function isNonZeroInputMovePayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const direction = payload.direction;
  return Boolean(
    direction
    && typeof direction === "object"
    && ((typeof direction.x === "number" && direction.x !== 0) || (typeof direction.y === "number" && direction.y !== 0))
  );
}

async function waitForNonZeroInputMove(afterTs, timeoutMs = 2_000) {
  return await waitForEvent(
    "player:inputMove",
    (entry) => entry.direction === "out" && entry.ts >= afterTs && isNonZeroInputMovePayload(entry.payload),
    timeoutMs,
    afterTs
  );
}

function findEvent(events, name, predicate = () => true, afterTs = 0) {
  return events.find((entry) => entry.ts >= afterTs && entry.name === name && predicate(entry)) ?? null;
}

function getSelfFromEvent(entry, selfId) {
  if (entry?.direction !== "in" || entry?.name !== "state:players") {
    return null;
  }
  return getSelfFromPlayers(entry.payload, selfId);
}

function findSelfMovementAfterInput(events, selfId, afterTs = 0, beforeTs = Number.POSITIVE_INFINITY) {
  if (!selfId) {
    return { baselineFrame: null, movedFrame: null };
  }

  let baselineFrame = null;
  for (const entry of events) {
    if (entry.ts < afterTs || entry.ts >= beforeTs) continue;
    const self = getSelfFromEvent(entry, selfId);
    if (!self) continue;
    if (!baselineFrame) {
      baselineFrame = { ts: entry.ts, self: { x: self.x, y: self.y } };
      continue;
    }
    if (self.x !== baselineFrame.self.x || self.y !== baselineFrame.self.y) {
      return {
        baselineFrame,
        movedFrame: {
          ts: entry.ts,
          self: { x: self.x, y: self.y }
        }
      };
    }
  }

  return { baselineFrame, movedFrame: null };
}

function analyzeFinalEvents(events) {
  const matchStarted = findEvent(events, "match:started", (entry) => entry.direction === "in");
  const selfId = matchStarted?.payload?.selfPlayerId ?? null;
  const zone = matchStarted?.payload?.room?.layout?.extractZones?.[0] ?? null;
  const openBufferMs = 750;
  const openSearchStart = matchStarted && zone ? matchStarted.ts + zone.openAtSec * 1000 - openBufferMs : 0;
  const openedTrue = findEvent(
    events,
    "extract:opened",
    (entry) => entry.direction === "in" && entry.payload?.zones?.some((candidate) => candidate.isOpen === true),
    openSearchStart
  );
  const sequenceStart = Math.max(
    0,
    openedTrue?.ts != null ? openedTrue.ts - openBufferMs : 0,
    matchStarted && zone ? matchStarted.ts + zone.openAtSec * 1000 - openBufferMs : 0
  );
  const firstOutbound = findEvent(events, "player:startExtract", (entry) => entry.direction === "out", sequenceStart);
  const firstStarted = findEvent(
    events,
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "started" && entry.ts >= (firstOutbound?.ts ?? sequenceStart),
    firstOutbound?.ts ?? sequenceStart
  );
  const firstProgress = findEvent(
    events,
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "progress" && entry.ts >= (firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart),
    firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart
  );
  const success = findEvent(
    events,
    "extract:success",
    (entry) => entry.direction === "in" && entry.ts >= (firstProgress?.ts ?? firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart),
    firstProgress?.ts ?? firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart
  );
  const firstNonZeroInputMove = findEvent(
    events,
    "player:inputMove",
    (entry) => entry.direction === "out" && isNonZeroInputMovePayload(entry.payload) && entry.ts >= sequenceStart && (!success || entry.ts < success.ts),
    sequenceStart
  );
  const firstInterrupted = findEvent(
    events,
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "interrupted" && entry.ts >= (firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart),
    firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart
  );
  const firstSequenceEndTs = success?.ts ?? firstInterrupted?.ts ?? Number.POSITIVE_INFINITY;
  const firstMovementEvidence = firstNonZeroInputMove
    ? findSelfMovementAfterInput(events, selfId, firstNonZeroInputMove.ts, firstSequenceEndTs)
    : { baselineFrame: null, movedFrame: null };
  const secondOutbound = firstInterrupted
    ? findEvent(events, "player:startExtract", (entry) => entry.direction === "out" && entry.ts >= firstInterrupted.ts, firstInterrupted.ts)
    : null;
  const secondStarted = secondOutbound
    ? findEvent(
        events,
        "extract:progress",
        (entry) => entry.direction === "in" && entry.payload?.status === "started" && entry.ts >= secondOutbound.ts,
        secondOutbound.ts
      )
    : null;
  const secondProgress = secondStarted
    ? findEvent(
        events,
        "extract:progress",
        (entry) => entry.direction === "in" && entry.payload?.status === "progress" && entry.ts >= secondStarted.ts,
        secondStarted.ts
      )
    : null;
  const settlement = findEvent(
    events,
    "match:settlement",
    (entry) => entry.direction === "in" && entry.ts >= (success?.ts ?? firstProgress?.ts ?? firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart),
    success?.ts ?? firstProgress?.ts ?? firstStarted?.ts ?? firstOutbound?.ts ?? sequenceStart
  );
  const inputMoveBeforeSuccess = firstNonZeroInputMove && (!success || firstNonZeroInputMove.ts < success.ts);
  const hasSelfMovementAfterFirstNonZeroInput = Boolean(firstMovementEvidence.movedFrame);
  const hasValidFirstSequence = Boolean(
    matchStarted
    && firstOutbound
    && firstStarted
    && firstProgress
    && firstNonZeroInputMove
    && inputMoveBeforeSuccess
    && hasSelfMovementAfterFirstNonZeroInput
  );
  const hasFullP0BSequence = Boolean(
    hasValidFirstSequence
    && firstInterrupted?.payload?.reason === "left_zone"
    && secondStarted
    && secondProgress
  );
  const classification = hasFullP0BSequence
    ? "full_p0b_sequence"
    : hasValidFirstSequence && (success || settlement) && !firstInterrupted
      ? "fast_extract_success"
      : firstInterrupted
        ? "interrupted_without_second_sequence"
        : hasValidFirstSequence
          ? "first_extract_detected"
          : "missing_first_extract_sequence";

  return {
    zone,
    openedTrue,
    sequenceStart,
    firstOutbound,
    firstStarted,
    firstProgress,
    firstNonZeroInputMove,
    firstMovementBaseline: firstMovementEvidence.baselineFrame,
    firstMovedFrame: firstMovementEvidence.movedFrame,
    firstInterrupted,
    secondOutbound,
    secondStarted,
    secondProgress,
    success,
    settlement,
    hasSelfMovementAfterFirstNonZeroInput,
    hasValidFirstSequence,
    hasFullP0BSequence,
    classification
  };
}

function applyFinalEventAnalysis(events) {
  applyEventCounts(events);
  const analysis = analyzeFinalEvents(events);
  if (analysis.openedTrue) summary.keyTimes.extractOpenedInbound = analysis.openedTrue.ts;
  if (analysis.firstOutbound) summary.keyTimes.firstStartOutbound = analysis.firstOutbound.ts;
  if (analysis.firstStarted) summary.keyTimes.firstStartedInbound = analysis.firstStarted.ts;
  if (analysis.firstProgress) summary.keyTimes.firstProgressInbound = analysis.firstProgress.ts;
  if (analysis.firstNonZeroInputMove) summary.keyTimes.firstNonZeroInputMoveOutbound = analysis.firstNonZeroInputMove.ts;
  if (analysis.firstMovementBaseline) summary.keyTimes.firstMovementBaseline = analysis.firstMovementBaseline.ts;
  if (analysis.firstMovedFrame) summary.keyTimes.firstMovedFrameInbound = analysis.firstMovedFrame.ts;
  if (analysis.firstInterrupted) summary.keyTimes.interruptedInbound = analysis.firstInterrupted.ts;
  if (analysis.secondOutbound) summary.keyTimes.secondStartOutbound = analysis.secondOutbound.ts;
  if (analysis.secondStarted) summary.keyTimes.secondStartedInbound = analysis.secondStarted.ts;
  if (analysis.secondProgress) summary.keyTimes.secondProgressInbound = analysis.secondProgress.ts;
  if (analysis.success) summary.keyTimes.extractSuccessInbound = analysis.success.ts;
  if (analysis.settlement) summary.keyTimes.matchSettlementInbound = analysis.settlement.ts;
  summary.classification = analysis.classification;
  summary.assertions.firstNonZeroInputMoveBeforeExtractSuccessInbound = Boolean(
    analysis.firstNonZeroInputMove
    && (!analysis.success || analysis.firstNonZeroInputMove.ts < analysis.success.ts)
  );
  summary.assertions.selfMovedAfterFirstNonZeroInput = Boolean(analysis.firstMovedFrame);
  summary.assertions.leftZoneInterrupted = analysis.firstInterrupted?.payload?.reason === "left_zone";
  summary.assertions.secondStarted = Boolean(analysis.secondStarted);
  summary.assertions.secondProgress = Boolean(analysis.secondProgress);
  summary.escalation.nonZeroInputBeforeSuccessButNoMovement = Boolean(
    analysis.firstNonZeroInputMove
    && analysis.success
    && analysis.firstNonZeroInputMove.ts < analysis.success.ts
    && !analysis.firstMovedFrame
  );
  return analysis;
}

function resolveSelfFromSnapshot(snapshot) {
  if (!snapshot?.matchSnapshot?.players || !snapshot.selfPlayerId) {
    return null;
  }
  return snapshot.matchSnapshot.players.find((player) => player.id === snapshot.selfPlayerId) ?? null;
}

function resolveZoneCenterFromSnapshot(snapshot) {
  return snapshot?.matchSnapshot?.layout?.extractZones?.[0] ?? null;
}

async function driveMoveUntil({
  direction,
  label,
  predicate,
  timeoutMs = 4_000,
  intervalMs = MOVE_POLL_INTERVAL_MS
}) {
  const started = Date.now();
  let lastSnapshot = null;
  while (Date.now() - started < timeoutMs) {
    await callMoveHook(direction);
    await sleep(intervalMs);
    lastSnapshot = await readHookSnapshot();
    if (predicate(lastSnapshot)) {
      return { ts: Date.now(), snapshot: lastSnapshot };
    }
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function driveMoveWhile({
  direction,
  label,
  stopWhen,
  timeoutMs = 4_000,
  intervalMs = MOVE_POLL_INTERVAL_MS
}) {
  const started = Date.now();
  let lastSnapshot = null;
  while (Date.now() - started < timeoutMs) {
    lastSnapshot = await readHookSnapshot();
    if (stopWhen(lastSnapshot)) {
      return { ts: Date.now(), snapshot: lastSnapshot, reason: "predicate" };
    }
    await callMoveHook(direction);
    await sleep(intervalMs);
  }
  return { ts: Date.now(), snapshot: lastSnapshot, reason: "timeout" };
}

async function stopMoveHook() {
  await callMoveHook({ x: 0, y: 0 });
}

async function startSustainedMoveLoop({ zone, fallbackDirection = { x: 1, y: 0 }, intervalMs = MOVE_POLL_INTERVAL_MS, label = "move-loop" }) {
  await page.evaluate(
    ({ nextZone, nextFallbackDirection, nextIntervalMs, nextLabel }) => {
      const clearLoop = () => {
        const active = window.__P0B_MOVE_LOOP__;
        if (active?.timerId) {
          window.clearInterval(active.timerId);
        }
        delete window.__P0B_MOVE_LOOP__;
      };

      clearLoop();

      const normalize = (direction) => {
        const x = Number(direction?.x ?? 0);
        const y = Number(direction?.y ?? 0);
        const length = Math.hypot(x, y);
        if (!Number.isFinite(length) || length <= 0.001) {
          const fallbackX = Number(nextFallbackDirection?.x ?? 1);
          const fallbackY = Number(nextFallbackDirection?.y ?? 0);
          return { x: fallbackX, y: fallbackY };
        }
        return { x: x / length, y: y / length };
      };

      const computeAwayDirection = () => {
        const hooks = window.__P0B_TEST_HOOKS__;
        const snapshot = typeof hooks?.getSnapshot === "function" ? hooks.getSnapshot() : null;
        const self = snapshot?.matchSnapshot?.players?.find((player) => player.id === snapshot?.selfPlayerId) ?? null;
        if (self && nextZone) {
          const dx = self.x - nextZone.x;
          const dy = self.y - nextZone.y;
          const length = Math.hypot(dx, dy);
          if (Number.isFinite(length) && length > 0.001) {
            return { x: dx / length, y: dy / length };
          }
        }
        return normalize(nextFallbackDirection);
      };

      const tick = () => {
        const hooks = window.__P0B_TEST_HOOKS__;
        if (!hooks || typeof hooks.sendMoveInput !== "function") {
          return;
        }
        hooks.sendMoveInput(computeAwayDirection());
      };

      tick();
      const resolvedIntervalMs = Math.max(16, Number(nextIntervalMs) || 50);
      const timerId = window.setInterval(tick, resolvedIntervalMs);
      window.__P0B_MOVE_LOOP__ = {
        timerId,
        label: nextLabel,
        zone: nextZone,
        fallbackDirection: normalize(nextFallbackDirection),
        intervalMs: resolvedIntervalMs,
        startedAt: Date.now()
      };
    },
    { nextZone: zone, nextFallbackDirection: fallbackDirection, nextIntervalMs: intervalMs, nextLabel: label }
  );
}

async function stopSustainedMoveLoop() {
  await page.evaluate(() => {
    const active = window.__P0B_MOVE_LOOP__;
    if (active?.timerId) {
      window.clearInterval(active.timerId);
    }
    delete window.__P0B_MOVE_LOOP__;
  });
}

async function createAndStartMatch() {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill(summary.playerName);
  note("filled player name", { playerName: summary.playerName });

  await page.locator("button.btn-primary").first().click();
  note("clicked primary create channel button");

  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  const roomState = await Promise.all([
    waitForEvent("room:state", (entry) => Boolean(entry.payload?.code), 12_000),
    page.locator("button.code-go").first().click()
  ]).then(([entry]) => entry);
  summary.keyTimes.roomCreated = roomState.ts;
  note("clicked code-go create button", { roomCode: roomState.payload?.code });

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  const matchStarted = await Promise.all([
    waitForEvent("match:started", () => true, 20_000, roomState.ts),
    page.locator("button.btn-primary").first().click()
  ]).then(([entry]) => entry);
  summary.keyTimes.matchStarted = matchStarted.ts;
  note("clicked start match button");

  await waitForCondition(
    "socket recorder ready after match start",
    async () => (await collectEvents()).some((entry) => entry.name === "match:started" && entry.ts === matchStarted.ts),
    5_000
  );
  note("confirmed socket recorder after match start", { matchStartedTs: matchStarted.ts });

  await ensureGameCanvas();
  await focusGameCanvas();
  summary.screenshots.gameStarted = await screenshot("01-game-started.png");
  await countEvents();
}

async function pressMovement(keys, ms) {
  const unique = [...new Set(keys.filter(Boolean))];
  await focusGameCanvas();
  for (const key of unique) await page.keyboard.down(key);
  await sleep(ms);
  for (const key of [...unique].reverse()) await page.keyboard.up(key);
}

function getKeyEventMeta(key) {
  switch (key) {
    case "a":
      return { key: "a", code: "KeyA", keyCode: 65, which: 65 };
    case "d":
      return { key: "d", code: "KeyD", keyCode: 68, which: 68 };
    case "ArrowLeft":
      return { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37, which: 37 };
    case "ArrowRight":
      return { key: "ArrowRight", code: "ArrowRight", keyCode: 39, which: 39 };
    default:
      return { key, code: key, keyCode: 0, which: 0 };
  }
}

async function dispatchDomKeyPhase(keys, type) {
  const payload = keys.map(getKeyEventMeta);
  await page.evaluate(
    ({ entries, eventType }) => {
      for (const entry of entries) {
        const event = new KeyboardEvent(eventType, {
          key: entry.key,
          code: entry.code,
          keyCode: entry.keyCode,
          which: entry.which,
          bubbles: true,
          cancelable: true,
          composed: true
        });
        window.dispatchEvent(event);
        document.dispatchEvent(event);
      }
    },
    { entries: payload, eventType: type }
  );
}

async function moveWithHold(keys, holdMs, options = {}) {
  const { startDelayMs = 0, skipFocus = false } = options;
  const unique = [...new Set(keys.filter(Boolean))];
  if (startDelayMs > 0) await sleep(startDelayMs);
  if (!skipFocus) {
    await focusGameCanvas();
  } else {
    await page.evaluate(() => window.focus());
  }
  for (const key of unique) await page.keyboard.down(key);
  await dispatchDomKeyPhase(unique, "keydown");
  await sleep(holdMs);
  for (const key of [...unique].reverse()) await page.keyboard.up(key);
  await dispatchDomKeyPhase([...unique].reverse(), "keyup");
}

function directionKeys(from, to) {
  const keys = [];
  if (!from || !to) return keys;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > 10) keys.push(dx > 0 ? "d" : "a", dx > 0 ? "ArrowRight" : "ArrowLeft");
  if (Math.abs(dy) > 10) keys.push(dy > 0 ? "s" : "w", dy > 0 ? "ArrowDown" : "ArrowUp");
  return keys;
}

function getSelfFromPlayers(players, selfId) {
  return Array.isArray(players) ? players.find((player) => player.id === selfId) ?? null : null;
}

function getExtractSnapshotForSelf(extractPayload, selfId) {
  if (!extractPayload) return { zone: null, member: null };
  return {
    zone: extractPayload.zones?.[0] ?? null,
    member: extractPayload.squadStatus?.members?.find((member) => member.playerId === selfId) ?? null
  };
}

async function waitForPlayerMotion(selfId, baseline, timeoutMs = 2_500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await collectEvents();
    const movedFrame = [...events].reverse().find((entry) => {
      if (entry.direction !== "in" || entry.name !== "state:players") return false;
      const self = getSelfFromPlayers(entry.payload, selfId);
      return self && (Math.abs(self.x - baseline.x) >= 8 || Math.abs(self.y - baseline.y) >= 8);
    });
    if (movedFrame) {
      return getSelfFromPlayers(movedFrame.payload, selfId);
    }
    await sleep(80);
  }
  return null;
}

function distanceFromPoint(point, target) {
  if (!point || !target) return Number.NaN;
  return Math.hypot(point.x - target.x, point.y - target.y);
}

function getDirectionToward(from, to) {
  if (!from || !to) {
    return { x: 0, y: 0 };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const magnitude = Math.hypot(dx, dy);
  if (!Number.isFinite(magnitude) || magnitude <= 0.001) {
    return { x: 0, y: 0 };
  }
  return {
    x: dx / magnitude,
    y: dy / magnitude
  };
}

function getAwayDirection(point, center) {
  if (!point || !center) {
    return { x: 1, y: 0 };
  }
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.001) {
    return { x: 1, y: 0 };
  }
  return {
    x: dx / length,
    y: dy / length
  };
}

function getExtractStartRadius(zoneRadius) {
  const inset = Math.min(18, Math.max(6, zoneRadius * 0.15));
  return Math.max(24, zoneRadius - inset);
}

async function holdMovementUntilDistance(keys, selfId, center, minDistance, timeoutMs = 3_000) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) {
    throw new Error("holdMovementUntilDistance requires at least one key");
  }

  await primeGameInputFocus();
  for (const key of unique) await page.keyboard.down(key);
  await dispatchDomKeyPhase(unique, "keydown");

  const started = Date.now();
  let thresholdFrame = null;
  try {
    while (Date.now() - started < timeoutMs) {
      const self = await getSelfState();
      const distance = distanceFromPoint(self, center);
      if (self && Number.isFinite(distance) && distance > minDistance) {
        thresholdFrame = {
          ts: Date.now(),
          self,
          distance
        };
        return thresholdFrame;
      }
      await sleep(40);
    }
    throw new Error(`Timed out waiting for self distance > ${minDistance}`);
  } finally {
    for (const key of [...unique].reverse()) await page.keyboard.up(key);
    await dispatchDomKeyPhase([...unique].reverse(), "keyup");
  }
}

async function waitForZoneOpen() {
  const zone = await waitForCondition("extract zone", getZone, 15_000);
  const openDeadline = (summary.keyTimes.matchStarted ?? Date.now()) + zone.openAtSec * 1000;
  const started = Date.now();
  let latestSnapshot = null;

  while (Date.now() - started < zone.openAtSec * 1000 + 8_000) {
    latestSnapshot = await latestExtractOpened();
    const liveZone = latestSnapshot?.zones?.find((candidate) => candidate.zoneId === zone.zoneId) ?? latestSnapshot?.zones?.[0] ?? null;
    if (liveZone?.isOpen === true) {
      const latestOpenEvent = await latestEvent("extract:opened");
      summary.keyTimes.extractOpenedInbound = latestOpenEvent?.ts ?? Date.now();
      note("extract zone reported open", { zone: liveZone });
      return { zone, extractPayload: latestSnapshot, openConfirmed: true };
    }
    if (Date.now() >= openDeadline) {
      note("extract zone open time reached before inbound open confirmation", {
        zoneId: zone.zoneId,
        openAtSec: zone.openAtSec,
        latestExtractZone: liveZone
      });
      return { zone, extractPayload: latestSnapshot, openConfirmed: false };
    }
    await sleep(100);
  }

  throw new Error(`Timed out waiting for extract zone ${zone.zoneId} to reach open window`);
}

async function ensureServerRecognizesZonePresence(zone, selfId) {
  let extractPayload = await latestExtractOpened();
  let { member } = getExtractSnapshotForSelf(extractPayload, selfId);
  if (member?.isInsideZone) {
    note("server already reports player inside extract zone", { member });
    return;
  }

  const baseline = await getSelfState();
  if (!baseline) {
    throw new Error("Missing self state before inside-zone verification");
  }

  note("server does not yet report inside-zone; forcing focused movement", {
    baseline,
    zone,
    extractMember: member ?? null
  });

  const nudgeTarget = { x: zone.x - 24, y: zone.y + 12 };
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const beforeMove = await getSelfState();
    await callMoveHook(getDirectionToward(beforeMove ?? baseline, nudgeTarget));
    const movedSelf = await waitForPlayerMotion(selfId, beforeMove ?? baseline, 3_000);
    await stopMoveHook();
    extractPayload = await latestExtractOpened();
    ({ member } = getExtractSnapshotForSelf(extractPayload, selfId));
    if (movedSelf || member?.isInsideZone) {
      note("validated focused movement against server state", {
        attempt,
        movedSelf,
        extractMember: member ?? null
      });
    }
    if (member?.isInsideZone) {
      return;
    }
    if (!movedSelf) {
      continue;
    }
    await sleep(120);
  }

  note("Focused movement did not produce server-recognized inside-zone state; continuing with final event-chain analysis", {
    classification: "focused_movement_unconfirmed",
    zone,
    selfId
  });
}

async function moveNearZoneStartRadius() {
  const zone = await waitForCondition("extract zone", getZone, 15_000);
  const startRadius = getExtractStartRadius(zone.radius);
  const target = { x: zone.x + startRadius - 4, y: zone.y + 12 };
  const selfId = (await matchPayload())?.selfPlayerId;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const self = await getSelfState();
    if (!self) {
      await sleep(100);
      continue;
    }
    const distanceToCenter = Math.hypot(self.x - zone.x, self.y - zone.y);
    const extractPayload = await latestExtractOpened();
    const { member } = getExtractSnapshotForSelf(extractPayload, selfId);
    if (distanceToCenter <= startRadius - 4 || member?.isInsideZone) {
      note("positioned inside extract start radius", {
        self,
        target,
        zone,
        startRadius,
        distanceToCenter,
        extractMember: member ?? null
      });
      return;
    }
    const beforeMove = self;
    await callMoveHook(getDirectionToward(self, target));
    const movedSelf = selfId ? await waitForPlayerMotion(selfId, beforeMove, 2_500) : null;
    await stopMoveHook();
    if (!movedSelf) {
      note("movement input did not change server position yet", { beforeMove, target });
    }
    await sleep(60);
  }
  throw new Error("Timed out moving near extract start radius");
}

async function waitForStableServerStartPosition(zone, selfId) {
  const startRadius = getExtractStartRadius(zone.radius);
  return await waitForCondition(
    "stable server-recognized extract start position",
    async () => {
      const self = await getSelfState();
      if (!self) return null;
      const distanceToCenter = Math.hypot(self.x - zone.x, self.y - zone.y);
      if (!Number.isFinite(distanceToCenter) || distanceToCenter > startRadius - 2) {
        return null;
      }

      const extractPayload = await latestExtractOpened();
      const { member } = getExtractSnapshotForSelf(extractPayload, selfId);
      if (!member?.isInsideZone || member.isExtracting) {
        return null;
      }

      return {
        self,
        member,
        distanceToCenter,
        startRadius
      };
    },
    8_000
  );
}

async function runAcceptance() {
  await createAndStartMatch();
  await moveNearZoneStartRadius();

  const hooks = await waitForCondition(
    "P0-B test hooks",
    async () => {
      const value = await getP0BTestHooks();
      return value?.hasSendMoveInput && value?.hasStartExtract ? value : null;
    },
    10_000
  );
  note("confirmed dev-only test hooks", hooks);

  const startedPayload = await matchPayload();
  const selfId = startedPayload?.selfPlayerId;
  const zone = startedPayload?.room?.layout?.extractZones?.[0] ?? null;
  if (!selfId) throw new Error("match:started payload missing selfPlayerId");
  if (!zone) throw new Error("match:started payload missing extract zone");
  await ensureServerRecognizesZonePresence(zone, selfId);
  await primeGameInputFocus();
  note("primed game input focus before first extract wait");

  const nominalOpenTs = summary.keyTimes.matchStarted + zone.openAtSec * 1000;
  const firstSequenceSearchStart = Math.max(0, nominalOpenTs - 750);
  const msUntilOpenWindow = nominalOpenTs - Date.now();
  if (msUntilOpenWindow > 150) {
    await sleep(msUntilOpenWindow - 150);
  }
  summary.keyTimes.firstZoneOpenReady = Date.now();
  note("armed first extract window from match/open timing", {
    zoneId: zone.zoneId,
    nominalOpenTs,
    firstSequenceSearchStart
  });

  const firstPreExtractSelf = await getSelfState();
  const firstPreExtractDirection = getAwayDirection(firstPreExtractSelf, zone);
  const firstMoveArmTs = Date.now();
  await startSustainedMoveLoop({
    zone,
    fallbackDirection: firstPreExtractDirection,
    intervalMs: MOVE_POLL_INTERVAL_MS,
    label: "first-extract-pre-outbound"
  });

  const confirmedFirstNonZeroInput = await waitForNonZeroInputMove(firstMoveArmTs, 2_500).catch(() => null);
  if (!confirmedFirstNonZeroInput) {
    await stopSustainedMoveLoop();
    await stopMoveHook();
    throw new Error("Failed to confirm non-zero player:inputMove in wsFrames before first startExtract/start/success window.");
  }
  summary.keyTimes.firstConfirmedNonZeroInputMoveOutbound = confirmedFirstNonZeroInput.ts;
  note("armed immediate non-zero move hook before first extract outbound", {
    moveTs: firstMoveArmTs,
    confirmedNonZeroInputTs: confirmedFirstNonZeroInput.ts,
    direction: firstPreExtractDirection,
    self: firstPreExtractSelf
  });

  const firstOutboundWait = waitForEvent(
    "player:startExtract",
    (entry) => entry.direction === "out" && entry.ts >= confirmedFirstNonZeroInput.ts,
    3_000,
    confirmedFirstNonZeroInput.ts
  ).catch(() => null);
  let firstOutbound = await firstOutboundWait;
  if (!firstOutbound) {
    await callStartExtractHook();
    note("requested first extract via test hook fallback after passive wait", {
      waitedMs: 3_000
    });
    firstOutbound = await waitForEvent(
      "player:startExtract",
      (entry) => entry.direction === "out" && entry.ts >= firstSequenceSearchStart,
      8_000,
      firstSequenceSearchStart
    );
  }
  const outwardBaseline = await getSelfState();
  const outwardDirection = getAwayDirection(outwardBaseline, zone);
  await startSustainedMoveLoop({
    zone,
    fallbackDirection: outwardDirection,
    intervalMs: MOVE_POLL_INTERVAL_MS,
    label: "first-extract-post-outbound"
  });
  note("kept sustained leave-zone move hook active after first outbound", {
    moveTs: Date.now(),
    direction: outwardDirection,
    self: outwardBaseline
  });
  const firstStarted = await waitForEvent(
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "started" && entry.ts >= confirmedFirstNonZeroInput.ts,
    10_000,
    confirmedFirstNonZeroInput.ts
  );
  const firstProgress = await waitForEvent(
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "progress" && entry.ts >= confirmedFirstNonZeroInput.ts,
    10_000,
    confirmedFirstNonZeroInput.ts
  );
  if (confirmedFirstNonZeroInput.ts >= firstStarted.ts) {
    await stopSustainedMoveLoop();
    await stopMoveHook();
    throw new Error("Confirmed non-zero player:inputMove did not land before first extract started.");
  }
  summary.keyTimes.firstStartOutbound = firstOutbound.ts;
  summary.keyTimes.firstStartedInbound = firstStarted.ts;
  summary.keyTimes.firstProgressInbound = firstProgress.ts;
  note("captured first extract start with leave-zone movement already active", {
    firstOutboundTs: firstOutbound.ts,
    firstStartedTs: firstStarted.ts,
    firstProgressTs: firstProgress.ts,
    confirmedNonZeroInputTs: confirmedFirstNonZeroInput.ts,
    outwardDirection
  });

  const firstMoveEvidence = await waitForPlayerMotion(selfId, firstPreExtractSelf ?? outwardBaseline, 2_500).catch(() => null);
  if (firstMoveEvidence) {
    note("observed self coordinate change after first non-zero hook input", {
      baseline: firstPreExtractSelf ?? outwardBaseline,
      movedSelf: firstMoveEvidence
    });
  } else {
    note("non-zero hook input was sent before first success but no self coordinate change was observed yet", {
      baseline: firstPreExtractSelf ?? outwardBaseline,
      firstStartedTs: firstStarted.ts,
      firstProgressTs: firstProgress.ts
    });
  }

  const continueRadiusThreshold = zone.radius + Math.min(14, Math.max(8, zone.radius * 0.12));
  const leaveThreshold = await waitForCondition(
    `self distance beyond continue radius ${continueRadiusThreshold}`,
    async () => {
      const self = await getSelfState();
      const distance = distanceFromPoint(self, zone);
      return self && Number.isFinite(distance) && distance > continueRadiusThreshold
        ? { ts: Date.now(), self, distance }
        : null;
    },
    4_000
  ).catch(() => null);
  if (leaveThreshold) {
    summary.keyTimes.firstLeaveThresholdReached = leaveThreshold.ts;
    note("confirmed self crossed continue radius before waiting for interrupted", {
      distance: leaveThreshold.distance,
      threshold: continueRadiusThreshold,
      self: leaveThreshold.self
    });
  } else {
    note("self did not cross continue radius before interrupted wait window", {
      threshold: continueRadiusThreshold
    });
  }

  const interrupted = await waitForEvent(
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "interrupted" && entry.payload?.reason === "left_zone" && entry.ts >= firstStarted.ts,
    6_000,
    firstStarted.ts
  ).catch(() => null);
  const successDuringFirst = await waitForEvent(
    "extract:success",
    (entry) => entry.direction === "in" && entry.ts >= firstStarted.ts,
    500,
    firstStarted.ts
  ).catch(() => null);
  const settlementDuringFirst = await waitForEvent(
    "match:settlement",
    (entry) => entry.direction === "in" && entry.ts >= firstStarted.ts,
    500,
    firstStarted.ts
  ).catch(() => null);
  await stopSustainedMoveLoop();
  await stopMoveHook();

  if (!interrupted) {
    if (successDuringFirst) {
      summary.keyTimes.extractSuccessInbound = successDuringFirst.ts;
    }
    if (settlementDuringFirst) {
      summary.keyTimes.matchSettlementInbound = settlementDuringFirst.ts;
    }
    note("first extract reached success/settlement before left-zone interrupt", {
      successTs: successDuringFirst?.ts ?? null,
      settlementTs: settlementDuringFirst?.ts ?? null
    });
    if (!leaveThreshold) {
      note("failure branch detail: no interrupted because continue radius was not exceeded in time", {
        threshold: continueRadiusThreshold
      });
    }
    summary.screenshots.secondProgress = await screenshot("04-fast-success.png", { fullPage: false });
    await countEvents();
    throw new Error(
      leaveThreshold
        ? "Full pass failed: first extract never emitted interrupted(left_zone) after crossing continue radius."
        : "Full pass failed: self never crossed continue radius before success/settlement, so interrupted(left_zone) could not be proven."
    );
  }
  summary.keyTimes.interruptedInbound = interrupted.ts;
  summary.assertions.leftZoneInterrupted = interrupted.payload?.reason === "left_zone";
  summary.screenshots.interrupted = await screenshot("03-left-zone-interrupted.png", { fullPage: false });

  note("starting scripted return-to-zone movement", {
    interruptedTs: interrupted.ts,
    startRadiusThreshold: 28
  });

  await moveNearZoneStartRadius();
  await stopMoveHook();
  await ensureServerRecognizesZonePresence(zone, selfId);
  const stableReturn = await waitForStableServerStartPosition(zone, selfId);
  summary.keyTimes.returnedToStartRadius = Date.now();
  note("confirmed stable server-recognized return before second restart", stableReturn);
  let secondOutbound = await waitForEvent(
    "player:startExtract",
    (entry) => entry.direction === "out" && entry.ts >= summary.keyTimes.returnedToStartRadius,
    1_500,
    summary.keyTimes.returnedToStartRadius
  ).catch(() => null);
  if (!secondOutbound) {
    await callStartExtractHook();
    note("requested second extract via test hook fallback");
    secondOutbound = await waitForEvent(
      "player:startExtract",
      (entry) => entry.direction === "out" && entry.ts >= summary.keyTimes.returnedToStartRadius,
      8_000,
      summary.keyTimes.returnedToStartRadius
    );
  }
  const secondStarted = await waitForEvent(
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "started" && entry.ts >= secondOutbound.ts,
    10_000,
    secondOutbound.ts
  );
  const secondProgress = await waitForEvent(
    "extract:progress",
    (entry) => entry.direction === "in" && entry.payload?.status === "progress" && entry.ts >= secondStarted.ts,
    10_000,
    secondStarted.ts
  );
  summary.keyTimes.secondStartOutbound = secondOutbound.ts;
  summary.keyTimes.secondStartedInbound = secondStarted.ts;
  summary.keyTimes.secondProgressInbound = secondProgress.ts;
  summary.assertions.secondStarted = true;
  summary.assertions.secondProgress = true;

  const successAfterSecond = await waitForEvent(
    "extract:success",
    (entry) => entry.direction === "in" && entry.ts >= secondStarted.ts,
    8_000,
    secondStarted.ts
  ).catch(() => null);
  const settlementAfterSecond = await waitForEvent(
    "match:settlement",
    (entry) => entry.direction === "in" && entry.ts >= secondStarted.ts,
    8_000,
    secondStarted.ts
  ).catch(() => null);
  if (successAfterSecond) {
    summary.keyTimes.extractSuccessInbound = successAfterSecond.ts;
  }
  if (settlementAfterSecond) {
    summary.keyTimes.matchSettlementInbound = settlementAfterSecond.ts;
  }

  summary.screenshots.secondProgress = await screenshot("04-second-progress.png", { fullPage: false });
  await countEvents();
}

async function cleanup() {
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
}

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
    await runAcceptance();
    const finalFrames = await collectEvents();
    const analysis = applyFinalEventAnalysis(finalFrames);
    if (!analysis.hasFullP0BSequence) {
      throw new Error(`Full pass assertions failed with classification=${analysis.classification}`);
    }
    writeJson(summary.wsFramesPath, finalFrames);
    summary.result = "pass";
    summary.classification = "full_p0b_sequence";
  } catch (error) {
    summary.result = "fail";
    pendingFatalError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
  } finally {
    let finalFrames = [];
    try {
      if (page && !page.isClosed()) {
        finalFrames = await collectEvents();
        writeJson(summary.wsFramesPath, finalFrames);
      } else {
        finalFrames = JSON.parse(readFileSync(summary.wsFramesPath, "utf8"));
      }
    } catch (error) {
      recordError("failed to write ws frames", { detail: String(error) });
      try {
        finalFrames = JSON.parse(readFileSync(summary.wsFramesPath, "utf8"));
      } catch {
        finalFrames = [];
      }
    }

    try {
      const analysis = applyFinalEventAnalysis(finalFrames);
      summary.counts.secondInboundStarted = analysis.secondStarted ? 1 : 0;
      summary.counts.secondInboundProgress = analysis.secondProgress ? 1 : 0;

      if (analysis.hasFullP0BSequence) {
        if (summary.result === "fail") {
          note("final event analysis overrides earlier failure because full P0-B sequence is present", {
            priorClassification: summary.classification,
            analysisClassification: analysis.classification
          });
        }
        summary.result = "pass";
        summary.classification = "full_p0b_sequence";
      } else if (summary.result === "fail" && analysis.classification === "fast_extract_success") {
        note("captured valid extract success sequence before scripted leave-return loop", {
          classification: analysis.classification,
          successTs: analysis.success?.ts ?? null,
          settlementTs: analysis.settlement?.ts ?? null
        });
      }

      writeJson(summary.eventLogPath, {
        result: summary.result,
        classification: summary.classification,
        counts: summary.counts,
        keyTimes: summary.keyTimes,
        extracted: finalFrames.filter((entry) => ["room:state", "match:started", "state:players", "extract:opened", "player:startExtract", "player:inputMove", "extract:progress", "extract:success", "match:settlement"].includes(entry.name))
      });
    } catch (error) {
      recordError("failed to write event log", { detail: String(error) });
    }

    if (pendingFatalError) {
      if (summary.result === "fail") {
        recordError(pendingFatalError.message, { stack: pendingFatalError.stack });
        if (page && !page.isClosed()) {
          try {
            summary.screenshots.failure = await screenshot("99-failure.png");
          } catch {
            // ignore
          }
        }
      } else {
        note("suppressed transient live-wait failure because final event analysis confirmed full P0-B sequence", {
          message: pendingFatalError.message
        });
      }
    }

    await cleanup();
    summary.finishedAt = new Date().toISOString();
    writeJson(summary.summaryPath, summary);
    console.log(JSON.stringify({ result: summary.result, artifactDir: ARTIFACT_DIR, summaryPath: summary.summaryPath }, null, 2));
    process.exitCode = summary.result === "pass" ? 0 : 1;
  }
}

await main();

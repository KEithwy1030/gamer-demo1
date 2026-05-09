import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(process.env.GAME_FEEL_SERVER_PORT ?? "5715", 10);
const CLIENT_PORT = Number.parseInt(process.env.GAME_FEEL_CLIENT_PORT ?? "6785", 10);
const RUN_ID = process.env.GAME_FEEL_RUN_ID ?? `game-feel-baseline-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const ARTIFACT_DIR = resolve(".codex-artifacts", "game-feel-baseline", RUN_ID);
const APP_URL = `http://${HOST}:${CLIENT_PORT}/?devRoomPreset=boss&p0bTestHooks=1`;
const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;

mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  script: "accept-game-feel-baseline",
  runId: RUN_ID,
  artifactDir: ARTIFACT_DIR,
  appUrl: APP_URL,
  serverUrl: SERVER_URL,
  serverPort: SERVER_PORT,
  clientPort: CLIENT_PORT,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  result: "fail",
  screenshots: {},
  observations: [],
  cleanup: {
    launcherPid: null,
    browserClosed: false,
    launcherExited: false,
    portsBefore: {},
    portsAfter: {},
    killedPids: []
  }
};

let launcher;
let browser;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function note(message, extra = {}) {
  summary.observations.push({ ts: new Date().toISOString(), message, ...extra });
}

function writeSummary() {
  writeFileSync(join(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function appendLog(name, chunk) {
  writeFileSync(join(ARTIFACT_DIR, name), String(chunk), { encoding: "utf8", flag: "a" });
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
  return [...new Set(String(result.stdout).match(/\b\d+\b/g) ?? [])];
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
      const response = await fetch(url);
      note("http endpoint responded", { url, status: response.status });
      return;
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
      DEV_ACCEPT_RUN_ID: `${RUN_ID}-launcher`
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  summary.cleanup.launcherPid = launcher.pid ?? null;
  launcher.stdout?.on("data", (chunk) => appendLog("launcher.stdout.log", chunk));
  launcher.stderr?.on("data", (chunk) => appendLog("launcher.stderr.log", chunk));
}

async function installSocketRecorder(page) {
  await page.addInitScript(() => {
    window.__GAME_FEEL_EVENTS__ = [];
    const pushEvent = (direction, raw) => {
      const entry = { ts: Date.now(), direction, raw: typeof raw === "string" ? raw : String(raw), name: null, payload: null };
      try {
        if (typeof raw === "string" && raw.startsWith("42")) {
          const parsed = JSON.parse(raw.slice(2));
          if (Array.isArray(parsed)) {
            entry.name = parsed[0] ?? null;
            entry.payload = parsed[1] ?? null;
          }
        }
      } catch (error) {
        entry.parseError = String(error);
      }
      window.__GAME_FEEL_EVENTS__.push(entry);
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class GameFeelRecorderWebSocket extends NativeWebSocket {
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

async function waitForEvent(page, name, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const event = await page.evaluate((eventName) => {
      return [...(window.__GAME_FEEL_EVENTS__ ?? [])].reverse().find((entry) => entry.name === eventName) ?? null;
    }, name);
    if (event) return event;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${name}`);
}

async function waitForEventAfter(page, name, afterTs = 0, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const event = await page.evaluate(({ eventName, minTs }) => {
      return (window.__GAME_FEEL_EVENTS__ ?? []).find((entry) => entry.ts >= minTs && entry.name === eventName) ?? null;
    }, { eventName: name, minTs: afterTs });
    if (event) return event;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${name}`);
}

async function screenshot(page, name, options = {}) {
  const path = join(ARTIFACT_DIR, name);
  await page.screenshot({ path, fullPage: options.fullPage ?? false });
  summary.screenshots[name.replace(/\.png$/, "")] = path;
  return path;
}

async function clickBossApproximation(page) {
  const canvas = page.locator("canvas:not(.lobby-background)").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("game canvas bounding box unavailable");
  await canvas.click({
    position: {
      x: Math.round(box.width / 2),
      y: Math.round(box.height / 2 + Math.min(260, box.height * 0.34))
    },
    force: true
  });
}

async function triggerAndWaitForCombatResult(page, selfPlayerId, timeoutMs = 10_000) {
  const started = Date.now();
  let lastClickAt = 0;
  while (Date.now() - started < timeoutMs) {
    const combatEvent = await page.evaluate(({ minTs, selfId }) => {
      return [...(window.__GAME_FEEL_EVENTS__ ?? [])]
        .reverse()
        .find((entry) => (
          entry.ts >= minTs
          && entry.name === "combat:result"
          && (entry.payload?.attackerId === selfId || entry.payload?.targetId === selfId)
        )) ?? null;
    }, { minTs: started, selfId: selfPlayerId });
    if (combatEvent) {
      return combatEvent;
    }
    if (Date.now() - lastClickAt > 650) {
      await clickBossApproximation(page);
      lastClickAt = Date.now();
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for self combat:result after boss click loop");
}

async function run() {
  startLauncher();
  await waitForHttp(SERVER_URL);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await installSocketRecorder(page);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill("GameFeelBaseline");
  await page.locator("button.btn-primary").first().click();

  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  const roomState = await Promise.all([
    waitForEvent(page, "room:state", 12_000),
    page.locator("button.code-go").first().click()
  ]).then(([entry]) => entry);

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  const matchStarted = await Promise.all([
    waitForEventAfter(page, "match:started", roomState.ts, 20_000),
    page.locator("button.btn-primary").first().click()
  ]).then(([entry]) => entry);
  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1_200);

  await screenshot(page, "01-combat-hud-boss-proximity.png");

  const combatEvent = await triggerAndWaitForCombatResult(page, matchStarted.payload?.selfPlayerId);
  note("captured combat result before hit-feedback screenshot", {
    attackerId: combatEvent.payload?.attackerId ?? null,
    targetId: combatEvent.payload?.targetId ?? null,
    amount: combatEvent.payload?.amount ?? null,
    damageType: combatEvent.payload?.damageType ?? null
  });
  await sleep(220);
  await screenshot(page, "02-combat-hit-feedback-attempt.png");

  await page.keyboard.press("i");
  await sleep(600);
  await screenshot(page, "03-combat-inventory-open.png");

  const events = await page.evaluate(() => window.__GAME_FEEL_EVENTS__ ?? []);
  writeFileSync(join(ARTIFACT_DIR, "events.json"), `${JSON.stringify(events, null, 2)}\n`, "utf8");

  summary.result = "pass";
  note("captured combat HUD, boss proximity, hit feedback attempt, and inventory baseline screenshots");
}

async function cleanup() {
  if (browser) {
    await browser.close();
    summary.cleanup.browserClosed = true;
  }
  if (launcher?.pid) {
    killPidTree(launcher.pid);
    summary.cleanup.launcherExited = true;
  }
  await sleep(500);
  summary.cleanup.portsAfter = {
    server: getListeningPids(SERVER_PORT),
    client: getListeningPids(CLIENT_PORT)
  };
  summary.finishedAt = new Date().toISOString();
  writeSummary();
}

run()
  .catch((error) => {
    summary.error = error instanceof Error ? error.stack ?? error.message : String(error);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });

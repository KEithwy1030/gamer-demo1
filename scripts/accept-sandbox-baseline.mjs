// 沙盒视觉验收：进 sandbox 预设 → 截图出生场景 → 走到宝箱开箱 → 打木桩验证打击反馈 → 静音按钮
// 产出 .codex-artifacts/sandbox-baseline/<runId>/ 截图 + events.json + summary.json
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = Number.parseInt(process.env.SANDBOX_SERVER_PORT ?? "5293", 10);
const CLIENT_PORT = Number.parseInt(process.env.SANDBOX_CLIENT_PORT ?? "5294", 10);
const RUN_ID = process.env.SANDBOX_RUN_ID ?? `sandbox-baseline-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const ARTIFACT_DIR = resolve(".codex-artifacts", "sandbox-baseline", RUN_ID);
const APP_URL = `http://${HOST}:${CLIENT_PORT}/?devRoomPreset=sandbox&p0bTestHooks=1`;
const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;

mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = {
  script: "accept-sandbox-baseline",
  runId: RUN_ID,
  artifactDir: ARTIFACT_DIR,
  appUrl: APP_URL,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  result: "fail",
  screenshots: {},
  observations: [],
  cleanup: { launcherPid: null, browserClosed: false, killedPids: [] }
};

let launcher;
let browser;
let activePage;
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

function killPidTree(pid) {
  if (!pid) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  summary.cleanup.killedPids.push(Number(pid));
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      // still starting
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startLauncher() {
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
    window.__SANDBOX_EVENTS__ = [];
    const pushEvent = (direction, raw) => {
      const entry = { ts: Date.now(), direction, name: null, payload: null };
      try {
        if (typeof raw === "string" && raw.startsWith("42")) {
          const parsed = JSON.parse(raw.slice(2));
          if (Array.isArray(parsed)) {
            entry.name = parsed[0] ?? null;
            entry.payload = parsed[1] ?? null;
          }
        }
      } catch {
        // ignore parse errors
      }
      window.__SANDBOX_EVENTS__.push(entry);
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class SandboxRecorderWebSocket extends NativeWebSocket {
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

async function waitForEventAfter(page, names, afterTs = 0, timeoutMs = 20_000) {
  const list = Array.isArray(names) ? names : [names];
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const event = await page.evaluate(({ eventNames, minTs }) => {
      return (window.__SANDBOX_EVENTS__ ?? []).find((entry) => entry.ts >= minTs && eventNames.includes(entry.name)) ?? null;
    }, { eventNames: list, minTs: afterTs });
    if (event) return event;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for any of ${list.join(", ")}`);
}

async function screenshot(page, name) {
  const path = join(ARTIFACT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  summary.screenshots[name.replace(/\.png$/, "")] = path;
  return path;
}

async function moveFor(page, direction, ms) {
  await page.evaluate((dir) => window.__P0B_TEST_HOOKS__?.sendMoveInput(dir), direction);
  await sleep(ms);
  await page.evaluate(() => window.__P0B_TEST_HOOKS__?.sendMoveInput({ x: 0, y: 0 }));
  await sleep(180);
}

async function getSelfPos(page, selfId) {
  return page.evaluate((id) => {
    const states = (window.__SANDBOX_EVENTS__ ?? []).filter((entry) => entry.name === "state:players");
    const latest = states[states.length - 1]?.payload;
    const self = Array.isArray(latest) ? latest.find((player) => player.id === id) : null;
    return self ? { x: Math.round(self.x), y: Math.round(self.y) } : null;
  }, selfId);
}

/** 带反馈的直线导航：每步读权威位置修正，停在目标 ±18px 内。 */
async function walkToX(page, selfId, targetX, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pos = await getSelfPos(page, selfId);
    if (!pos) {
      await sleep(150);
      continue;
    }
    const dx = targetX - pos.x;
    if (Math.abs(dx) <= 18) {
      return pos;
    }
    const burstMs = Math.max(60, Math.min(400, Math.round((Math.abs(dx) / 300) * 1000) - 40));
    await moveFor(page, { x: Math.sign(dx), y: 0 }, burstMs);
  }
  throw new Error(`walkToX timed out heading to ${targetX}`);
}

async function run() {
  startLauncher();
  await waitForHttp(SERVER_URL);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  activePage = page;
  await installSocketRecorder(page);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill("SandboxBaseline");
  await page.locator("button.btn-primary").first().click();

  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  const roomState = await Promise.all([
    waitForEventAfter(page, "room:state", 0, 12_000),
    page.locator("button.code-go").first().click()
  ]).then(([entry]) => entry);

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  const matchStarted = await Promise.all([
    waitForEventAfter(page, "match:started", roomState.ts, 20_000),
    page.locator("button.btn-primary").first().click()
  ]).then(([entry]) => entry);
  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1_500);

  // 断言 1：沙盒里只有 1 只木桩怪
  const monsterCount = await page.evaluate(() => {
    const states = (window.__SANDBOX_EVENTS__ ?? [])
      .filter((entry) => entry.name === "state:monsters")
      .map((entry) => entry.payload);
    const latest = states[states.length - 1];
    return Array.isArray(latest) ? latest.filter((monster) => monster.isAlive).length : -1;
  });
  note("sandbox monster count", { monsterCount });
  if (monsterCount !== 1) {
    throw new Error(`sandbox should contain exactly 1 dummy monster, got ${monsterCount}`);
  }

  await screenshot(page, "01-sandbox-spawn.png");

  const hooksProbe = await page.evaluate(() => ({
    hooks: typeof window.__P0B_TEST_HOOKS__,
    selfPlayerId: window.__P0B_TEST_HOOKS__?.getSnapshot?.()?.selfPlayerId ?? null
  }));
  note("hooks probe", hooksProbe);
  const selfId = hooksProbe.selfPlayerId;
  const spawnPos = await getSelfPos(page, selfId);
  if (!spawnPos) {
    throw new Error("self position unavailable after match start");
  }
  note("spawn position", spawnPos);

  // 先把脚下的种子掉落捡干净（E 的拾取优先级高于开箱）
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("e");
    await sleep(260);
  }

  // 带反馈走到宝箱（预设放在出生点左侧 160px）并开箱。注意：此阶段不点击
  // canvas，点击会触发攻击并短暂锁操作。
  const canvas = page.locator("canvas:not(.lobby-background)").first();
  await walkToX(page, selfId, spawnPos.x - 160);
  let chestOpened = null;
  for (let attempt = 0; attempt < 6 && !chestOpened; attempt += 1) {
    await page.keyboard.press("e");
    try {
      chestOpened = await waitForEventAfter(page, ["chest:progress", "domain:ChestRummageStarted"], matchStarted.ts, 1_800);
    } catch {
      note("chest attempt miss", { attempt, selfPos: await getSelfPos(page, selfId) });
      await walkToX(page, selfId, spawnPos.x - 160);
    }
  }
  if (!chestOpened) {
    throw new Error("chest rummage never started in sandbox");
  }
  note("chest rummage started");
  const opened = await waitForEventAfter(page, ["chest:opened", "domain:ChestOpened"], chestOpened.ts, 20_000);
  note("chest opened", { chestId: opened.payload?.chestId ?? null });
  await sleep(450);
  await screenshot(page, "02-chest-opened.png");

  // 走向木桩（出生点右侧 220px）并攻击，验证 MonsterDamaged 链路。
  // 站在木桩左侧 ~90px（剑程 116px 内），向右点击攻击。
  await walkToX(page, selfId, spawnPos.x + 130);
  let monsterDamaged = null;
  for (let attempt = 0; attempt < 8 && !monsterDamaged; attempt += 1) {
    await canvas.click({ position: { x: 960, y: 450 }, force: true }).catch(() => {});
    try {
      monsterDamaged = await waitForEventAfter(page, ["domain:MonsterDamaged"], matchStarted.ts, 1_500);
    } catch {
      await walkToX(page, selfId, spawnPos.x + 130);
    }
  }
  if (!monsterDamaged) {
    throw new Error("MonsterDamaged never observed while attacking the sandbox dummy");
  }
  note("monster hit feedback event observed", { amount: monsterDamaged.payload?.amount ?? null });
  await sleep(120);
  await screenshot(page, "03-hit-feedback.png");

  // 静音按钮存在且可点
  const muteState = await page.evaluate(() => {
    const button = document.querySelector(".audio-mute-toggle");
    if (!(button instanceof HTMLElement)) return { exists: false };
    button.click();
    return { exists: true, mutedAfterClick: button.classList.contains("audio-mute-toggle--muted") };
  });
  note("mute button", muteState);
  if (!muteState.exists || !muteState.mutedAfterClick) {
    throw new Error(`mute button check failed: ${JSON.stringify(muteState)}`);
  }
  await screenshot(page, "04-muted.png");

  const events = await page.evaluate(() => window.__SANDBOX_EVENTS__ ?? []);
  writeFileSync(join(ARTIFACT_DIR, "events.json"), `${JSON.stringify(events, null, 2)}\n`, "utf8");
  summary.result = "pass";
  note("sandbox baseline captured: spawn, chest opened, hit feedback, mute");
}

async function cleanup() {
  try {
    if (activePage && !activePage.isClosed()) {
      const events = await activePage.evaluate(() => window.__SANDBOX_EVENTS__ ?? []);
      writeFileSync(join(ARTIFACT_DIR, "events.json"), `${JSON.stringify(events, null, 2)}\n`, "utf8");
    }
  } catch {
    // 事件转储尽力而为
  }
  if (browser) {
    await browser.close();
    summary.cleanup.browserClosed = true;
  }
  if (launcher?.pid) {
    killPidTree(launcher.pid);
  }
  await sleep(400);
  summary.finishedAt = new Date().toISOString();
  writeSummary();
}

run()
  .catch((error) => {
    summary.error = error instanceof Error ? error.stack ?? error.message : String(error);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup().catch((cleanupError) => {
      console.error(cleanupError);
      process.exitCode = 1;
    });
  });

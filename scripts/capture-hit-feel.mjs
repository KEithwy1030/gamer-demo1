// 打击手感动态证据采集：沙盒场景里连续攻击木桩，页面内逐帧抓取游戏画布
// （rAF + canvas.toDataURL，依赖 preserveDrawingBuffer），输出 JPEG 帧序列。
// 帧序列再由 scripts/assemble-hit-feel-gif.py 合成 GIF（交付用）。
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = 5307;
const CLIENT_PORT = 5308;
const ARTIFACT_DIR = resolve(".codex-artifacts", "hit-feel");
const APP_URL = `http://${HOST}:${CLIENT_PORT}/?devRoomPreset=sandbox&p0bTestHooks=1`;
mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[hit-feel] ${msg}`);

function killPidTree(pid) {
  if (!pid) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { await fetch(url); return; } catch { await sleep(250); }
  }
  throw new Error(`timeout waiting ${url}`);
}

async function installSocketRecorder(page) {
  await page.addInitScript(() => {
    window.__SANDBOX_EVENTS__ = [];
    const pushEvent = (direction, raw) => {
      const entry = { ts: Date.now(), direction, name: null, payload: null };
      try {
        if (typeof raw === "string" && raw.startsWith("42")) {
          const parsed = JSON.parse(raw.slice(2));
          if (Array.isArray(parsed)) { entry.name = parsed[0] ?? null; entry.payload = parsed[1] ?? null; }
        }
      } catch { /* ignore */ }
      window.__SANDBOX_EVENTS__.push(entry);
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) { super(...args); this.addEventListener("message", (e) => pushEvent("in", e.data)); }
      send(data) { pushEvent("out", data); return super.send(data); }
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
    const self = Array.isArray(latest) ? latest.find((p) => p.id === id) : null;
    return self ? { x: Math.round(self.x), y: Math.round(self.y) } : null;
  }, selfId);
}

async function walkTo(page, selfId, targetX, targetY, timeoutMs = 15_000) {
  const started = Date.now();
  let last = null;
  let stallCount = 0;
  while (Date.now() - started < timeoutMs) {
    const pos = await getSelfPos(page, selfId);
    if (!pos) { await sleep(150); continue; }
    const dx = targetX - pos.x;
    const dy = targetY - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 20) return pos;
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 6) {
      stallCount += 1;
      const sidestep = Math.abs(dx) >= Math.abs(dy)
        ? { x: 0, y: stallCount % 2 === 0 ? 1 : -1 }
        : { x: stallCount % 2 === 0 ? 1 : -1, y: 0 };
      await moveFor(page, sidestep, 320);
    }
    last = pos;
    const burstMs = Math.max(60, Math.min(400, Math.round((dist / 300) * 1000) - 40));
    await moveFor(page, { x: dx / dist, y: dy / dist }, burstMs);
  }
  throw new Error(`walkTo timed out heading to ${targetX},${targetY}`);
}

async function getDummyPos(page) {
  return page.evaluate(() => {
    const states = (window.__SANDBOX_EVENTS__ ?? []).filter((entry) => entry.name === "state:monsters");
    const latest = states[states.length - 1]?.payload;
    const dummy = Array.isArray(latest) ? latest.find((m) => m.isAlive) : null;
    return dummy ? { x: Math.round(dummy.x), y: Math.round(dummy.y) } : null;
  });
}

const launcher = spawn("node", ["scripts/dev-acceptance-launcher.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT),
    DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT),
    DEV_ACCEPT_RUN_ID: "capture-hit-feel-launcher"
  },
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true
});

let browser;
try {
  await waitForHttp(`http://${HOST}:${SERVER_PORT}`);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await installSocketRecorder(page);
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill("HitFeelCapture");
  await page.locator("button.btn-primary").first().click();
  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  const roomState = await Promise.all([
    waitForEventAfter(page, ["room:state"], 0, 12_000),
    page.locator("button.code-go").first().click()
  ]).then(([entry]) => entry);
  const matchStarted = await Promise.all([
    waitForEventAfter(page, ["match:started"], roomState.ts, 20_000),
    page.locator("button.btn-primary").first().click()
  ]).then(([entry]) => entry);
  const selfId = matchStarted.payload?.selfPlayerId;
  const canvas = page.locator("canvas:not(.lobby-background)").first();
  await canvas.waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1_500);
  log(`match started, self=${selfId}`);

  const dummyPos = await getDummyPos(page);
  if (!dummyPos) throw new Error("dummy monster not found");
  await walkTo(page, selfId, dummyPos.x - 90, dummyPos.y);
  log("standing next to dummy");

  // 开始页面内逐帧抓取（每 2 个 rAF 抓一帧 ≈ 30fps，抓 3.2 秒 ≈ 96 帧）
  const capturePromise = page.evaluate(() => {
    return new Promise((resolveCapture) => {
      const canvasEl = document.querySelector("canvas:not(.lobby-background)");
      const frames = [];
      let tick = 0;
      const MAX_FRAMES = 96;
      const grab = () => {
        tick += 1;
        if (tick % 2 === 0) {
          try { frames.push(canvasEl.toDataURL("image/jpeg", 0.75)); } catch { /* ignore */ }
        }
        if (frames.length >= MAX_FRAMES) { resolveCapture(frames); return; }
        requestAnimationFrame(grab);
      };
      requestAnimationFrame(grab);
    });
  });

  // 录制期间打 4 刀（间隔覆盖完整命中反馈链：顿帧/白闪/挫动/火星/伤害数字）
  const attack = async () => {
    const pos = await getSelfPos(page, selfId);
    if (!pos) return;
    const dx = dummyPos.x - pos.x;
    const dy = dummyPos.y - pos.y;
    const mag = Math.max(1, Math.hypot(dx, dy));
    await canvas.click({
      position: { x: Math.round(640 + (dx / mag) * 110), y: Math.round(360 + (dy / mag) * 110) },
      force: true
    }).catch(() => {});
  };
  for (let i = 0; i < 4; i += 1) {
    await attack();
    await sleep(720);
  }

  const frames = await capturePromise;
  log(`captured ${frames.length} frames`);
  frames.forEach((dataUrl, index) => {
    const base64 = dataUrl.split(",")[1];
    writeFileSync(join(ARTIFACT_DIR, `frame-${String(index).padStart(3, "0")}.jpg`), Buffer.from(base64, "base64"));
  });
  const hits = await page.evaluate(() =>
    (window.__SANDBOX_EVENTS__ ?? []).filter((e) => e.name === "domain:MonsterDamaged").length
  );
  log(`MonsterDamaged events observed: ${hits}`);
  if (hits === 0) throw new Error("no hits landed during capture");
  log(`frames written to ${ARTIFACT_DIR}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  killPidTree(launcher.pid);
}

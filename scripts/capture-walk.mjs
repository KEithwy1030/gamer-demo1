// 走路动画采集：沙盒里让玩家边走边抓帧，输出玩家居中裁剪的帧序列 + GIF。
// 用于验收走路循环 + 武器在手 + 比例。一次性工具。
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = 5313;
const CLIENT_PORT = 5314;
const ARTIFACT_DIR = resolve(".codex-artifacts", "walk");
mkdirSync(ARTIFACT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[walk] ${m}`);

function killPidTree(pid) {
  if (!pid) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
}
async function waitForHttp(url, timeoutMs = 60_000) {
  const s = Date.now();
  while (Date.now() - s < timeoutMs) { try { await fetch(url); return; } catch { await sleep(250); } }
  throw new Error(`timeout ${url}`);
}
async function installRecorder(page) {
  await page.addInitScript(() => {
    window.__SANDBOX_EVENTS__ = [];
    const push = (raw) => {
      try {
        if (typeof raw === "string" && raw.startsWith("42")) {
          const p = JSON.parse(raw.slice(2));
          if (Array.isArray(p)) window.__SANDBOX_EVENTS__.push({ ts: Date.now(), name: p[0] ?? null, payload: p[1] ?? null });
        }
      } catch { /* ignore */ }
    };
    const N = window.WebSocket;
    window.WebSocket = class extends N { constructor(...a) { super(...a); this.addEventListener("message", (e) => push(e.data)); } };
  });
}
async function waitFor(page, names, afterTs, timeoutMs = 20_000) {
  const list = Array.isArray(names) ? names : [names];
  const s = Date.now();
  while (Date.now() - s < timeoutMs) {
    const e = await page.evaluate(({ ns, mt }) => (window.__SANDBOX_EVENTS__ ?? []).find((x) => x.ts >= mt && ns.includes(x.name)) ?? null, { ns: list, mt: afterTs });
    if (e) return e;
    await sleep(100);
  }
  throw new Error(`timeout waiting ${list.join(",")}`);
}

const launcher = spawn("node", ["scripts/dev-acceptance-launcher.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT), DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT), DEV_ACCEPT_RUN_ID: "capture-walk-launcher" },
  stdio: ["ignore", "ignore", "ignore"], windowsHide: true
});

let browser;
try {
  await waitForHttp(`http://${HOST}:${SERVER_PORT}`);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await installRecorder(page);
  await page.goto(`http://${HOST}:${CLIENT_PORT}/?devRoomPreset=sandbox&p0bTestHooks=1&grade=moonlit`, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill("WalkCap");
  await page.locator("button.btn-primary").first().click();
  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  const room = await Promise.all([waitFor(page, ["room:state"], 0, 12_000), page.locator("button.code-go").first().click()]).then(([e]) => e);
  await Promise.all([waitFor(page, ["match:started"], room.ts, 20_000), page.locator("button.btn-primary").first().click()]).then(([e]) => e);
  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(1200);
  log("match started");

  // 边走边抓帧：先右走，再左走（看左右翻转 + 走路循环）
  const capturePromise = page.evaluate(() => new Promise((res) => {
    const c = document.querySelector("canvas:not(.lobby-background)");
    const frames = []; let tick = 0;
    const grab = () => { tick++; if (tick % 2 === 0) { try { frames.push(c.toDataURL("image/jpeg", 0.8)); } catch {} } if (frames.length >= 90) return res(frames); requestAnimationFrame(grab); };
    requestAnimationFrame(grab);
  }));
  const drive = async () => {
    for (const [dir, ms] of [[{x:1,y:0.2},1400],[{x:-1,y:0.1},1400]]) {
      await page.evaluate((d) => window.__P0B_TEST_HOOKS__?.sendMoveInput(d), dir);
      await sleep(ms);
    }
    await page.evaluate(() => window.__P0B_TEST_HOOKS__?.sendMoveInput({x:0,y:0}));
  };
  await drive();
  const frames = await capturePromise;
  log(`captured ${frames.length} frames`);

  const { createCanvas, loadImage } = {};
  frames.forEach((d, i) => writeFileSync(join(ARTIFACT_DIR, `frame-${String(i).padStart(3,"0")}.jpg`), Buffer.from(d.split(",")[1], "base64")));
  log(`done -> ${ARTIFACT_DIR}`);
} catch (e) {
  console.error(e); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  killPidTree(launcher.pid);
}

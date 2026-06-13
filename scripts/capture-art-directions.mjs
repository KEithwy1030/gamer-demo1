// 美术方向样板采集：同一沙盒场景同机位，依次用 3 套 ?grade 预设各截一张。
// 产物给项目所有者横向对比挑方向（一次性决策工具）。
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = 5311;
const CLIENT_PORT = 5312;
const GRADES = ["gothic", "ember", "moonlit"];
const ARTIFACT_DIR = resolve(".codex-artifacts", "art-directions");
mkdirSync(ARTIFACT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[art-dir] ${m}`);

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
    window.WebSocket = class extends N {
      constructor(...a) { super(...a); this.addEventListener("message", (e) => push(e.data)); }
    };
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
  env: { ...process.env, DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT), DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT), DEV_ACCEPT_RUN_ID: "capture-art-directions-launcher" },
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true
});

let browser;
try {
  await waitForHttp(`http://${HOST}:${SERVER_PORT}`);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`);
  browser = await chromium.launch({ headless: true });

  for (const grade of GRADES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await installRecorder(page);
    await page.goto(`http://${HOST}:${CLIENT_PORT}/?devRoomPreset=sandbox&p0bTestHooks=1&grade=${grade}`, { waitUntil: "domcontentloaded" });
    await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
    await page.locator("input.code-input").first().fill(`Grade_${grade}`);
    await page.locator("button.btn-primary").first().click();
    await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
    const room = await Promise.all([waitFor(page, ["room:state"], 0, 12_000), page.locator("button.code-go").first().click()]).then(([e]) => e);
    await Promise.all([waitFor(page, ["match:started"], room.ts, 20_000), page.locator("button.btn-primary").first().click()]).then(([e]) => e);
    await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20_000 });
    await sleep(2_200);
    // 用 canvas.toDataURL 抓游戏画布（避开 page.screenshot 的字体等待挂起；
    // preserveDrawingBuffer 已开，HUD 也在 Phaser 画布内）
    const dataUrl = await page.evaluate(() => {
      const c = document.querySelector("canvas:not(.lobby-background)");
      return c ? c.toDataURL("image/png") : null;
    });
    if (!dataUrl) throw new Error(`canvas grab failed for ${grade}`);
    writeFileSync(join(ARTIFACT_DIR, `${grade}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    log(`captured ${grade}`);
    await context.close();
  }
  log(`done -> ${ARTIFACT_DIR}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  killPidTree(launcher.pid);
}

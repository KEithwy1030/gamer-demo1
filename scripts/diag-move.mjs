// 诊断：移动时触发了哪些事件 / console 有无异常 / 抓帧。定位"移动出异响+帧乱"。
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1", SERVER_PORT = 5317, CLIENT_PORT = 5318;
const WEAPON = process.env.DIAG_WEAPON ?? "sword";
const ART = resolve(".codex-artifacts", "diag-move");
mkdirSync(ART, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[diag-move] ${m}`);
function kill(pid) { if (pid) spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); }
async function waitHttp(u, t = 60000) { const s = Date.now(); while (Date.now() - s < t) { try { await fetch(u); return; } catch { await sleep(250); } } throw new Error("timeout " + u); }

const launcher = spawn("node", ["scripts/dev-acceptance-launcher.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT), DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT), DEV_ACCEPT_RUN_ID: "diag-move-launcher", DEV_SANDBOX_WEAPON: WEAPON },
  stdio: ["ignore", "ignore", "ignore"], windowsHide: true
});

let browser;
try {
  await waitHttp(`http://${HOST}:${SERVER_PORT}`); await waitHttp(`http://${HOST}:${CLIENT_PORT}`);
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on("console", (m) => consoleMsgs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e}`));
  await page.addInitScript(() => {
    window.__EV__ = [];
    const push = (raw) => { try { if (typeof raw === "string" && raw.startsWith("42")) { const p = JSON.parse(raw.slice(2)); if (Array.isArray(p)) window.__EV__.push({ t: Date.now(), name: p[0] }); } } catch {} };
    const N = window.WebSocket; window.WebSocket = class extends N { constructor(...a) { super(...a); this.addEventListener("message", (e) => push(e.data)); } };
  });
  await page.goto(`http://${HOST}:${CLIENT_PORT}/?devRoomPreset=sandbox&p0bTestHooks=1&grade=moonlit`, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator("input.code-input").first().fill("DiagMove");
  await page.locator("button.btn-primary").first().click();
  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator("button.code-go").first().click();
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator("button.btn-primary").first().click();
  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20000 });
  await sleep(1500);

  // 标记移动窗口起点，移动 ~2.5s（右、左、上、下），统计窗口内事件
  const startTs = await page.evaluate(() => { window.__MOVE_START__ = Date.now(); return window.__MOVE_START__; });
  for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
    await page.evaluate((dir) => window.__P0B_TEST_HOOKS__?.sendMoveInput(dir), d);
    await sleep(650);
  }
  await page.evaluate(() => window.__P0B_TEST_HOOKS__?.sendMoveInput({ x: 0, y: 0 }));
  await sleep(300);

  const result = await page.evaluate((startTs) => {
    const ev = (window.__EV__ ?? []).filter((e) => e.t >= startTs);
    const counts = {};
    for (const e of ev) counts[e.name] = (counts[e.name] ?? 0) + 1;
    return { counts, total: ev.length };
  }, startTs);

  log("event counts during movement window:");
  console.log(JSON.stringify(result.counts, null, 2));
  const sus = Object.keys(result.counts).filter((n) => /attack|damaged|skill|hurt|cue|audio/i.test(n));
  log("suspicious (combat/audio) events during pure movement: " + (sus.length ? sus.join(", ") : "NONE"));
  const errs = consoleMsgs.filter((m) => /error|warn|fail|exception/i.test(m));
  log("console errors/warns: " + (errs.length ? "\n" + errs.slice(0, 20).join("\n") : "none"));
  writeFileSync(join(ART, "console.log"), consoleMsgs.join("\n"));
} catch (e) { console.error(e); process.exitCode = 1; }
finally { if (browser) await browser.close(); kill(launcher.pid); }

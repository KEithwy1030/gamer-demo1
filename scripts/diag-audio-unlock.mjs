// 验证音频解锁 bug 修复：旧代码每次 keydown/pointerdown 都 play() 全部音效（爆音）。
// 修复后首次交互解锁即摘监听，后续输入应触发 0 次 cue play()。
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1", SERVER_PORT = 5319, CLIENT_PORT = 5320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function kill(pid) { if (pid) spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); }
async function waitHttp(u, t = 60000) { const s = Date.now(); while (Date.now() - s < t) { try { await fetch(u); return; } catch { await sleep(250); } } throw new Error("timeout " + u); }

const launcher = spawn("node", ["scripts/dev-acceptance-launcher.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT), DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT), DEV_ACCEPT_RUN_ID: "diag-audio-launcher" },
  stdio: ["ignore", "ignore", "ignore"], windowsHide: true
});
let browser;
try {
  await waitHttp(`http://${HOST}:${SERVER_PORT}`); await waitHttp(`http://${HOST}:${CLIENT_PORT}`);
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  // 注入 play() 计数器
  await page.addInitScript(() => {
    window.__PLAY_COUNT__ = 0;
    const orig = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function (...a) { window.__PLAY_COUNT__++; return orig.apply(this, a); };
  });
  await page.goto(`http://${HOST}:${CLIENT_PORT}/?devRoomPreset=sandbox&p0bTestHooks=1`, { waitUntil: "domcontentloaded" });
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator("input.code-input").first().fill("AudioDiag");
  await page.locator("button.btn-primary").first().click();
  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator("button.code-go").first().click();
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20000 });
  await page.locator("button.btn-primary").first().click();
  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20000 });
  await sleep(1500);

  // 此时已经历多次菜单点击（pointerdown）→ 解锁应已消耗。清零计数。
  await page.evaluate(() => { window.__PLAY_COUNT__ = 0; });
  // 模拟 12 次移动按键（keydown）—— 修复后这些不应再触发任何 cue play()
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" })));
    await sleep(40);
  }
  await sleep(200);
  const count = await page.evaluate(() => window.__PLAY_COUNT__);
  console.log(`[audio-diag] cue play() calls during 12 movement keydowns AFTER unlock: ${count}`);
  console.log(`[audio-diag] expected with fix: 0   (old bug would be ~72 = 12 keydowns x 6 cues)`);
  console.log(`[audio-diag] RESULT: ${count === 0 ? "PASS - no per-keypress audio blips" : "FAIL - still playing on keypress"}`);
} catch (e) { console.error(e); process.exitCode = 1; }
finally { if (browser) await browser.close(); kill(launcher.pid); }

// 一次性诊断脚本：无头浏览器跑 boss 预设，抓 console/pageerror/WebGL 信息
// 用于定位 2026-06-13 发现的"无头截图全屏红（所有纹理消失）"问题。用完可删。
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const SERVER_PORT = 5305;
const CLIENT_PORT = 5306;
const PRESET = process.env.DIAG_PRESET ?? "boss";
const ARTIFACT_DIR = resolve(".codex-artifacts", "diag-headless-render");
mkdirSync(ARTIFACT_DIR, { recursive: true });

const logs = [];
const note = (kind, text) => {
  logs.push({ ts: new Date().toISOString(), kind, text });
  console.log(`[${kind}] ${text}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killPidTree(pid) {
  if (!pid) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`timeout waiting ${url}`);
}

const launcher = spawn("node", ["scripts/dev-acceptance-launcher.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DEV_ACCEPT_SERVER_PORT: String(SERVER_PORT),
    DEV_ACCEPT_CLIENT_PORT: String(CLIENT_PORT),
    DEV_ACCEPT_RUN_ID: "diag-headless-render-launcher"
  },
  stdio: ["ignore", "ignore", "ignore"],
  windowsHide: true
});

let browser;
try {
  await waitForHttp(`http://${HOST}:${SERVER_PORT}`);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  page.on("console", (msg) => note(`console.${msg.type()}`, msg.text()));
  page.on("pageerror", (err) => note("pageerror", String(err)));
  page.on("requestfailed", (req) => note("requestfailed", `${req.url()} :: ${req.failure()?.errorText}`));

  await page.goto(`http://${HOST}:${CLIENT_PORT}/?devRoomPreset=${PRESET}&p0bTestHooks=1`, { waitUntil: "domcontentloaded" });

  const glInfo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl1 = gl2 ? null : canvas.getContext("webgl");
    const gl = gl2 ?? gl1;
    if (!gl) return { webgl: "NONE" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl: gl2 ? "webgl2" : "webgl1",
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "masked",
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE)
    };
  });
  note("glinfo", JSON.stringify(glInfo));

  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("input.code-input").first().fill("DiagRender");
  await page.locator("button.btn-primary").first().click();
  await page.locator("button.code-go").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("button.code-go").first().click();
  await page.locator("button.btn-primary").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("button.btn-primary").first().click();
  await page.locator("canvas:not(.lobby-background)").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(3_000);

  const phaserInfo = await page.evaluate(() => {
    const canvas = document.querySelector("canvas:not(.lobby-background)");
    if (!canvas) return { canvas: "missing" };
    const attrs = { width: canvas.width, height: canvas.height };
    // Phaser 把 renderer type 暴露在全局 game 实例上（若有）
    const game = window.__PHASER_GAME__ ?? null;
    return { attrs, rendererType: game?.renderer?.constructor?.name ?? "no global handle" };
  });
  note("phaser", JSON.stringify(phaserInfo));

  await page.screenshot({ path: join(ARTIFACT_DIR, `diag-${PRESET}.png`) });
  note("done", `screenshot saved diag-${PRESET}.png`);
} catch (error) {
  note("fatal", String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  killPidTree(launcher.pid);
  writeFileSync(join(ARTIFACT_DIR, "diag-log.json"), JSON.stringify(logs, null, 2));
}

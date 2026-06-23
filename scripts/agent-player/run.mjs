import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { getRecordedEvents, installAgentRecorder, sleep } from "./browser-session.mjs";
import {
  applyOutcome,
  createAgentPlayerSummary,
  toMarkdownReport
} from "./report.mjs";
import { runSandboxSmoke } from "./scenarios/sandbox-smoke.mjs";

const HOST = "127.0.0.1";
const args = parseArgs(process.argv.slice(2));
const SCENARIO = args.scenario ?? "sandbox-smoke";
const SERVER_PORT = Number.parseInt(args.serverPort ?? process.env.AGENT_PLAYER_SERVER_PORT ?? "5301", 10);
const CLIENT_PORT = Number.parseInt(args.clientPort ?? process.env.AGENT_PLAYER_CLIENT_PORT ?? "5302", 10);
const HEADLESS = args.headed !== "1";
const TRACE_ENABLED = args.trace === "1" || process.env.AGENT_PLAYER_TRACE === "1";
const RUN_ID = sanitizeRunId(args.runId ?? `agent-player-${SCENARIO}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const ARTIFACT_DIR = resolve(".codex-artifacts", "agent-player", RUN_ID);
const SERVER_URL = `http://${HOST}:${SERVER_PORT}`;
const APP_URL = scenarioUrl(SCENARIO, CLIENT_PORT);

mkdirSync(ARTIFACT_DIR, { recursive: true });

const summary = createAgentPlayerSummary({
  runId: RUN_ID,
  scenario: SCENARIO,
  artifactDir: ARTIFACT_DIR,
  appUrl: APP_URL,
  serverUrl: SERVER_URL,
  serverPort: SERVER_PORT,
  clientPort: CLIENT_PORT
});

let launcher = null;
let browser = null;
let context = null;
let page = null;
let tracingStarted = false;

function note(message, extra = {}) {
  summary.observations.push({ ts: new Date().toISOString(), message, ...extra });
}

function addFinding(finding) {
  summary.findings.push({
    severity: finding.severity,
    scope: finding.scope,
    title: finding.title,
    detail: finding.detail,
    checkpointId: finding.checkpointId ?? null,
    evidence: finding.evidence ?? {}
  });
}

function addCheckpoint(id, label, status, evidence = {}) {
  summary.checkpoints.push({ id, label, status, evidence });
}

function writeJson(name, data) {
  const path = join(ARTIFACT_DIR, name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  summary.artifacts[name] = path;
  return path;
}

function appendLog(name, chunk) {
  const path = join(ARTIFACT_DIR, name);
  writeFileSync(path, String(chunk), { encoding: "utf8", flag: "a" });
  summary.artifacts[name] = path;
}

async function screenshot(name) {
  if (!page) throw new Error("page is not initialized");
  const path = join(ARTIFACT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  summary.artifacts[name] = path;
  return path;
}

function startLauncher() {
  const occupied = [
    { label: "server", port: SERVER_PORT, pids: getListeningPids(SERVER_PORT) },
    { label: "client", port: CLIENT_PORT, pids: getListeningPids(CLIENT_PORT) }
  ].filter((entry) => entry.pids.length > 0);

  if (occupied.length > 0) {
    const detail = occupied.map((entry) => `${entry.label}:${entry.port}=${entry.pids.join(",")}`).join("; ");
    throw new Error(`agent-player target ports already in use: ${detail}`);
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

async function run() {
  if (SCENARIO !== "sandbox-smoke") {
    throw new Error(`Unsupported agent-player scenario: ${SCENARIO}`);
  }

  startLauncher();
  await waitForHttp(`${SERVER_URL}/health`, 60_000);
  await waitForHttp(`http://${HOST}:${CLIENT_PORT}`, 60_000);

  browser = await chromium.launch({ headless: HEADLESS });
  context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1
  });
  if (TRACE_ENABLED) {
    await context.tracing.start({ screenshots: true, snapshots: true });
    tracingStarted = true;
  }
  page = await context.newPage();
  installBrowserDiagnostics(page);
  await installAgentRecorder(page);

  await runSandboxSmoke({
    page,
    appUrl: APP_URL,
    addCheckpoint,
    addFinding,
    note,
    screenshot
  });

  const events = await getRecordedEvents(page);
  writeJson("events.json", events);
  copyDevLogTail();
}

async function cleanup() {
  try {
    if (context && tracingStarted) {
      const tracePath = join(ARTIFACT_DIR, "trace.zip");
      await context.tracing.stop({ path: tracePath });
      summary.artifacts["trace.zip"] = tracePath;
    }
  } catch (error) {
    addFinding({
      severity: "P3",
      scope: "tool",
      title: "Trace capture failed during cleanup",
      detail: error instanceof Error ? error.message : String(error),
      evidence: {}
    });
  }

  if (browser) {
    await browser.close();
    summary.cleanup.browserClosed = true;
  }
  if (launcher?.pid) {
    killPidTree(launcher.pid);
  }
  await sleep(500);

  summary.finishedAt = new Date().toISOString();
  applyOutcome(summary);
  writeJson("summary.json", summary);
  const reportPath = join(ARTIFACT_DIR, "report.md");
  writeFileSync(reportPath, toMarkdownReport(summary), "utf8");
  summary.artifacts["report.md"] = reportPath;
  writeFileSync(join(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function installBrowserDiagnostics(targetPage) {
  targetPage.on("console", (message) => {
    summary.browser.consoleMessages.push({
      ts: new Date().toISOString(),
      type: message.type(),
      text: message.text()
    });
  });
  targetPage.on("pageerror", (error) => {
    summary.browser.pageErrors.push({
      ts: new Date().toISOString(),
      message: error.message,
      stack: error.stack ?? null
    });
    addFinding({
      severity: "P1",
      scope: "game",
      title: "Browser page error",
      detail: error.message,
      evidence: {}
    });
  });
  targetPage.on("requestfailed", (request) => {
    summary.browser.failedRequests.push({
      ts: new Date().toISOString(),
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? null
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        note("http endpoint ready", { url, status: response.status });
        return;
      }
    } catch {
      // still starting
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function copyDevLogTail() {
  const devLogPath = resolve(".devlog", "latest.jsonl");
  if (!existsSync(devLogPath)) return;
  const lines = readFileSync(devLogPath, "utf8").split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-120).join("\n");
  const outPath = join(ARTIFACT_DIR, "devlog-tail.jsonl");
  writeFileSync(outPath, `${tail}\n`, "utf8");
  summary.artifacts["devlog-tail.jsonl"] = outPath;
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

function scenarioUrl(scenario, clientPort) {
  if (scenario === "sandbox-smoke") {
    return `http://${HOST}:${clientPort}/?devRoomPreset=sandbox&p0bTestHooks=1&grade=moonlit`;
  }
  throw new Error(`Unsupported scenario url: ${scenario}`);
}

function sanitizeRunId(raw) {
  return String(raw).replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 120);
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[toCamelCase(key)] = "1";
      continue;
    }
    parsed[toCamelCase(key)] = next;
    index += 1;
  }
  return parsed;
}

function toCamelCase(key) {
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

run()
  .catch((error) => {
    addFinding({
      severity: "P0",
      scope: "tool",
      title: "Agent Player runner crashed",
      detail: error instanceof Error ? error.stack ?? error.message : String(error),
      evidence: {}
    });
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });

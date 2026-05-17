import { spawn, spawnSync } from "node:child_process";

const isManualPlaytest = process.argv.includes("--manual-playtest");
const manualPlaytestTimeoutMs = 20 * 60 * 1000;

function runNpmScript(scriptName) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm run ${scriptName}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  }
  return spawn("npm", ["run", scriptName], { stdio: ["ignore", "pipe", "pipe"] });
}

const children = [
  runNpmScript("dev:server"),
  runNpmScript("dev:client")
];

let shuttingDown = false;

function stopChildTree(child) {
  if (child.killed || child.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  child.kill("SIGTERM");
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    stopChildTree(child);
  }
  process.exit(exitCode);
}

console.log(`[dev] root pid ${process.pid}; child pids ${children.map((child) => child.pid).join(", ")}`);
console.log("[dev] Press Ctrl+C to stop server and client process trees.");
if (isManualPlaytest) {
  console.log("[manual-playtest] URL: http://localhost:5173/");
  console.log("[manual-playtest] Protocol: docs/agent/MANUAL_PLAYTEST_PROTOCOL_2026-05-18.md");
  console.log("[manual-playtest] Copy the lobby template before the run and the settlement record after the run.");
  console.log("[manual-playtest] Auto-stop is armed for 20 minutes to avoid leaving dev processes behind.");
  setTimeout(() => {
    console.log("[manual-playtest] Auto-stop reached; cleaning server and client process trees.");
    stopAll(0);
  }, manualPlaytestTimeoutMs);
}

for (const child of children) {
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.on("exit", (code, signal) => {
    if (!shuttingDown && (code !== null || signal)) {
      stopAll(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

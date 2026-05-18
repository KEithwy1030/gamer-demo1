import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

const isManualPlaytest = process.argv.includes("--manual-playtest");
const manualPlaytestTimeoutMs = 20 * 60 * 1000;
const requiredPorts = [
  { port: 3000, label: "server" },
  { port: 5173, label: "client" }
];

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function assertRequiredPortsAvailable() {
  const unavailablePorts = [];
  for (const requiredPort of requiredPorts) {
    if (!(await isPortAvailable(requiredPort.port))) {
      unavailablePorts.push(requiredPort);
    }
  }

  if (unavailablePorts.length > 0) {
    const ports = unavailablePorts.map((entry) => `${entry.label}:${entry.port}`).join(", ");
    console.error(`[dev] Required port(s) already in use: ${ports}`);
    console.error("[dev] Stop the existing dev/playtest process before starting a new session.");
    process.exit(1);
  }
}

function runNpmScript(scriptName) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm run ${scriptName}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  }
  return spawn("npm", ["run", scriptName], { stdio: ["ignore", "pipe", "pipe"] });
}

await assertRequiredPortsAvailable();

const children = [
  runNpmScript("dev:server"),
  runNpmScript("dev:client")
];

let shuttingDown = false;
let stopPromise = null;

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
  if (stopPromise) {
    return stopPromise;
  }

  stopPromise = (async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      stopChildTree(child);
    }
  })().finally(() => {
    process.exit(exitCode);
  });

  return stopPromise;
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
      void stopAll(code ?? 1);
    }
  });
}

process.on("SIGINT", () => {
  void stopAll(0);
});
process.on("SIGTERM", () => {
  void stopAll(0);
});
process.on("uncaughtException", (error) => {
  console.error(`[dev] uncaught exception: ${error instanceof Error ? error.message : String(error)}`);
  void stopAll(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[dev] unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  void stopAll(1);
});

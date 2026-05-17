import { spawn, spawnSync } from "node:child_process";

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

import { spawn } from "node:child_process";

function runNpmScript(scriptName) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm run ${scriptName}`], { stdio: ["ignore", "pipe", "pipe"] });
  }
  return spawn("npm", ["run", scriptName], { stdio: ["ignore", "pipe", "pipe"] });
}

const children = [
  runNpmScript("dev:server"),
  runNpmScript("dev:client")
];

let shuttingDown = false;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(exitCode);
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

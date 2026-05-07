import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const SERVER_PORT = process.env.DEV_ACCEPT_SERVER_PORT ?? "3415";
const CLIENT_PORT = process.env.DEV_ACCEPT_CLIENT_PORT ?? "5185";
const SELF_TEST_MS = Number.parseInt(process.env.DEV_ACCEPT_SELF_TEST_MS ?? "0", 10);
const REUSE_EXISTING = process.env.DEV_ACCEPT_REUSE === "1";
const HOST = "127.0.0.1";
const RUN_ID = sanitizeRunId(
  process.env.DEV_ACCEPT_RUN_ID ??
    `${new Date().toISOString().replace(/[:.]/g, "-")}-s${SERVER_PORT}-c${CLIENT_PORT}`
);
const artifactRoot = resolve(".codex-artifacts", "dev-acceptance");
const artifactDir = resolve(artifactRoot, RUN_ID);
const profileStorePath = resolve(artifactDir, `profiles-${SERVER_PORT}.json`);

mkdirSync(artifactDir, { recursive: true });

const serverUrl = `http://${HOST}:${SERVER_PORT}`;
const clientBaseUrl = `http://${HOST}:${CLIENT_PORT}`;
const envBase = { ...process.env };
const isWindows = process.platform === "win32";
const serverLogPath = resolve(artifactDir, `server-${SERVER_PORT}.log`);
const clientLogPath = resolve(artifactDir, `client-${CLIENT_PORT}.log`);
const launcherLogPath = resolve(artifactDir, "launcher.log");

const occupiedPorts = [
  { name: "server", port: SERVER_PORT, pids: getListeningPids(SERVER_PORT) },
  { name: "client", port: CLIENT_PORT, pids: getListeningPids(CLIENT_PORT) }
].filter((entry) => entry.pids.length > 0);

if (occupiedPorts.length > 0 && !REUSE_EXISTING) {
  const lines = [
    "[dev-acceptance] refused to start because target port(s) are already in use",
    ...occupiedPorts.map(
      (entry) => `${entry.name} port ${entry.port} occupied by PID(s): ${entry.pids.join(", ")}`
    ),
    "set DEV_ACCEPT_SERVER_PORT / DEV_ACCEPT_CLIENT_PORT to unused ports for a clean run",
    "or set DEV_ACCEPT_REUSE=1 to explicitly reuse an existing environment"
  ];
  writeFileSync(launcherLogPath, `${lines.join("\n")}\n`, "utf8");
  console.error(lines.join("\n"));
  process.exit(1);
}

if (REUSE_EXISTING) {
  const lines = [
    "[dev-acceptance] reusing existing dev acceptance environment",
    `run id: ${RUN_ID}`,
    `server url: ${serverUrl}`,
    `client base url: ${clientBaseUrl}`,
    `boss preset url: ${clientBaseUrl}/?devRoomPreset=boss`,
    `extract preset url: ${clientBaseUrl}/?devRoomPreset=extract`,
    ...occupiedPorts.map(
      (entry) => `${entry.name} port ${entry.port} existing PID(s): ${entry.pids.join(", ")}`
    ),
    `launcher log: ${launcherLogPath}`
  ];
  writeFileSync(launcherLogPath, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));
  process.exit(0);
}

const server = spawnNpm(["run", "dev", "--workspace", "server"], {
  cwd: process.cwd(),
  env: {
    ...envBase,
    PORT: SERVER_PORT,
    ENABLE_TEST_HOOKS: "1",
    CLIENT_ORIGIN: `${clientBaseUrl},http://localhost:${CLIENT_PORT}`,
    PROFILE_STORE_PATH: profileStorePath
  },
  stdio: [
    "ignore",
    "pipe",
    "pipe"
  ],
  windowsHide: true
});

const client = spawnNpm(["run", "dev", "--workspace", "client", "--", "--host", HOST, "--port", CLIENT_PORT, "--strictPort"], {
  cwd: process.cwd(),
  env: {
    ...envBase,
    VITE_SERVER_URL: serverUrl
  },
  stdio: [
    "ignore",
    "pipe",
    "pipe"
  ],
  windowsHide: true
});

const serverLog = writeLog(serverLogPath);
const clientLog = writeLog(clientLogPath);
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
client.stdout.pipe(clientLog);
client.stderr.pipe(clientLog);

const lines = [
  "[dev-acceptance] started fixed dev preset launcher",
  `run id: ${RUN_ID}`,
  `server pid: ${server.pid}`,
  `client pid: ${client.pid}`,
  `server url: ${serverUrl}`,
  `client base url: ${clientBaseUrl}`,
  `boss preset url: ${clientBaseUrl}/?devRoomPreset=boss`,
  `extract preset url: ${clientBaseUrl}/?devRoomPreset=extract`,
  `env PORT=${SERVER_PORT}`,
  "env ENABLE_TEST_HOOKS=1",
  `env CLIENT_ORIGIN=${clientBaseUrl},http://localhost:${CLIENT_PORT}`,
  `env VITE_SERVER_URL=${serverUrl}`,
  `env PROFILE_STORE_PATH=${profileStorePath}`,
  SELF_TEST_MS > 0 ? `env DEV_ACCEPT_SELF_TEST_MS=${SELF_TEST_MS}` : undefined,
  `artifact dir: ${artifactDir}`,
  `profile store: ${profileStorePath}`,
  `server log: ${serverLogPath}`,
  `client log: ${clientLogPath}`,
  `launcher log: ${launcherLogPath}`,
  "stop: Ctrl+C in this launcher terminal"
];

const printableLines = lines.filter((line) => line !== undefined);
writeFileSync(launcherLogPath, `${printableLines.join("\n")}\n`, "utf8");
console.log(printableLines.join("\n"));

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  killProcessTree(server.pid);
  killProcessTree(client.pid);
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
process.on("exit", () => {
  shutdown();
});
if (SELF_TEST_MS > 0) {
  setTimeout(() => {
    shutdown();
    process.exit(0);
  }, SELF_TEST_MS);
}
server.on("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    console.error(`[dev-acceptance] server exited with code ${code}`);
    shutdown();
    process.exitCode = code ?? 1;
  }
});
client.on("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    console.error(`[dev-acceptance] client exited with code ${code}`);
    shutdown();
    process.exitCode = code ?? 1;
  }
});
server.on("error", (error) => {
  console.error(`[dev-acceptance] server failed to start: ${error.message}`);
  shutdown();
  process.exitCode = 1;
});
client.on("error", (error) => {
  console.error(`[dev-acceptance] client failed to start: ${error.message}`);
  shutdown();
  process.exitCode = 1;
});

function writeLog(path) {
  return createWriteStream(path, { flags: "w" });
}

function spawnNpm(args, options) {
  return isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", "npm", ...args], options)
    : spawn("npm", args, options);
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (isWindows) {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
}

function sanitizeRunId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function getListeningPids(port) {
  const portNumber = Number.parseInt(String(port), 10);
  if (!Number.isInteger(portNumber) || portNumber <= 0 || portNumber > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  if (isWindows) {
    const powershell = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${portNumber} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`
      ],
      { encoding: "utf8", windowsHide: true }
    );
    const pids = parsePids(powershell.stdout);
    if (pids.length > 0) {
      return pids;
    }

    const netstat = spawnSync("netstat.exe", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      windowsHide: true
    });
    return parseNetstatPids(netstat.stdout, portNumber);
  }

  const lsof = spawnSync("lsof", [`-tiTCP:${portNumber}`, "-sTCP:LISTEN"], {
    encoding: "utf8"
  });
  return parsePids(lsof.stdout);
}

function parsePids(output) {
  return [...new Set(String(output).match(/\b\d+\b/g) ?? [])];
}

function parseNetstatPids(output, portNumber) {
  const pids = [];
  for (const line of String(output).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0].toUpperCase() !== "TCP") {
      continue;
    }
    const [localAddress, state, pid] = [parts[1], parts[3], parts[4]];
    if (state.toUpperCase() === "LISTENING" && localAddress.endsWith(`:${portNumber}`)) {
      pids.push(pid);
    }
  }
  return [...new Set(pids)];
}

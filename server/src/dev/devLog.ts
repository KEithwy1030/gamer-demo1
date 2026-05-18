import { appendFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DevLogCategory =
  | "AUDIO"
  | "COMBAT"
  | "CHEST"
  | "UI"
  | "PLAYER"
  | "NET"
  | "EXTRACT"
  | "GENERAL";

export interface DevLogEntry {
  t: number;
  category: DevLogCategory;
  event: string;
  data?: Record<string, unknown>;
}

export interface DevLogRuntimeConfig {
  enabled: boolean;
  retentionHours: number;
  maxTotalMb: number;
}

interface SweepOptions {
  dirPath?: string;
  retentionHours: number;
  maxTotalMb: number;
  nowMs?: number;
  logger?: Pick<Console, "warn">;
}

interface DevLogFileInfo {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
}

const DEV_LOG_DIR_PATH = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)), ".devlog");
const LATEST_LOG_FILE_NAME = "latest.jsonl";
const SESSION_FILE_PREFIX = "session-";
const SESSION_GAP_MS = 5 * 60 * 1000;
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  "AUDIO",
  "COMBAT",
  "CHEST",
  "UI",
  "PLAYER",
  "NET",
  "EXTRACT",
  "GENERAL"
]);

export class DevLogService {
  private currentSessionStartedAt = Date.now();
  private currentSessionFileName = buildSessionFileName(this.currentSessionStartedAt);
  private lastAppendAt = 0;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: DevLogRuntimeConfig,
    private readonly logger: Pick<Console, "warn"> = console
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getDirectoryPath(): string {
    return DEV_LOG_DIR_PATH;
  }

  startRetentionSweepLoop(): NodeJS.Timeout | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    void this.runRetentionSweep();
    return setInterval(() => {
      void this.runRetentionSweep();
    }, RETENTION_SWEEP_INTERVAL_MS);
  }

  async runRetentionSweep(nowMs = Date.now()): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    await sweepDevLogFiles({
      dirPath: DEV_LOG_DIR_PATH,
      retentionHours: this.config.retentionHours,
      maxTotalMb: this.config.maxTotalMb,
      nowMs,
      logger: this.logger
    });
  }

  async appendEntries(entries: DevLogEntry[]): Promise<void> {
    if (!this.config.enabled) {
      throw new Error("Dev log is disabled.");
    }

    if (entries.length === 0) {
      return;
    }

    const operation = async () => {
      await mkdir(DEV_LOG_DIR_PATH, { recursive: true });

      const now = Date.now();
      const shouldRotateSession = this.lastAppendAt === 0 || now - this.lastAppendAt > SESSION_GAP_MS;
      if (shouldRotateSession) {
        this.currentSessionStartedAt = this.lastAppendAt === 0 ? this.currentSessionStartedAt : now;
        this.currentSessionFileName = buildSessionFileName(this.currentSessionStartedAt);
      }

      const batchText = serializeEntries(entries);
      const sessionPath = path.join(DEV_LOG_DIR_PATH, this.currentSessionFileName);
      const latestPath = path.join(DEV_LOG_DIR_PATH, LATEST_LOG_FILE_NAME);

      await appendFile(sessionPath, batchText, "utf8");
      if (shouldRotateSession) {
        await writeFile(latestPath, batchText, "utf8");
      } else {
        await appendFile(latestPath, batchText, "utf8");
      }

      this.lastAppendAt = now;
    };

    const result = this.writeChain.then(operation, operation);
    this.writeChain = result.catch((error) => {
      this.logger.warn("[devlog] failed to append batch", error);
    });
    await result;
  }
}

export async function sweepDevLogFiles(options: SweepOptions): Promise<void> {
  const dirPath = options.dirPath ?? DEV_LOG_DIR_PATH;
  const logger = options.logger ?? console;
  const nowMs = options.nowMs ?? Date.now();
  const retentionCutoffMs = nowMs - options.retentionHours * 60 * 60 * 1000;
  const maxTotalBytes = options.maxTotalMb * 1024 * 1024;

  await mkdir(dirPath, { recursive: true });

  let files = await listDevLogFiles(dirPath);
  const expiredFiles = files.filter((file) => file.name !== LATEST_LOG_FILE_NAME && file.mtimeMs < retentionCutoffMs);
  for (const file of expiredFiles) {
    try {
      await rm(file.path, { force: true });
    } catch (error) {
      logger.warn(`[devlog] failed to delete expired file ${file.name}`, error);
    }
  }

  files = await listDevLogFiles(dirPath);
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes <= maxTotalBytes) {
    return;
  }

  const removableFiles = files
    .filter((file) => file.name !== LATEST_LOG_FILE_NAME)
    .sort((left, right) => left.mtimeMs - right.mtimeMs);

  for (const file of removableFiles) {
    if (totalBytes <= maxTotalBytes) {
      break;
    }

    try {
      await rm(file.path, { force: true });
      totalBytes -= file.size;
    } catch (error) {
      logger.warn(`[devlog] failed to delete retained file ${file.name}`, error);
    }
  }
}

export function isValidDevLogEntry(value: unknown): value is DevLogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<DevLogEntry>;
  if (!Number.isFinite(entry.t)) {
    return false;
  }

  if (typeof entry.category !== "string" || !VALID_CATEGORIES.has(entry.category)) {
    return false;
  }

  if (typeof entry.event !== "string" || entry.event.trim() === "") {
    return false;
  }

  if (entry.data === undefined) {
    return true;
  }

  return isPlainObject(entry.data);
}

export function getDevLogDirectoryPath(): string {
  return DEV_LOG_DIR_PATH;
}

function buildSessionFileName(startedAtMs: number): string {
  return `${SESSION_FILE_PREFIX}${formatUtcTimestamp(startedAtMs)}.jsonl`;
}

function formatUtcTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  const seconds = pad2(date.getUTCSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function serializeEntries(entries: DevLogEntry[]): string {
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

async function listDevLogFiles(dirPath: string): Promise<DevLogFileInfo[]> {
  const dirEntries = await readdir(dirPath, { withFileTypes: true });
  const files = dirEntries.filter((entry) => entry.isFile());
  const results = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dirPath, file.name);
      const fileStat = await stat(filePath);
      return {
        name: file.name,
        path: filePath,
        size: fileStat.size,
        mtimeMs: fileStat.mtimeMs
      } satisfies DevLogFileInfo;
    })
  );
  return results.sort((left, right) => left.mtimeMs - right.mtimeMs);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

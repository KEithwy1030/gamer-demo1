export type LogCategory = "AUDIO" | "COMBAT" | "CHEST" | "UI" | "PLAYER" | "NET" | "EXTRACT" | "GENERAL";

export interface LogEntry {
  t: number;
  category: LogCategory;
  event: string;
  data?: Record<string, unknown>;
}

const LOG_BUFFER_CAPACITY = 1000;
const DEV_LOG_QUERY_KEY = "devLog";
const DEV_LOG_STORAGE_KEY = "gamer.devLog";
const DOWNLOAD_PREFIX = "gamer-runtime-log";

const moduleStartTime = getNow();
const enabled = detectEnabled();
const logBuffer: LogEntry[] = [];

export function logEvent(category: LogCategory, event: string, data?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }

  logBuffer.push({
    t: Math.max(0, Math.round(getNow() - moduleStartTime)),
    category,
    event,
    data
  });

  if (logBuffer.length > LOG_BUFFER_CAPACITY) {
    logBuffer.splice(0, logBuffer.length - LOG_BUFFER_CAPACITY);
  }
}

export function getLog(): LogEntry[] {
  return logBuffer.map((entry) => ({
    ...entry,
    data: entry.data ? { ...entry.data } : undefined
  }));
}

export function clearLog(): void {
  if (!enabled) {
    return;
  }

  logBuffer.length = 0;
}

export function exportLog(): string {
  return JSON.stringify(getLog());
}

export function downloadLog(filename = buildFilename()): void {
  if (!enabled || typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }

  const blob = new Blob([exportLog()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function isEnabled(): boolean {
  return enabled;
}

function detectEnabled(): boolean {
  if (isDevBuild()) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const devLogParam = safeReadUrlParam(DEV_LOG_QUERY_KEY);
  if (devLogParam === "1") {
    return true;
  }

  return safeReadLocalStorage(DEV_LOG_STORAGE_KEY) === "1";
}

function isDevBuild(): boolean {
  const meta = import.meta as ImportMeta & {
    env?: {
      DEV?: boolean;
    };
  };

  return meta.env?.DEV === true;
}

function safeReadUrlParam(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

function safeReadLocalStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function getNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function buildFilename(): string {
  const elapsedMs = Math.max(0, Math.round(getNow() - moduleStartTime));
  return `${DOWNLOAD_PREFIX}-${elapsedMs}ms.json`;
}


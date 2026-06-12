export type LogCategory = "AUDIO" | "COMBAT" | "CHEST" | "UI" | "PLAYER" | "NET" | "EXTRACT" | "GENERAL";

export interface LogEntry {
  t: number;
  category: LogCategory;
  event: string;
  data?: Record<string, unknown>;
}

const LOG_BUFFER_CAPACITY = 1000;
const FLUSH_QUEUE_CAPACITY = 500;
const FLUSH_TRIGGER_COUNT = 50;
const FLUSH_INTERVAL_MS = 2000;
const DEV_LOG_QUERY_KEY = "devLog";
const DEV_LOG_STORAGE_KEY = "gamer.devLog";
const DOWNLOAD_PREFIX = "gamer-runtime-log";
const DEV_LOG_ENDPOINT_PATH = "/__devlog/append";

const moduleStartTime = getNow();
const enabled = detectEnabled();
const logBuffer: LogEntry[] = [];
const transportState = getTransportState();

// Expose debug surface — agents can drive __DEVLOG__ via Chrome DevTools MCP to verify chain
if (typeof window !== "undefined") {
  (window as unknown as { __DEVLOG__?: unknown }).__DEVLOG__ = {
    isEnabled,
    getLog,
    logEvent,
    getDevLogEndpoint,
    enabledFlag: enabled,
    importMetaEnv: (import.meta as unknown as { env?: unknown }).env
  };
}

if (enabled) {
  installTransport();
  // One-time boot event so agents can confirm log chain is alive without needing player input
  logEvent("GENERAL", "client.boot", {
    enabled,
    endpoint: getDevLogEndpoint(),
    hasFetch: typeof fetch === "function",
    hasBeacon: typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
  });
}

export function logEvent(category: LogCategory, event: string, data?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }

  const entry: LogEntry = {
    t: Math.max(0, Math.round(getNow() - moduleStartTime)),
    category,
    event,
    data
  };

  logBuffer.push(entry);
  enqueueForFlush(entry);

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
  transportState.flushQueue.length = 0;
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

/**
 * 调试面板（log 计数 / Copy / Download 按钮）是否被显式请求。
 * 日志采集在 dev 构建下默认开启（验收链依赖），但浮在玩家画面上的
 * 面板必须显式 ?devLog=1 或 localStorage 开启——游戏画面不许出现开发元素。
 */
export function isPanelRequested(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (safeReadUrlParam(DEV_LOG_QUERY_KEY) === "1") {
    return true;
  }
  return safeReadLocalStorage(DEV_LOG_STORAGE_KEY) === "1";
}

export function getDevLogEndpoint(): string {
  const meta = import.meta as ImportMeta & {
    env?: {
      VITE_SERVER_URL?: string;
    };
  };

  const baseUrl = meta.env?.VITE_SERVER_URL?.trim() || "http://localhost:5289";
  return `${baseUrl.replace(/\/+$/, "")}${DEV_LOG_ENDPOINT_PATH}`;
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

function installTransport(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (transportState.flushIntervalId == null) {
    transportState.flushIntervalId = window.setInterval(() => {
      void flushQueueToServer();
    }, FLUSH_INTERVAL_MS);
  }

  if (!transportState.unloadHandlerInstalled) {
    window.addEventListener("beforeunload", flushQueueOnUnload, { capture: true });
    transportState.unloadHandlerInstalled = true;
  }
}

function enqueueForFlush(entry: LogEntry): void {
  transportState.flushQueue.push(entry);
  if (transportState.flushQueue.length > FLUSH_QUEUE_CAPACITY) {
    transportState.flushQueue.splice(0, transportState.flushQueue.length - FLUSH_QUEUE_CAPACITY);
  }

  if (transportState.flushQueue.length >= FLUSH_TRIGGER_COUNT) {
    void flushQueueToServer();
  }
}

async function flushQueueToServer(): Promise<boolean> {
  if (!enabled || transportState.flushInFlight || transportState.flushQueue.length === 0 || typeof fetch !== "function") {
    return false;
  }

  const batch = transportState.flushQueue.slice();
  transportState.flushInFlight = true;

  try {
    const response = await fetch(getDevLogEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ entries: batch })
    });

    if (!response.ok) {
      return false;
    }

    transportState.flushQueue.splice(0, batch.length);
    return true;
  } catch {
    return false;
  } finally {
    transportState.flushInFlight = false;
  }
}

function flushQueueOnUnload(): void {
  if (!enabled || transportState.flushQueue.length === 0) {
    return;
  }

  const payload = JSON.stringify({ entries: transportState.flushQueue });
  const endpoint = getDevLogEndpoint();
  if (trySendBeacon(endpoint, payload)) {
    transportState.flushQueue.length = 0;
    return;
  }

  if (sendSyncRequest(endpoint, payload)) {
    transportState.flushQueue.length = 0;
  }
}

function trySendBeacon(endpoint: string, payload: string): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }

  try {
    return navigator.sendBeacon(
      endpoint,
      new Blob([payload], { type: "application/json;charset=utf-8" })
    );
  } catch {
    return false;
  }
}

function sendSyncRequest(endpoint: string, payload: string): boolean {
  if (typeof XMLHttpRequest === "undefined") {
    return false;
  }

  try {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint, false);
    request.setRequestHeader("Content-Type", "application/json;charset=utf-8");
    request.send(payload);
    return request.status >= 200 && request.status < 300;
  } catch {
    return false;
  }
}

function getTransportState(): RuntimeLogTransportState {
  const runtime = globalThis as typeof globalThis & {
    __gamerRuntimeLogTransport__?: RuntimeLogTransportState;
  };

  if (!runtime.__gamerRuntimeLogTransport__) {
    runtime.__gamerRuntimeLogTransport__ = {
      flushQueue: [],
      flushInFlight: false,
      flushIntervalId: null,
      unloadHandlerInstalled: false
    };
  }

  return runtime.__gamerRuntimeLogTransport__;
}

interface RuntimeLogTransportState {
  flushQueue: LogEntry[];
  flushInFlight: boolean;
  flushIntervalId: number | null;
  unloadHandlerInstalled: boolean;
}

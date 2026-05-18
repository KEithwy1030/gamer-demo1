import dotenv from "dotenv";
import {
  DEFAULT_ROOM_CAPACITY,
  MAX_ROOM_CAPACITY,
  MIN_ROOM_CAPACITY,
  SERVER_PLAYER_SYNC_HZ
} from "./internal-constants.js";
import { createCorsOriginResolver } from "./cors.js";

dotenv.config();

const DEFAULT_PORT = 5289;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_SOCKET_PING_INTERVAL_MS = 25_000;
const DEFAULT_SOCKET_PING_TIMEOUT_MS = 60_000;
const DEFAULT_SOCKET_CONNECT_TIMEOUT_MS = 45_000;
const DEFAULT_DEV_LOG_RETENTION_HOURS = 24;
const DEFAULT_DEV_LOG_MAX_TOTAL_MB = 50;

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOrigins(value: string | undefined): string[] | boolean {
  if (!value || value.trim() === "") {
    return true;
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
}

function shouldAllowLoopbackOrigins(): boolean {
  return process.env.ENABLE_TEST_HOOKS === "1"
    || process.env.NODE_ENV === "development"
    || process.env.NODE_ENV === "test";
}

export const serverConfig = {
  port: parseInteger(process.env.PORT, DEFAULT_PORT),
  host: process.env.HOST?.trim() || DEFAULT_HOST,
  corsOrigin: createCorsOriginResolver(
    parseOrigins(process.env.CLIENT_ORIGIN),
    shouldAllowLoopbackOrigins()
  ),
  socketPingIntervalMs: parseInteger(
    process.env.SOCKET_PING_INTERVAL_MS,
    DEFAULT_SOCKET_PING_INTERVAL_MS
  ),
  socketPingTimeoutMs: parseInteger(
    process.env.SOCKET_PING_TIMEOUT_MS,
    DEFAULT_SOCKET_PING_TIMEOUT_MS
  ),
  socketConnectTimeoutMs: parseInteger(
    process.env.SOCKET_CONNECT_TIMEOUT_MS,
    DEFAULT_SOCKET_CONNECT_TIMEOUT_MS
  ),
  playerSyncHz: parseInteger(process.env.PLAYER_SYNC_HZ, SERVER_PLAYER_SYNC_HZ),
  defaultRoomCapacity: parseInteger(
    process.env.DEFAULT_ROOM_CAPACITY,
    DEFAULT_ROOM_CAPACITY
  ),
  minRoomCapacity: parseInteger(process.env.MIN_ROOM_CAPACITY, MIN_ROOM_CAPACITY),
  maxRoomCapacity: parseInteger(process.env.MAX_ROOM_CAPACITY, MAX_ROOM_CAPACITY),
  devLogEnabled: parseBoolean(process.env.GAMER_DEV_LOG, process.env.NODE_ENV !== "production"),
  devLogRetentionHours: parsePositiveNumber(
    process.env.GAMER_DEVLOG_RETENTION_HOURS,
    DEFAULT_DEV_LOG_RETENTION_HOURS
  ),
  devLogMaxTotalMb: parsePositiveNumber(
    process.env.GAMER_DEVLOG_MAX_TOTAL_MB,
    DEFAULT_DEV_LOG_MAX_TOTAL_MB
  )
};

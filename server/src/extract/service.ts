import type { SettlementPayload } from "../../../shared/dist/types/game.js";
import {
  EXTRACT_CHANNEL_DURATION_MS,
  EXTRACT_CENTER_RADIUS,
  EXTRACT_OPEN_SEC,
  MATCH_DURATION_SEC,
  MATCH_MAP_HEIGHT,
  MATCH_MAP_WIDTH
} from "../internal-constants.js";
import type {
  ExtractOpenedPayload,
  ExtractProgressPayload,
  ExtractSuccessPayload,
  MatchSettlementEnvelope,
  RuntimePlayer,
  RuntimeRoom
} from "../types.js";

interface ExtractUpdateResult {
  opened?: ExtractOpenedPayload;
  progressEvents: ExtractProgressPayload[];
  successEvents: ExtractSuccessPayload[];
  settlementEvents: MatchSettlementEnvelope[];
  shouldCloseRoom: boolean;
}

type ExtractInterruptReason = "damaged" | "left_zone" | "dead" | "timeout";

const PROGRESS_BROADCAST_INTERVAL_MS = 250;

export function initializeExtractState(room: RuntimeRoom): void {
  room.extract ??= {
    centerX: MATCH_MAP_WIDTH / 2,
    centerY: MATCH_MAP_HEIGHT / 2,
    radius: EXTRACT_CENTER_RADIUS,
    channelDurationMs: EXTRACT_CHANNEL_DURATION_MS,
    openAtSec: EXTRACT_OPEN_SEC,
    isOpen: false
  };

  for (const player of room.players.values()) {
    player.extract ??= {};
  }
}

export function startPlayerExtract(room: RuntimeRoom, playerId: string, now = Date.now()): ExtractUpdateResult {
  initializeExtractState(room);
  const player = getRuntimePlayer(room, playerId);
  const opened = openExtractIfReady(room, now);

  if (room.extract?.matchEndedAt) {
    throw new Error("Match is already settled.");
  }

  if (!room.extract?.isOpen) {
    throw new Error("Extract is not open yet.");
  }

  if (!player.state?.isAlive) {
    throw new Error("Dead players cannot extract.");
  }

  if (player.extract?.settledAt) {
    throw new Error("Player already settled.");
  }

  if (!isInsideExtractZone(room, player)) {
    throw new Error("Player must stand inside the extract zone.");
  }

  player.extract = {
    ...player.extract,
    startedAt: now,
    completesAt: now + room.extract.channelDurationMs,
    lastProgressBroadcastAt: now
  };

  return {
    opened,
    progressEvents: [buildProgressPayload(room, player, "started", room.extract.channelDurationMs)],
    successEvents: [],
    settlementEvents: [],
    shouldCloseRoom: false
  };
}

export function interruptPlayerExtract(
  room: RuntimeRoom,
  playerId: string,
  reason: ExtractInterruptReason,
  now = Date.now()
): ExtractProgressPayload | undefined {
  initializeExtractState(room);
  const player = room.players.get(playerId);
  if (!player?.extract?.completesAt || player.extract.settledAt) {
    return undefined;
  }

  player.extract.startedAt = undefined;
  player.extract.completesAt = undefined;
  player.extract.lastProgressBroadcastAt = now;

  return buildProgressPayload(room, player, "interrupted", 0, reason);
}

export function advanceExtractState(room: RuntimeRoom, now = Date.now()): ExtractUpdateResult {
  initializeExtractState(room);

  const opened = openExtractIfReady(room, now);
  const progressEvents: ExtractProgressPayload[] = [];
  const successEvents: ExtractSuccessPayload[] = [];
  const settlementEvents: MatchSettlementEnvelope[] = [];

  if (shouldForceTimeout(room, now)) {
    room.extract!.matchEndedAt = now;

    for (const player of room.players.values()) {
      const interruption = interruptPlayerExtract(room, player.id, "timeout", now);
      if (interruption) {
        progressEvents.push(interruption);
      }

      const settlement = settlePlayer(room, player, {
        now,
        result: "failure",
        reason: "timeout"
      });
      if (settlement) {
        settlementEvents.push(settlement);
      }
    }

    return {
      opened,
      progressEvents,
      successEvents,
      settlementEvents,
      shouldCloseRoom: true
    };
  }

  for (const player of room.players.values()) {
    if (player.extract?.settledAt) {
      continue;
    }

    if (player.state && !player.state.isAlive) {
      const interruption = interruptPlayerExtract(room, player.id, "dead", now);
      if (interruption) {
        progressEvents.push(interruption);
      }

      const settlement = settlePlayer(room, player, {
        now,
        result: "failure",
        reason: "killed"
      });
      if (settlement) {
        settlementEvents.push(settlement);
      }
      continue;
    }

    if (!player.extract?.completesAt) {
      continue;
    }

    if (!isInsideExtractZone(room, player)) {
      const interruption = interruptPlayerExtract(room, player.id, "left_zone", now);
      if (interruption) {
        progressEvents.push(interruption);
      }
      continue;
    }

    const remainingMs = Math.max(0, player.extract.completesAt - now);
    if (remainingMs > 0) {
      if (!player.extract.lastProgressBroadcastAt || now - player.extract.lastProgressBroadcastAt >= PROGRESS_BROADCAST_INTERVAL_MS) {
        player.extract.lastProgressBroadcastAt = now;
        progressEvents.push(buildProgressPayload(room, player, "progress", remainingMs));
      }
      continue;
    }

    const settlement = settlePlayer(room, player, {
      now,
      result: "success",
      reason: "extracted"
    });
    if (!settlement) {
      continue;
    }

    successEvents.push({
      roomCode: room.code,
      playerId: player.id,
      extractedAt: now,
      settlement: settlement.settlement
    });
    settlementEvents.push(settlement);
  }

  const shouldCloseRoom = room.extract!.matchEndedAt !== undefined || areAllPlayersSettled(room);
  if (shouldCloseRoom && !room.extract?.matchEndedAt) {
    room.extract!.matchEndedAt = now;
  }

  return {
    opened,
    progressEvents,
    successEvents,
    settlementEvents,
    shouldCloseRoom
  };
}

function openExtractIfReady(room: RuntimeRoom, now: number): ExtractOpenedPayload | undefined {
  if (!room.startedAt || !room.extract || room.extract.isOpen) {
    return undefined;
  }

  const elapsedSec = Math.floor((now - room.startedAt) / 1000);
  if (elapsedSec < room.extract.openAtSec) {
    return undefined;
  }

  room.extract.isOpen = true;
  room.extract.openedAt = now;

  return {
    roomCode: room.code,
    x: room.extract.centerX,
    y: room.extract.centerY,
    radius: room.extract.radius,
    channelDurationMs: room.extract.channelDurationMs
  };
}

function shouldForceTimeout(room: RuntimeRoom, now: number): boolean {
  if (!room.startedAt || room.extract?.matchEndedAt) {
    return false;
  }

  return now - room.startedAt >= MATCH_DURATION_SEC * 1000;
}

function areAllPlayersSettled(room: RuntimeRoom): boolean {
  let hasPlayers = false;

  for (const player of room.players.values()) {
    hasPlayers = true;
    if (!player.extract?.settledAt) {
      return false;
    }
  }

  return hasPlayers;
}

function settlePlayer(
  room: RuntimeRoom,
  player: RuntimePlayer,
  outcome: {
    now: number;
    result: SettlementPayload["result"];
    reason: NonNullable<SettlementPayload["reason"]>;
  }
): MatchSettlementEnvelope | undefined {
  player.extract ??= {};
  if (player.extract.settledAt) {
    return undefined;
  }

  const settlement = buildSettlement(player, room, outcome);
  player.extract.settledAt = outcome.now;
  player.extract.settlement = settlement;
  player.extract.startedAt = undefined;
  player.extract.completesAt = undefined;
  player.extract.lastProgressBroadcastAt = undefined;

  if (outcome.reason === "extracted" && player.state) {
    player.state.isAlive = false;
    player.deathLootDropped = true;
  }

  return {
    roomCode: room.code,
    playerId: player.id,
    settlement
  };
}

function buildSettlement(
  player: RuntimePlayer,
  room: RuntimeRoom,
  outcome: {
    now: number;
    result: SettlementPayload["result"];
    reason: NonNullable<SettlementPayload["reason"]>;
  }
): SettlementPayload {
  const survivedSeconds = room.startedAt
    ? Math.max(0, Math.floor((outcome.now - room.startedAt) / 1000))
    : 0;

  if (outcome.result === "success") {
    const extractedItems = collectExtractedItems(player);
    return {
      result: "success",
      reason: outcome.reason,
      survivedSeconds,
      playerKills: player.combat?.killsPlayers ?? player.state?.killsPlayers ?? 0,
      monsterKills: player.state?.killsMonsters ?? 0,
      extractedGold: extractedItems.gold,
      extractedTreasureValue: extractedItems.treasureValue,
      extractedItems: extractedItems.names
    };
  }

  return {
    result: "failure",
    reason: outcome.reason,
    survivedSeconds,
    playerKills: player.combat?.killsPlayers ?? player.state?.killsPlayers ?? 0,
    monsterKills: player.state?.killsMonsters ?? 0,
    extractedGold: 0,
    extractedTreasureValue: 0,
    extractedItems: []
  };
}

function collectExtractedItems(player: RuntimePlayer): { gold: number; treasureValue: number; names: string[] } {
  const items = [
    ...(player.inventory?.items.map((entry) => entry.item) ?? []),
    ...Object.values(player.inventory?.equipment ?? {}).filter((item): item is NonNullable<typeof item> => Boolean(item))
  ];

  return {
    gold: items.reduce((sum, item) => sum + item.goldValue, 0),
    treasureValue: items.reduce((sum, item) => sum + item.treasureValue, 0),
    names: items.map((item) => item.name)
  };
}

function buildProgressPayload(
  room: RuntimeRoom,
  player: RuntimePlayer,
  status: ExtractProgressPayload["status"],
  remainingMs: number,
  reason?: ExtractProgressPayload["reason"]
): ExtractProgressPayload {
  return {
    roomCode: room.code,
    playerId: player.id,
    status,
    remainingMs,
    durationMs: room.extract?.channelDurationMs ?? EXTRACT_CHANNEL_DURATION_MS,
    reason
  };
}

function isInsideExtractZone(room: RuntimeRoom, player: RuntimePlayer): boolean {
  if (!room.extract || !player.state) {
    return false;
  }

  const distance = Math.hypot(
    player.state.x - room.extract.centerX,
    player.state.y - room.extract.centerY
  );

  return distance <= room.extract.radius;
}

function getRuntimePlayer(room: RuntimeRoom, playerId: string): RuntimePlayer {
  const player = room.players.get(playerId);
  if (!player) {
    throw new Error("Player not found in room.");
  }

  return player;
}

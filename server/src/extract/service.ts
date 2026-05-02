import type { SettlementPayload } from "@gamer/shared";
import {
  EXTRACT_CHANNEL_DURATION_MS,
  EXTRACT_CENTER_RADIUS,
  EXTRACT_OPEN_SEC,
  MATCH_DURATION_SEC
} from "../internal-constants.js";
import type {
  ExtractOpenedPayload,
  ExtractProgressPayload,
  ExtractSuccessPayload,
  MatchSettlementEnvelope,
  RuntimePlayer,
  RuntimeRoom,
  RuntimeRoomExtractZone
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
  const layoutZones = room.matchLayout?.extractZones ?? [];
  room.extract ??= {
    zones: layoutZones.map((zone) => ({
      ...zone,
      radius: zone.radius ?? EXTRACT_CENTER_RADIUS,
      channelDurationMs: zone.channelDurationMs ?? EXTRACT_CHANNEL_DURATION_MS,
      openAtSec: zone.openAtSec ?? EXTRACT_OPEN_SEC,
      isOpen: false
    }))
  };

  if (room.extract.zones.length === 0 && layoutZones.length > 0) {
    room.extract.zones = layoutZones.map((zone) => ({
      ...zone,
      radius: zone.radius ?? EXTRACT_CENTER_RADIUS,
      channelDurationMs: zone.channelDurationMs ?? EXTRACT_CHANNEL_DURATION_MS,
      openAtSec: zone.openAtSec ?? EXTRACT_OPEN_SEC,
      isOpen: false
    }));
  }

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

  const zone = resolveOccupiedExtractZone(room, player);
  if (!zone?.isOpen) {
    throw new Error("Extract is not open yet.");
  }

  if (!player.state?.isAlive) {
    throw new Error("Dead players cannot extract.");
  }

  if (player.extract?.settledAt) {
    throw new Error("Player already settled.");
  }

  if (
    player.extract?.zoneId === zone.zoneId
    && player.extract.completesAt
    && !player.extract.settledAt
  ) {
    return {
      opened,
      progressEvents: [],
      successEvents: [],
      settlementEvents: [],
      shouldCloseRoom: false
    };
  }

  player.extract = {
    ...player.extract,
    zoneId: zone.zoneId,
    startedAt: now,
    completesAt: now + zone.channelDurationMs,
    lastProgressBroadcastAt: now
  };

  return {
    opened,
    progressEvents: [buildProgressPayload(room, player, zone.zoneId, "started", zone.channelDurationMs)],
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
  if (!player?.extract?.completesAt || player.extract.settledAt || !player.extract.zoneId) {
    return undefined;
  }

  const zoneId = player.extract.zoneId;
  player.extract.startedAt = undefined;
  player.extract.completesAt = undefined;
  player.extract.lastProgressBroadcastAt = now;
  player.extract.zoneId = undefined;

  return buildProgressPayload(room, player, zoneId, "interrupted", 0, reason);
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

    if (player.extract?.completesAt && player.extract.zoneId) {
      const activeZone = room.extract?.zones.find((entry) => entry.zoneId === player.extract?.zoneId);
      if (activeZone && isInsideExtractZone(activeZone, player) && player.extract.completesAt <= now) {
        const settlement = settlePlayer(room, player, {
          now,
          result: 'success',
          reason: 'extracted'
        });
        if (!settlement) {
          continue;
        }

        successEvents.push({
          roomCode: room.code,
          playerId: player.id,
          zoneId: activeZone.zoneId,
          extractedAt: now,
          settlement: settlement.settlement
        });
        settlementEvents.push(settlement);
        continue;
      }
    }

    if (player.state && !player.state.isAlive) {
      const interruption = interruptPlayerExtract(room, player.id, "dead", now);
      if (interruption) {
        progressEvents.push(interruption);
      }

      const settlement = settlePlayer(room, player, {
        now,
        result: "failure",
        reason: player.deathReason === "corpseFog" ? "corpseFog" : "killed"
      });
      if (settlement) {
        settlementEvents.push(settlement);
      }
      continue;
    }

    if (!player.extract?.completesAt || !player.extract.zoneId) {
      continue;
    }

    const zone = room.extract?.zones.find((entry) => entry.zoneId === player.extract?.zoneId);
    if (!zone || !isInsideExtractZone(zone, player)) {
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
        progressEvents.push(buildProgressPayload(room, player, zone.zoneId, "progress", remainingMs));
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
      zoneId: zone.zoneId,
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
  if (!room.startedAt || !room.extract || room.extract.zones.every((zone) => zone.isOpen)) {
    return undefined;
  }

  const elapsedSec = Math.floor((now - room.startedAt) / 1000);
  const zonesToOpen = room.extract.zones.filter((zone) => !zone.isOpen && elapsedSec >= zone.openAtSec);
  if (zonesToOpen.length === 0) {
    return undefined;
  }

  for (const zone of zonesToOpen) {
    zone.isOpen = true;
    zone.openedAt = now;
  }

  return {
    roomCode: room.code,
    zones: room.extract.zones.map((zone) => ({
      zoneId: zone.zoneId,
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      channelDurationMs: zone.channelDurationMs,
      openAtSec: zone.openAtSec,
      isOpen: zone.isOpen
    }))
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
  player.extract.zoneId = undefined;

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
      extractedItems: extractedItems.names,
      retainedItems: extractedItems.names,
      lostItems: [],
      loadoutLost: false,
      profileGoldDelta: extractedItems.gold + extractedItems.treasureValue
    };
  }

  const lostItems = collectAllItemNames(player);
  return {
    result: "failure",
    reason: outcome.reason,
    survivedSeconds,
    playerKills: player.combat?.killsPlayers ?? player.state?.killsPlayers ?? 0,
    monsterKills: player.state?.killsMonsters ?? 0,
    extractedGold: 0,
    extractedTreasureValue: 0,
    extractedItems: [],
    retainedItems: [],
    lostItems,
    loadoutLost: lostItems.length > 0,
    profileGoldDelta: 0
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

function collectAllItemNames(player: RuntimePlayer): string[] {
  return [
    ...(player.inventory?.items.map((entry) => entry.item.name) ?? []),
    ...Object.values(player.inventory?.equipment ?? {})
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => item.name)
  ];
}

function buildProgressPayload(
  room: RuntimeRoom,
  player: RuntimePlayer,
  zoneId: string,
  status: ExtractProgressPayload["status"],
  remainingMs: number,
  reason?: ExtractProgressPayload["reason"]
): ExtractProgressPayload {
  const zone = room.extract?.zones.find((entry) => entry.zoneId === zoneId);
  return {
    roomCode: room.code,
    playerId: player.id,
    zoneId,
    status,
    remainingMs,
    durationMs: zone?.channelDurationMs ?? EXTRACT_CHANNEL_DURATION_MS,
    reason
  };
}

function resolveOccupiedExtractZone(room: RuntimeRoom, player: RuntimePlayer): RuntimeRoomExtractZone | undefined {
  if (!room.extract || !player.state) {
    return undefined;
  }
  return room.extract.zones.find((zone) => isInsideExtractZone(zone, player));
}

function isInsideExtractZone(zone: RuntimeRoomExtractZone, player: RuntimePlayer): boolean {
  if (!player.state) {
    return false;
  }
  const distance = Math.hypot(player.state.x - zone.x, player.state.y - zone.y);
  return distance <= zone.radius;
}

function getRuntimePlayer(room: RuntimeRoom, playerId: string): RuntimePlayer {
  const player = room.players.get(playerId);
  if (!player) {
    throw new Error("Player not found in room.");
  }
  return player;
}

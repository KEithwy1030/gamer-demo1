import type { ExtractSquadStatus, SettlementPayload, SquadId } from "@gamer/shared";
import {
  EXTRACT_CHANNEL_DURATION_MS,
  EXTRACT_CENTER_RADIUS,
  EXTRACT_OPEN_SEC,
  MATCH_DURATION_SEC
} from "../internal-constants.js";
import { InventoryService } from "../inventory/service.js";
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
type ExtractZoneCheckMode = "start" | "continue" | "default";

const PROGRESS_BROADCAST_INTERVAL_MS = 250;
const EXTRACT_START_INSET_MIN = 10;
const EXTRACT_START_INSET_MAX = 16;
const EXTRACT_LEAVE_GRACE_MIN = 8;
const EXTRACT_LEAVE_GRACE_MAX = 14;
const inventoryService = new InventoryService();

export function initializeExtractState(room: RuntimeRoom): void {
  const layoutZones = room.matchLayout?.extractZones ?? [];
  room.extract ??= {
    zones: layoutZones.map((zone) => ({
      ...zone,
      radius: zone.radius ?? EXTRACT_CENTER_RADIUS,
      channelDurationMs: zone.channelDurationMs ?? EXTRACT_CHANNEL_DURATION_MS,
      openAtSec: zone.openAtSec ?? EXTRACT_OPEN_SEC,
      isOpen: false
    })),
    carrier: {
      holderPlayerId: null,
      holderSquadId: null
    },
    activeSquadId: null,
    activeZoneId: null
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

  room.extract.carrier ??= {
    holderPlayerId: null,
    holderSquadId: null
  };
  room.extract.activeSquadId ??= null;
  room.extract.activeZoneId ??= null;

  syncExtractCarrier(room);

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

  if (!player.state?.isAlive) {
    throw new Error("Dead players cannot extract.");
  }

  if (player.extract?.settledAt) {
    throw new Error("Player already settled.");
  }

  const activeZone = player.extract?.zoneId
    ? room.extract?.zones.find((entry) => entry.zoneId === player.extract?.zoneId)
    : undefined;
  if (
    activeZone
    && player.extract?.completesAt
    && !player.extract.settledAt
    && isInsideExtractZone(activeZone, player, "continue")
  ) {
    return {
      opened: buildOpenedPayload(room),
      progressEvents: [],
      successEvents: [],
      settlementEvents: [],
      shouldCloseRoom: false
    };
  }

  const zone = resolveOccupiedExtractZone(room, player);
  if (!zone) {
    throw new Error("Player is not inside the extract zone.");
  }

  const activeSquadId = room.extract?.activeSquadId ?? null;
  const squadHolderId = room.extract?.carrier?.holderSquadId ?? null;
  const playerHasTorch = inventoryService.playerHasExtractKey(player);
  const canIgniteForSquad = playerHasTorch && (!activeSquadId || activeSquadId === player.squadId);

  if (!zone.isOpen) {
    if (!canIgniteForSquad) {
      throw new Error("Need the extract torch to ignite camp.");
    }
    openZoneForSquad(room, zone, player, now);
  }

  if (activeSquadId && activeSquadId !== player.squadId) {
    throw new Error("Extract is keyed to another squad.");
  }

  if (squadHolderId && squadHolderId !== player.squadId) {
    throw new Error("Extract is keyed to another squad.");
  }

  player.extract = {
    ...player.extract,
    zoneId: zone.zoneId,
    startedAt: now,
    completesAt: now + zone.channelDurationMs,
    lastProgressBroadcastAt: now
  };

  return {
    opened: buildOpenedPayload(room),
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
  syncExtractCarrier(room);

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
      opened: opened ?? buildOpenedPayload(room),
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
        reason: player.deathReason === "corpseFog" || player.deathReason === "riverHazard"
          ? player.deathReason
          : "killed"
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
    if (!zone || !isInsideExtractZone(zone, player, "continue")) {
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

    const success = settleSquadExtraction(room, player, zone, now);
    successEvents.push(...success.successEvents);
    settlementEvents.push(...success.settlementEvents);
  }

  const shouldCloseRoom = room.extract!.matchEndedAt !== undefined || areAllPlayersSettled(room);
  if (shouldCloseRoom && !room.extract?.matchEndedAt) {
    room.extract!.matchEndedAt = now;
  }

  return {
    opened: opened ?? buildOpenedPayload(room),
    progressEvents,
    successEvents,
    settlementEvents,
    shouldCloseRoom
  };
}

export function buildExtractOpenedPayload(room: RuntimeRoom): ExtractOpenedPayload {
  initializeExtractState(room);
  return buildOpenedPayload(room);
}

function settleSquadExtraction(
  room: RuntimeRoom,
  triggeringPlayer: RuntimePlayer,
  zone: RuntimeRoomExtractZone,
  now: number
): { successEvents: ExtractSuccessPayload[]; settlementEvents: MatchSettlementEnvelope[] } {
  const successEvents: ExtractSuccessPayload[] = [];
  const settlementEvents: MatchSettlementEnvelope[] = [];
  const squadId = room.extract?.activeSquadId ?? triggeringPlayer.squadId;
  const zoneId = room.extract?.activeZoneId ?? zone.zoneId;
  const eligibleMembers = getExtractEligibleSquadMembers(room, squadId, zoneId);

  for (const member of eligibleMembers) {
    const settlement = settlePlayer(room, member, {
      now,
      result: "success",
      reason: "extracted"
    });
    if (!settlement) {
      continue;
    }

    successEvents.push({
      roomCode: room.code,
      playerId: member.id,
      zoneId,
      extractedAt: now,
      settlement: settlement.settlement,
      squadStatus: buildSquadStatus(room)
    });
    settlementEvents.push(settlement);
  }

  return { successEvents, settlementEvents };
}

function openExtractIfReady(room: RuntimeRoom, now: number): ExtractOpenedPayload | undefined {
  if (!room.startedAt || !room.extract || room.extract.zones.every((zone) => zone.isOpen)) {
    return undefined;
  }

  const activeSquadId = room.extract.carrier?.holderSquadId ?? null;
  if (!activeSquadId) {
    return undefined;
  }

  const elapsedSec = Math.floor((now - room.startedAt) / 1000);
  const zonesToOpen = room.extract.zones.filter((zone) => !zone.isOpen && elapsedSec >= zone.openAtSec);
  if (zonesToOpen.length === 0) {
    return undefined;
  }

  room.extract.activeSquadId = activeSquadId;
  for (const zone of zonesToOpen) {
    zone.isOpen = true;
    zone.openedAt = now;
    room.extract.activeZoneId ??= zone.zoneId;
  }

  return buildOpenedPayload(room);
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
    inventoryService.removeNonExtractableItems(player);
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

function syncExtractCarrier(room: RuntimeRoom): void {
  if (!room.extract?.carrier) {
    return;
  }

  const holder = [...room.players.values()].find((player) => (
    player.state?.isAlive
    && inventoryService.playerHasExtractKey(player)
  ));

  room.extract.carrier.holderPlayerId = holder?.id ?? null;
  room.extract.carrier.holderSquadId = holder?.squadId ?? null;

  if (holder) {
    room.extract.activeSquadId ??= holder.squadId;
    return;
  }

  if (
    room.extract.activeSquadId
    && room.extract.activeZoneId
    && hasActiveExtractingSquad(room, room.extract.activeSquadId, room.extract.activeZoneId)
  ) {
    return;
  }

  room.extract.activeSquadId = null;
  room.extract.activeZoneId = null;
  for (const zone of room.extract.zones) {
    zone.isOpen = false;
    zone.openedAt = undefined;
  }
}

function hasActiveExtractingSquad(room: RuntimeRoom, squadId: SquadId, zoneId: string): boolean {
  return [...room.players.values()].some((player) => (
    player.squadId === squadId
    && player.state?.isAlive
    && !player.extract?.settledAt
    && player.extract?.zoneId === zoneId
    && Boolean(player.extract?.completesAt)
  ));
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
    reason,
    squadStatus: buildSquadStatus(room)
  };
}

function buildOpenedPayload(room: RuntimeRoom): ExtractOpenedPayload {
  return {
    roomCode: room.code,
    carrier: room.extract?.carrier,
    squadStatus: buildSquadStatus(room),
    zones: (room.extract?.zones ?? []).map((zone) => ({
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

function buildSquadStatus(room: RuntimeRoom): ExtractSquadStatus {
  const activeSquadId = room.extract?.activeSquadId ?? null;
  const activeZoneId = room.extract?.activeZoneId ?? null;
  const zone = activeZoneId
    ? room.extract?.zones.find((entry) => entry.zoneId === activeZoneId)
    : undefined;

  const members = [...room.players.values()]
    .filter((player) => activeSquadId !== null && player.squadId === activeSquadId)
    .map((player) => ({
      playerId: player.id,
      squadId: player.squadId,
      name: player.name,
      isAlive: player.state?.isAlive === true,
      isInsideZone: zone
        ? isInsideExtractZone(zone, player, player.extract?.zoneId === activeZoneId && player.extract?.completesAt ? "continue" : "start")
        : false,
      isExtracting: player.extract?.zoneId === activeZoneId && Boolean(player.extract?.completesAt),
      isSettled: Boolean(player.extract?.settledAt)
    }));

  return {
    activeSquadId,
    activeZoneId,
    members
  };
}

function getExtractEligibleSquadMembers(room: RuntimeRoom, squadId: SquadId, zoneId: string): RuntimePlayer[] {
  const zone = room.extract?.zones.find((entry) => entry.zoneId === zoneId);
  if (!zone) {
    return [];
  }

  return [...room.players.values()].filter((player) => (
    player.squadId === squadId
    && player.state?.isAlive === true
    && !player.extract?.settledAt
    && isInsideExtractZone(zone, player, player.extract?.zoneId === zoneId && player.extract?.completesAt ? "continue" : "start")
  ));
}

function openZoneForSquad(room: RuntimeRoom, zone: RuntimeRoomExtractZone, player: RuntimePlayer, now: number): void {
  zone.isOpen = true;
  zone.openedAt = now;

  if (!room.extract) {
    return;
  }

  room.extract.activeSquadId = player.squadId;
  room.extract.activeZoneId = zone.zoneId;
  room.extract.carrier ??= {
    holderPlayerId: null,
    holderSquadId: null
  };
  room.extract.carrier.holderPlayerId = player.id;
  room.extract.carrier.holderSquadId = player.squadId;
}

function resolveOccupiedExtractZone(room: RuntimeRoom, player: RuntimePlayer): RuntimeRoomExtractZone | undefined {
  if (!room.extract || !player.state) {
    return undefined;
  }
  return room.extract.zones.find((zone) => isInsideExtractZone(zone, player, "start"));
}

function isInsideExtractZone(zone: RuntimeRoomExtractZone, player: RuntimePlayer, mode: ExtractZoneCheckMode = "default"): boolean {
  if (!player.state) {
    return false;
  }
  const distance = Math.hypot(player.state.x - zone.x, player.state.y - zone.y);
  return distance <= getExtractCheckRadius(zone, mode);
}

function getExtractCheckRadius(zone: RuntimeRoomExtractZone, mode: ExtractZoneCheckMode): number {
  if (mode === "start") {
    const inset = Math.min(EXTRACT_START_INSET_MAX, Math.max(EXTRACT_START_INSET_MIN, zone.radius * 0.15));
    return Math.max(24, zone.radius - inset);
  }

  if (mode === "continue") {
    const grace = Math.min(EXTRACT_LEAVE_GRACE_MAX, Math.max(EXTRACT_LEAVE_GRACE_MIN, zone.radius * 0.12));
    return zone.radius + grace;
  }

  return zone.radius;
}

function getRuntimePlayer(room: RuntimeRoom, playerId: string): RuntimePlayer {
  const player = room.players.get(playerId);
  if (!player) {
    throw new Error("Player not found in room.");
  }
  return player;
}

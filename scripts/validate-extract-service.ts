import {
  advanceExtractState,
  buildExtractOpenedPayload,
  initializeExtractState,
  startPlayerExtract
} from "../server/src/extract/service.ts";
import { applyDevRoomPreset } from "../server/src/dev-test-hooks.ts";
import type { RuntimePlayer, RuntimeRoom } from "../server/src/types.ts";
import {
  createInitialExtractState,
  normalizeExtractOpened,
  normalizeExtractProgress,
  resolvePrimaryExtractZone
} from "../client/src/scenes/extractUiState.ts";
import type { ExtractOpenedPayload } from "../client/src/network/socketClient.ts";
import { GameSceneInteractions } from "../client/src/scenes/gameScene/interactions.ts";

const EXTRACT_START_INSET_MIN = 10;
const EXTRACT_START_INSET_MAX = 16;
const EXTRACT_LEAVE_GRACE_MIN = 8;
const EXTRACT_LEAVE_GRACE_MAX = 14;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeExtractTorch(instanceId = "torch-1") {
  return {
    instanceId,
    templateId: "extract_torch",
    name: "归营火种",
    kind: "quest" as const,
    rarity: "rare" as const,
    tags: ["extract_key" as const, "non_extractable" as const],
    width: 1,
    height: 3,
    goldValue: 0,
    treasureValue: 0,
    affixes: []
  };
}

function makeTreasure(instanceId: string, name: string) {
  return {
    instanceId,
    templateId: `treasure_${instanceId}`,
    name,
    kind: "treasure" as const,
    rarity: "common" as const,
    width: 1,
    height: 1,
    goldValue: 0,
    treasureValue: 40,
    affixes: []
  };
}

function makePlayer(
  id: string,
  name: string,
  squadId: RuntimePlayer["squadId"],
  position: { x: number; y: number },
  items: Array<ReturnType<typeof makeTreasure> | ReturnType<typeof makeExtractTorch>> = []
): RuntimePlayer {
  return {
    id,
    socketId: `${id}-socket`,
    name,
    isHost: id === "player-1",
    ready: true,
    joinedAt: 1_000,
    squadId,
    squadType: squadId === "player" ? "human" : "bot",
    isBot: squadId !== "player",
    state: {
      id,
      name,
      x: position.x,
      y: position.y,
      direction: { x: 0, y: 1 },
      hp: 100,
      maxHp: 100,
      weaponType: "sword",
      isAlive: true,
      moveSpeed: 300,
      attackPower: 0,
      attackSpeed: 0,
      critRate: 0,
      dodgeRate: 0,
      damageReduction: 0,
      statusEffects: [],
      killsPlayers: 0,
      killsMonsters: 0,
      squadId,
      squadType: squadId === "player" ? "human" : "bot",
      isBot: squadId !== "player"
    },
    inventory: {
      width: 10,
      height: 20,
      items: items.map((item, index) => ({
        item,
        x: index,
        y: 0
      })),
      equipment: {}
    }
  };
}

function makeRoom(now: number): RuntimeRoom {
  const torchCarrier = makePlayer("player-1", "Torch Bearer", "player", { x: 100, y: 100 }, [
    makeTreasure("idol-1", "Small Idol"),
    makeExtractTorch()
  ]);
  const squadMateInside = makePlayer("player-2", "Squad Mate", "player", { x: 120, y: 100 }, [
    makeTreasure("coin-1", "Coin Purse")
  ]);
  const squadMateOutside = makePlayer("player-3", "Late Mate", "player", { x: 320, y: 100 }, [
    makeTreasure("ring-1", "Scrap Ring")
  ]);
  const enemy = makePlayer("enemy-1", "Enemy Raider", "bot_alpha", { x: 100, y: 100 }, [
    makeTreasure("fang-1", "Bone Fang")
  ]);

  return {
    code: "TEST01",
    hostPlayerId: torchCarrier.id,
    botDifficulty: "easy",
    capacity: 4,
    status: "started",
    createdAt: now,
    startedAt: now,
    players: new Map([
      [torchCarrier.id, torchCarrier],
      [squadMateInside.id, squadMateInside],
      [squadMateOutside.id, squadMateOutside],
      [enemy.id, enemy]
    ]),
    matchLayout: {
      templateId: "A",
      squadSpawns: [],
      extractZones: [{
        zoneId: "extract-test",
        x: 100,
        y: 100,
        radius: 80,
        openAtSec: 0,
        channelDurationMs: 500
      }],
      chestZones: [],
      safeZones: [],
      riverHazards: [],
      safeCrossings: []
    }
  };
}

function getStartRadius(zoneRadius: number): number {
  const inset = Math.min(EXTRACT_START_INSET_MAX, Math.max(EXTRACT_START_INSET_MIN, zoneRadius * 0.15));
  return Math.max(24, zoneRadius - inset);
}

function getContinueRadius(zoneRadius: number): number {
  const grace = Math.min(EXTRACT_LEAVE_GRACE_MAX, Math.max(EXTRACT_LEAVE_GRACE_MIN, zoneRadius * 0.12));
  return zoneRadius + grace;
}

function main(): void {
  const now = 1_000;
  const room = makeRoom(now);
  initializeExtractState(room);
  assert(room.extract?.zones.length === 1, "initializeExtractState should clone layout zones");
  assert(room.extract.zones[0].isOpen === false, "extract zone should start closed");

  room.players.get("player-1")!.inventory!.items = room.players.get("player-1")!.inventory!.items.filter((entry) => entry.item.templateId !== "extract_torch");
  try {
    startPlayerExtract(room, "player-1", now);
    throw new Error("startPlayerExtract should require the extract torch");
  } catch (error) {
    assert(
      error instanceof Error && /extract torch/.test(error.message),
      "startPlayerExtract should reject ignition without the extract torch"
    );
  }

  room.players.get("player-1")!.inventory!.items.push({ item: makeExtractTorch(), x: 1, y: 0 });

  const zoneRadius = room.extract!.zones[0]!.radius;
  const startRadius = getStartRadius(zoneRadius);
  const continueRadius = getContinueRadius(zoneRadius);

  room.players.get("player-1")!.state!.x = room.extract!.zones[0]!.x + zoneRadius - 1;
  try {
    startPlayerExtract(room, "player-1", now);
    throw new Error("startPlayerExtract should reject players standing only on the outer edge");
  } catch (error) {
    assert(
      error instanceof Error && /not inside the extract zone/.test(error.message),
      "startPlayerExtract should use an inset start radius"
    );
  }

  room.players.get("player-1")!.state!.x = room.extract!.zones[0]!.x + startRadius - 2;

  const start = startPlayerExtract(room, "player-1", now);
  assert(start.opened?.zones[0].isOpen === true, "torch squad should open ready zone");
  assert(start.opened?.squadStatus?.activeSquadId === "player", "extract should bind to carrier squad");
  assert(start.progressEvents[0]?.status === "started", "torch squad should receive started progress");

  const squadMateStart = startPlayerExtract(room, "player-2", now + 25);
  assert(squadMateStart.progressEvents[0]?.status === "started", "same squad member inside zone should be able to join extract");

  try {
    startPlayerExtract(room, "enemy-1", now + 50);
    throw new Error("other squad should not be able to use ignited extract");
  } catch (error) {
    assert(
      error instanceof Error && /another squad/.test(error.message),
      "other squad should be rejected from using the torch squad extract"
    );
  }

  const progress = advanceExtractState(room, now + 300);
  assert(progress.progressEvents.some((event) => event.status === "progress" && event.playerId === "player-1"), "carrier should receive progress events while channeling");
  assert(progress.progressEvents.some((event) => event.status === "progress" && event.playerId === "player-2"), "same squad member should receive progress events while channeling");
  assert(progress.shouldCloseRoom === false, "room should stay open before completion");

  const hysteresisRoom = makeRoom(now);
  initializeExtractState(hysteresisRoom);
  const hysteresisZone = hysteresisRoom.extract!.zones[0]!;
  hysteresisRoom.players.get("player-1")!.state!.x = hysteresisZone.x + getStartRadius(hysteresisZone.radius) - 2;
  const hysteresisStart = startPlayerExtract(hysteresisRoom, "player-1", now);
  assert(hysteresisStart.progressEvents[0]?.status === "started", "player inside inset radius should start extracting");

  hysteresisRoom.players.get("player-1")!.state!.x = hysteresisZone.x + hysteresisZone.radius + 4;
  const graceProgress = advanceExtractState(hysteresisRoom, now + 300);
  assert(
    graceProgress.progressEvents.some((event) => event.status === "progress" && event.playerId === "player-1"),
    "player slightly outside base radius should continue extracting within hysteresis grace"
  );

  hysteresisRoom.players.get("player-1")!.state!.x = hysteresisZone.x + continueRadius + 2;
  const leftZone = advanceExtractState(hysteresisRoom, now + 350);
  assert(
    leftZone.progressEvents.some((event) => event.status === "interrupted" && event.reason === "left_zone" && event.playerId === "player-1"),
    "player clearly outside grace radius should be interrupted"
  );

  hysteresisRoom.players.get("player-1")!.state!.x = hysteresisZone.x + getStartRadius(hysteresisZone.radius) - 3;
  const restarted = startPlayerExtract(hysteresisRoom, "player-1", now + 375);
  assert(restarted.progressEvents[0]?.status === "started", "player who re-enters inset radius should be able to restart extract");

  const settled = advanceExtractState(room, now + 525);
  const successIds = new Set(settled.successEvents.map((event) => event.playerId));
  assert(successIds.has("player-1"), "carrier should extract successfully");
  assert(successIds.has("player-2"), "inside-zone squadmate should extract with carrier");
  assert(!successIds.has("player-3"), "outside-zone squadmate should not be extracted");
  assert(!successIds.has("enemy-1"), "enemy squad should not be extracted");

  const carrierSettlement = settled.settlementEvents.find((event) => event.playerId === "player-1")?.settlement;
  const insideSettlement = settled.settlementEvents.find((event) => event.playerId === "player-2")?.settlement;
  const outsideSettlement = settled.settlementEvents.find((event) => event.playerId === "player-3")?.settlement;
  assert(carrierSettlement?.result === "success", "carrier settlement should be success");
  assert(insideSettlement?.result === "success", "inside squadmate settlement should be success");
  assert(!outsideSettlement, "outside squadmate should remain unsettled after team extract");
  assert(
    !carrierSettlement?.extractedItems.includes("归营火种"),
    "extract torch should not be listed as extracted loot"
  );
  assert(
    !room.players.get("player-1")!.inventory!.items.some((entry) => entry.item.templateId === "extract_torch"),
    "extract torch should be removed from runtime inventory after success"
  );

  validateExtractUiStateStability();
  validateInterruptedAutoExtractRestart();
  validateInterruptedHeartbeatReenterRestart();
  validateInitialOpenedPayloadCarriesSquadStatus();

  console.log("[extract-service] PASS no-torch reject, inset-start, grace-continue, left-zone interrupt, restart, auto-reenter-restart, squad-open, enemy-block, squad-extract, outside-left, torch-not-carried, ui-opened-does-not-flash");
}

function validateInitialOpenedPayloadCarriesSquadStatus(): void {
  const room = makeRoom(1_000);
  initializeExtractState(room);
  applyDevRoomPreset(room, "extract");
  const opened = buildExtractOpenedPayload(room);
  assert(opened.zones.length === 1, "initial opened payload should include extract zone");
  assert(opened.carrier?.holderPlayerId === "player-1", "initial opened payload should expose current torch carrier");
  assert(opened.squadStatus?.activeSquadId === "player", "initial opened payload should expose active squad for first client auto-start");
  const selfMember = opened.squadStatus?.members.find((member) => member.playerId === "player-1");
  assert(selfMember, "initial opened payload should include the local carrier in squadStatus members");
  assert(selfMember?.isExtracting === false, "initial opened payload should not pretend extract is already running");
}

function validateExtractUiStateStability(): void {
  const opened: ExtractOpenedPayload = {
    roomCode: "TEST",
    carrier: {
      holderPlayerId: "player-1",
      holderSquadId: "player"
    },
    squadStatus: {
      activeSquadId: "player",
      activeZoneId: "extract-test",
      members: [{
        playerId: "player-1",
        squadId: "player",
        name: "Player 1",
        isAlive: true,
        isInsideZone: true,
        isExtracting: true,
        isSettled: false
      }]
    },
    zones: [{
      zoneId: "extract-test",
      x: 120,
      y: 80,
      radius: 96,
      channelDurationMs: 500,
      openAtSec: 0,
      isOpen: true
    }]
  };

  let uiState = {
    ...createInitialExtractState(),
    ...normalizeExtractOpened(createInitialExtractState(), opened),
    ...resolvePrimaryExtractZone(opened)
  };
  uiState = {
    ...uiState,
    ...normalizeExtractProgress({
      roomCode: "TEST",
      playerId: "player-1",
      zoneId: "extract-test",
      status: "started",
      remainingMs: 500,
      durationMs: 500,
      squadStatus: opened.squadStatus
    })
  };
  assert(uiState.isExtracting === true && uiState.progress === 0, "ui should show extract progress immediately after started");

  uiState = {
    ...uiState,
    ...normalizeExtractOpened(uiState, opened),
    ...resolvePrimaryExtractZone(opened)
  };
  assert(uiState.isExtracting === true, "extract opened heartbeat should not hide active progress bar");
  assert(uiState.progress === 0, "extract opened heartbeat should not reset active progress value");

  uiState = {
    ...uiState,
    ...normalizeExtractProgress({
      roomCode: "TEST",
      playerId: "player-1",
      zoneId: "extract-test",
      status: "progress",
      remainingMs: 250,
      durationMs: 500,
      squadStatus: opened.squadStatus
    })
  };
  assert(uiState.isExtracting === true && uiState.progress === 0.5, "ui should continue progress after heartbeat");

  uiState = {
    ...uiState,
    ...normalizeExtractOpened(uiState, opened),
    ...resolvePrimaryExtractZone(opened)
  };
  assert(uiState.isExtracting === true && uiState.progress === 0.5, "ui should keep progress visible between progress broadcasts");

  uiState = {
    ...uiState,
    ...normalizeExtractProgress({
      roomCode: "TEST",
      playerId: "player-1",
      zoneId: "extract-test",
      status: "interrupted",
      reason: "left_zone",
      remainingMs: 0,
      durationMs: 500,
      squadStatus: {
        ...opened.squadStatus!,
        members: opened.squadStatus!.members.map((member) => (
          member.playerId === "player-1"
            ? { ...member, isInsideZone: false, isExtracting: false }
            : member
        ))
      }
    })
  };
  assert(uiState.phase === "interrupted", "interrupted progress should keep interrupted phase even when remainingMs hits zero");
  assert(uiState.didSucceed === false, "interrupted progress should not mark extraction as succeeded");
}

function validateInterruptedAutoExtractRestart(): void {
  const interactions = new GameSceneInteractions({} as any);
  const zone = {
    x: 2_400,
    y: 2_400,
    radius: 96
  };
  const baseExtractState = {
    ...createInitialExtractState(),
    isOpen: true,
    x: zone.x,
    y: zone.y,
    radius: zone.radius,
    carrier: {
      holderPlayerId: "player-1",
      holderSquadId: "player" as const
    },
    squadStatus: {
      activeSquadId: "player" as const,
      activeZoneId: "extract-test",
      members: [{
        playerId: "player-1",
        squadId: "player" as const,
        name: "Torch Bearer",
        isAlive: true,
        isInsideZone: true,
        isExtracting: false,
        isSettled: false
      }]
    }
  };
  const idleExtractState = {
    ...baseExtractState,
    phase: "idle" as const,
    isExtracting: false,
    progress: null
  };
  const extractingState = {
    ...withoutExtractZone(baseExtractState),
    phase: "extracting" as const,
    isExtracting: true,
    progress: 0.15
  };
  const interruptedState = {
    ...withoutExtractZone(baseExtractState),
    phase: "interrupted" as const,
    isExtracting: false,
    progress: null
  };
  const interruptedOutsideStartState = {
    ...interruptedState,
    squadStatus: {
      ...interruptedState.squadStatus,
      members: interruptedState.squadStatus.members.map((member) => (
        member.playerId === "player-1"
          ? { ...member, isInsideZone: false, isExtracting: false }
          : member
      ))
    }
  };
  const interruptedReenteredState = {
    ...interruptedState,
    squadStatus: {
      ...interruptedState.squadStatus,
      members: interruptedState.squadStatus.members.map((member) => (
        member.playerId === "player-1"
          ? { ...member, isInsideZone: true, isExtracting: false }
          : member
      ))
    }
  };
  const playerMarker = {
    id: "player-1",
    root: {
      x: zone.x + 43,
      y: zone.y + 18
    }
  };
  let autoStarts = 0;
  const start = () => {
    autoStarts += 1;
  };

  interactions.updateAutoExtract(playerMarker as any, idleExtractState, start);
  assert(autoStarts === 1, "idle player inside start radius should auto start extract");

  interactions.updateAutoExtract(playerMarker as any, extractingState, start);
  assert(autoStarts === 1, "active extract progress should not spam startExtract");

  playerMarker.root.x = zone.x + 103;
  playerMarker.root.y = zone.y + 18;
  interactions.updateAutoExtract(playerMarker as any, interruptedState, start);
  assert(autoStarts === 1, "interrupted extract outside start radius should not immediately restart");

  playerMarker.root.x = zone.x + 568;
  playerMarker.root.y = zone.y + 18;
  interactions.updateAutoExtract(playerMarker as any, interruptedOutsideStartState, start);
  assert(autoStarts === 1, "moving far outside after interruption should rearm without starting extract");

  const returnPulses = [
    { x: zone.x + 568, y: zone.y + 18 },
    { x: zone.x + 75, y: zone.y + 18 },
    { x: zone.x + 18, y: zone.y + 18 },
    { x: zone.x - 62, y: zone.y + 18 },
    { x: zone.x - 47, y: zone.y + 18 },
    { x: zone.x + 28, y: zone.y + 18 },
    { x: zone.x + 103, y: zone.y + 18 }
  ];
  for (const pulse of returnPulses) {
    playerMarker.root.x = pulse.x;
    playerMarker.root.y = pulse.y;
    interactions.updateAutoExtract(playerMarker as any, interruptedReenteredState, start);
  }
  assert(autoStarts === 2, "pulsed return through start radius should trigger exactly one restart");

  interactions.updateAutoExtract(playerMarker as any, interruptedReenteredState, start);
  assert(autoStarts === 2, "auto extract should not spam restart while waiting for server progress");
  interactions.destroy();
}

function validateInterruptedHeartbeatReenterRestart(): void {
  const interactions = new GameSceneInteractions({} as any);
  const zone = {
    x: 2_400,
    y: 2_400,
    radius: 96
  };
  const baseOpened: ExtractOpenedPayload = {
    roomCode: "TEST",
    carrier: {
      holderPlayerId: "player-1",
      holderSquadId: "player"
    },
    squadStatus: {
      activeSquadId: "player",
      activeZoneId: "extract-test",
      members: [{
        playerId: "player-1",
        squadId: "player",
        name: "Torch Bearer",
        isAlive: true,
        isInsideZone: true,
        isExtracting: false,
        isSettled: false
      }]
    },
    zones: [{
      zoneId: "extract-test",
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      channelDurationMs: 500,
      openAtSec: 0,
      isOpen: true
    }]
  };
  const playerMarker = {
    id: "player-1",
    root: {
      x: zone.x + 16,
      y: zone.y + 12
    }
  };
  let autoStarts = 0;
  const start = () => {
    autoStarts += 1;
  };

  let uiState = {
    ...createInitialExtractState(),
    ...normalizeExtractOpened(createInitialExtractState(), baseOpened),
    ...resolvePrimaryExtractZone(baseOpened),
    carrier: baseOpened.carrier,
    squadStatus: baseOpened.squadStatus
  };
  interactions.updateAutoExtract(playerMarker as any, uiState, start);
  assert(autoStarts === 1, "opened state inside radius should trigger the first auto start");

  uiState = {
    ...uiState,
    ...normalizeExtractProgress({
      roomCode: "TEST",
      playerId: "player-1",
      zoneId: "extract-test",
      status: "started",
      remainingMs: 500,
      durationMs: 500,
      squadStatus: baseOpened.squadStatus
    })
  };
  interactions.updateAutoExtract(playerMarker as any, uiState, start);
  assert(autoStarts === 1, "started progress should keep the first latch armed");

  const interruptedOutsideStatus = {
    ...baseOpened.squadStatus,
    members: baseOpened.squadStatus!.members.map((member) => (
      member.playerId === "player-1"
        ? { ...member, isInsideZone: false, isExtracting: false }
        : member
    ))
  };
  uiState = {
    ...uiState,
    ...normalizeExtractProgress({
      roomCode: "TEST",
      playerId: "player-1",
      zoneId: "extract-test",
      status: "interrupted",
      reason: "left_zone",
      remainingMs: 0,
      durationMs: 500,
      squadStatus: interruptedOutsideStatus
    }),
    squadStatus: interruptedOutsideStatus
  };
  interactions.updateAutoExtract(playerMarker as any, uiState, start);
  assert(autoStarts === 1, "interrupted event should not instantly restart while server still reports outside");

  uiState = {
    ...uiState,
    ...normalizeExtractOpened(uiState, {
      ...baseOpened,
      squadStatus: interruptedOutsideStatus
    }),
    ...resolvePrimaryExtractZone(baseOpened),
    carrier: baseOpened.carrier,
    squadStatus: interruptedOutsideStatus
  };
  interactions.updateAutoExtract(playerMarker as any, uiState, start);
  assert(autoStarts === 1, "opened heartbeat after interruption should not lose the rearm state");

  const reenteredStatus = {
    ...baseOpened.squadStatus,
    members: baseOpened.squadStatus!.members.map((member) => (
      member.playerId === "player-1"
        ? { ...member, isInsideZone: true, isExtracting: false }
        : member
    ))
  };
  uiState = {
    ...uiState,
    ...normalizeExtractOpened(uiState, {
      ...baseOpened,
      squadStatus: reenteredStatus
    }),
    ...resolvePrimaryExtractZone(baseOpened),
    carrier: baseOpened.carrier,
    squadStatus: reenteredStatus
  };
  interactions.updateAutoExtract(playerMarker as any, uiState, start);
  assert(autoStarts === 2, "opened heartbeat after re-enter should trigger exactly one second auto start");

  interactions.updateAutoExtract(playerMarker as any, uiState, start);
  assert(autoStarts === 2, "second auto start should stay latched until server progress resumes");
  interactions.destroy();
}

function withoutExtractZone<T extends { x?: number; y?: number; radius?: number }>(state: T): Omit<T, "x" | "y" | "radius"> {
  const { x: _x, y: _y, radius: _radius, ...rest } = state;
  return rest;
}

main();

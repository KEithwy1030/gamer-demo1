import type { MonsterSpawnDefinition, SpawnPhase, SpawnPhaseChangedPayload } from "@gamer/shared";
import { MATCH_MAP_HEIGHT, MATCH_MAP_WIDTH } from "../internal-constants.js";
import { isPointInsideObstacle, isPointInsideRiverHazard } from "../match-layout.js";
import type { RuntimePlayer, RuntimeRoom } from "../types.js";

const PHASE_TIMINGS: Array<{ phase: SpawnPhase; startSec: number; endSec: number; cap: number; spawnIntervalMs: number }> = [
  { phase: "opening", startSec: 0, endSec: 90, cap: 6, spawnIntervalMs: 4200 },
  { phase: "skirmish", startSec: 90, endSec: 240, cap: 12, spawnIntervalMs: 2600 },
  { phase: "danger", startSec: 240, endSec: 360, cap: 16, spawnIntervalMs: 2100 },
  { phase: "extract", startSec: 360, endSec: 480, cap: 20, spawnIntervalMs: 1600 }
];

export interface SpawnDirectorAdvanceResult {
  phase: SpawnPhase;
  phaseChanged?: SpawnPhaseChangedPayload;
  spawns: MonsterSpawnDefinition[];
}

export function initializeSpawnDirector(room: RuntimeRoom, now = Date.now()): void {
  room.spawnDirector = {
    phase: "opening",
    lastPhaseBroadcast: undefined,
    nextSpawnAt: now + 1200,
    phaseStartedAt: now
  };
}

export function getCurrentPhase(room: RuntimeRoom, now = Date.now()): SpawnPhase {
  return resolvePhase(getRunSeconds(room, now)).phase;
}

export function getSpawnCap(phase: SpawnPhase): number {
  return PHASE_TIMINGS.find((entry) => entry.phase === phase)?.cap ?? 6;
}

export function advanceSpawnDirector(room: RuntimeRoom, now = Date.now()): SpawnDirectorAdvanceResult {
  if (!room.spawnDirector) {
    initializeSpawnDirector(room, now);
  }

  const director = room.spawnDirector!;
  const runSeconds = getRunSeconds(room, now);
  const config = resolvePhase(runSeconds);
  let phaseChanged: SpawnPhaseChangedPayload | undefined;

  if (director.lastPhaseBroadcast !== config.phase) {
    director.phase = config.phase;
    director.lastPhaseBroadcast = config.phase;
    director.phaseStartedAt = now;
    director.nextSpawnAt = now + Math.max(700, Math.round(config.spawnIntervalMs * 0.55));
    phaseChanged = {
      phase: config.phase,
      atRunSeconds: runSeconds
    };
  }

  if (now < director.nextSpawnAt) {
    return {
      phase: director.phase,
      phaseChanged,
      spawns: []
    };
  }

  const livingNonBossCount = [...(room.monsters?.values() ?? [])]
    .filter((monster) => monster.isAlive && monster.type !== "boss")
    .length;
  if (livingNonBossCount >= config.cap) {
    director.nextSpawnAt = now + config.spawnIntervalMs;
    return {
      phase: director.phase,
      phaseChanged,
      spawns: []
    };
  }

  const spawnType = chooseNextSpawnType(room, config.phase);
  const spawnPoint = chooseSpawnPoint(room, config.phase, spawnType);
  director.nextSpawnAt = now + config.spawnIntervalMs;

  return {
    phase: director.phase,
    phaseChanged,
    spawns: [{
      id: `${spawnType}_${now}_${Math.random().toString(36).slice(2, 7)}`,
      type: spawnType,
      x: Math.round(spawnPoint.x),
      y: Math.round(spawnPoint.y)
    }]
  };
}

function chooseNextSpawnType(room: RuntimeRoom, phase: SpawnPhase): MonsterSpawnDefinition["type"] {
  const aliveCounts = countAliveByType(room);

  if (phase === "opening") {
    return "basic";
  }

  if (phase === "skirmish") {
    return weightedPick([
      { type: "basic", weight: 0.62 },
      { type: "skirmisher", weight: 0.38 }
    ]);
  }

  if (phase === "danger") {
    if ((aliveCounts.elite ?? 0) < 1) return "elite";
    if ((aliveCounts.archer ?? 0) < 1) return "archer";
    return weightedPick([
      { type: "basic", weight: 0.34 },
      { type: "skirmisher", weight: 0.28 },
      { type: "elite", weight: 0.18 },
      { type: "archer", weight: 0.20 }
    ]);
  }

  if ((aliveCounts.brute ?? 0) < 1) return "brute";
  if ((aliveCounts.elite ?? 0) < 1) return "elite";
  return weightedPick([
    { type: "skirmisher", weight: 0.34 },
    { type: "elite", weight: 0.22 },
    { type: "brute", weight: 0.18 },
    { type: "archer", weight: 0.16 },
    { type: "basic", weight: 0.10 }
  ]);
}

function chooseSpawnPoint(room: RuntimeRoom, phase: SpawnPhase, type: MonsterSpawnDefinition["type"]): { x: number; y: number } {
  const anchor = resolvePrimaryPlayer(room);
  const extractZone = room.extract?.zones?.find((zone) => zone.isOpen) ?? room.matchLayout?.extractZones?.[0];

  if (phase === "extract" && extractZone) {
    return findPointWithFallback(room, () => polarAround(extractZone.x, extractZone.y, randomBetween(extractZone.radius + 150, extractZone.radius + 260)), 120);
  }

  if (!anchor?.state) {
    return findPointWithFallback(room, () => randomMapPoint(), 120);
  }

  if (phase === "opening") {
    return findPointWithFallback(
      room,
      () => polarAround(anchor.state!.x, anchor.state!.y, randomBetween(520, 820)),
      120
    );
  }

  if (type === "archer") {
    return findPointWithFallback(
      room,
      () => polarAround(anchor.state!.x, anchor.state!.y, randomBetween(260, 420), preferForwardAngle(anchor)),
      120
    );
  }

  return findPointWithFallback(
    room,
    () => polarAround(anchor.state!.x, anchor.state!.y, randomBetween(180, 360), preferForwardAngle(anchor)),
    120
  );
}

function resolvePrimaryPlayer(room: RuntimeRoom): RuntimePlayer | undefined {
  return [...room.players.values()].find((player) => !player.isBot && player.state?.isAlive)
    ?? [...room.players.values()].find((player) => player.state?.isAlive);
}

function preferForwardAngle(player: RuntimePlayer): number | undefined {
  const direction = player.state?.direction;
  if (!direction) return undefined;
  const magnitude = Math.hypot(direction.x, direction.y);
  if (magnitude < 0.1) return undefined;
  return Math.atan2(direction.y, direction.x);
}

function findPointWithFallback(room: RuntimeRoom, factory: () => { x: number; y: number }, attempts: number): { x: number; y: number } {
  for (let index = 0; index < attempts; index += 1) {
    const point = clampPoint(factory());
    if (isValidSpawnPoint(room, point.x, point.y)) {
      return point;
    }
  }

  for (let index = 0; index < 40; index += 1) {
    const point = clampPoint(randomMapPoint());
    if (isValidSpawnPoint(room, point.x, point.y)) {
      return point;
    }
  }

  return clampPoint(randomMapPoint());
}

function isValidSpawnPoint(room: RuntimeRoom, x: number, y: number): boolean {
  if (x < 96 || x > MATCH_MAP_WIDTH - 96 || y < 96 || y > MATCH_MAP_HEIGHT - 96) {
    return false;
  }

  const layout = room.matchLayout;
  if (!layout) {
    return true;
  }

  if (layout.safeZones.some((zone) => distance(x, y, zone.x, zone.y) <= zone.radius + 220)) {
    return false;
  }

  if (layout.extractZones.some((zone) => distance(x, y, zone.x, zone.y) <= zone.radius + 96)) {
    return false;
  }

  // 怪物出生在障碍体内（不可达、打不到）或河道里（持续掉血秒杀自己）都是废点。
  // 留 48px 缓冲，避免出生即贴墙导致追击路径退化。
  if (isPointInsideObstacle(layout, x, y, 48)) {
    return false;
  }

  if (isPointInsideRiverHazard(layout, x, y)) {
    return false;
  }

  return true;
}

function resolvePhase(runSeconds: number) {
  return PHASE_TIMINGS.find((entry) => runSeconds >= entry.startSec && runSeconds < entry.endSec)
    ?? PHASE_TIMINGS[PHASE_TIMINGS.length - 1]!;
}

function countAliveByType(room: RuntimeRoom): Partial<Record<MonsterSpawnDefinition["type"], number>> {
  const counts: Partial<Record<MonsterSpawnDefinition["type"], number>> = {};
  for (const monster of room.monsters?.values() ?? []) {
    if (!monster.isAlive) continue;
    counts[monster.type] = (counts[monster.type] ?? 0) + 1;
  }
  return counts;
}

function getRunSeconds(room: RuntimeRoom, now: number): number {
  if (!room.startedAt) return 0;
  return Math.max(0, Math.floor((now - room.startedAt) / 1000));
}

function weightedPick(options: Array<{ type: MonsterSpawnDefinition["type"]; weight: number }>): MonsterSpawnDefinition["type"] {
  const total = options.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) {
      return option.type;
    }
  }
  return options[options.length - 1]!.type;
}

function polarAround(centerX: number, centerY: number, radius: number, preferredAngle?: number): { x: number; y: number } {
  const baseAngle = preferredAngle ?? randomBetween(0, Math.PI * 2);
  const angle = baseAngle + randomBetween(-0.75, 0.75);
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius
  };
}

function randomMapPoint(): { x: number; y: number } {
  return {
    x: randomBetween(96, MATCH_MAP_WIDTH - 96),
    y: randomBetween(96, MATCH_MAP_HEIGHT - 96)
  };
}

function clampPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(96, Math.min(MATCH_MAP_WIDTH - 96, point.x)),
    y: Math.max(96, Math.min(MATCH_MAP_HEIGHT - 96, point.y))
  };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

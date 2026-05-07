import type { ExtractCarrierState, ExtractSquadStatus } from "@gamer/shared";
import type { ExtractOpenedPayload, ExtractProgressPayload } from "../network";

export interface ExtractUiState {
  phase: "idle" | "extracting" | "interrupted" | "succeeded";
  isOpen: boolean;
  isExtracting: boolean;
  progress: number | null;
  secondsRemaining: number | null;
  message: string | null;
  didSucceed: boolean;
  carrier?: ExtractCarrierState;
  squadStatus?: ExtractSquadStatus;
  x?: number;
  y?: number;
  radius?: number;
}

export function createInitialExtractState(): ExtractUiState {
  return {
    phase: "idle",
    isOpen: false,
    isExtracting: false,
    progress: null,
    secondsRemaining: null,
    message: "携带归营火种前往中心归营火，点燃后开始撤离。",
    didSucceed: false,
    squadStatus: {
      activeSquadId: null,
      activeZoneId: null,
      members: []
    }
  };
}

export function resolvePrimaryExtractZone(payload: ExtractOpenedPayload | undefined): { x?: number; y?: number; radius?: number } {
  const zone = payload?.zones.find((entry) => entry.isOpen) ?? payload?.zones[0];
  if (!zone) {
    return {};
  }
  return {
    x: zone.x,
    y: zone.y,
    radius: zone.radius
  };
}

export function normalizeExtractProgress(payload: ExtractProgressPayload | number | undefined): Partial<ExtractUiState> {
  if (typeof payload === "number") {
    return {
      phase: payload >= 1 ? "succeeded" : (payload > 0 && payload < 1 ? "extracting" : "idle"),
      isOpen: true,
      isExtracting: payload > 0 && payload < 1,
      progress: clamp(payload, 0, 1),
      secondsRemaining: null,
      message: payload >= 1 ? "撤离完成，收益结算中。" : "撤离读条中，受击会中断。"
    };
  }

  const rawProgress = typeof payload?.durationMs === "number" && typeof payload?.remainingMs === "number"
    ? 1 - payload.remainingMs / Math.max(1, payload.durationMs)
    : null;
  const progress = rawProgress == null ? null : clamp(rawProgress, 0, 1);
  const secondsRemaining = typeof payload?.remainingMs === "number" ? Math.max(0, Math.ceil(payload.remainingMs / 1000)) : null;
  const interrupted = payload?.status === "interrupted";
  const active = !interrupted && (payload?.status === "started" || payload?.status === "progress");
  const didSucceed = !interrupted && progress === 1;

  return {
    phase: interrupted ? "interrupted" : (didSucceed ? "succeeded" : (active ? "extracting" : "idle")),
    isOpen: true,
    isExtracting: active,
    progress: interrupted ? null : progress,
    secondsRemaining,
    message: interrupted ? "撤离被打断，立即拉开重进。" : (active ? "撤离读条中，受击会中断。" : (didSucceed ? "撤离完成，收益结算中。" : "撤离点待命")),
    didSucceed,
    squadStatus: payload?.squadStatus
  };
}

export function normalizeExtractOpened(current: ExtractUiState, payload: ExtractOpenedPayload | undefined): Partial<ExtractUiState> {
  const isOpen = resolveExtractOpen(payload);
  const hasActiveProgress = current.isExtracting && current.progress !== null;

  return {
    phase: hasActiveProgress ? current.phase : (current.didSucceed ? "succeeded" : "idle"),
    isOpen,
    isExtracting: hasActiveProgress,
    progress: hasActiveProgress ? current.progress : null,
    secondsRemaining: hasActiveProgress ? current.secondsRemaining : resolveCountdownSeconds(payload),
    message: hasActiveProgress ? current.message : buildExtractMessage(payload),
    didSucceed: current.didSucceed
  };
}

function resolveExtractOpen(payload: ExtractOpenedPayload | undefined): boolean {
  if (!payload) return true;
  return payload.zones.some((zone) => zone.isOpen);
}

function resolveCountdownSeconds(payload: ExtractOpenedPayload | undefined): number | null {
  const openZones = payload?.zones.filter((zone) => zone.isOpen) ?? [];
  if (openZones.length === 0) return null;
  return Math.max(0, Math.ceil(openZones[0]!.channelDurationMs / 1000));
}

function buildExtractMessage(payload: ExtractOpenedPayload | undefined): string {
  const activeMembers = payload?.squadStatus?.members ?? [];
  const aliveMembers = activeMembers.filter((member) => member.isAlive && !member.isSettled);
  const insideCount = aliveMembers.filter((member) => member.isInsideZone).length;
  const aliveCount = aliveMembers.length;
  const zoneCount = payload?.zones.filter((zone) => zone.isOpen).length ?? 0;
  if (zoneCount > 1) {
    return `队伍归营火已点燃 ${zoneCount} 处，圈内 ${insideCount}/${aliveCount} 人可撤离。`;
  }
  if (zoneCount === 1) {
    return `队伍归营火已点燃，圈内 ${insideCount}/${aliveCount} 人可一起撤离。`;
  }
  if (payload?.carrier?.holderPlayerId) {
    return "有人携带归营火种，靠近中心归营火可点燃撤离。";
  }
  return "寻找归营火种；开发期真人开局会自动携带。";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

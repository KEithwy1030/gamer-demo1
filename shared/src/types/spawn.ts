export type SpawnPhase = "opening" | "skirmish" | "danger" | "extract";

export interface SpawnPhaseChangedPayload {
  phase: SpawnPhase;
  atRunSeconds: number;
}

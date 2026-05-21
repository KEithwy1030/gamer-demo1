export type MusicMode = "lobby" | "calm" | "skirmish" | "danger" | "extract_pressure" | "death" | "victory";

export interface MusicModePayload {
  mode: MusicMode;
  ts: number;
}

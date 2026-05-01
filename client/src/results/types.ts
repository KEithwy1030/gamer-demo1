import type { SettlementPayload } from "@gamer/shared";

export interface ResultOverlayState {
  visible: boolean;
  settlement: SettlementPayload | null;
}

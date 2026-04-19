import type { SettlementPayload } from "../../../shared/src/index";

export interface ResultOverlayState {
  visible: boolean;
  settlement: SettlementPayload | null;
}


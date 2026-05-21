import type { RuntimeRoom } from "../types.js";
import { interruptPlayerExtract } from "./service.js";

export function processExtractInterruptsFromEvents(room: RuntimeRoom): void {
  if (!room.events?.length) {
    return;
  }

  for (const event of room.events) {
    if (event.type === "PlayerDamaged") {
      if (event.payload.amount <= 0 || event.payload.interruptsExtract === false) {
        continue;
      }
      interruptPlayerExtract(room, event.payload.targetId, "damaged");
      continue;
    }

    if (event.type === "PlayerDied") {
      interruptPlayerExtract(room, event.payload.playerId, "dead");
    }
  }
}

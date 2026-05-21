import type { RuntimeRoom } from "../types.js";
import { interruptChestOpening } from "./chest-manager.js";

export function processChestPhaseEvents(room: RuntimeRoom): void {
  if (!room.events?.length) {
    return;
  }

  for (const event of room.events) {
    if (event.type === "PhaseStarted") {
      room.chestLootPhase = event.payload.phase;
    }
  }
}

export function processChestInterruptsFromEvents(room: RuntimeRoom): void {
  if (!room.events?.length) {
    return;
  }

  for (const event of room.events) {
    if (event.type === "PlayerDamaged") {
      if (event.payload.amount <= 0 || event.payload.interruptsExtract === false) {
        continue;
      }
      interruptChestOpening(room, event.payload.targetId, "damaged");
      continue;
    }

    if (event.type === "PlayerDied") {
      interruptChestOpening(room, event.payload.playerId, "dead");
    }
  }
}

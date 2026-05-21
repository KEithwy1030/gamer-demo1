import type { DomainEvent } from "@gamer/shared";
import type { Server } from "socket.io";
import type { RuntimeRoom } from "../types.js";

/**
 * Drain room.events queue and emit each event as a typed socket message.
 * Wire format: socket event name is `domain:<EventType>`, payload is the event payload.
 */
export function flushEvents(room: RuntimeRoom, io: Server): void {
  if (!room.events || room.events.length === 0) {
    return;
  }

  const batch = room.events;
  room.events = [];
  for (const event of batch) {
    io.to(room.code).emit(`domain:${event.type}`, event.payload);
  }
}

export function emitDomain<E extends DomainEvent>(room: RuntimeRoom, event: E): void {
  room.events ??= [];
  room.events.push(event);
}

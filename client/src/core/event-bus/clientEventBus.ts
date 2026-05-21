import mitt, { type Emitter } from "mitt";
import type { DomainEvent, DomainEventType } from "@gamer/shared";

type EventMap = {
  [K in DomainEventType]: Extract<DomainEvent, { type: K }>["payload"];
};

export const clientEventBus: Emitter<EventMap> = mitt<EventMap>();

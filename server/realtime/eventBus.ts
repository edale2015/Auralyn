import { EventEmitter } from "events";

export interface SystemEvent {
  type: "reasoning" | "health" | "error" | "safety" | "decision" | "learning";
  source: string;
  payload: any;
  timestamp: number;
}

class EventBus extends EventEmitter {
  private recentEvents: SystemEvent[] = [];
  private maxEvents = 200;

  emitEvent(event: SystemEvent) {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents = this.recentEvents.slice(0, this.maxEvents);
    }
    this.emit("event", event);
  }

  getRecentEvents(limit: number = 50): SystemEvent[] {
    return this.recentEvents.slice(0, limit);
  }

  subscribe(listener: (e: SystemEvent) => void) {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const eventBus = new EventBus();

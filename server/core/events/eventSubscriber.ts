import { ClinicalEventType } from "./eventTypes";

type EventHandler = (event: {
  caseId: string;
  type: string;
  payload?: any;
  timestamp: string;
}) => void | Promise<void>;

interface Subscription {
  id: string;
  eventType: ClinicalEventType | "*";
  handler: EventHandler;
  once: boolean;
}

class ClinicalEventSubscriber {
  private subscriptions: Subscription[] = [];
  private idCounter = 0;

  subscribe(
    eventType: ClinicalEventType | "*",
    handler: EventHandler,
    opts: { once?: boolean } = {}
  ): () => void {
    const id = `sub_${++this.idCounter}`;
    this.subscriptions.push({ id, eventType, handler, once: opts.once ?? false });
    return () => this.unsubscribe(id);
  }

  once(eventType: ClinicalEventType | "*", handler: EventHandler): () => void {
    return this.subscribe(eventType, handler, { once: true });
  }

  unsubscribe(id: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== id);
  }

  async emit(event: {
    caseId: string;
    type: string;
    payload?: any;
    timestamp: string;
  }): Promise<void> {
    const toRemove: string[] = [];
    const matched = this.subscriptions.filter(
      s => s.eventType === "*" || s.eventType === event.type
    );
    for (const sub of matched) {
      try {
        await sub.handler(event);
      } catch {
      }
      if (sub.once) toRemove.push(sub.id);
    }
    if (toRemove.length) {
      this.subscriptions = this.subscriptions.filter(s => !toRemove.includes(s.id));
    }
  }

  subscriberCount(eventType?: ClinicalEventType | "*"): number {
    if (!eventType) return this.subscriptions.length;
    return this.subscriptions.filter(s => s.eventType === eventType || s.eventType === "*").length;
  }

  clear(): void {
    this.subscriptions = [];
  }
}

export const clinicalEventSubscriber = new ClinicalEventSubscriber();

export function onClinicalEvent(
  eventType: ClinicalEventType | "*",
  handler: EventHandler
): () => void {
  return clinicalEventSubscriber.subscribe(eventType, handler);
}

export function onceClinicalEvent(
  eventType: ClinicalEventType | "*",
  handler: EventHandler
): () => void {
  return clinicalEventSubscriber.once(eventType, handler);
}

export function emitToSubscribers(event: {
  caseId: string;
  type: string;
  payload?: any;
  timestamp: string;
}): void {
  clinicalEventSubscriber.emit(event).catch(() => {});
}

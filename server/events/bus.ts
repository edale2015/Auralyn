/**
 * Unified clinical event bus.
 * Uses the existing in-memory queue infrastructure with optional BullMQ upgrade.
 * All events are published fire-and-forget with structured logging for audit.
 */

interface EventEnvelope {
  topic: string;
  payload: Record<string, unknown>;
  ts: number;
  id: string;
}

type Handler = (envelope: EventEnvelope) => Promise<void> | void;

const handlers: Map<string, Handler[]> = new Map();
const eventLog: EventEnvelope[] = [];
const MAX_LOG = 500;

let eventCounter = 0;

export function subscribe(topic: string, handler: Handler): void {
  if (!handlers.has(topic)) handlers.set(topic, []);
  handlers.get(topic)!.push(handler);
}

export async function publish(topic: string, payload: Record<string, unknown>): Promise<string> {
  const id = `EVT-${Date.now()}-${(++eventCounter).toString().padStart(5, "0")}`;
  const envelope: EventEnvelope = { topic, payload, ts: Date.now(), id };

  if (eventLog.length >= MAX_LOG) eventLog.shift();
  eventLog.push(envelope);

  const topicHandlers = handlers.get(topic) ?? [];
  for (const handler of topicHandlers) {
    setImmediate(() => {
      Promise.resolve(handler(envelope)).catch((err) =>
        console.error(`[EventBus] Handler error for topic "${topic}":`, err?.message)
      );
    });
  }

  console.log(`[EventBus] Published: ${topic} | id=${id}`);
  return id;
}

export function getRecentEvents(limit = 50): EventEnvelope[] {
  return eventLog.slice(-limit).reverse();
}

export function getEventsByTopic(topic: string, limit = 20): EventEnvelope[] {
  return eventLog.filter((e) => e.topic === topic).slice(-limit).reverse();
}

export function getBusStats() {
  const topicCounts: Record<string, number> = {};
  for (const e of eventLog) {
    topicCounts[e.topic] = (topicCounts[e.topic] || 0) + 1;
  }
  return {
    totalPublished: eventCounter,
    buffered: eventLog.length,
    subscribedTopics: handlers.size,
    topicCounts,
  };
}

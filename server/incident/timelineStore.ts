export type TimelineEvent = {
  type: string;
  incidentId?: string;
  action?: string;
  detail?: string;
  severity?: string;
  region?: string;
  timestamp: number;
};

const MAX_EVENTS = 500;
const timeline: TimelineEvent[] = [];

export function recordEvent(event: Omit<TimelineEvent, "timestamp">): void {
  timeline.push({ ...event, timestamp: Date.now() });
  if (timeline.length > MAX_EVENTS) timeline.shift();
}

export function getTimeline(): TimelineEvent[] {
  return timeline;
}

export function clearTimeline(): void {
  timeline.length = 0;
}

export async function replayTimeline(delayMs = 100): Promise<{ replayed: number }> {
  const events = getTimeline();
  console.log(`[Timeline] Replaying ${events.length} events...`);
  for (const e of events) {
    console.log(`[Timeline] ${new Date(e.timestamp).toISOString()} — ${e.type} ${e.action ?? ""} ${e.incidentId ?? ""}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { replayed: events.length };
}

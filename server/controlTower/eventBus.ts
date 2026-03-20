const MAX_EVENTS = 1000;

export type TowerEvent = {
  type: string;
  payload: any;
  timestamp: number;
};

type Listener = (event: TowerEvent) => void;

const listeners: Listener[] = [];
let events: TowerEvent[] = [];

const CROSS_REGION_TYPES = new Set([
  "REGION_STATUS",
  "ALERT",
  "SELF_HEAL",
  "PATIENT_FLOW",
  "CIRCUIT_OPEN",
]);

function forwardToSecondaryRegion(event: TowerEvent): void {
  const secondaryUrl = process.env.SECONDARY_API_URL;
  if (!secondaryUrl) return;
  fetch(`${secondaryUrl}/api/monitoring/region-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-region-sync": "true" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

export function emitEvent(event: TowerEvent): void {
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  for (const l of listeners) {
    try { l(event); } catch (_) {}
  }
  if (CROSS_REGION_TYPES.has(event.type)) {
    forwardToSecondaryRegion(event);
  }
}

export function subscribeToTower(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

export function getRecentEvents(limit = 100): TowerEvent[] {
  return events.slice(-limit);
}

export function clearEventLog(): void {
  events = [];
}

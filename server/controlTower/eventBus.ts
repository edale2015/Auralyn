const MAX_EVENTS = 1000;

export type TowerEvent = {
  type: string;
  payload: any;
  timestamp: number;
};

type Listener = (event: TowerEvent) => void;

const listeners: Listener[] = [];
let events: TowerEvent[] = [];

export function emitEvent(event: TowerEvent): void {
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  for (const l of listeners) {
    try { l(event); } catch (_) {}
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

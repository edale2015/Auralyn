type EventHandler = (data: any) => void;

const subscribers: Record<string, EventHandler[]> = {};
const eventLog: Array<{ event: string; timestamp: string; dataKeys: string[] }> = [];

export function subscribe(event: string, handler: EventHandler) {
  if (!subscribers[event]) subscribers[event] = [];
  subscribers[event].push(handler);
}

export function unsubscribe(event: string, handler: EventHandler) {
  if (!subscribers[event]) return;
  subscribers[event] = subscribers[event].filter((h) => h !== handler);
}

export function publish(event: string, data: any) {
  eventLog.push({
    event,
    timestamp: new Date().toISOString(),
    dataKeys: data ? Object.keys(data) : [],
  });
  if (eventLog.length > 500) eventLog.splice(0, eventLog.length - 500);

  if (subscribers[event]) {
    subscribers[event].forEach((fn) => {
      try {
        fn(data);
      } catch (_) {}
    });
  }
}

export function getEventLog(limit = 100): typeof eventLog {
  return eventLog.slice(-limit);
}

export function getSubscribers(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [event, handlers] of Object.entries(subscribers)) {
    counts[event] = handlers.length;
  }
  return counts;
}

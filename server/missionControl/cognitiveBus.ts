type CognitiveTopic =
  | "telemed_cognition"
  | "qa_event"
  | "escalation"
  | "learning_update"
  | "population_signal"
  | "system_threshold";

export interface CognitiveBusMessage {
  topic: CognitiveTopic;
  caseId?: string;
  payload: any;
  ts: number;
}

const subscribers = new Set<any>();
const messageHistory: CognitiveBusMessage[] = [];
const MAX_HISTORY = 200;

export function registerCognitiveSubscriber(ws: any): void {
  subscribers.add(ws);
  ws.on?.("close", () => subscribers.delete(ws));
}

export function publishCognitive(msg: CognitiveBusMessage): void {
  messageHistory.unshift(msg);
  if (messageHistory.length > MAX_HISTORY) messageHistory.length = MAX_HISTORY;

  const data = JSON.stringify(msg);
  for (const ws of subscribers) {
    try {
      if (ws.readyState === 1) ws.send(data);
    } catch { }
  }
}

export function getCognitiveHistory(limit = 50): CognitiveBusMessage[] {
  return messageHistory.slice(0, limit);
}

export function getCognitiveSubscriberCount(): number {
  return subscribers.size;
}

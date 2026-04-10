export interface QueuedPatient {
  id: string;
  risk?: string;
  complaint?: string;
  ts: number;
  [key: string]: unknown;
}

const queue: QueuedPatient[] = [];

export function addPatient(p: Omit<QueuedPatient, "ts"> & Partial<Pick<QueuedPatient, "ts">>): QueuedPatient {
  const entry: QueuedPatient = { ...p, ts: p.ts ?? Date.now() };
  queue.push(entry);
  return entry;
}

export function nextPatient(): QueuedPatient | undefined {
  queue.sort((a, b) => a.ts - b.ts);
  return queue.shift();
}

export function peekQueue(): QueuedPatient[] {
  return [...queue].sort((a, b) => a.ts - b.ts);
}

export function queueLength(): number {
  return queue.length;
}

export function clearQueue(): void {
  queue.splice(0);
}

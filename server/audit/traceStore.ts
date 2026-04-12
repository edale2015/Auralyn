import crypto from "crypto";

export interface AgentTraceStep {
  agent:     string;
  input:     Record<string, unknown>;
  output:    Record<string, unknown>;
  timestamp: number;
  durationMs:number;
}

export interface ExecutionTrace {
  id:        string;
  patientId: string | undefined;
  complaint: string | undefined;
  steps:     AgentTraceStep[];
  createdAt: string;
  totalMs:   number;
}

const MAX_TRACES = 200;
const store: ExecutionTrace[] = [];

export function saveTrace(trace: Omit<ExecutionTrace, "id" | "createdAt">): ExecutionTrace {
  const full: ExecutionTrace = {
    ...trace,
    id:        crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  store.unshift(full); // newest first

  if (store.length > MAX_TRACES) store.splice(MAX_TRACES);

  return full;
}

export function getTrace(id: string): ExecutionTrace | undefined {
  return store.find((t) => t.id === id);
}

export function listTraces(limit = 20): ExecutionTrace[] {
  return store.slice(0, limit);
}

export function traceCount(): number {
  return store.length;
}

export function clearTraces(): void {
  store.splice(0);
}

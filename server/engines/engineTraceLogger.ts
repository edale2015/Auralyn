export interface TraceEntry {
  engine: string;
  input?: unknown;
  output: unknown;
  durationMs?: number;
  timestamp: string;
  sessionId?: string;
  caseId?: string;
}

const MAX_TRACE_ENTRIES = 500;
const engineTrace: TraceEntry[] = [];

export function logEngineTrace(
  engine: string,
  output: unknown,
  options: { input?: unknown; sessionId?: string; caseId?: string; startTime?: number } = {}
): void {
  const entry: TraceEntry = {
    engine,
    output,
    timestamp: new Date().toISOString(),
  };

  if (options.input !== undefined) entry.input = options.input;
  if (options.sessionId) entry.sessionId = options.sessionId;
  if (options.caseId) entry.caseId = options.caseId;
  if (options.startTime) entry.durationMs = Date.now() - options.startTime;

  engineTrace.push(entry);

  if (engineTrace.length > MAX_TRACE_ENTRIES) {
    engineTrace.splice(0, engineTrace.length - MAX_TRACE_ENTRIES);
  }
}

export function getTrace(options: { limit?: number; sessionId?: string; caseId?: string } = {}): TraceEntry[] {
  let result = [...engineTrace];

  if (options.sessionId) result = result.filter((e) => e.sessionId === options.sessionId);
  if (options.caseId) result = result.filter((e) => e.caseId === options.caseId);

  return result.slice(-(options.limit ?? 100)).reverse();
}

export function clearTrace(): void {
  engineTrace.splice(0, engineTrace.length);
}

export function getTraceStats(): {
  total: number;
  engines: Record<string, number>;
  avgDurationMs: number;
} {
  const engines: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;

  for (const entry of engineTrace) {
    engines[entry.engine] = (engines[entry.engine] ?? 0) + 1;
    if (entry.durationMs != null) {
      totalDuration += entry.durationMs;
      durationCount++;
    }
  }

  return {
    total: engineTrace.length,
    engines,
    avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
  };
}

export function withTrace<T>(
  engineName: string,
  fn: () => T,
  options: { sessionId?: string; caseId?: string; input?: unknown } = {}
): T {
  const start = Date.now();
  const result = fn();
  logEngineTrace(engineName, result, { ...options, startTime: start });
  return result;
}

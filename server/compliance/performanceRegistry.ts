export interface PerformanceEntry {
  caseId?: string;
  packId?: string;
  correct: boolean;
  confidence?: number;
  latencyMs?: number;
  timestamp: string;
}

const registry: PerformanceEntry[] = [];

export function logPerformance(entry: Omit<PerformanceEntry, "timestamp">): PerformanceEntry {
  const full: PerformanceEntry = { ...entry, timestamp: new Date().toISOString() };
  registry.push(full);
  return full;
}

export interface PerformanceStats {
  total: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgConfidence: number;
  avgLatencyMs: number;
  byPack: Record<string, { total: number; correct: number; accuracy: number }>;
}

export function getPerformanceStats(): PerformanceStats {
  const total = registry.length;
  const correct = registry.filter((e) => e.correct).length;
  const incorrect = total - correct;

  const confidences = registry.filter((e) => e.confidence !== undefined).map((e) => e.confidence!);
  const latencies = registry.filter((e) => e.latencyMs !== undefined).map((e) => e.latencyMs!);

  const byPack: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const e of registry) {
    const key = e.packId || "unknown";
    if (!byPack[key]) byPack[key] = { total: 0, correct: 0, accuracy: 0 };
    byPack[key].total++;
    if (e.correct) byPack[key].correct++;
    byPack[key].accuracy = Math.round((byPack[key].correct / byPack[key].total) * 1000) / 10;
  }

  return {
    total,
    correct,
    incorrect,
    accuracy: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
    avgConfidence: confidences.length > 0 ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100 : 0,
    avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    byPack,
  };
}

export function getPerformanceLog(limit = 100): PerformanceEntry[] {
  return registry.slice(-limit);
}

export function clearPerformanceRegistry(): void {
  registry.length = 0;
}

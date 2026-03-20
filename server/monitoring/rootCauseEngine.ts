import { getRecentEvents, TowerEvent } from "../controlTower/eventBus";
import { emitEvent } from "../controlTower/eventBus";

export interface FailureSource {
  source: string;
  count: number;
  percentage: number;
  lastSeen: string;
  sampleMessages: string[];
}

export interface RootCauseReport {
  totalErrors: number;
  analysisWindowEvents: number;
  topSources: FailureSource[];
  topFailureSource: string | null;
  topFailurePercent: number;
  generatedAt: string;
}

export function analyzeFailure(events?: TowerEvent[]): RootCauseReport {
  const source = events ?? getRecentEvents(500);
  const errors = source.filter((e) => e.type === "ERROR" || e.type === "RPA_FAILURE" || e.type === "TIMEOUT");

  const grouped: Record<string, { count: number; last: number; messages: string[] }> = {};

  for (const e of errors) {
    const src = e.payload?.source ?? "unknown";
    if (!grouped[src]) grouped[src] = { count: 0, last: 0, messages: [] };
    grouped[src].count++;
    grouped[src].last = Math.max(grouped[src].last, e.timestamp);
    const msg = e.payload?.error ?? e.payload?.message ?? e.payload?.reason ?? "";
    if (msg && grouped[src].messages.length < 3) {
      grouped[src].messages.push(String(msg).slice(0, 100));
    }
  }

  const totalErrors = errors.length;

  const topSources: FailureSource[] = Object.entries(grouped)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([src, data]) => ({
      source: src,
      count: data.count,
      percentage: totalErrors > 0 ? Math.round((data.count / totalErrors) * 100) : 0,
      lastSeen: new Date(data.last).toISOString(),
      sampleMessages: data.messages,
    }));

  const top = topSources[0] ?? null;

  if (top && top.percentage >= 30) {
    emitEvent({
      type: "ALERT",
      payload: {
        source: "rootCauseEngine",
        severity: top.percentage >= 60 ? "CRITICAL" : "HIGH",
        message: `Top failure source: ${top.source} (${top.percentage}% of errors)`,
        topSource: top.source,
        errorCount: top.count,
      },
      timestamp: Date.now(),
    });
  }

  return {
    totalErrors,
    analysisWindowEvents: source.length,
    topSources,
    topFailureSource: top?.source ?? null,
    topFailurePercent: top?.percentage ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

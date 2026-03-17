import { eventBus, SystemEvent } from "../realtime/eventBus";

export interface RootCauseResult {
  rootCause: string | null;
  errorCounts: Record<string, number>;
  topSources: { source: string; count: number }[];
  patterns: string[];
  analyzedAt: number;
}

export class RootCauseEngine {
  analyze(events?: SystemEvent[]): RootCauseResult {
    const eventList = events || eventBus.getRecentEvents(200);
    const errorSources: Record<string, number> = {};
    const patterns: string[] = [];

    eventList.forEach((e) => {
      if (e.type === "error") {
        errorSources[e.source] = (errorSources[e.source] || 0) + 1;
      }
    });

    const sorted = Object.entries(errorSources).sort((a, b) => b[1] - a[1]);
    const topSources = sorted.map(([source, count]) => ({ source, count }));

    if (sorted.length >= 2 && sorted[0][1] > sorted[1][1] * 2) {
      patterns.push(`${sorted[0][0]} is the dominant error source — likely root cause`);
    }

    const errorTimestamps = eventList.filter((e) => e.type === "error").map((e) => e.timestamp);
    if (errorTimestamps.length >= 3) {
      const gaps = [];
      for (let i = 1; i < errorTimestamps.length; i++) gaps.push(errorTimestamps[i - 1] - errorTimestamps[i]);
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      if (avgGap < 5000) patterns.push("Error burst detected — errors clustering within 5s windows");
    }

    return {
      rootCause: sorted[0]?.[0] || null,
      errorCounts: errorSources,
      topSources,
      patterns,
      analyzedAt: Date.now(),
    };
  }
}

export const rootCauseEngine = new RootCauseEngine();

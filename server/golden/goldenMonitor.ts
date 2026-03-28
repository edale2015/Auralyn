import { runAllGoldenCases, type GoldenResult } from "./goldenRunner";

export interface GoldenRunSummary {
  ranAt: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  avgLatencyMs: number;
  results: GoldenResult[];
}

let lastSummary: GoldenRunSummary | null = null;
let isRunning = false;
let timer: ReturnType<typeof setInterval> | null = null;

export async function runGoldenMonitor(): Promise<GoldenRunSummary> {
  if (isRunning) return lastSummary!;
  isRunning = true;

  try {
    console.log("[GoldenMonitor] Starting golden case run…");
    const results = await runAllGoldenCases();

    const passed  = results.filter(r => r.passed).length;
    const failed  = results.filter(r => !r.passed).length;
    const blocked = results.filter(r => r.blocked).length;
    const avgMs   = Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / (results.length || 1));

    const summary: GoldenRunSummary = {
      ranAt: new Date().toISOString(),
      total: results.length,
      passed,
      failed,
      blocked,
      avgLatencyMs: avgMs,
      results,
    };

    lastSummary = summary;

    if (failed > 0) {
      const failures = results.filter(r => !r.passed).map(r => r.caseId);
      console.error(`[GoldenMonitor] ⚠ ${failed}/${results.length} FAILED — ${failures.join(", ")}`);
    } else {
      console.log(`[GoldenMonitor] ✅ All ${results.length} golden cases passed (avg ${avgMs}ms)`);
    }

    return summary;
  } finally {
    isRunning = false;
  }
}

export function getLastGoldenSummary(): GoldenRunSummary | null {
  return lastSummary;
}

export function startGoldenMonitor(intervalMs = 300_000) {
  if (timer) return;
  setTimeout(() => runGoldenMonitor().catch(() => {}), 5_000);
  timer = setInterval(() => runGoldenMonitor().catch(() => {}), intervalMs);
  console.log(`[GoldenMonitor] Started (every ${intervalMs / 1000}s + initial run in 5s)`);
}

export function stopGoldenMonitor() {
  if (timer) { clearInterval(timer); timer = null; }
}

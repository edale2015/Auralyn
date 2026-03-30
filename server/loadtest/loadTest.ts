/**
 * Recommendation #3 — Internal Load Test Utility
 *
 * Validates 10,000 patient/day capacity using the real autonomous pipeline.
 * Tracks P50/P95/P99 latency, error rate, and agent failures internally.
 *
 * Usage (from project root):
 *   npx ts-node server/loadtest/loadTest.ts [total] [concurrency]
 *
 * Defaults: 1000 requests, 50 concurrent.
 */

import { runAutonomousPipeline } from "../system/runAutonomousPipeline";

const SAMPLE_CASES = [
  { symptoms: ["sore throat", "fever"],            complaint: "sore throat" },
  { symptoms: ["ear pain", "hearing loss"],         complaint: "ear pain" },
  { symptoms: ["cough", "runny nose", "congestion"], complaint: "cold" },
  { symptoms: ["headache", "facial pressure"],      complaint: "sinus pressure" },
  { symptoms: ["fever", "body aches", "fatigue"],   complaint: "flu-like illness" },
];

interface LoadTestResult {
  total:      number;
  concurrency: number;
  succeeded:  number;
  failed:     number;
  errorRate:  number;
  p50Ms:      number;
  p95Ms:      number;
  p99Ms:      number;
  minMs:      number;
  maxMs:      number;
  durationMs: number;
  rps:        number;
}

export async function runLoadTest(
  total       = 1000,
  concurrency = 50,
): Promise<LoadTestResult> {
  const latencies: number[] = [];
  let succeeded = 0;
  let failed    = 0;
  let idx       = 0;

  const start = Date.now();

  async function worker() {
    while (idx < total) {
      const thisIdx = idx++;
      const input   = SAMPLE_CASES[thisIdx % SAMPLE_CASES.length];
      const t0      = Date.now();

      try {
        const result = await runAutonomousPipeline(input);
        if ((result as any)._meta?.failed) {
          failed++;
        } else {
          succeeded++;
          latencies.push(Date.now() - t0);
        }
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const wallMs = Date.now() - start;

  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.floor(latencies.length * p)] ?? 0;

  return {
    total,
    concurrency,
    succeeded,
    failed,
    errorRate:  failed / total,
    p50Ms:      pct(0.5),
    p95Ms:      pct(0.95),
    p99Ms:      pct(0.99),
    minMs:      latencies[0] ?? 0,
    maxMs:      latencies.at(-1) ?? 0,
    durationMs: wallMs,
    rps:        Math.round((total / wallMs) * 1000),
  };
}

/* ── CLI entrypoint ─────────────────────────────────────────────────────── */
if (require.main === module) {
  const total       = parseInt(process.argv[2] ?? "1000", 10);
  const concurrency = parseInt(process.argv[3] ?? "50",   10);

  console.log(`\n🚀 Auralyn Load Test — ${total} requests @ concurrency ${concurrency}\n`);

  runLoadTest(total, concurrency).then(r => {
    console.log("─".repeat(50));
    console.log(`✅ Succeeded   : ${r.succeeded}`);
    console.log(`❌ Failed      : ${r.failed}`);
    console.log(`📉 Error Rate  : ${(r.errorRate * 100).toFixed(1)}%`);
    console.log(`⚡ P50 Latency : ${r.p50Ms}ms`);
    console.log(`⚡ P95 Latency : ${r.p95Ms}ms`);
    console.log(`⚡ P99 Latency : ${r.p99Ms}ms`);
    console.log(`📊 RPS         : ${r.rps} req/sec`);
    console.log(`⏱  Total time  : ${(r.durationMs / 1000).toFixed(1)}s`);
    console.log(`📈 Daily cap   : ~${(r.rps * 86400).toLocaleString()} patients/day`);
    console.log("─".repeat(50));
  }).catch(console.error);
}

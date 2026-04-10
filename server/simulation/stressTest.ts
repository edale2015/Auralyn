import { runFinalPipeline } from "../clinical/finalPipeline";

export interface StressTestResult {
  total: number;
  erRate: number;
  errors: number;
  durationMs: number;
  throughputPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

const COMPLAINTS = [
  "chest pain", "shortness of breath", "headache", "abdominal pain",
  "fever", "dizziness", "back pain", "nausea", "ankle injury", "cough",
];

export async function runStressTest(n = 50_000): Promise<StressTestResult> {
  const start = Date.now();
  let errors = 0;
  let er = 0;
  const latencies: number[] = [];

  const BATCH = 200;
  for (let offset = 0; offset < n; offset += BATCH) {
    const batchSize = Math.min(BATCH, n - offset);
    await Promise.all(
      Array.from({ length: batchSize }).map(async (_, j) => {
        const i = offset + j;
        const t0 = Date.now();
        try {
          const complaint = COMPLAINTS[i % COMPLAINTS.length];
          const result = runFinalPipeline({
            patientId: `S${i}`,
            freeText: complaint,
            ageYears: 20 + (i % 60),
          });
          if (result.safetyDisposition === "ER_NOW") er++;
          latencies.push(Date.now() - t0);
        } catch {
          errors++;
          latencies.push(Date.now() - t0);
        }
      })
    );
  }

  const durationMs = Date.now() - start;
  latencies.sort((a, b) => a - b);

  const pct = (p: number) => latencies[Math.floor(latencies.length * p)] ?? 0;

  return {
    total: n,
    erRate: n > 0 ? er / n : 0,
    errors,
    durationMs,
    throughputPerSec: n / (durationMs / 1000),
    p50Ms: pct(0.5),
    p95Ms: pct(0.95),
    p99Ms: pct(0.99),
  };
}

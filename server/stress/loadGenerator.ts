interface PatientCase {
  complaint: string;
  answers: Record<string, any>;
}

interface LoadTestResult {
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  p95LatencyMs: number;
  throughputPerSecond: number;
  durationMs: number;
  safetyBlocked: number;
  breakdown: Record<string, number>;
}

const PATIENT_CASES: PatientCase[] = [
  { complaint: "cough", answers: { age: 70, cough: true } },
  { complaint: "chest-pain", answers: { age: 65, chestPain: true } },
  { complaint: "fever", answers: { age: 25, fever: true } },
  { complaint: "fever", answers: { age: 3, fever: true } },
  { complaint: "cough", answers: { age: 30, pregnant: true, medications: ["ibuprofen"] } },
  { complaint: "sore-throat", answers: { age: 50, sob: true } },
  { complaint: "sore-throat", answers: { age: 28, fever: true, exudate: true } },
  { complaint: "ear-pain", answers: { age: 8, earPain: true, fever: true } },
  { complaint: "sinus", answers: { age: 40, congestion: true } },
  { complaint: "cough", answers: { age: 55, smoker: true } },
];

function pickCase(i: number): PatientCase {
  return PATIENT_CASES[i % PATIENT_CASES.length];
}

async function runSinglePatient(
  baseUrl: string,
  token: string,
  caseData: PatientCase
): Promise<{ ok: boolean; latencyMs: number; blocked: boolean }> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/clinical/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(caseData),
    });
    const body = await res.json() as any;
    return {
      ok: res.ok || res.status < 500,
      latencyMs: Date.now() - start,
      blocked: body?.blocked === true,
    };
  } catch {
    return { ok: false, latencyMs: Date.now() - start, blocked: false };
  }
}

export async function runLoadTest(
  total = 100,
  concurrency = 10,
  baseUrl = "http://localhost:5000",
  token = ""
): Promise<LoadTestResult> {
  const start = Date.now();
  let completed = 0;
  let failed = 0;
  let safetyBlocked = 0;
  const latencies: number[] = [];
  const breakdown: Record<string, number> = {};

  const runBatch = async (batchStart: number, batchSize: number) => {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < batchSize; i++) {
      const caseData = pickCase(batchStart + i);
      promises.push(
        runSinglePatient(baseUrl, token, caseData).then(result => {
          latencies.push(result.latencyMs);
          if (result.ok) {
            completed++;
          } else {
            failed++;
          }
          if (result.blocked) safetyBlocked++;
          breakdown[caseData.complaint] = (breakdown[caseData.complaint] || 0) + 1;
        })
      );
    }
    await Promise.all(promises);
  };

  let processed = 0;
  while (processed < total) {
    const batchSize = Math.min(concurrency, total - processed);
    await runBatch(processed, batchSize);
    processed += batchSize;
    console.log(`[LoadGenerator] Progress: ${processed}/${total}`);
  }

  const durationMs = Date.now() - start;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  return {
    total,
    completed,
    failed,
    successRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    avgLatencyMs: Math.round(avg),
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
    minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
    p95LatencyMs: sorted[p95Index] ?? 0,
    throughputPerSecond: durationMs > 0 ? Math.round((total / durationMs) * 1000 * 10) / 10 : 0,
    durationMs,
    safetyBlocked,
    breakdown,
  };
}

import { SimulationCase } from "./simulationCaseFactory";
import { SimulationEvaluation } from "./simulationEvaluator";
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface SimulationRunRecord {
  runId: string;
  createdAt: number;
  complaint: string;
  difficulty: string;
  cases: SimulationCase[];
  results: SimulationEvaluation[];
  summary: {
    totalCases: number;
    dispositionAccuracy: number;
    diagnosisAccuracy: number;
    avgScore: number;
    redFlagMissRate: number;
  };
  failureBreakdown?: Record<string, number>;
  learningUpdates?: any[];
}

const simulationRuns: SimulationRunRecord[] = [];

// ── DB persistence ─────────────────────────────────────────────────────────────
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS simulation_pack_runs (
      run_id              TEXT PRIMARY KEY,
      created_at          BIGINT NOT NULL,
      complaint           TEXT NOT NULL,
      difficulty          TEXT NOT NULL,
      total_cases         INTEGER,
      pass_rate           NUMERIC(5,4),
      avg_score           NUMERIC(5,4),
      red_flag_miss_rate  NUMERIC(5,4),
      failure_breakdown   JSONB,
      summary             JSONB,
      created_timestamp   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function persistRun(run: SimulationRunRecord) {
  try {
    await db.execute(sql`
      INSERT INTO simulation_pack_runs
        (run_id, created_at, complaint, difficulty, total_cases, pass_rate, avg_score, red_flag_miss_rate, failure_breakdown, summary)
      VALUES (
        ${run.runId},
        ${run.createdAt},
        ${run.complaint},
        ${run.difficulty},
        ${run.summary.totalCases},
        ${run.summary.dispositionAccuracy},
        ${run.summary.avgScore},
        ${run.summary.redFlagMissRate},
        ${JSON.stringify(run.failureBreakdown ?? {})},
        ${JSON.stringify(run.summary)}
      )
      ON CONFLICT (run_id) DO NOTHING
    `);
  } catch (e: any) {
    console.warn("[SimulationStore] DB persist failed:", e.message);
  }
}

// ── Heatmap persistence ────────────────────────────────────────────────────────
async function ensureHeatmapTable() {
  // No FK to simulation_pack_runs — heatmap save is async/fire-and-forget and may
  // race with the parent row write. The run_id is the logical join key.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS simulation_run_heatmaps (
      run_id       TEXT PRIMARY KEY,
      heatmap_data JSONB NOT NULL,
      complaints   TEXT[],
      reasons      TEXT[],
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function saveHeatmap(runId: string, heatmapData: {
  complaints: string[];
  reasons: string[];
  grid: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}) {
  try {
    await db.execute(sql`
      INSERT INTO simulation_run_heatmaps (run_id, heatmap_data, complaints, reasons)
      VALUES (
        ${runId},
        ${JSON.stringify(heatmapData)},
        ${heatmapData.complaints as any},
        ${heatmapData.reasons as any}
      )
      ON CONFLICT (run_id) DO UPDATE
        SET heatmap_data = EXCLUDED.heatmap_data,
            complaints   = EXCLUDED.complaints,
            reasons      = EXCLUDED.reasons
    `);
  } catch (e: any) {
    console.warn("[SimulationStore] Heatmap persist failed:", e.message);
  }
}

export async function getHeatmap(runId: string) {
  try {
    const xRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);
    const rows = await db.execute(sql`
      SELECT run_id, heatmap_data, complaints, reasons, created_at
      FROM simulation_run_heatmaps WHERE run_id = ${runId}
    `);
    const r = xRows(rows)[0];
    if (!r) return null;
    return { runId: r.run_id, ...(r.heatmap_data as object), createdAt: r.created_at };
  } catch {
    return null;
  }
}

export function computeHeatmapFromResults(results: any[]) {
  const failures = results.filter((r: any) => !r.dispositionCorrect || r.redFlagMiss);
  const complaintSet = new Set<string>();
  const reasonSet = new Set<string>();
  const raw: Record<string, Record<string, number>> = {};

  for (const f of failures) {
    const complaint = f.complaint ?? "unknown";
    const rs: string[] = [...(f.failureReasons ?? f.reasons ?? [])];
    if (f.redFlagMiss) rs.push("missed_red_flag");
    if (!f.dispositionCorrect) rs.push("disposition_error");
    complaintSet.add(complaint);
    for (const r of rs) {
      reasonSet.add(r);
      if (!raw[complaint]) raw[complaint] = {};
      raw[complaint][r] = (raw[complaint][r] ?? 0) + 1;
    }
  }

  const complaints = Array.from(complaintSet);
  const reasons = Array.from(reasonSet);
  const totals: Record<string, number> = {};
  for (const c of complaints) {
    totals[c] = Object.values(raw[c] ?? {}).reduce((a, b) => a + b, 0);
  }

  return { complaints, reasons, grid: raw, totals };
}

export async function initSimulationStore() {
  try {
    await ensureTable();
    await ensureHeatmapTable();
    const xRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);
    const rows = await db.execute(sql`
      SELECT run_id, created_at, complaint, difficulty, summary, failure_breakdown
      FROM simulation_pack_runs ORDER BY created_at DESC LIMIT 50
    `);
    const loaded = xRows(rows);
    for (const row of loaded) {
      if (!simulationRuns.find(r => r.runId === row.run_id)) {
        simulationRuns.push({
          runId: row.run_id as string,
          createdAt: Number(row.created_at),
          complaint: row.complaint as string,
          difficulty: row.difficulty as string,
          cases: [],
          results: [],
          summary: (row.summary as any) ?? {
            totalCases: 0, dispositionAccuracy: 0, diagnosisAccuracy: 0, avgScore: 0, redFlagMissRate: 0,
          },
          failureBreakdown: row.failure_breakdown as any,
        });
      }
    }
    console.log(`[SimulationStore] Loaded ${loaded.length} past runs from DB`);
  } catch (e: any) {
    console.warn("[SimulationStore] Init warning:", e.message);
  }
}

export function saveSimulationRun(run: SimulationRunRecord) {
  simulationRuns.unshift(run);
  if (simulationRuns.length > 100) simulationRuns.pop();
  persistRun(run).catch(() => {});
}

export function listSimulationRuns() {
  return simulationRuns.map(r => ({
    runId: r.runId,
    createdAt: r.createdAt,
    complaint: r.complaint,
    difficulty: r.difficulty,
    summary: r.summary,
    failureBreakdown: r.failureBreakdown,
  }));
}

export function getSimulationRun(runId: string) {
  return simulationRuns.find(r => r.runId === runId) ?? null;
}

export function clearSimulationRuns() {
  simulationRuns.length = 0;
}

export function getLastRunSummary() {
  return simulationRuns[0]?.summary ?? null;
}

export async function getRunHistory(limit = 30) {
  try {
    const xRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);
    const rows = await db.execute(sql`
      SELECT run_id, created_at, complaint, difficulty, total_cases, pass_rate,
             avg_score, red_flag_miss_rate, failure_breakdown, created_timestamp
      FROM simulation_pack_runs ORDER BY created_at DESC LIMIT ${limit}
    `);
    return xRows(rows);
  } catch {
    return simulationRuns.slice(0, limit).map(r => ({
      run_id: r.runId,
      created_at: r.createdAt,
      complaint: r.complaint,
      difficulty: r.difficulty,
      total_cases: r.summary.totalCases,
      pass_rate: r.summary.dispositionAccuracy,
    }));
  }
}

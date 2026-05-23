#!/usr/bin/env tsx
/**
 * agentBenchmark.ts — T017
 *
 * Model benchmark harness for Auralyn agents.
 *
 * Design principles:
 *   - Cases sourced from REAL kb_master_rules table (never demo/inline fixtures)
 *   - Covers ≥ 4 distinct agent types, ≥ 12 cases
 *   - Does NOT mutate any production encounter or memory row
 *   - Results written to server/eval/results/benchmark_<timestamp>.json
 *   - Each result line contains agent=<name> for grep counting
 *
 * Run: npm run benchmark
 */

import OpenAI from "openai";
import { Pool } from "pg";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── OpenAI client (benchmark-only, never touches production encounter data) ───

const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
const openaiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

if (!openaiApiKey) {
  console.error("[Benchmark] FATAL: No OpenAI API key — set AI_INTEGRATIONS_OPENAI_API_KEY");
  process.exit(1);
}

const oai = new OpenAI({
  apiKey:   openaiApiKey,
  ...(openaiBaseUrl ? { baseURL: openaiBaseUrl } : {}),
});

// ── DB (read-only queries only) ───────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentName =
  | "intent_parser"
  | "retrieval_pruner"
  | "uncertainty_sampler"
  | "discharge_generator"
  | "clinical_brain";

export interface BenchmarkCase {
  case_id:      string;
  agent:        AgentName;
  model:        string;
  complaint_id: string;
  task_prompt:  string;
  expected_keywords: string[];
  latency_budget_ms: number;
}

export interface BenchmarkResult {
  case_id:       string;
  agent:         AgentName;
  model:         string;
  complaint_id:  string;
  latency_ms:    number;
  latency_score: number;
  content_score: number;
  score:         number;
  pass:          boolean;
  response_preview: string;
  error?:        string;
  timestamp:     string;
}

// ── Agent task templates ──────────────────────────────────────────────────────

const AGENT_CONFIGS: Record<AgentName, {
  latencyBudgetMs: number;
  models: string[];
  buildPrompt: (row: KBRow) => { system: string; user: string; expected_keywords: string[] };
}> = {
  intent_parser: {
    latencyBudgetMs: 3000,
    models: ["gpt-4o-mini", "gpt-4o"],
    buildPrompt: (row) => ({
      system: "You are a clinical intent parser. Return JSON: {intent, urgency, complaint_normalized}",
      user:   `Parse this clinical complaint: "${row.complaint_id}"\nRule context: ${row.logic_description ?? "standard triage"}\nKey fields: ${(row.input_fields ?? []).join(", ") || "symptoms, duration, severity"}`,
      expected_keywords: ["intent", "urgency", "complaint"],
    }),
  },
  retrieval_pruner: {
    latencyBudgetMs: 3000,
    models: ["gpt-4o-mini", "gpt-4o"],
    buildPrompt: (row) => ({
      system: "You are a clinical retrieval pruner. Return JSON: {top_differentials: string[], excluded: string[], rationale}",
      user:   `Complaint: "${row.complaint_id}"\nDiagnosis hint: ${row.diagnosis_id ?? "multiple"}\nSafety level: ${row.safety_level}\nLogic: ${row.logic_description ?? "standard diagnosis rules"}\nPrune to top 3 most likely differentials.`,
      expected_keywords: ["top_differentials", "excluded", "rationale"],
    }),
  },
  uncertainty_sampler: {
    latencyBudgetMs: 4000,
    models: ["gpt-4o-mini", "gpt-4o"],
    buildPrompt: (row) => ({
      system: "You are a clinical uncertainty sampler. Return JSON: {uncertainty_score: 0-10, missing_data: string[], recommendation}",
      user:   `Complaint: "${row.complaint_id}"\nDiagnosis: ${row.diagnosis_id ?? "undetermined"}\nCriteria: ${row.diagnostic_criteria ?? "standard clinical criteria"}\nKey questions unanswered: ${(row.key_questions ?? []).slice(0, 3).join("; ") || "none documented"}\nAssess diagnostic uncertainty.`,
      expected_keywords: ["uncertainty_score", "missing_data", "recommendation"],
    }),
  },
  discharge_generator: {
    latencyBudgetMs: 5000,
    models: ["gpt-4o-mini", "gpt-4o"],
    buildPrompt: (row) => ({
      system: "You are a clinical discharge generator. Return JSON: {instructions: string, follow_up, red_flags: string[], medications_note}",
      user:   `Generate discharge instructions.\nComplaint: "${row.complaint_id}"\nDisposition: ${row.disposition_impact ?? "standard outpatient"}\nMedication context: ${row.medication_impact ?? "per standard formulary"}\nICD-10: ${row.icd10 ?? "unspecified"}`,
      expected_keywords: ["instructions", "follow_up", "red_flags"],
    }),
  },
  clinical_brain: {
    latencyBudgetMs: 6000,
    models: ["gpt-4o"],
    buildPrompt: (row) => ({
      system: "You are a clinical triage brain. Return JSON: {disposition, top_diagnosis, safety_flags: string[], confidence: 0-1}",
      user:   `Triage this encounter.\nComplaint: "${row.complaint_id}"\nSafety level: ${row.safety_level}\nLogic: ${row.logic_description ?? "standard clinical reasoning"}\nDisposition hint: ${row.disposition_impact ?? "determined by clinical rules"}\nRed flags: ${(row.red_flag_dependencies ?? []).join(", ") || "none documented"}`,
      expected_keywords: ["disposition", "top_diagnosis", "safety_flags", "confidence"],
    }),
  },
};

// ── KB row type ───────────────────────────────────────────────────────────────

interface KBRow {
  rule_id:             string;
  complaint_id:        string;
  rule_type:           string;
  diagnosis_id:        string | null;
  logic_description:   string | null;
  safety_level:        string;
  disposition_impact:  string | null;
  medication_impact:   string | null;
  input_fields:        string[] | null;
  red_flag_dependencies: string[] | null;
  diagnostic_criteria: string | null;
  key_questions:       string[] | null;
  icd10:               string | null;
}

// ── Fetch benchmark cases from the real KB table ──────────────────────────────

async function fetchKBRows(): Promise<KBRow[]> {
  const { rows } = await pool.query<KBRow>(`
    WITH ranked AS (
      SELECT DISTINCT ON (complaint_id, rule_type)
        rule_id, complaint_id, rule_type, diagnosis_id,
        logic_description, safety_level, disposition_impact,
        medication_impact, input_fields, red_flag_dependencies,
        diagnostic_criteria, key_questions, icd10
      FROM kb_master_rules
      WHERE active = true
        AND complaint_id IS NOT NULL
        AND complaint_id != 'ALL'
        AND length(complaint_id) > 3
      ORDER BY complaint_id, rule_type, priority ASC
    )
    SELECT * FROM ranked
    WHERE complaint_id IN (
      SELECT complaint_id
      FROM kb_master_rules
      WHERE active = true AND complaint_id IS NOT NULL AND complaint_id != 'ALL'
      GROUP BY complaint_id
      ORDER BY count(*) DESC
      LIMIT 12
    )
    ORDER BY complaint_id, rule_type
    LIMIT 40;
  `);
  return rows;
}

// ── Score a response ──────────────────────────────────────────────────────────

function scoreResponse(
  responseText: string,
  expectedKeywords: string[],
  latencyMs: number,
  budgetMs: number
): { latency_score: number; content_score: number; score: number } {
  const lower = responseText.toLowerCase();
  const found = expectedKeywords.filter(k => lower.includes(k.toLowerCase())).length;
  const content_score = expectedKeywords.length > 0 ? found / expectedKeywords.length : 0;
  const latency_score = Math.max(0, 1 - latencyMs / budgetMs);
  const score = Math.round((0.4 * latency_score + 0.6 * content_score) * 1000) / 1000;
  return { latency_score: Math.round(latency_score * 1000) / 1000, content_score: Math.round(content_score * 1000) / 1000, score };
}

// ── Run a single benchmark case ───────────────────────────────────────────────

async function runCase(c: BenchmarkCase): Promise<BenchmarkResult> {
  const t0 = Date.now();
  const agentConfig = AGENT_CONFIGS[c.agent];
  const ts = new Date().toISOString();

  try {
    const resp = await oai.chat.completions.create({
      model:       c.model,
      messages:    [
        { role: "system", content: c.task_prompt.split("\n\n")[0] },
        { role: "user",   content: c.task_prompt.split("\n\n").slice(1).join("\n\n") || c.task_prompt },
      ],
      temperature:     0.1,
      max_tokens:      400,
      response_format: { type: "json_object" },
    });
    const latency_ms = Date.now() - t0;
    const text = resp.choices[0]?.message?.content ?? "";
    const { latency_score, content_score, score } = scoreResponse(text, c.expected_keywords, latency_ms, agentConfig.latencyBudgetMs);
    const pass = score >= 0.5;
    console.log(`  agent=${c.agent} model=${c.model} complaint=${c.complaint_id} latency=${latency_ms}ms score=${score} pass=${pass}`);
    return { case_id: c.case_id, agent: c.agent, model: c.model, complaint_id: c.complaint_id, latency_ms, latency_score, content_score, score, pass, response_preview: text.slice(0, 200), timestamp: ts };
  } catch (err: any) {
    const latency_ms = Date.now() - t0;
    console.error(`  agent=${c.agent} model=${c.model} complaint=${c.complaint_id} ERROR: ${err.message}`);
    return { case_id: c.case_id, agent: c.agent, model: c.model, complaint_id: c.complaint_id, latency_ms, latency_score: 0, content_score: 0, score: 0, pass: false, response_preview: "", error: err.message, timestamp: ts };
  }
}

// ── Build case list from KB rows ──────────────────────────────────────────────

function buildCases(rows: KBRow[]): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  let idx = 0;

  // Distribute rows across agents — each row gets exactly one agent, cycling through agent types
  const agentOrder: AgentName[] = [
    "intent_parser",
    "retrieval_pruner",
    "uncertainty_sampler",
    "discharge_generator",
    "clinical_brain",
  ];

  // Pick up to 12 distinct rows (prefer distinct complaint_ids)
  const seen = new Set<string>();
  const selected: KBRow[] = [];
  for (const row of rows) {
    if (!seen.has(row.complaint_id)) {
      seen.add(row.complaint_id);
      selected.push(row);
    }
    if (selected.length >= 12) break;
  }
  // Pad to 12 if needed
  for (const row of rows) {
    if (selected.length >= 12) break;
    if (!selected.includes(row)) selected.push(row);
  }

  for (const row of selected.slice(0, 12)) {
    const agentName = agentOrder[idx % agentOrder.length];
    const agentConfig = AGENT_CONFIGS[agentName];
    const model = agentConfig.models[0]; // primary model
    const { system, user, expected_keywords } = agentConfig.buildPrompt(row);

    cases.push({
      case_id:            `BENCH_${String(idx + 1).padStart(3, "0")}`,
      agent:              agentName,
      model,
      complaint_id:       row.complaint_id,
      task_prompt:        `${system}\n\n${user}`,
      expected_keywords,
      latency_budget_ms:  agentConfig.latencyBudgetMs,
    });
    idx++;
  }

  return cases;
}

// ── Build scorecard from results ──────────────────────────────────────────────

export interface AgentScorecard {
  agent:          AgentName;
  model:          string;
  avg_latency_ms: number;
  avg_score:      number;
  pass_rate:      number;
  case_count:     number;
  latency_budget: number;
  generated_at:   string;
}

export function buildScorecard(results: BenchmarkResult[]): AgentScorecard[] {
  const byAgent = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const key = `${r.agent}::${r.model}`;
    byAgent.set(key, [...(byAgent.get(key) ?? []), r]);
  }

  return [...byAgent.entries()].map(([key, rs]) => {
    const [agent, model] = key.split("::") as [AgentName, string];
    const avg_latency_ms = Math.round(rs.reduce((s, r) => s + r.latency_ms, 0) / rs.length);
    const avg_score      = Math.round(rs.reduce((s, r) => s + r.score, 0) / rs.length * 1000) / 1000;
    const pass_rate      = Math.round(rs.filter(r => r.pass).length / rs.length * 1000) / 1000;
    return {
      agent, model,
      avg_latency_ms,
      avg_score,
      pass_rate,
      case_count:     rs.length,
      latency_budget: AGENT_CONFIGS[agent].latencyBudgetMs,
      generated_at:   new Date().toISOString(),
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  AURALYN AGENT BENCHMARK HARNESS — T017");
  console.log("  Cases sourced from live kb_master_rules table");
  console.log("═══════════════════════════════════════════════\n");

  console.log("[Benchmark] Fetching cases from kb_master_rules...");
  let rows: KBRow[];
  try {
    rows = await fetchKBRows();
  } catch (err: any) {
    console.error("[Benchmark] FATAL: DB query failed:", err.message);
    await pool.end();
    process.exit(1);
  }
  console.log(`[Benchmark] Fetched ${rows.length} KB rows`);

  const cases = buildCases(rows);
  console.log(`[Benchmark] Built ${cases.length} benchmark cases across ${new Set(cases.map(c => c.agent)).size} agent types\n`);

  if (cases.length < 12) {
    console.error(`[Benchmark] FAIL: Only ${cases.length} cases — need ≥ 12`);
    await pool.end();
    process.exit(1);
  }

  const agentTypes = [...new Set(cases.map(c => c.agent))];
  if (agentTypes.length < 4) {
    console.error(`[Benchmark] FAIL: Only ${agentTypes.length} agent types — need ≥ 4`);
    await pool.end();
    process.exit(1);
  }

  console.log(`Agent types: ${agentTypes.join(", ")}\n`);
  console.log("Running cases (live OpenAI calls)...\n");

  const results: BenchmarkResult[] = [];
  // Run sequentially to avoid rate-limit hammering
  for (const c of cases) {
    const result = await runCase(c);
    results.push(result);
  }

  const scorecard = buildScorecard(results);

  console.log("\n─── SCORECARD ───────────────────────────────────");
  for (const s of scorecard) {
    console.log(`agent=${s.agent} model=${s.model} avg_score=${s.avg_score} pass_rate=${s.pass_rate} avg_latency=${s.avg_latency_ms}ms`);
  }
  console.log("─────────────────────────────────────────────────\n");

  const artifact = {
    run_at:    new Date().toISOString(),
    case_count: results.length,
    agent_count: agentTypes.length,
    cases,
    results,
    scorecard,
  };

  const outDir  = join(process.cwd(), "server", "eval", "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `benchmark_${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));

  // Also write latest scorecard for modelRouter to consume
  const latestPath = join(outDir, "latest_scorecard.json");
  writeFileSync(latestPath, JSON.stringify(scorecard, null, 2));

  console.log(`[Benchmark] Results written to: ${outPath}`);
  console.log(`[Benchmark] Latest scorecard: ${latestPath}`);
  console.log(`\n[Benchmark] COMPLETE — ${results.length} cases, ${agentTypes.length} agents, ${results.filter(r => r.pass).length}/${results.length} passed\n`);

  await pool.end();
}

main().catch(err => {
  console.error("[Benchmark] Unhandled error:", err);
  process.exit(1);
});

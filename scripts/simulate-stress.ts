process.env.HARNESS_MODE = "1";

import fs from "node:fs";
import path from "node:path";
import { runComplaintGraph } from "../server/services/complaintNodeRunner";
import type { CaseState } from "../shared/agentTypes";

const N = Number(process.env.N ?? "500");
const OUT = path.resolve("stress_results.json");
const SEED = Number(process.env.SEED ?? Date.now());

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function loadAllGoldens(): Array<{ cc_id: string; answers: Record<string, string>; id: string }> {
  const casesDir = path.resolve("tests/cases");
  const goldens: Array<{ cc_id: string; answers: Record<string, string>; id: string }> = [];

  if (!fs.existsSync(casesDir)) return goldens;

  for (const dir of fs.readdirSync(casesDir)) {
    const dirPath = path.join(casesDir, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith("_golden.json")) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf8"));
        if (raw.cc_id && raw.answers) {
          goldens.push({ cc_id: raw.cc_id, answers: raw.answers, id: raw.id || file });
        }
      } catch {}
    }
  }
  return goldens;
}

function loadQuestionsByComplaint(): Record<string, string[]> {
  const csvPath = path.resolve("server/data/csv/CORE_QUESTIONS.csv");
  const map: Record<string, string[]> = {};
  if (!fs.existsSync(csvPath)) return map;

  const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const ccId = parts[0]?.trim();
    const qId = parts[2]?.trim();
    if (ccId && qId) {
      if (!map[ccId]) map[ccId] = [];
      if (!map[ccId].includes(qId)) map[ccId].push(qId);
    }
  }
  return map;
}

function generateNoisyCase(
  base: { cc_id: string; answers: Record<string, string> },
  questions: string[],
  rand: () => number,
  noiseLevel: number
): Record<string, string> {
  const answers = { ...base.answers };

  for (const q of questions) {
    if (rand() < noiseLevel) {
      answers[q] = rand() < 0.5 ? "yes" : "no";
    }
  }

  return answers;
}

function buildCaseState(ccId: string, answers: Record<string, string>): CaseState {
  return {
    encounterId: `stress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    patientId: `stress_patient`,
    chiefComplaint: ccId,
    normalizedComplaint: ccId,
    answers,
    demographics: {},
    routingState: "INTAKE_PENDING",
    redFlags: [],
    scores: {},
    events: [],
    activeClusters: [],
    diagnosisClusterIds: [],
    dispositionReasonCodes: [],
    candidateMeds: [],
    spotInterventions: [],
    careGaps: [],
    recommendedActions: [],
    questionQueue: [],
    routing: { state: "INTAKE_PENDING" },
    audit: { steps: [], events: [] },
  } as unknown as CaseState;
}

async function main() {
  console.log(`Stress simulation: N=${N}, SEED=${SEED}`);
  console.log(`Loading goldens and questions...\n`);

  const goldens = loadAllGoldens();
  const questionsByCC = loadQuestionsByComplaint();
  const rand = seededRandom(SEED);

  if (goldens.length === 0) {
    console.error("No goldens found");
    process.exit(1);
  }

  console.log(`Found ${goldens.length} golden cases across ${new Set(goldens.map(g => g.cc_id)).size} complaints`);

  const results: Array<{
    i: number;
    cc_id: string;
    baseId: string;
    disposition: string;
    cluster: string;
    rf_gate: string;
    rf_fired: string[];
    noiseLevel: number;
    error?: string;
  }> = [];

  const dispDist: Record<string, number> = {};
  const clusterDist: Record<string, number> = {};
  const ccDispDist: Record<string, Record<string, number>> = {};
  const errorCount: Record<string, number> = {};
  let completed = 0;

  for (let i = 0; i < N; i++) {
    const baseIdx = Math.floor(rand() * goldens.length);
    const base = goldens[baseIdx];
    const questions = questionsByCC[base.cc_id] || Object.keys(base.answers);
    const noiseLevel = rand() * 0.4;

    const noisyAnswers = generateNoisyCase(base, questions, rand, noiseLevel);
    const state = buildCaseState(base.cc_id, noisyAnswers);

    try {
      const result = await runComplaintGraph(state, base.cc_id);
      const s = result.state as any;

      const disposition = s.dispositionLevel || s.disposition || "unknown";
      const clusters: string[] = s.activeClusters ?? [];
      const cluster = clusters.length > 0 ? clusters[0] : "UNCLASSIFIED";
      const rfGate = s.rfGateResult || "PASS";
      const rfFired = (s.triggeredRedFlags || s.redFlags || []).map((f: any) => typeof f === "string" ? f : f.ruleId || f);

      dispDist[disposition] = (dispDist[disposition] || 0) + 1;
      clusterDist[cluster] = (clusterDist[cluster] || 0) + 1;

      if (!ccDispDist[base.cc_id]) ccDispDist[base.cc_id] = {};
      ccDispDist[base.cc_id][disposition] = (ccDispDist[base.cc_id][disposition] || 0) + 1;

      results.push({
        i, cc_id: base.cc_id, baseId: base.id,
        disposition, cluster, rf_gate: rfGate, rf_fired: rfFired,
        noiseLevel,
      });
      completed++;
    } catch (e: any) {
      const stack = e.stack || "";
      const errKey = `${base.cc_id}: ${e.message?.slice(0, 80) || "unknown"}`;
      errorCount[errKey] = (errorCount[errKey] || 0) + 1;
      if (Object.values(errorCount).reduce((a, b) => a + b, 0) <= 3) {
        console.error(`\n  [DEBUG] ${base.cc_id} error stack:\n  ${stack.split("\n").slice(0, 5).join("\n  ")}`);
      }
      results.push({
        i, cc_id: base.cc_id, baseId: base.id,
        disposition: "ERROR", cluster: "ERROR", rf_gate: "ERROR", rf_fired: [],
        noiseLevel, error: e.message,
      });
    }

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`  ${i + 1}/${N} complete\r`);
    }
  }

  console.log(`\n\n=== Stress Test Results ===`);
  console.log(`Completed: ${completed}/${N}  |  Errors: ${N - completed}`);

  console.log(`\n--- Disposition Distribution ---`);
  const sortedDisp = Object.entries(dispDist).sort((a, b) => b[1] - a[1]);
  for (const [d, count] of sortedDisp) {
    const pct = ((count / N) * 100).toFixed(1);
    console.log(`  ${d}: ${count} (${pct}%)`);
  }

  console.log(`\n--- Top 20 Clusters ---`);
  const sortedClusters = Object.entries(clusterDist).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [c, count] of sortedClusters) {
    console.log(`  ${c}: ${count}`);
  }

  console.log(`\n--- Hotspots (ER_SEND % by complaint) ---`);
  const hotspots: Array<{ cc: string; erPct: number; total: number }> = [];
  for (const [cc, disps] of Object.entries(ccDispDist)) {
    const total = Object.values(disps).reduce((a, b) => a + b, 0);
    const erCount = disps["er_send"] || 0;
    const erPct = (erCount / total) * 100;
    hotspots.push({ cc, erPct, total });
  }
  hotspots.sort((a, b) => b.erPct - a.erPct);
  for (const h of hotspots.slice(0, 15)) {
    console.log(`  ${h.cc}: ${h.erPct.toFixed(1)}% er_send (${h.total} cases)`);
  }

  if (Object.keys(errorCount).length > 0) {
    console.log(`\n--- Errors ---`);
    for (const [e, count] of Object.entries(errorCount).sort((a, b) => b[1] - a[1])) {
      console.log(`  (${count}x) ${e}`);
    }
  }

  const report = {
    seed: SEED,
    n: N,
    completed,
    errors: N - completed,
    dispositionDistribution: dispDist,
    topClusters: Object.fromEntries(sortedClusters),
    hotspots: hotspots.map(h => ({ complaint: h.cc, erSendPct: h.erPct, total: h.total })),
    errorDetails: errorCount,
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nFull report: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });

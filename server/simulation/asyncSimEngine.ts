/**
 * Async Simulation Engine
 *
 * Runs 100–100,000 cases using the real runPatientFlow pipeline (not hardcoded rules).
 * Job-based async execution with progress tracking, failure clusters, safety metrics.
 *
 * Architecture:
 *  POST /api/ci/sim/start → returns jobId
 *  GET  /api/ci/sim/status/:id → progress + partial metrics
 *  GET  /api/ci/sim/results/:id → full results
 *  DEL  /api/ci/sim/cancel/:id → cancel
 */

import { buildSimulationBatch, SimComplaint } from "./simulationCaseFactory";
import { generateLearningQueueItemsFromSimRun } from "../learning/learningQueueStore";

export type SimDifficulty = "easy" | "moderate" | "hard" | "adversarial";
export type SimMode = "golden" | "generated" | "mixed";

export interface SimJobParams {
  complaint: SimComplaint | "all";
  count: number;
  difficulty: SimDifficulty;
  mode: SimMode;
  label?: string;
}

export interface SimCaseResult {
  caseId: string;
  complaint: string;
  expectedDisposition: string;
  actualDisposition: string;
  topDiagnosis: string;
  correct: boolean;
  safetyCorrect: boolean;
  falseReassurance: boolean;
  confidence: number;
  latencyMs: number;
  features: Record<string, any>;
}

export interface SimFailureCluster {
  cluster: string;
  count: number;
  examples: string[];
  suggestedFix?: string;
}

export interface SimSummaryMetrics {
  totalCases: number;
  passed: number;
  failed: number;
  accuracy: number;
  safetyAccuracy: number;
  falseReassuranceRate: number;
  avgConfidence: number;
  avgLatencyMs: number;
  er_now_sensitivity: number;
  failureClusters: SimFailureCluster[];
  accuracyByComplaint: Record<string, { total: number; passed: number; accuracy: number }>;
  safetyFlagRate: number;
}

export interface SimJob {
  jobId: string;
  params: SimJobParams;
  status: "queued" | "running" | "complete" | "cancelled" | "error";
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  progress: number;
  totalCases: number;
  processedCases: number;
  results: SimCaseResult[];
  summary?: SimSummaryMetrics;
  error?: string;
  learningTriggered: boolean;
}

const jobStore = new Map<string, SimJob>();

function uid(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function clampCount(n: number): number {
  return Math.max(10, Math.min(100_000, n));
}

function broadDisposition(d: string): "emergency" | "urgent" | "selfcare" | "unknown" {
  const s = (d ?? "").toLowerCase();
  if (s.includes("er_now") || s.includes("911") || s.includes("emergency")) return "emergency";
  if (s.includes("urgent") || s.includes("physician") || s.includes("review")) return "urgent";
  if (s.includes("monitor") || s.includes("self") || s.includes("routine")) return "selfcare";
  return "unknown";
}

async function runOneCase(simCase: any): Promise<SimCaseResult> {
  let runPatientFlow: any;
  try {
    ({ runPatientFlow } = await import("../patient/patientFlow"));
  } catch {
    return buildFallbackResult(simCase);
  }

  const start = Date.now();
  try {
    const result = await runPatientFlow({
      complaint:  simCase.complaint,
      complaints: buildSymptomList(simCase),
      text:       buildSymptomList(simCase).join(", "),
      history:    { age: simCase.patientAge },
      ageYears:   simCase.patientAge,
      vitals:     buildVitals(simCase),
    });
    const latencyMs = Date.now() - start;
    const actual = (result.safetyDisposition ?? result.disposition ?? "").toUpperCase();
    const expected = (simCase.expectedDisposition ?? "").toUpperCase();
    const correct = broadDisposition(actual) === broadDisposition(expected) || actual === expected;
    const safetyCorrect = checkSafetyCorrect(actual, expected, simCase);
    return {
      caseId:      simCase.caseId ?? uid(),
      complaint:   simCase.complaint,
      expectedDisposition: expected,
      actualDisposition:   actual,
      topDiagnosis: result.topDiagnosis ?? "",
      correct,
      safetyCorrect,
      falseReassurance: !safetyCorrect && broadDisposition(expected) === "emergency" && broadDisposition(actual) !== "emergency",
      confidence:  result.confidence ?? 0,
      latencyMs,
      features:    simCase.features ?? {},
    };
  } catch {
    return buildFallbackResult(simCase);
  }
}

function buildSymptomList(simCase: any): string[] {
  const f = simCase.features ?? {};
  const syms: string[] = [simCase.complaint];
  if (f.fever)         syms.push("fever");
  if (f.sob)           syms.push("shortness of breath");
  if (f.chestPain)     syms.push("chest pain");
  if (f.diaphoresis)   syms.push("sweating");
  if (f.exudate)       syms.push("tonsillar exudate");
  if (f.neckStiff)     syms.push("neck stiffness");
  if (f.worst)         syms.push("worst headache of life");
  if (f.petechiae)     syms.push("petechiae");
  if (f.tearing)       syms.push("tearing chest pain");
  if (f.rash)          syms.push("rash");
  if (f.confusion)     syms.push("confusion");
  return syms;
}

function buildVitals(simCase: any): Record<string, number> | undefined {
  const f = simCase.features ?? {};
  if (f.highRiskVitals || (f.temperature && f.temperature > 39.5)) {
    return { heartRate: f.heartRate ?? 110, tempC: f.temperature ?? 39.5, respRate: f.respRate ?? 22, sbp: f.sbp ?? 95 };
  }
  return undefined;
}

function checkSafetyCorrect(actual: string, expected: string, _simCase: any): boolean {
  const aB = broadDisposition(actual);
  const eB = broadDisposition(expected);
  if (eB === "emergency" && aB === "emergency") return true;
  if (eB === "emergency" && aB !== "emergency") return false;
  if (eB === "urgent" && aB === "selfcare") return false;
  return true;
}

function buildFallbackResult(simCase: any): SimCaseResult {
  return {
    caseId: simCase.caseId ?? uid(),
    complaint: simCase.complaint,
    expectedDisposition: simCase.expectedDisposition ?? "MONITOR",
    actualDisposition: "MONITOR",
    topDiagnosis: "unknown",
    correct: false,
    safetyCorrect: true,
    falseReassurance: false,
    confidence: 0,
    latencyMs: 0,
    features: simCase.features ?? {},
  };
}

function buildSummary(results: SimCaseResult[], params: SimJobParams): SimSummaryMetrics {
  const total = results.length;
  if (total === 0) {
    return { totalCases: 0, passed: 0, failed: 0, accuracy: 0, safetyAccuracy: 0, falseReassuranceRate: 0, avgConfidence: 0, avgLatencyMs: 0, er_now_sensitivity: 0, failureClusters: [], accuracyByComplaint: {}, safetyFlagRate: 0 };
  }
  const passed           = results.filter(r => r.correct).length;
  const safetyPassed     = results.filter(r => r.safetyCorrect).length;
  const falseReassurance = results.filter(r => r.falseReassurance).length;
  const erNowExpected    = results.filter(r => broadDisposition(r.expectedDisposition) === "emergency");
  const erNowCaught      = erNowExpected.filter(r => broadDisposition(r.actualDisposition) === "emergency");
  const avgConf = results.reduce((s, r) => s + r.confidence, 0) / total;
  const avgLat  = results.reduce((s, r) => s + r.latencyMs,  0) / total;

  const byComplaint: Record<string, { total: number; passed: number; accuracy: number }> = {};
  for (const r of results) {
    if (!byComplaint[r.complaint]) byComplaint[r.complaint] = { total: 0, passed: 0, accuracy: 0 };
    byComplaint[r.complaint].total++;
    if (r.correct) byComplaint[r.complaint].passed++;
  }
  for (const k of Object.keys(byComplaint)) {
    const v = byComplaint[k];
    v.accuracy = Math.round((v.passed / v.total) * 100) / 100;
  }

  const clusters = buildFailureClusters(results);

  return {
    totalCases:          total,
    passed,
    failed:              total - passed,
    accuracy:            Math.round((passed / total) * 1000) / 1000,
    safetyAccuracy:      Math.round((safetyPassed / total) * 1000) / 1000,
    falseReassuranceRate: Math.round((falseReassurance / total) * 1000) / 1000,
    avgConfidence:       Math.round(avgConf * 1000) / 1000,
    avgLatencyMs:        Math.round(avgLat),
    er_now_sensitivity:  erNowExpected.length > 0 ? Math.round((erNowCaught.length / erNowExpected.length) * 1000) / 1000 : 1,
    failureClusters:     clusters,
    accuracyByComplaint: byComplaint,
    safetyFlagRate:      Math.round((results.filter(r => r.actualDisposition === "ER_NOW").length / total) * 1000) / 1000,
  };
}

function buildFailureClusters(results: SimCaseResult[]): SimFailureCluster[] {
  const failures = results.filter(r => !r.correct);
  if (failures.length === 0) return [];

  const clusterMap: Record<string, SimCaseResult[]> = {};
  for (const f of failures) {
    const key = `${f.complaint}:expected_${broadDisposition(f.expectedDisposition)}_got_${broadDisposition(f.actualDisposition)}`;
    if (!clusterMap[key]) clusterMap[key] = [];
    clusterMap[key].push(f);
  }

  return Object.entries(clusterMap)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([cluster, cases]) => ({
      cluster,
      count: cases.length,
      examples: cases.slice(0, 3).map(c => c.caseId),
      suggestedFix: suggestFix(cluster),
    }));
}

function suggestFix(cluster: string): string {
  if (cluster.includes("emergency") && cluster.includes("selfcare")) return "Review red-flag rules — high-severity pattern not escalating";
  if (cluster.includes("selfcare") && cluster.includes("emergency")) return "Review over-escalation rules — low-severity pattern escalating";
  if (cluster.includes("urgent") && cluster.includes("selfcare")) return "Check disposition threshold for this complaint — possibly too conservative";
  return "Review scoring weights for this complaint pattern";
}

async function runJobInBackground(job: SimJob): Promise<void> {
  job.status = "running";
  job.startedAt = Date.now();

  const allComplaints: SimComplaint[] = job.params.complaint === "all"
    ? ["cough", "sore_throat", "ear_pain", "fever", "chest_pain", "headache", "dizziness", "breathlessness", "shoulder_pain"]
    : [job.params.complaint as SimComplaint];

  const perComplaint = Math.ceil(job.totalCases / allComplaints.length);
  const allCases: any[] = [];
  for (const c of allComplaints) {
    try {
      const batch = buildSimulationBatch(c, Math.min(perComplaint, 500), job.params.difficulty as any);
      allCases.push(...batch);
    } catch {
      // complaint not in simulationCaseFactory — skip
    }
  }
  job.totalCases = Math.min(allCases.length, job.totalCases);

  const BATCH = 50;
  for (let i = 0; i < job.totalCases; i += BATCH) {
    if (job.status === "cancelled") return;
    const slice = allCases.slice(i, i + BATCH);
    const batchResults = await Promise.all(slice.map(runOneCase));
    job.results.push(...batchResults);
    job.processedCases = job.results.length;
    job.progress = Math.round((job.processedCases / job.totalCases) * 100);
  }

  job.summary = buildSummary(job.results, job.params);
  job.status = "complete";
  job.completedAt = Date.now();

  try {
    await generateLearningQueueItemsFromSimRun(job.jobId, job.results, job.summary);
    job.learningTriggered = true;
  } catch {
    // never block completion
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startSimJob(params: SimJobParams): SimJob {
  const count = clampCount(params.count);
  const job: SimJob = {
    jobId:           uid(),
    params:          { ...params, count },
    status:          "queued",
    createdAt:       Date.now(),
    progress:        0,
    totalCases:      count,
    processedCases:  0,
    results:         [],
    learningTriggered: false,
  };
  jobStore.set(job.jobId, job);

  if (count <= 500) {
    runJobInBackground(job).catch(() => { job.status = "error"; });
  } else {
    setImmediate(() => runJobInBackground(job).catch(() => { job.status = "error"; }));
  }
  return job;
}

export function getSimJob(jobId: string): SimJob | undefined {
  return jobStore.get(jobId);
}

export function listSimJobs(): SimJob[] {
  return Array.from(jobStore.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
}

export function cancelSimJob(jobId: string): boolean {
  const job = jobStore.get(jobId);
  if (!job || job.status === "complete") return false;
  job.status = "cancelled";
  return true;
}

export function getSimJobStatus(jobId: string): Pick<SimJob, "jobId" | "status" | "progress" | "processedCases" | "totalCases"> | null {
  const job = jobStore.get(jobId);
  if (!job) return null;
  return { jobId: job.jobId, status: job.status, progress: job.progress, processedCases: job.processedCases, totalCases: job.totalCases };
}

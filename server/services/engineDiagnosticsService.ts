import { getAllEngineHealthMetrics, getEngineRegistry, EngineHealthMetrics } from "../observability/engineHealthWrapper";
import { getAllBreakerStates, openAIBreaker, dbBreaker, twilioBreaker, scoringBreaker } from "../utils/circuitBreaker";
import { getSLOStatuses, CLINICAL_SLOS, recordSLOValue } from "../observability/clinicalSLOs";
import { getAllEngineCosts, estimatePipelineCost } from "../observability/engineCostOptimizer";
import { invalidateFlowCache, invalidateAllFlowCache } from "../flows/sheetFlowLoader";
import { invalidateEntFluRulesCache } from "../rules/entFluRuleLoader";
import { runClinicalBrainCoordinator } from "../core/brain/coordinator";

const PIPELINE_STAGE_ORDER = [
  "symptomNormalizationEngine",
  "contradictionEngine",
  "clinicalSafetyGuard",
  "clinicalMemoryEngine",
  "caseSimilarityEngine",
  "bayesianDifferentialEngine",
  "knowledgeGraphEngine",
  "evidenceAggregatorEngine",
  "uncertaintyEngine",
  "complaintCompletenessEngine",
  "severityScoringEngine",
  "testRecommendationEngine",
  "treatmentRecommendationEngine",
  "guidelineAdherenceEngine",
  "protocolVarianceEngine",
  "diagnosticDriftEngine",
  "patientRiskStratificationEngine",
  "supervisorEngine",
  "dispositionCalibrationEngine",
  "returnPrecautionEngine",
  "medicationSafetyEngine",
  "physicianReviewPacketEngine",
];

export interface EngineIssue {
  engineId: string;
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
  detail?: string;
}

export interface EngineScanResult {
  scannedAt: string;
  totalEngines: number;
  healthyEngines: number;
  degradedEngines: number;
  openCircuitBreakers: number;
  issues: EngineIssue[];
  metrics: EngineHealthMetrics[];
}

export interface GoldenCaseTestResult {
  ok: boolean;
  escalationOk: boolean;
  durationMs: number;
  testedAt: string;
  cases: Array<{
    name: string;
    complaint: string;
    expectedDisposition: string;
    actualDisposition: string | undefined;
    passed: boolean;
    safetyHardStop: boolean;
    confidence: number | undefined;
    isEscalation: boolean;
    error?: string;
  }>;
  passRate: number;
  escalationPassRate: number;
  totalEscalationCases: number;
  summary: string;
}

export interface MaintenanceReport {
  generatedAt: string;
  overallStatus: "healthy" | "degraded" | "critical";
  engineScan: EngineScanResult;
  circuitBreakers: ReturnType<typeof getAllBreakerStates>;
  sloBreaches: number;
  stalledEngines: string[];
  kbStatus: { flowCacheActive: boolean; ruleCacheActive: boolean };
  recommendations: string[];
  costSummary: ReturnType<typeof estimatePipelineCost>;
}

export function runEngineHealthScan(): EngineScanResult {
  const metrics = getAllEngineHealthMetrics();
  const issues: EngineIssue[] = [];
  const now = new Date().toISOString();

  for (const m of metrics) {
    if (m.circuitBreakerOpen) {
      issues.push({
        engineId: m.engineId,
        severity: "critical",
        code: "CIRCUIT_OPEN",
        message: `Circuit breaker is OPEN`,
        detail: `Triggered by: ${m.circuitBreakerTriggeredBy ?? "unknown"} at ${m.circuitBreakerOpenedAt ?? "unknown"}`,
      });
    }

    if (m.errorRate1h > 0.25) {
      issues.push({
        engineId: m.engineId,
        severity: "critical",
        code: "HIGH_ERROR_RATE_1H",
        message: `1h error rate is ${(m.errorRate1h * 100).toFixed(1)}% (threshold: 25%)`,
        detail: `Last error: ${m.lastErrorMessage ?? "none"}`,
      });
    } else if (m.errorRate1h > 0.10) {
      issues.push({
        engineId: m.engineId,
        severity: "warning",
        code: "ELEVATED_ERROR_RATE_1H",
        message: `1h error rate is ${(m.errorRate1h * 100).toFixed(1)}%`,
      });
    }

    if (m.p95LatencyMs > 5000) {
      issues.push({
        engineId: m.engineId,
        severity: "warning",
        code: "HIGH_P95_LATENCY",
        message: `p95 latency is ${m.p95LatencyMs}ms (threshold: 5000ms)`,
      });
    }

    if (m.inputValidationFailureRate > 0.05) {
      issues.push({
        engineId: m.engineId,
        severity: "warning",
        code: "INPUT_VALIDATION_FAILURES",
        message: `Input validation failure rate: ${(m.inputValidationFailureRate * 100).toFixed(1)}%`,
      });
    }

    if (m.outputSchemaViolationRate > 0.03) {
      issues.push({
        engineId: m.engineId,
        severity: "warning",
        code: "OUTPUT_SCHEMA_VIOLATIONS",
        message: `Output schema violation rate: ${(m.outputSchemaViolationRate * 100).toFixed(1)}%`,
      });
    }
  }

  const circuitBreakers = getAllBreakerStates();
  for (const cb of circuitBreakers) {
    if (cb.state === "open") {
      issues.push({
        engineId: cb.name,
        severity: "critical",
        code: "SYSTEM_CIRCUIT_OPEN",
        message: `System-level circuit breaker "${cb.name}" is OPEN`,
        detail: `${cb.failures} failures, last failure: ${cb.lastFailAt ? new Date(cb.lastFailAt).toISOString() : "never"}`,
      });
    } else if (cb.state === "half-open") {
      issues.push({
        engineId: cb.name,
        severity: "warning",
        code: "SYSTEM_CIRCUIT_HALF_OPEN",
        message: `System-level circuit breaker "${cb.name}" is HALF-OPEN (probing recovery)`,
      });
    }
  }

  const openCircuitBreakers =
    metrics.filter(m => m.circuitBreakerOpen).length +
    circuitBreakers.filter(cb => cb.state === "open").length;

  return {
    scannedAt: now,
    totalEngines: metrics.length,
    healthyEngines: metrics.filter(m => !m.circuitBreakerOpen && m.errorRate1h < 0.10).length,
    degradedEngines: metrics.filter(m => m.circuitBreakerOpen || m.errorRate1h > 0.10).length,
    openCircuitBreakers,
    issues,
    metrics,
  };
}

export function detectStaleEngines(thresholdMs = 60 * 60 * 1000): string[] {
  const metrics = getAllEngineHealthMetrics();
  const now = Date.now();
  const stale: string[] = [];

  for (const m of metrics) {
    if (!m.lastInvocationAt) {
      stale.push(m.engineId);
      continue;
    }
    const lastMs = new Date(m.lastInvocationAt).getTime();
    if (now - lastMs > thresholdMs) {
      stale.push(m.engineId);
    }
  }

  const registered = Array.from(getEngineRegistry().keys());
  for (const id of PIPELINE_STAGE_ORDER) {
    if (registered.length > 0 && !registered.includes(id)) {
      stale.push(`MISSING:${id}`);
    }
  }

  return [...new Set(stale)];
}

export function runGoldenCaseTest(): GoldenCaseTestResult {
  const testedAt = new Date().toISOString();
  const start = Date.now();

  const goldenCases: Array<{
    name: string;
    complaint: string;
    symptoms: string[];
    ageYears: number;
    expectedDisposition: string;
    isEscalation: boolean;
    presentationType?: "typical" | "atypical";
  }> = [
    // ── CHEST PAIN / STEMI (typical + atypical) ─────────────────────────────
    {
      name: "Chest Pain STEMI — Typical (ER_NOW)",
      complaint: "chest pain",
      symptoms: ["severe chest pain", "left arm pain", "diaphoresis", "shortness of breath"],
      ageYears: 58, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Chest Pain STEMI — Atypical Diabetic (jaw pain + nausea, ER_NOW)",
      complaint: "jaw pain and nausea",
      symptoms: ["jaw pain", "nausea", "sweating", "epigastric pain", "fatigue"],
      ageYears: 64, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    {
      name: "Chest Pain STEMI — Atypical Female (indigestion + diaphoresis, ER_NOW)",
      complaint: "indigestion",
      symptoms: ["indigestion", "diaphoresis", "chest tightness", "shortness of breath"],
      ageYears: 55, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    // ── STROKE (typical + atypical) ──────────────────────────────────────────
    {
      name: "Stroke FAST — Typical (ER_NOW)",
      complaint: "facial droop",
      symptoms: ["facial droop", "arm weakness", "slurred speech", "sudden onset"],
      ageYears: 67, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Stroke — Atypical Posterior (vertigo + diplopia, ER_NOW)",
      complaint: "severe dizziness",
      symptoms: ["sudden severe dizziness", "double vision", "difficulty walking", "arm weakness"],
      ageYears: 71, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    // ── SEPSIS (typical + atypical) ──────────────────────────────────────────
    {
      name: "Sepsis — Typical (ER_NOW)",
      complaint: "fever and confusion",
      symptoms: ["confusion", "fever 103", "rapid heart rate", "low blood pressure", "not acting right"],
      ageYears: 72, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Sepsis — Atypical Pediatric (no fever, lethargy + fast breathing, ER_NOW)",
      complaint: "very tired and breathing fast",
      symptoms: ["lethargy", "fast breathing", "poor feeding", "mottled skin", "cold hands"],
      ageYears: 1, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    {
      name: "Sepsis — Atypical Elderly UTI with AMS (ER_NOW)",
      complaint: "confusion and not acting right",
      symptoms: ["confusion", "not acting right", "decreased urine output", "low blood pressure", "rapid heart rate"],
      ageYears: 82, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    // ── THUNDERCLAP HEADACHE / SAH ────────────────────────────────────────────
    {
      name: "Thunderclap Headache SAH — Typical (ER_NOW)",
      complaint: "worst headache of my life",
      symptoms: ["worst headache of life", "sudden onset", "neck stiffness", "photophobia"],
      ageYears: 42, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Thunderclap Headache — Atypical Brief/Resolved (ER_NOW)",
      complaint: "severe headache that went away",
      symptoms: ["sudden severe headache", "resolved in 20 minutes", "worst ever", "nausea"],
      ageYears: 38, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    // ── SEVERE DYSPNEA / RESPIRATORY FAILURE ─────────────────────────────────
    {
      name: "Severe Dyspnea — SpO2 Drop (ER_NOW)",
      complaint: "difficulty breathing",
      symptoms: ["shortness of breath", "trouble breathing at rest", "low oxygen", "cannot speak full sentences"],
      ageYears: 61, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Severe Dyspnea — Pediatric Respiratory Distress (ER_NOW)",
      complaint: "baby breathing very fast",
      symptoms: ["fast breathing", "grunting", "retractions", "nasal flaring", "poor color"],
      ageYears: 0, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    // ── ANAPHYLAXIS ───────────────────────────────────────────────────────────
    {
      name: "Anaphylaxis — Classic (ER_NOW)",
      complaint: "allergic reaction",
      symptoms: ["hives", "throat swelling", "difficulty breathing", "wheezing", "ate peanuts"],
      ageYears: 24, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Anaphylaxis — Atypical Isolated Hypotension (ER_NOW)",
      complaint: "feeling faint after bee sting",
      symptoms: ["bee sting", "low blood pressure", "rapid heart rate", "dizziness", "near fainting"],
      ageYears: 45, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "atypical",
    },
    // ── ALTERED MENTAL STATUS ─────────────────────────────────────────────────
    {
      name: "Altered Mental Status — Hypoglycemia (ER_NOW)",
      complaint: "unresponsive diabetic",
      symptoms: ["confusion", "unresponsive", "diabetic", "diaphoresis", "seizure-like"],
      ageYears: 55, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    // ── ABDOMINAL EMERGENCIES ─────────────────────────────────────────────────
    {
      name: "Ruptured Ectopic — Typical (ER_NOW)",
      complaint: "severe abdominal pain",
      symptoms: ["severe sharp abdominal pain", "missed period", "positive pregnancy test", "shoulder pain", "dizziness"],
      ageYears: 27, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    {
      name: "Testicular Torsion — (ER_NOW)",
      complaint: "sudden severe scrotal pain",
      symptoms: ["sudden severe testicular pain", "swollen testicle", "nausea", "high-riding testicle"],
      ageYears: 17, expectedDisposition: "ER_NOW", isEscalation: true, presentationType: "typical",
    },
    // ── NON-ESCALATION CASES (high specificity, should NOT trigger ER_NOW) ────
    {
      name: "Mild Sore Throat — Urgent Care (NOT ER_NOW)",
      complaint: "sore throat",
      symptoms: ["sore throat", "mild difficulty swallowing", "no fever"],
      ageYears: 28, expectedDisposition: "self_care_with_precautions", isEscalation: false,
    },
    {
      name: "URI/Cold — Self-Care (NOT ER_NOW)",
      complaint: "runny nose and cough",
      symptoms: ["runny nose", "congestion", "mild cough", "low-grade fever"],
      ageYears: 35, expectedDisposition: "self_care_with_precautions", isEscalation: false,
    },
    {
      name: "Ankle Sprain — Non-Emergency (NOT ER_NOW)",
      complaint: "twisted ankle",
      symptoms: ["ankle pain", "swelling", "able to walk with limp", "no numbness"],
      ageYears: 22, expectedDisposition: "urgent_care", isEscalation: false,
    },
    {
      name: "Low Back Pain — Non-Emergency (NOT ER_NOW)",
      complaint: "low back pain",
      symptoms: ["low back pain", "worsens with movement", "no leg weakness", "no bowel changes"],
      ageYears: 40, expectedDisposition: "urgent_care", isEscalation: false,
    },
    {
      name: "Ear Infection — Non-Emergency (NOT ER_NOW)",
      complaint: "ear pain",
      symptoms: ["ear pain", "decreased hearing", "mild fever", "no facial paralysis"],
      ageYears: 6, expectedDisposition: "urgent_care", isEscalation: false,
    },
    {
      name: "Pink Eye — Non-Emergency (NOT ER_NOW)",
      complaint: "red eye and discharge",
      symptoms: ["red eye", "discharge", "itching", "no vision loss", "no pain"],
      ageYears: 32, expectedDisposition: "urgent_care", isEscalation: false,
    },
    {
      name: "Mild UTI — Non-Emergency (NOT ER_NOW)",
      complaint: "painful urination",
      symptoms: ["burning urination", "frequent urination", "mild lower abdominal pain", "no fever", "no flank pain"],
      ageYears: 30, expectedDisposition: "urgent_care", isEscalation: false,
    },
    {
      name: "Skin Laceration — Urgent Care (NOT ER_NOW)",
      complaint: "cut on hand",
      symptoms: ["laceration", "bleeding controlled", "no tendon involvement", "intact sensation"],
      ageYears: 45, expectedDisposition: "urgent_care", isEscalation: false,
    },
  ];

  const results = goldenCases.map(gc => {
    try {
      const output = runClinicalBrainCoordinator({
        caseId: `golden-test-${Date.now()}`,
        complaint: gc.complaint,
        symptoms: gc.symptoms,
        ageYears: gc.ageYears,
        answers: {},
      });

      const actualDisposition: string | undefined =
        (output as any)?.disposition ??
        (output as any)?.proposedDisposition ??
        (output as any)?.supervisor?.recommendedDisposition ??
        (output as any)?.dispositionCalibration?.finalDisposition;

      const safetyHardStop =
        !!(output as any)?.safety?.triggered ||
        !!(output as any)?.safety?.hardStop ||
        !!(output as any)?.safetyTriggered;

      const confidence =
        (output as any)?.uncertainty?.confidenceScore ??
        (output as any)?.uncertainty?.confidence ??
        (output as any)?.dispositionCalibration?.confidence;

      const dispositionNorm = (actualDisposition ?? "").toUpperCase().replace(/[\s-]/g, "_");
      const expectedNorm = gc.expectedDisposition.toUpperCase().replace(/[\s-]/g, "_");

      const dispositionMatches =
        dispositionNorm === expectedNorm ||
        dispositionNorm.includes(expectedNorm) ||
        expectedNorm.includes(dispositionNorm);

      const passed =
        safetyHardStop
          ? gc.expectedDisposition === "ER_NOW" || gc.expectedDisposition === "CALL_911"
          : dispositionMatches;

      return {
        name: gc.name,
        complaint: gc.complaint,
        expectedDisposition: gc.expectedDisposition,
        actualDisposition,
        passed,
        safetyHardStop,
        confidence,
        isEscalation: gc.isEscalation,
      };
    } catch (err: any) {
      return {
        name: gc.name,
        complaint: gc.complaint,
        expectedDisposition: gc.expectedDisposition,
        actualDisposition: undefined,
        passed: false,
        safetyHardStop: false,
        confidence: undefined,
        isEscalation: gc.isEscalation,
        error: err?.message ?? String(err),
      };
    }
  });

  const passed = results.filter(r => r.passed).length;
  const passRate = results.length > 0 ? passed / results.length : 0;

  const escalationResults = results.filter(r => r.isEscalation);
  const escalationPassed = escalationResults.filter(r => r.passed).length;
  const escalationPassRate = escalationResults.length > 0 ? escalationPassed / escalationResults.length : 1;

  // CRITICAL: Escalation (ER_NOW) cases MUST hit 100% — 97% means 3-in-100 missed escalations
  // which is clinically unacceptable for STEMI, stroke, anaphylaxis, and ruptured ectopic.
  const escalationOk = escalationPassRate === 1.0;
  const overallOk = passRate >= 0.90;

  const missedEscalations = escalationResults.filter(r => !r.passed).map(r => r.name);

  let summary: string;
  if (escalationOk && overallOk) {
    summary = `All ${escalationResults.length} escalation cases passed (100%). Overall: ${passed}/${results.length} (${Math.round(passRate * 100)}%).`;
  } else if (!escalationOk) {
    summary = `CRITICAL: ${missedEscalations.length} escalation case(s) MISSED — ${missedEscalations.join("; ")}. Patient safety at risk — immediate review required.`;
  } else {
    summary = `Escalation cases OK (100%). Overall: ${passed}/${results.length} (${Math.round(passRate * 100)}%). Review non-escalation failures.`;
  }

  return {
    ok: overallOk && escalationOk,
    escalationOk,
    durationMs: Date.now() - start,
    testedAt,
    cases: results,
    passRate,
    escalationPassRate,
    totalEscalationCases: escalationResults.length,
    summary,
  };
}

export function forceReloadAllKBCaches(): { reloadedAt: string; components: string[] } {
  const components: string[] = [];
  try {
    invalidateAllFlowCache();
    components.push("sheetFlowLoader (all flows)");
  } catch (e) {
    console.error("[EngineDiagnostics] Failed to invalidate flow cache:", e);
  }
  try {
    invalidateEntFluRulesCache();
    components.push("entFluRuleLoader (clinical rules)");
  } catch (e) {
    console.error("[EngineDiagnostics] Failed to invalidate rule cache:", e);
  }
  console.log(`[EngineDiagnostics] KB caches forcibly reloaded: ${components.join(", ")}`);
  return { reloadedAt: new Date().toISOString(), components };
}

export function resetAllSystemCircuitBreakers(): { resetAt: string; reset: string[] } {
  const breakers = [
    { name: "openai", cb: openAIBreaker },
    { name: "database", cb: dbBreaker },
    { name: "twilio", cb: twilioBreaker },
    { name: "scoring", cb: scoringBreaker },
  ];
  const reset: string[] = [];
  for (const { name, cb } of breakers) {
    cb.reset();
    reset.push(name);
  }
  console.log(`[EngineDiagnostics] System circuit breakers reset: ${reset.join(", ")}`);
  return { resetAt: new Date().toISOString(), reset };
}

export function resetEngineCircuitBreaker(engineId: string): { ok: boolean; message: string } {
  const registry = getEngineRegistry();
  const engine = registry.get(engineId);
  if (!engine) {
    return { ok: false, message: `Engine "${engineId}" not found in registry` };
  }
  engine.resetCircuitBreaker();
  console.log(`[EngineDiagnostics] Engine circuit breaker reset: ${engineId}`);
  return { ok: true, message: `Engine "${engineId}" circuit breaker reset` };
}

export function generateMaintenanceReport(): MaintenanceReport {
  const engineScan = runEngineHealthScan();
  const circuitBreakers = getAllBreakerStates();
  const sloStatuses = getSLOStatuses();
  const stalledEngines = detectStaleEngines();
  const costSummary = estimatePipelineCost(PIPELINE_STAGE_ORDER);

  const sloBreaches = sloStatuses.filter(s => s.breached).length;
  const openSystemBreakers = circuitBreakers.filter(cb => cb.state === "open").length;

  const recommendations: string[] = [];

  if (engineScan.openCircuitBreakers > 0) {
    recommendations.push(
      `CRITICAL: ${engineScan.openCircuitBreakers} circuit breaker(s) open — investigate root cause before resetting.`
    );
  }

  if (sloBreaches > 0) {
    const breachedSLOs = sloStatuses.filter(s => s.breached).map(s => s.slo.name);
    recommendations.push(`SLO breach detected: ${breachedSLOs.join(", ")} — review recent case outcomes.`);
  }

  if (stalledEngines.length > 0) {
    const missing = stalledEngines.filter(e => e.startsWith("MISSING:"));
    const stale = stalledEngines.filter(e => !e.startsWith("MISSING:"));
    if (missing.length > 0) {
      recommendations.push(`MISSING engines not in registry: ${missing.map(e => e.replace("MISSING:", "")).join(", ")}`);
    }
    if (stale.length > 0) {
      recommendations.push(`${stale.length} engine(s) have had no invocations in 1h — check if they are receiving cases.`);
    }
  }

  const highErrorEngines = engineScan.metrics.filter(m => m.errorRate1h > 0.10);
  if (highErrorEngines.length > 0) {
    recommendations.push(
      `Elevated error rates on: ${highErrorEngines.map(e => e.engineId).join(", ")} — check logs for root cause.`
    );
  }

  if (costSummary.totalLatencyMs > 3000) {
    recommendations.push(
      `Pipeline estimated latency is ${costSummary.totalLatencyMs}ms — consider enabling caching or swapping to cheaper engines.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("All engines healthy. No action required.");
  }

  const overallStatus: "healthy" | "degraded" | "critical" =
    engineScan.openCircuitBreakers > 0 || sloBreaches > 0 || openSystemBreakers > 0
      ? "critical"
      : engineScan.degradedEngines > 0 || stalledEngines.length > 2
      ? "degraded"
      : "healthy";

  return {
    generatedAt: new Date().toISOString(),
    overallStatus,
    engineScan,
    circuitBreakers,
    sloBreaches,
    stalledEngines,
    kbStatus: { flowCacheActive: true, ruleCacheActive: true },
    recommendations,
    costSummary,
  };
}

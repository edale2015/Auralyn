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
    error?: string;
  }>;
  passRate: number;
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
  }> = [
    {
      name: "Chest Pain — Expected ER_NOW",
      complaint: "chest pain",
      symptoms: ["severe chest pain", "left arm pain", "diaphoresis", "shortness of breath"],
      ageYears: 58,
      expectedDisposition: "ER_NOW",
    },
    {
      name: "Severe Headache — Expected ER_NOW",
      complaint: "severe sudden headache",
      symptoms: ["worst headache of life", "sudden onset", "neck stiffness"],
      ageYears: 42,
      expectedDisposition: "ER_NOW",
    },
    {
      name: "Mild Sore Throat — Expected Self-Care or Urgent-Care",
      complaint: "sore throat",
      symptoms: ["sore throat", "mild difficulty swallowing"],
      ageYears: 28,
      expectedDisposition: "self_care_with_precautions",
    },
    {
      name: "Pediatric High Fever — Expected ER_NOW or Urgent",
      complaint: "fever",
      symptoms: ["fever 104", "lethargy", "stiff neck"],
      ageYears: 2,
      expectedDisposition: "ER_NOW",
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

      const safetyHardStop = !!(output as any)?.safety?.hardStop;
      const confidence = (output as any)?.uncertainty?.confidenceScore ??
        (output as any)?.dispositionCalibration?.confidence;

      const passed =
        safetyHardStop
          ? gc.expectedDisposition === "ER_NOW"
          : (actualDisposition ?? "").toLowerCase().includes(gc.expectedDisposition.toLowerCase()) ||
            gc.expectedDisposition.toLowerCase().includes((actualDisposition ?? "").toLowerCase());

      return {
        name: gc.name,
        complaint: gc.complaint,
        expectedDisposition: gc.expectedDisposition,
        actualDisposition,
        passed,
        safetyHardStop,
        confidence,
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
        error: err?.message ?? String(err),
      };
    }
  });

  const passed = results.filter(r => r.passed).length;
  const passRate = results.length > 0 ? passed / results.length : 0;

  const summary =
    passRate === 1
      ? "All golden cases passed."
      : `${passed}/${results.length} golden cases passed. Review failures immediately — patient safety at risk.`;

  return {
    ok: passRate >= 0.75,
    durationMs: Date.now() - start,
    testedAt,
    cases: results,
    passRate,
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

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  runEngineHealthScan,
  detectStaleEngines,
  runGoldenCaseTest,
  forceReloadAllKBCaches,
  resetAllSystemCircuitBreakers,
  resetEngineCircuitBreaker,
  generateMaintenanceReport,
} from "../services/engineDiagnosticsService";
import {
  getAllBreakerStates,
  openAIBreaker,
  dbBreaker,
  twilioBreaker,
  scoringBreaker,
} from "../utils/circuitBreaker";
import {
  getSLOStatuses,
  getSLOsByCategory,
  recordSLOValue,
  CLINICAL_SLOS,
} from "../observability/clinicalSLOs";
import {
  getAllEngineCosts,
  estimatePipelineCost,
  chooseLowestCostEngine,
} from "../observability/engineCostOptimizer";
import { getAllEngineHealthMetrics, getEngineRegistry } from "../observability/engineHealthWrapper";

const router = Router();
const adminPhysician = requireRole(["admin", "physician"]);
const adminOnly = requireRole(["admin"]);

router.get("/status", adminPhysician, (_req, res) => {
  try {
    const scan = runEngineHealthScan();
    res.json({ ok: true, ...scan });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/circuit-breakers", adminPhysician, (_req, res) => {
  try {
    const system = getAllBreakerStates();
    const engines = getAllEngineHealthMetrics()
      .filter(m => m.circuitBreakerOpen)
      .map(m => ({
        name: m.engineId,
        state: "open",
        openedAt: m.circuitBreakerOpenedAt,
        triggeredBy: m.circuitBreakerTriggeredBy,
      }));
    res.json({ ok: true, system, engines });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/circuit-breakers/reset", adminOnly, (req, res) => {
  try {
    const { target } = req.body as { target?: string };
    if (target && target !== "all") {
      const breakerMap: Record<string, typeof openAIBreaker> = {
        openai: openAIBreaker,
        database: dbBreaker,
        twilio: twilioBreaker,
        scoring: scoringBreaker,
      };
      const cb = breakerMap[target.toLowerCase()];
      if (!cb) return res.status(400).json({ ok: false, error: `Unknown system breaker: ${target}` });
      cb.reset();
      console.log(`[EngineMaintenanceRoutes] Admin reset system circuit breaker: ${target}`);
      return res.json({ ok: true, message: `System circuit breaker "${target}" reset`, resetAt: new Date().toISOString() });
    }
    const result = resetAllSystemCircuitBreakers();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/engine/:engineId/reset-breaker", adminOnly, (req, res) => {
  try {
    const { engineId } = req.params;
    const result = resetEngineCircuitBreaker(engineId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/slos", adminPhysician, (_req, res) => {
  try {
    const statuses = getSLOStatuses();
    const breachedCount = statuses.filter(s => s.breached).length;
    const haltRisk = statuses.filter(s => s.breached && s.slo.breachAction === "halt_system");
    res.json({ ok: true, sloCount: statuses.length, breachedCount, haltRisk: haltRisk.map(s => s.slo.id), statuses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/slos/:category", adminPhysician, (req, res) => {
  try {
    const { category } = req.params;
    const valid = ["safety", "compliance", "performance", "equity", "complaint_category"];
    if (!valid.includes(category)) {
      return res.status(400).json({ ok: false, error: `Invalid category. Use one of: ${valid.join(", ")}` });
    }
    const statuses = getSLOsByCategory(category as any);
    res.json({ ok: true, category, statuses });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/slo/record", adminOnly, (req, res) => {
  try {
    const { sloId, value } = req.body as { sloId: string; value: number };
    if (!sloId || typeof value !== "number") {
      return res.status(400).json({ ok: false, error: "sloId (string) and value (number) are required" });
    }
    const known = CLINICAL_SLOS.find(s => s.id === sloId);
    if (!known) {
      return res.status(404).json({ ok: false, error: `Unknown SLO ID: ${sloId}`, availableIds: CLINICAL_SLOS.map(s => s.id) });
    }
    recordSLOValue(sloId, value);
    const breached = known.higherIsBetter ? value < known.target : value > known.target;
    res.json({ ok: true, sloId, value, breached, target: known.target, action: breached ? known.breachAction : "none" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/cost-profile", adminPhysician, (_req, res) => {
  try {
    const costs = getAllEngineCosts();
    const scored = costs.map(c => ({
      ...c,
      score: c.latencyMs * 0.3 + c.costUnits * 100 * 0.5 + (1 - c.reliability) * 1000 * 0.2,
    })).sort((a, b) => a.score - b.score);
    res.json({ ok: true, engines: scored });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/cost-pipeline", adminPhysician, (req, res) => {
  try {
    const { engines } = req.body as { engines?: string[] };
    if (!Array.isArray(engines) || engines.length === 0) {
      return res.status(400).json({ ok: false, error: "engines[] array is required" });
    }
    const summary = estimatePipelineCost(engines);
    const best = chooseLowestCostEngine(engines);
    res.json({ ok: true, pipeline: engines, ...summary, lowestCostSingle: best });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/kb/reload", adminOnly, (_req, res) => {
  try {
    const result = forceReloadAllKBCaches();
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/stale-engines", adminPhysician, (req, res) => {
  try {
    const thresholdHours = Number(req.query.thresholdHours ?? 1);
    if (!Number.isFinite(thresholdHours) || thresholdHours <= 0) {
      return res.status(400).json({ ok: false, error: "thresholdHours must be a positive number" });
    }
    const stale = detectStaleEngines(thresholdHours * 60 * 60 * 1000);
    const registeredCount = getEngineRegistry().size;
    res.json({ ok: true, thresholdHours, registeredEngines: registeredCount, staleCount: stale.length, staleEngines: stale });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.post("/self-test", adminOnly, (_req, res) => {
  try {
    console.log("[EngineMaintenanceRoutes] Starting golden case self-test...");
    const result = runGoldenCaseTest();
    console.log(`[EngineMaintenanceRoutes] Self-test complete — pass rate: ${(result.passRate * 100).toFixed(0)}%`);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/report", adminPhysician, (_req, res) => {
  try {
    const report = generateMaintenanceReport();
    res.json({ ok: true, ...report });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/engine/:engineId/metrics", adminPhysician, (req, res) => {
  try {
    const { engineId } = req.params;
    const all = getAllEngineHealthMetrics();
    const engine = all.find(e => e.engineId === engineId);
    if (!engine) {
      return res.status(404).json({ ok: false, error: `Engine "${engineId}" not found`, registeredIds: all.map(e => e.engineId) });
    }
    res.json({ ok: true, ...engine });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

router.get("/topology", adminPhysician, (_req, res) => {
  try {
    const registry = getEngineRegistry();
    const costs = getAllEngineCosts();
    const costMap = Object.fromEntries(costs.map(c => [c.engine, c]));
    const metrics = Object.fromEntries(getAllEngineHealthMetrics().map(m => [m.engineId, m]));

    const stages = [
      { stage: 1, id: "symptomNormalizationEngine", label: "Symptom Normalization", feeds: ["contradictionEngine"] },
      { stage: 2, id: "contradictionEngine", label: "Contradiction Detection", feeds: ["clinicalSafetyGuard"] },
      { stage: 3, id: "clinicalSafetyGuard", label: "Clinical Safety Guard", feeds: ["caseSimilarityEngine"] },
      { stage: 4, id: "clinicalMemoryEngine", label: "Clinical Memory Retrieval", feeds: ["caseSimilarityEngine"] },
      { stage: 5, id: "caseSimilarityEngine", label: "Case Similarity", feeds: ["bayesianDifferentialEngine"] },
      { stage: 6, id: "bayesianDifferentialEngine", label: "Bayesian Differential", feeds: ["evidenceAggregatorEngine"] },
      { stage: 7, id: "knowledgeGraphEngine", label: "Knowledge Graph", feeds: ["evidenceAggregatorEngine"] },
      { stage: 8, id: "evidenceAggregatorEngine", label: "Evidence Aggregator", feeds: ["uncertaintyEngine"] },
      { stage: 9, id: "uncertaintyEngine", label: "Uncertainty Quantification", feeds: ["complaintCompletenessEngine"] },
      { stage: 10, id: "complaintCompletenessEngine", label: "Complaint Completeness", feeds: ["severityScoringEngine"] },
      { stage: 11, id: "severityScoringEngine", label: "Severity Scoring", feeds: ["testRecommendationEngine", "treatmentRecommendationEngine"] },
      { stage: 12, id: "testRecommendationEngine", label: "Test Recommendations", feeds: ["guidelineAdherenceEngine"] },
      { stage: 13, id: "treatmentRecommendationEngine", label: "Treatment Recommendations", feeds: ["guidelineAdherenceEngine"] },
      { stage: 14, id: "guidelineAdherenceEngine", label: "Guideline Adherence", feeds: ["protocolVarianceEngine"] },
      { stage: 15, id: "protocolVarianceEngine", label: "Protocol Variance", feeds: ["diagnosticDriftEngine"] },
      { stage: 16, id: "diagnosticDriftEngine", label: "Diagnostic Drift Detection", feeds: ["patientRiskStratificationEngine"] },
      { stage: 17, id: "patientRiskStratificationEngine", label: "Risk Stratification", feeds: ["supervisorEngine"] },
      { stage: 18, id: "supervisorEngine", label: "Supervisor Engine", feeds: ["dispositionCalibrationEngine"] },
      { stage: 19, id: "dispositionCalibrationEngine", label: "Disposition Calibration", feeds: ["returnPrecautionEngine", "medicationSafetyEngine"] },
      { stage: 20, id: "returnPrecautionEngine", label: "Return Precautions", feeds: ["physicianReviewPacketEngine"] },
      { stage: 21, id: "medicationSafetyEngine", label: "Medication Safety", feeds: ["physicianReviewPacketEngine"] },
      { stage: 22, id: "physicianReviewPacketEngine", label: "Physician Review Packet", feeds: [] },
    ];

    const enriched = stages.map(s => ({
      ...s,
      registered: registry.has(s.id),
      cost: costMap[s.id] ?? null,
      health: metrics[s.id] ?? null,
    }));

    res.json({ ok: true, totalStages: stages.length, topology: enriched });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;

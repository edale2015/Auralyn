import { Router, Request, Response } from "express";
import { logIncident, acknowledgeIncident, resolveIncident, getIncidents, getIncidentStats } from "../monitoring/incidents";
import { traceStep, buildTrace, getRecentTraces, getTracingStats } from "../monitoring/tracing";
import { checkSystemHealth, getAlertHistory, getSystemAlertStats } from "../monitoring/systemAlerts";
import { generateAlerts, getAlertFatigueStats } from "../clinical/alertFatigue";
import { generateSummary, getPhysicianSummaryStats } from "../clinical/physicianSummary";
import { patientExplanation, getPatientExplanationStats } from "../patient/patientExplanation";
import { computeFinancials, getDemoFinancials, getFinanceEngineStats } from "../admin/financeEngine";
import { computeROI, getROIStats } from "../admin/roiEngine";
import { growthMetrics, computeSystemGrowth, getGrowthMetricStats } from "../admin/growthMetrics";

const router = Router();

// ── Incident Control ──────────────────────────────────────────────────────────
router.post("/incidents/log", (req: Request, res: Response) => {
  const { severity, category, message, detail } = req.body;
  if (!severity || !category || !message) return res.status(400).json({ error: "severity, category, message required" });
  res.json(logIncident({ severity, category, message, detail }));
});

router.get("/incidents", (req: Request, res: Response) => {
  res.json(getIncidents({ status: req.query.status as any, severity: req.query.severity as any }));
});

router.post("/incidents/:id/acknowledge", (req: Request, res: Response) => {
  const result = acknowledgeIncident(req.params.id, req.body.acknowledgedBy ?? "system");
  if (!result) return res.status(404).json({ error: "Incident not found" });
  res.json(result);
});

router.post("/incidents/:id/resolve", (req: Request, res: Response) => {
  const result = resolveIncident(req.params.id, req.body.resolvedBy ?? "system");
  if (!result) return res.status(404).json({ error: "Incident not found" });
  res.json(result);
});

router.get("/incidents/stats", (_req: Request, res: Response) => {
  res.json(getIncidentStats());
});

router.get("/incidents/demo", (_req: Request, res: Response) => {
  res.json(logIncident({ severity: "HIGH", category: "latency", message: "Triage pipeline latency spike: 2800ms", detail: { engine: "bayesian", ms: 2800 } }));
});

// ── Distributed Tracing ───────────────────────────────────────────────────────
router.get("/traces", (_req: Request, res: Response) => {
  res.json(getRecentTraces());
});

router.get("/traces/stats", (_req: Request, res: Response) => {
  res.json(getTracingStats());
});

router.get("/traces/demo", (_req: Request, res: Response) => {
  const steps = [
    traceStep("INIT", { complaint: "sore_throat" }),
    traceStep("RED_FLAG_GATE", { flags: 0 }),
    traceStep("BAYESIAN_DIFFERENTIAL", { topDx: "strep_pharyngitis" }),
    traceStep("SAFETY_PIPELINE", { disposition: "URGENT_24H" }),
    traceStep("COMPLETE", { confidence: 0.81 }),
  ];
  res.json(buildTrace("clinical_triage", steps));
});

// ── System Health Alerts ──────────────────────────────────────────────────────
router.post("/health/check", (req: Request, res: Response) => {
  const alert = checkSystemHealth(req.body);
  res.json({ alert, hasAlert: alert !== null });
});

router.get("/health/alerts", (_req: Request, res: Response) => {
  res.json(getAlertHistory());
});

router.get("/health/stats", (_req: Request, res: Response) => {
  res.json(getSystemAlertStats());
});

router.get("/health/demo", (_req: Request, res: Response) => {
  const alert = checkSystemHealth({ avgLatencyMs: 3200, errorRate: 0.02, erRate: 0.22 });
  res.json({ alert, history: getAlertHistory().slice(0, 3), stats: getSystemAlertStats() });
});

// ── Alert Fatigue ─────────────────────────────────────────────────────────────
router.post("/alerts/generate", (req: Request, res: Response) => {
  res.json(generateAlerts(req.body));
});

router.get("/alerts/fatigue/stats", (_req: Request, res: Response) => {
  res.json(getAlertFatigueStats());
});

router.get("/alerts/demo", (_req: Request, res: Response) => {
  res.json({
    alerts: generateAlerts({ sepsisRisk: true, sepsisScore: 3, mildFever: true, minorCough: true }),
    stats: getAlertFatigueStats(),
  });
});

// ── Physician Summary ─────────────────────────────────────────────────────────
router.post("/physician/summary", (req: Request, res: Response) => {
  res.json(generateSummary(req.body));
});

router.get("/physician/summary/demo", (_req: Request, res: Response) => {
  res.json(generateSummary({
    topDiagnosis: "streptococcal_pharyngitis",
    disposition: "URGENT_24H",
    confidence: 0.81,
    keyFactors: ["fever", "tonsillar_exudate", "no_cough"],
    redFlags: [],
    differential: [
      { dx: "streptococcal_pharyngitis", score: 0.81 },
      { dx: "viral_pharyngitis",         score: 0.14 },
    ],
  }));
});

router.get("/physician/summary/stats", (_req: Request, res: Response) => {
  res.json(getPhysicianSummaryStats());
});

// ── Patient Explanation ───────────────────────────────────────────────────────
router.post("/patient/explanation", (req: Request, res: Response) => {
  res.json(patientExplanation(req.body));
});

router.get("/patient/explanation/demo", (_req: Request, res: Response) => {
  res.json(patientExplanation({ topDiagnosis: "streptococcal_pharyngitis", disposition: "URGENT_24H", confidence: 0.81 }));
});

router.get("/patient/explanation/stats", (_req: Request, res: Response) => {
  res.json(getPatientExplanationStats());
});

// ── Financial Analytics ───────────────────────────────────────────────────────
router.post("/finance/compute", (req: Request, res: Response) => {
  const { encounters, claims } = req.body;
  if (!encounters || !claims) return res.status(400).json({ error: "encounters and claims required" });
  res.json(computeFinancials(encounters, claims));
});

router.get("/finance/demo", (_req: Request, res: Response) => {
  res.json(getDemoFinancials());
});

router.get("/finance/stats", (_req: Request, res: Response) => {
  res.json(getFinanceEngineStats());
});

// ── ROI Engine ────────────────────────────────────────────────────────────────
router.post("/roi/compute", (req: Request, res: Response) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Array of encounter ROI data required" });
  res.json(computeROI(req.body));
});

router.get("/roi/demo", (_req: Request, res: Response) => {
  res.json(computeROI([
    ...Array.from({ length: 280 }, (_, i) => ({ encounterId: `ENC-${i}`, revenue: 195, denied: false, hccCaptured: i % 5 === 0 })),
    ...Array.from({ length:  30 }, (_, i) => ({ encounterId: `ENC-D-${i}`, revenue: 0, denied: true, hccCaptured: false })),
  ]));
});

router.get("/roi/stats", (_req: Request, res: Response) => {
  res.json(getROIStats());
});

// ── Growth Metrics ────────────────────────────────────────────────────────────
router.post("/growth/clinic", (req: Request, res: Response) => {
  res.json(growthMetrics(req.body));
});

router.get("/growth/system/demo", (_req: Request, res: Response) => {
  res.json(computeSystemGrowth([
    { clinicId: "nyc-01", clinicName: "NYC Clinic",    patients: 850, revenue: 165000, marketingSpend: 22000, monthsActive: 12 },
    { clinicId: "bos-01", clinicName: "Boston Clinic", patients: 420, revenue: 78000,  marketingSpend: 14000, monthsActive: 8  },
    { clinicId: "la-01",  clinicName: "LA Clinic",     patients: 310, revenue: 58000,  marketingSpend: 9000,  monthsActive: 5  },
  ]));
});

router.get("/growth/stats", (_req: Request, res: Response) => {
  res.json(getGrowthMetricStats());
});

export default router;

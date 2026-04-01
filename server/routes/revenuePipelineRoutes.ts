import { Router } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { requireRole } from "../middleware/requireRole";
import { autoFixEncounter } from "../billing/autoFixEngine";
import { logClaimOutcome, getClaimOutcomeStats, getOutcomeLog, getLearnedDenialScore } from "../billing/claimOutcomeLearning";
import { routeToPhysician, registerPhysician, getPhysicianRegistry, detectSpecialty, releasePhysicianLoad } from "../billing/smartPhysicianRouter";
import { calculateRevenueMetrics } from "../billing/revenueAnalytics";
import { autoCodeDiagnosisCluster } from "../billing/diagnosisAutoCoder";
import { predictDenial } from "../billing/denialPredictionEngine";
import { classifyRisk } from "../compliance/riskEngine";

const router = Router();

const autoFixSchema = z.object({
  diagnosis: z.string().min(1),
  differentials: z.array(z.string()).optional().default([]),
  triage: z.string().min(1),
  complaint: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

router.post("/auto-fix", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = autoFixSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { diagnosis, differentials, triage, complaint, confidence } = parsed.data;

  const coding = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  const risk = classifyRisk({ triage, diagnosis, confidence });
  const denial = predictDenial({
    coding,
    riskClassification: risk,
    encounter: { complaint, diagnosis, triage, confidence },
    clinicalNote: { hpi: `Chief Complaint: ${complaint}`, assessment: `Primary: ${diagnosis}`, plan: `Disposition: ${triage}` },
  });

  const fix = autoFixEncounter(coding, denial, { triage, confidence });

  res.json({
    originalDenialRisk: denial.riskScore,
    fix,
    denialReasons: denial.reasons,
    recommendations: denial.recommendations,
  });
});

const outcomeSchema = z.object({
  encounterId: z.string().min(1),
  icd10: z.string().min(1),
  cptCode: z.string().min(1),
  paid: z.boolean(),
  revenueAmount: z.number().min(0),
  denialReasons: z.array(z.string()).optional(),
});

router.post("/claim-outcome", requireRole(["admin"]), (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const entry = logClaimOutcome({ ...parsed.data, timestamp: new Date().toISOString() });
  res.json({ logged: true, updatedWeight: entry });
});

router.get("/claim-outcome/stats", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getClaimOutcomeStats());
});

router.get("/claim-outcome/log", requireRole(["admin"]), (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json(getOutcomeLog(limit));
});

router.get("/learned-score", requireRole(["admin", "physician"]), (req, res) => {
  const icd10 = req.query.icd10 as string;
  const cpt = req.query.cpt as string;
  if (!icd10 || !cpt) return res.status(400).json({ error: "icd10 and cpt query params required" });
  res.json({ icd10, cpt, learnedDenialScore: getLearnedDenialScore(icd10, cpt) });
});

const routeSchema = z.object({
  icd10Code: z.string().min(1),
  denialRiskScore: z.number().min(0).max(1),
  riskLevel: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

router.post("/route-physician", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = routeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const decision = routeToPhysician(parsed.data);
  res.json(decision);
});

const physicianSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  specialty: z.string().min(1),
  currentLoad: z.number().min(0).default(0),
  maxLoad: z.number().min(1).default(20),
  available: z.boolean().default(true),
});

router.post("/physicians/register", requireRole(["admin"]), (req, res) => {
  const parsed = physicianSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  registerPhysician(parsed.data);
  res.json({ registered: true, physician: parsed.data });
});

router.get("/physicians", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getPhysicianRegistry());
});

router.get("/specialty-detect", requireRole(["admin", "physician"]), (req, res) => {
  const icd10 = req.query.icd10 as string;
  if (!icd10) return res.status(400).json({ error: "icd10 query param required" });
  res.json({ icd10, specialty: detectSpecialty(icd10) });
});

router.post("/physicians/:id/release", requireRole(["admin", "physician"]), (req, res) => {
  const released = releasePhysicianLoad(req.params.id);
  if (!released) return res.status(404).json({ error: "Physician not found or load already 0" });
  res.json({ released: true, physicianId: req.params.id });
});

router.get("/revenue", requireRole(["admin"]), (_req, res) => {
  res.json(calculateRevenueMetrics());
});

const fullPipelineSchema = z.object({
  diagnosis: z.string().min(1),
  differentials: z.array(z.string()).optional().default([]),
  triage: z.string().min(1),
  complaint: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  hpiText: z.string().optional(),
});

router.post("/full-pipeline", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = fullPipelineSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { diagnosis, differentials, triage, complaint, confidence, hpiText } = parsed.data;

  const coding = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  const risk = classifyRisk({ triage, diagnosis, confidence });
  const denial = predictDenial({
    coding,
    riskClassification: risk,
    encounter: { complaint, diagnosis, triage, confidence },
    clinicalNote: {
      hpi: hpiText || `Chief Complaint: ${complaint}`,
      assessment: `Primary: ${diagnosis} (ICD-10: ${coding.primary.icd10})`,
      plan: `Disposition: ${triage}`,
    },
  });

  const fix = autoFixEncounter(coding, denial, { triage, confidence });

  const learnedScore = getLearnedDenialScore(coding.primary.icd10, fix.finalCpt);
  const adjustedRisk = Math.round(Math.max(denial.riskScore * (1 - learnedScore * 0.3), 0) * 1000) / 1000;

  const routing = routeToPhysician({
    icd10Code: coding.primary.icd10,
    denialRiskScore: adjustedRisk,
    riskLevel: risk.level,
    confidence,
  });

  res.json({
    coding: { primary: coding.primary, cpt: fix.finalCpt, originalCpt: coding.cpt, codingConfidence: coding.codingConfidence },
    denialPrediction: { riskScore: denial.riskScore, riskLevel: denial.riskLevel, reasons: denial.reasons },
    autoFix: fix,
    adjustedRisk,
    learnedScore,
    routing,
    disposition: routing.autoSubmitEligible ? "AUTO_SUBMIT" : "PHYSICIAN_REVIEW",
  });
});

// ─── Reimbursement Optimizer ──────────────────────────────────────────────────
const optimizeSchema = z.object({
  diagnosis: z.string().min(1),
  differentials: z.array(z.string()).optional().default([]),
  triage: z.string().min(1),
  complaint: z.string().min(1),
  confidence: z.number().min(0).max(1).optional().default(0.8),
  cptOptions: z.array(z.string()).min(1, "cptOptions required"),
});

const CPT_BASE_RATES: Record<string, number> = {
  "99201": 55, "99202": 68, "99203": 90, "99204": 120, "99205": 150,
  "99211": 30, "99212": 55, "99213": 75, "99214": 110, "99215": 150,
  "99281": 100, "99282": 150, "99283": 200, "99284": 250, "99285": 400,
  "99441": 40, "99442": 65, "99443": 85,
};

router.post("/optimize-reimbursement", (req, res) => {
  const parsed = optimizeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { diagnosis, differentials, triage, complaint, confidence, cptOptions } = parsed.data;
  const coding = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  const risk = classifyRisk({ triage, diagnosis, confidence });

  const ranked = cptOptions.map(cpt => {
    const base = CPT_BASE_RATES[cpt] ?? 75;
    const learnedScore = getLearnedDenialScore(coding.primary.icd10, cpt);
    const denial = predictDenial({
      coding: { ...coding, cpt },
      riskClassification: risk,
      encounter: { complaint, diagnosis, triage, confidence },
      clinicalNote: { hpi: `Chief Complaint: ${complaint}`, assessment: `Primary: ${diagnosis}`, plan: `Disposition: ${triage}` },
    });
    const adjustedDenialRisk = Math.max(denial.riskScore * (1 - learnedScore * 0.3), 0);
    const expectedValue = Math.round(base * (1 - adjustedDenialRisk) * 100) / 100;
    return {
      cpt,
      baseRate: base,
      denialRisk: Math.round(adjustedDenialRisk * 1000) / 1000,
      expectedValue,
      reasons: denial.reasons.slice(0, 2),
      recommended: false,
    };
  }).sort((a, b) => b.expectedValue - a.expectedValue);

  if (ranked.length > 0) ranked[0].recommended = true;

  res.json({ ok: true, ranked, bestCpt: ranked[0]?.cpt, maxExpectedValue: ranked[0]?.expectedValue });
});

// ─── Physician Coaching Agent ─────────────────────────────────────────────────
function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

const coachingSchema = z.object({
  clinicianId: z.string().min(1),
  totalCases: z.number().min(0).default(0),
  accuracyScore: z.number().min(0).max(1).default(0.85),
  escalationRate: z.number().min(0).max(1).default(0.1),
  avgDecisionTimeMs: z.number().min(0).default(3000),
  denialRate: z.number().min(0).max(1).default(0.05),
  topDiagnoses: z.array(z.string()).optional().default([]),
});

router.post("/coaching", async (req, res) => {
  const parsed = coachingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { clinicianId, totalCases, accuracyScore, escalationRate, avgDecisionTimeMs, denialRate, topDiagnoses } = parsed.data;

  const ruleBasedFeedback: string[] = [];
  let priority: "low" | "medium" | "high" = "low";

  if (accuracyScore < 0.80) { ruleBasedFeedback.push("Diagnostic accuracy below 80% — review top missed diagnoses."); priority = "high"; }
  else if (accuracyScore < 0.90) { ruleBasedFeedback.push("Accuracy is acceptable but improvement opportunities exist in complex differentials."); if (priority === "low") priority = "medium"; }
  if (escalationRate > 0.25) { ruleBasedFeedback.push("Escalation rate exceeds 25% — consider earlier pattern recognition to pre-empt escalations."); priority = "high"; }
  if (avgDecisionTimeMs > 7000) { ruleBasedFeedback.push("Decision latency is high (>7s) — workflow efficiency review recommended."); if (priority === "low") priority = "medium"; }
  if (denialRate > 0.15) { ruleBasedFeedback.push("Claim denial rate >15% — documentation quality and CPT selection need review."); if (priority !== "high") priority = "medium"; }
  if (ruleBasedFeedback.length === 0) ruleBasedFeedback.push("Performance metrics are within excellent ranges. Maintain current clinical approach.");

  try {
    const prompt = `You are a senior clinical performance coach for a medical AI triage platform. Based on the following clinician performance data, provide 3 concise, actionable coaching recommendations (1-2 sentences each).

Clinician ID: ${clinicianId}
Total Cases Reviewed: ${totalCases}
Diagnostic Accuracy: ${(accuracyScore * 100).toFixed(1)}%
Escalation Rate: ${(escalationRate * 100).toFixed(1)}%
Avg Decision Time: ${(avgDecisionTimeMs / 1000).toFixed(1)}s
Claim Denial Rate: ${(denialRate * 100).toFixed(1)}%
Top Diagnoses: ${topDiagnoses.length > 0 ? topDiagnoses.join(", ") : "N/A"}
Rule-based flags: ${ruleBasedFeedback.join(" | ")}

Respond with a JSON object: { "recommendations": ["...", "...", "..."], "summary": "one sentence overall assessment", "strengths": ["..."], "focus_area": "single top priority" }`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const ai = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    res.json({
      ok: true, clinicianId, priority,
      ruleBasedFlags: ruleBasedFeedback,
      aiRecommendations: ai.recommendations ?? [],
      summary: ai.summary ?? "Performance review complete.",
      strengths: ai.strengths ?? [],
      focusArea: ai.focus_area ?? "Documentation quality",
      metrics: { totalCases, accuracyScore, escalationRate, avgDecisionTimeMs, denialRate },
    });
  } catch (_e) {
    res.json({
      ok: true, clinicianId, priority,
      ruleBasedFlags: ruleBasedFeedback,
      aiRecommendations: ruleBasedFeedback,
      summary: `Clinician ${clinicianId} reviewed — ${priority} priority coaching needed.`,
      strengths: accuracyScore > 0.9 ? ["High diagnostic accuracy"] : [],
      focusArea: denialRate > 0.15 ? "Billing documentation" : escalationRate > 0.25 ? "Escalation thresholds" : "Overall performance",
      metrics: { totalCases, accuracyScore, escalationRate, avgDecisionTimeMs, denialRate },
    });
  }
});

// ─── Contract Simulation Engine ───────────────────────────────────────────────
const contractSimSchema = z.object({
  payerId: z.string().min(1),
  payerName: z.string().optional().default("Unknown Payer"),
  currentRate: z.number().min(0),
  proposedRate: z.number().min(0),
  visitVolume: z.number().min(1).default(1000),
  denialRate: z.number().min(0).max(1).optional().default(0.12),
  avgCaseMix: z.number().min(0).max(1).optional().default(0.7),
  negotiationCostHours: z.number().min(0).optional().default(20),
  hourlyRate: z.number().min(0).optional().default(150),
});

router.post("/contract-simulate", (req, res) => {
  const parsed = contractSimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { payerId, payerName, currentRate, proposedRate, visitVolume, denialRate, avgCaseMix, negotiationCostHours, hourlyRate } = parsed.data;

  const effectiveCollectionRate = 1 - (denialRate ?? 0.12);
  const currentRevenue = currentRate * visitVolume * effectiveCollectionRate * (avgCaseMix ?? 0.7);
  const projectedRevenue = proposedRate * visitVolume * effectiveCollectionRate * (avgCaseMix ?? 0.7);
  const revenueGain = projectedRevenue - currentRevenue;
  const negotiationCost = (negotiationCostHours ?? 20) * (hourlyRate ?? 150);
  const netGain = revenueGain - negotiationCost;
  const roi = negotiationCost > 0 ? (netGain / negotiationCost) * 100 : 0;
  const breakEvenMonths = revenueGain > 0 ? negotiationCost / (revenueGain / 12) : null;
  const rateChangePct = currentRate > 0 ? ((proposedRate - currentRate) / currentRate) * 100 : 0;

  let strategy: string;
  let recommendation: string;
  if (rateChangePct > 15 && roi > 200) { strategy = "anchor_high"; recommendation = "Strong ROI — pursue aggressively with outcome data as leverage."; }
  else if (roi > 100) { strategy = "value_based"; recommendation = "Good ROI — frame negotiation around quality metrics and outcomes."; }
  else if (roi > 50) { strategy = "bundled_rate"; recommendation = "Moderate ROI — consider bundled rates to improve overall contract value."; }
  else if (netGain < 0) { strategy = "risk_share"; recommendation = "Negative ROI — explore risk-share model or delay until volume increases."; }
  else { strategy = "standard"; recommendation = "Acceptable ROI — proceed with standard rate negotiation."; }

  const scenarios = [0.5, 0.75, 1.0, 1.25, 1.5].map(multiplier => {
    const vol = Math.round(visitVolume * multiplier);
    const rev = proposedRate * vol * effectiveCollectionRate * (avgCaseMix ?? 0.7);
    return { volumeMultiplier: multiplier, visitVolume: vol, revenue: Math.round(rev), gain: Math.round(rev - currentRevenue) };
  });

  res.json({
    ok: true, payerId, payerName,
    currentRate, proposedRate, rateChangePct: Math.round(rateChangePct * 10) / 10,
    currentRevenue: Math.round(currentRevenue),
    projectedRevenue: Math.round(projectedRevenue),
    revenueGain: Math.round(revenueGain),
    netGain: Math.round(netGain),
    roi: Math.round(roi),
    negotiationCost: Math.round(negotiationCost),
    breakEvenMonths: breakEvenMonths ? Math.round(breakEvenMonths * 10) / 10 : null,
    strategy, recommendation, scenarios,
    denialRate, visitVolume,
  });
});

// ─── Outcome-Weighted Revenue Dashboard ───────────────────────────────────────
router.get("/outcome-revenue", (_req, res) => {
  const revenue = calculateRevenueMetrics();
  const stats = getClaimOutcomeStats();

  // Compute quality-adjusted revenue
  const qualityWeight = stats.paidRate > 0 ? stats.paidRate : 0.85;
  const qualityAdjustedRevenue = Math.round(revenue.totalRevenue * qualityWeight);
  const outcomeEfficiency = revenue.totalEncounters > 0
    ? Math.round((qualityAdjustedRevenue / Math.max(revenue.totalRevenue, 1)) * 1000) / 10
    : 0;

  // Top revenue opportunities
  const opportunities = revenue.topDeniedCodePairs.slice(0, 5).map(p => ({
    ...p,
    recoveryPotential: Math.round(p.potentialLoss * (1 - (stats.denialRate ?? 0))),
    priority: p.denials > 5 ? "high" : p.denials > 2 ? "medium" : "low",
  }));

  // Grade the revenue health
  const denialRate = revenue.denialRate ?? stats.denialRate ?? 0;
  let grade: string;
  let gradeColor: string;
  if (denialRate < 0.05) { grade = "A+"; gradeColor = "green"; }
  else if (denialRate < 0.10) { grade = "A"; gradeColor = "green"; }
  else if (denialRate < 0.15) { grade = "B"; gradeColor = "yellow"; }
  else if (denialRate < 0.25) { grade = "C"; gradeColor = "orange"; }
  else { grade = "D"; gradeColor = "red"; }

  res.json({
    ok: true,
    revenue,
    qualityAdjustedRevenue,
    outcomeEfficiency,
    qualityWeight: Math.round(qualityWeight * 1000) / 10,
    opportunities,
    grade, gradeColor,
    denialRate: Math.round(denialRate * 1000) / 10,
    stats: {
      totalOutcomes: stats.totalOutcomes,
      paidRate: Math.round((stats.paidRate ?? 0) * 1000) / 10,
      totalRevenue: Math.round(stats.totalRevenue ?? 0),
    },
  });
});

export default router;

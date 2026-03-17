import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { fdaGuard } from "../middleware/fdaGuard";
import { orchestrationLayer } from "../layers/orchestration/orchestrationLayer";
import { memoryEngine } from "../engines/memoryEngine";

const router = Router();

interface ReviewCase {
  id: string;
  patientName: string;
  chiefComplaint: string;
  symptoms: string[];
  aiSuggestion: { diagnosis: string; disposition: string; confidence: number };
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number;
  status: "pending" | "reviewed" | "overridden";
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  physicianDecision?: string;
  override: boolean;
}

interface OutcomeEntry {
  id: string;
  caseId: string;
  aiDiagnosis: string;
  actualDiagnosis: string;
  correct: boolean;
  submittedAt: number;
  feedback?: string;
}

const reviewCases: ReviewCase[] = [];
const outcomes: OutcomeEntry[] = [];
const auditLog: any[] = [];

function seedCases() {
  if (reviewCases.length > 0) return;
  const demoData = [
    { name: "Sarah Mitchell", complaint: "Sore throat and fever for 3 days", symptoms: ["sore throat", "fever", "difficulty swallowing"] },
    { name: "James Rodriguez", complaint: "Persistent headache with visual changes", symptoms: ["headache", "blurred vision", "nausea"] },
    { name: "Emily Chen", complaint: "Ear pain and hearing loss", symptoms: ["ear pain", "hearing loss", "dizziness"] },
    { name: "Robert Thompson", complaint: "Chronic cough with blood", symptoms: ["cough", "hemoptysis", "chest pain"] },
    { name: "Maria Santos", complaint: "Facial swelling and pain", symptoms: ["facial pain", "swelling", "fever"] },
    { name: "David Kim", complaint: "Sudden onset vertigo", symptoms: ["vertigo", "nausea", "vomiting"] },
    { name: "Lisa Anderson", complaint: "Nasal congestion for 2 weeks", symptoms: ["nasal congestion", "headache", "postnasal drip"] },
    { name: "Michael Brown", complaint: "Difficulty breathing through nose", symptoms: ["nasal obstruction", "snoring", "fatigue"] },
    { name: "Jennifer Taylor", complaint: "Recurring tonsillitis", symptoms: ["sore throat", "fever", "swollen tonsils"] },
    { name: "William Davis", complaint: "Hoarseness lasting 4 weeks", symptoms: ["hoarseness", "throat pain", "difficulty swallowing"] },
    { name: "Amanda Wilson", complaint: "Nosebleeds and sinus pressure", symptoms: ["epistaxis", "sinus pressure", "headache"] },
    { name: "Christopher Lee", complaint: "Sudden hearing loss in right ear", symptoms: ["hearing loss", "tinnitus", "ear fullness"] },
  ];

  demoData.forEach((d, i) => {
    const brainResult = orchestrationLayer.run(d.symptoms.join(", "), "batch_review");
    const riskScore = calculateRisk(brainResult);
    reviewCases.push({
      id: `case_${Date.now()}_${i}`,
      patientName: d.name,
      chiefComplaint: d.complaint,
      symptoms: d.symptoms,
      aiSuggestion: {
        diagnosis: brainResult.decision?.diagnosis || "Unknown",
        disposition: brainResult.decision?.disposition || "clinic",
        confidence: brainResult.decision?.confidence || 0.5,
      },
      riskLevel: riskScore >= 5 ? "HIGH" : riskScore >= 3 ? "MEDIUM" : "LOW",
      riskScore,
      status: "pending",
      submittedAt: Date.now() - Math.floor(Math.random() * 86400000),
      override: false,
    });
  });

  outcomes.push(
    { id: "out_1", caseId: "hist_1", aiDiagnosis: "Strep Throat", actualDiagnosis: "Strep Throat", correct: true, submittedAt: Date.now() - 86400000 * 5 },
    { id: "out_2", caseId: "hist_2", aiDiagnosis: "Sinusitis", actualDiagnosis: "Sinusitis", correct: true, submittedAt: Date.now() - 86400000 * 4 },
    { id: "out_3", caseId: "hist_3", aiDiagnosis: "Otitis Media", actualDiagnosis: "Otitis Externa", correct: false, submittedAt: Date.now() - 86400000 * 3, feedback: "Misclassified ear infection type" },
    { id: "out_4", caseId: "hist_4", aiDiagnosis: "GERD", actualDiagnosis: "GERD", correct: true, submittedAt: Date.now() - 86400000 * 2 },
    { id: "out_5", caseId: "hist_5", aiDiagnosis: "Allergic Rhinitis", actualDiagnosis: "Allergic Rhinitis", correct: true, submittedAt: Date.now() - 86400000 },
    { id: "out_6", caseId: "hist_6", aiDiagnosis: "Pharyngitis", actualDiagnosis: "Peritonsillar Abscess", correct: false, submittedAt: Date.now() - 86400000 * 6, feedback: "Missed abscess" },
    { id: "out_7", caseId: "hist_7", aiDiagnosis: "BPPV", actualDiagnosis: "BPPV", correct: true, submittedAt: Date.now() - 86400000 * 7 },
    { id: "out_8", caseId: "hist_8", aiDiagnosis: "Tonsillitis", actualDiagnosis: "Tonsillitis", correct: true, submittedAt: Date.now() - 86400000 * 8 },
  );
}

function calculateRisk(brainResult: any): number {
  let score = 0;
  const confidence = brainResult.decision?.confidence || 0.5;
  if (confidence < 0.7) score += 2;
  if (brainResult.safety?.alerts?.length > 0) score += 3;
  if (brainResult.decision?.disposition === "er") score += 5;
  if (brainResult.decision?.disposition === "urgent") score += 2;
  return score;
}

seedCases();

router.get("/api/batch-review/cases", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const limit = Number((_req.query as any).limit) || 20;
  const status = (_req.query as any).status || "pending";
  const filtered = status === "all" ? reviewCases : reviewCases.filter((c) => c.status === status);
  res.json({ cases: filtered.slice(0, limit), total: filtered.length, pending: reviewCases.filter((c) => c.status === "pending").length });
});

router.post("/api/batch-review/approve", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseIds } = req.body;
  if (!caseIds || !Array.isArray(caseIds)) return res.status(400).json({ error: "caseIds array required" });
  let approved = 0;
  caseIds.forEach((id: string) => {
    const c = reviewCases.find((rc) => rc.id === id);
    if (c && c.status === "pending") {
      c.status = "reviewed";
      c.reviewedAt = Date.now();
      c.reviewedBy = (req as any).authUser?.userId || "physician";
      c.physicianDecision = c.aiSuggestion.diagnosis;
      c.override = false;
      approved++;
      auditLog.push({ caseId: id, action: "batch_approve", userId: c.reviewedBy, aiSuggestion: c.aiSuggestion.diagnosis, finalDecision: c.aiSuggestion.diagnosis, override: false, timestamp: Date.now() });
    }
  });
  res.json({ approved, total: caseIds.length });
});

router.post("/api/batch-review/override", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseId, decision, reason } = req.body;
  const c = reviewCases.find((rc) => rc.id === caseId);
  if (!c) return res.status(404).json({ error: "Case not found" });
  c.status = "overridden";
  c.reviewedAt = Date.now();
  c.reviewedBy = (req as any).authUser?.userId || "physician";
  c.physicianDecision = decision;
  c.override = true;
  auditLog.push({ caseId, action: "override", userId: c.reviewedBy, aiSuggestion: c.aiSuggestion.diagnosis, finalDecision: decision, override: true, reason, timestamp: Date.now() });
  res.json({ success: true, case: c });
});

router.get("/api/batch-review/audit", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({ auditLog: auditLog.slice(-50).reverse() });
});

router.get("/api/risk-assessment", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const summary = {
    total: reviewCases.length,
    byRisk: { HIGH: reviewCases.filter((c) => c.riskLevel === "HIGH").length, MEDIUM: reviewCases.filter((c) => c.riskLevel === "MEDIUM").length, LOW: reviewCases.filter((c) => c.riskLevel === "LOW").length },
    highRiskCases: reviewCases.filter((c) => c.riskLevel === "HIGH").map((c) => ({ id: c.id, patient: c.patientName, complaint: c.chiefComplaint, score: c.riskScore, diagnosis: c.aiSuggestion.diagnosis })),
  };
  res.json(summary);
});

router.post("/api/scale/outcomes/submit", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseId, aiDiagnosis, actualDiagnosis, feedback } = req.body;
  const entry: OutcomeEntry = {
    id: `out_${Date.now()}`,
    caseId,
    aiDiagnosis: aiDiagnosis || "Unknown",
    actualDiagnosis: actualDiagnosis || "Unknown",
    correct: aiDiagnosis === actualDiagnosis,
    submittedAt: Date.now(),
    feedback,
  };
  outcomes.push(entry);
  memoryEngine.store("outcome_feedback", entry.id, entry);
  res.json(entry);
});

router.get("/api/scale/outcomes/stats", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const total = outcomes.length;
  const correct = outcomes.filter((o) => o.correct).length;
  const accuracy = total > 0 ? correct / total : 0;
  const errorRate = total > 0 ? (total - correct) / total : 0;
  const adjustment = errorRate > 0.1 ? "increase_caution" : "stable";
  res.json({
    total,
    correct,
    incorrect: total - correct,
    accuracy: Number(accuracy.toFixed(3)),
    errorRate: Number(errorRate.toFixed(3)),
    modelAdjustment: adjustment,
    recentOutcomes: outcomes.slice(-10).reverse(),
  });
});

router.get("/api/fda/disclaimer", fdaGuard, (_req: Request, res: Response) => {
  res.json({ status: "active", type: "Clinical Decision Support System" });
});

export default router;

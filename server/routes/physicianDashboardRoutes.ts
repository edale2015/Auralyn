import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { ingestOutcome, getFeedbackLogs, getFeedbackStats, CaseData, ActualOutcome } from "../engines/feedbackEngine";
import { detectErrors, getErrorSummary, groupErrorsByComplaint } from "../engines/errorDetectionEngine";
import { updateFixStatus } from "../engines/autoFixEngine";
import { runSelfImprovementCycle, seedAllDemoData, getCycleCount, getFixesPending, getAllFixes } from "../engines/selfImprovementCycleEngine";
import { storeCase, findSimilarCases, getMemoryStats } from "../engines/caseMemoryEngine";
import { explainabilityGraphEngine, ClinicalTrace } from "../engines/explainabilityGraphEngine";

const router = Router();

const auth = requireRole(["admin", "physician"]);

router.post("/feedback/ingest", auth, (req: Request, res: Response) => {
  try {
    const { caseData, actualOutcome } = req.body;
    if (!caseData || !actualOutcome) return res.status(400).json({ error: "caseData and actualOutcome required" });
    if (!caseData.caseId || !caseData.complaint || !caseData.diagnosis || !caseData.triage) {
      return res.status(400).json({ error: "caseData requires caseId, complaint, diagnosis, triage" });
    }
    const safe: CaseData = {
      caseId: String(caseData.caseId),
      complaint: String(caseData.complaint),
      diagnosis: String(caseData.diagnosis),
      triage: String(caseData.triage),
      symptoms: Array.isArray(caseData.symptoms) ? caseData.symptoms : [],
      questionsAsked: Array.isArray(caseData.questionsAsked) ? caseData.questionsAsked : [],
      rulesTriggered: Array.isArray(caseData.rulesTriggered) ? caseData.rulesTriggered : [],
      confidence: typeof caseData.confidence === "number" ? caseData.confidence : 0.5,
    };
    const safeOutcome: ActualOutcome = {
      diagnosis: String(actualOutcome.diagnosis ?? ""),
      triage: String(actualOutcome.triage ?? ""),
      admittedToER: !!actualOutcome.admittedToER,
      followUpNeeded: !!actualOutcome.followUpNeeded,
      missedSignals: Array.isArray(actualOutcome.missedSignals) ? actualOutcome.missedSignals : [],
    };
    const log = ingestOutcome(safe, safeOutcome);
    res.json({ success: true, log });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/feedback/logs", auth, (_req: Request, res: Response) => {
  try {
    const logs = getFeedbackLogs();
    res.json({ logs, total: logs.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/feedback/stats", auth, (_req: Request, res: Response) => {
  try {
    res.json(getFeedbackStats());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/errors/detect", auth, (_req: Request, res: Response) => {
  try {
    const logs = getFeedbackLogs();
    const errors = detectErrors(logs);
    const summary = getErrorSummary(errors);
    const grouped = groupErrorsByComplaint(errors);
    res.json({ errors, summary, grouped });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/cycle/run", auth, (_req: Request, res: Response) => {
  try {
    const result = runSelfImprovementCycle();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/cycle/status", auth, (_req: Request, res: Response) => {
  try {
    res.json({
      cycleCount: getCycleCount(),
      pendingFixes: getFixesPending().length,
      totalFixes: getAllFixes().length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/fixes", auth, (_req: Request, res: Response) => {
  try {
    const fixes = getAllFixes();
    const pending = fixes.filter(f => f.status === "pending");
    const approved = fixes.filter(f => f.status === "approved");
    const rejected = fixes.filter(f => f.status === "rejected");
    const applied = fixes.filter(f => f.status === "applied");
    res.json({ fixes, counts: { total: fixes.length, pending: pending.length, approved: approved.length, rejected: rejected.length, applied: applied.length } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/fixes/:fixId", auth, (req: Request, res: Response) => {
  try {
    const { fixId } = req.params;
    const { status } = req.body;
    if (!["approved", "rejected", "applied"].includes(status)) {
      return res.status(400).json({ error: "status must be approved, rejected, or applied" });
    }
    const fix = updateFixStatus(fixId, status);
    if (!fix) return res.status(404).json({ error: "Fix not found" });
    res.json({ success: true, fix });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/memory/store", auth, (req: Request, res: Response) => {
  try {
    const { caseId, complaint, symptoms, diagnosis, triage } = req.body;
    if (!caseId || !complaint) return res.status(400).json({ error: "caseId and complaint required" });
    if (!Array.isArray(symptoms)) return res.status(400).json({ error: "symptoms must be an array" });
    storeCase({ caseId: String(caseId), complaint: String(complaint), symptoms, diagnosis: String(diagnosis ?? "unknown"), triage: String(triage ?? "unknown") });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/memory/similar", auth, (req: Request, res: Response) => {
  try {
    const { complaint, symptoms, topK, minScore } = req.body;
    if (!complaint || !Array.isArray(symptoms)) return res.status(400).json({ error: "complaint (string) and symptoms (array) required" });
    const k = Math.min(Math.max(1, Number(topK) || 5), 50);
    const ms = Math.min(Math.max(0, Number(minScore) || 0.1), 1);
    const results = findSimilarCases({ complaint: String(complaint), symptoms }, k, ms);
    res.json({ results, total: results.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/memory/stats", auth, (_req: Request, res: Response) => {
  try {
    res.json(getMemoryStats());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/explain", auth, (req: Request, res: Response) => {
  try {
    const trace = req.body.trace;
    if (!trace || !trace.complaint) return res.status(400).json({ error: "trace with complaint required" });
    const safe: ClinicalTrace = {
      complaint: String(trace.complaint),
      questions: Array.isArray(trace.questions) ? trace.questions : [],
      modifiers: Array.isArray(trace.modifiers) ? trace.modifiers : [],
      rules: Array.isArray(trace.rules) ? trace.rules : [],
      clusters: Array.isArray(trace.clusters) ? trace.clusters : [],
      diagnosis: String(trace.diagnosis ?? "unknown"),
      triage: String(trace.triage ?? "unknown"),
    };
    const graph = explainabilityGraphEngine.buildClinicalGraph(safe);
    res.json(graph);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/explain/demo", auth, (_req: Request, res: Response) => {
  try {
    const graph = explainabilityGraphEngine.buildDemoGraph();
    res.json(graph);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/seed", auth, (_req: Request, res: Response) => {
  try {
    const result = seedAllDemoData();
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/overview", auth, (_req: Request, res: Response) => {
  try {
    const feedbackStats = getFeedbackStats();
    const logs = getFeedbackLogs();
    const errors = detectErrors(logs);
    const errorSummary = getErrorSummary(errors);
    const fixes = getAllFixes();
    const memoryStats = getMemoryStats();

    res.json({
      feedbackStats,
      errorSummary,
      fixCounts: {
        total: fixes.length,
        pending: fixes.filter(f => f.status === "pending").length,
        approved: fixes.filter(f => f.status === "approved").length,
        rejected: fixes.filter(f => f.status === "rejected").length,
        applied: fixes.filter(f => f.status === "applied").length,
      },
      memoryStats,
      cycleCount: getCycleCount(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

import { Router, Request, Response } from "express";
import { saveTrace, loadAllTraces, loadTrace, loadTracesByComplaint } from "../self-improve/traceStore";
import { listGoldCases, addGoldCase, compareToGold } from "../self-improve/goldCaseStore";
import { classifyFailure, aggregateFailurePatterns } from "../self-improve/failureClassifier";
import { generateProposal, listProposals, updateProposalStatus, getProposalDashboard } from "../self-improve/proposalEngine";
import { updateQ, getPolicyStats, computeReward, bestAction } from "../self-improve/reinforcementEngine";
import { addEdge, rankDiagnoses, getGraphStats } from "../self-improve/reasoningGraph";
import { scoreRisk, trainModel, getModelStats } from "../self-improve/riskModel";
import { runImprovementCycle, getOrchestratorStatus } from "../self-improve/improvementOrchestrator";
import { runSystemAudit, auditComponent } from "../self-improve/auditEngine";
import { ALL_CONTRACTS } from "../self-improve/componentContracts";

const router = Router();

// ── Level 1: Trace Capture ───────────────────────────────────────────────────
router.post("/trace", async (req: Request, res: Response) => {
  try {
    const trace = req.body;
    if (!trace.case_id || !trace.complaint) {
      return res.status(400).json({ error: "case_id and complaint are required" });
    }
    if (!trace.timestamp) trace.timestamp = new Date().toISOString();
    if (!trace.channel) trace.channel = "web";
    if (!trace.patient_context) trace.patient_context = {};
    if (!trace.modifier_intake) trace.modifier_intake = {};
    if (!trace.questions_asked) trace.questions_asked = [];
    if (!trace.signals_detected) trace.signals_detected = [];
    if (!trace.rules_triggered) trace.rules_triggered = [];
    if (!trace.differential_scores) trace.differential_scores = [];
    if (!trace.final_output) trace.final_output = { disposition: "unknown", confidence: "low", review_required: true };
    if (!trace.missing_expected_data) trace.missing_expected_data = [];
    if (!trace.runtime_flags) trace.runtime_flags = [];
    await saveTrace(trace);
    res.json({ success: true, case_id: trace.case_id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/traces", async (req: Request, res: Response) => {
  try {
    const complaint = req.query.complaint as string | undefined;
    const traces = complaint ? await loadTracesByComplaint(complaint) : await loadAllTraces();
    res.json({ traces: traces.slice(0, 100), total: traces.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/trace/:caseId", async (req: Request, res: Response) => {
  try {
    const trace = await loadTrace(req.params.caseId);
    if (!trace) return res.status(404).json({ error: "Trace not found" });
    res.json(trace);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 2: Gold Cases + Evaluation ─────────────────────────────────────────
router.get("/gold-cases", async (req: Request, res: Response) => {
  try {
    const complaint = req.query.complaint as string | undefined;
    const cases = await listGoldCases(complaint);
    res.json({ cases, total: cases.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/gold-cases", async (req: Request, res: Response) => {
  try {
    const gc = req.body;
    if (!gc.case_id || !gc.complaint || !gc.expected_disposition) {
      return res.status(400).json({ error: "case_id, complaint, expected_disposition required" });
    }
    gc.source = gc.source ?? "manual";
    const created = await addGoldCase(gc);
    res.json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/compare", async (req: Request, res: Response) => {
  try {
    const { trace, gold_case } = req.body;
    if (!trace || !gold_case) return res.status(400).json({ error: "trace and gold_case required" });
    const result = compareToGold(trace, gold_case);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 3: Failure Classification ──────────────────────────────────────────
router.post("/classify", async (req: Request, res: Response) => {
  try {
    const { trace, comparison } = req.body;
    if (!trace || !comparison) return res.status(400).json({ error: "trace and comparison required" });
    const classification = classifyFailure(trace, comparison);
    res.json(classification);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/patterns/:complaint", async (req: Request, res: Response) => {
  try {
    const { complaint } = req.params;
    const allTraces = await loadTracesByComplaint(complaint);
    const goldCases = await listGoldCases(complaint);
    const failures: any[] = [];
    const totalByComplaint: Record<string, number> = { [complaint]: allTraces.length || goldCases.length };

    for (const gc of goldCases) {
      const trace = allTraces.find(t => t.case_id === gc.case_id);
      if (!trace) continue;
      const comp = compareToGold(trace, gc);
      if (!comp.pass) {
        const cf = classifyFailure(trace, comp);
        failures.push(cf);
      }
    }
    const patterns = aggregateFailurePatterns(failures, totalByComplaint);
    res.json({ complaint, patterns, failures_found: failures.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 4: Proposal System ──────────────────────────────────────────────────
router.post("/proposals/generate", async (req: Request, res: Response) => {
  try {
    const { failure } = req.body;
    if (!failure || !failure.case_id) return res.status(400).json({ error: "failure object required" });
    const proposal = await generateProposal(failure);
    res.json({ proposal });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/proposals", async (req: Request, res: Response) => {
  try {
    const complaint = req.query.complaint as string | undefined;
    const status = req.query.status as any;
    const proposals = await listProposals(complaint, status);
    res.json({ proposals, total: proposals.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/proposals/:proposalId", async (req: Request, res: Response) => {
  try {
    const { proposalId } = req.params;
    const { status, reviewer_notes, approved_by } = req.body;
    const updated = await updateProposalStatus(proposalId, status, reviewer_notes, approved_by);
    if (!updated) return res.status(404).json({ error: "Proposal not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/proposals/dashboard", async (req: Request, res: Response) => {
  try {
    const dashboard = await getProposalDashboard();
    res.json(dashboard);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 7: Reinforcement Learning ──────────────────────────────────────────
router.post("/rl/update", async (req: Request, res: Response) => {
  try {
    const { state, action, predicted_disposition, expected_disposition, dangerous_miss } = req.body;
    if (!state || !action) return res.status(400).json({ error: "state and action required" });
    const reward = computeReward(predicted_disposition ?? action, expected_disposition ?? action, dangerous_miss ?? false);
    await updateQ(state, action, reward);
    res.json({ success: true, reward });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/rl/best-action", async (req: Request, res: Response) => {
  try {
    const { state, actions } = req.body;
    if (!state || !actions) return res.status(400).json({ error: "state and actions required" });
    const best = await bestAction(state, actions);
    res.json({ best_action: best });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/rl/policy", async (req: Request, res: Response) => {
  try {
    const complaint = req.query.complaint as string | undefined;
    const stats = await getPolicyStats(complaint);
    res.json({ stats, total: stats.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 8: Knowledge Graph ──────────────────────────────────────────────────
router.post("/graph/add", async (req: Request, res: Response) => {
  try {
    const { symptom, diagnosis, confirmed, complaint } = req.body;
    if (!symptom || !diagnosis) return res.status(400).json({ error: "symptom and diagnosis required" });
    await addEdge(symptom, diagnosis, confirmed ?? true, complaint);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/graph/rank", async (req: Request, res: Response) => {
  try {
    const { symptoms, complaint } = req.body;
    if (!symptoms) return res.status(400).json({ error: "symptoms array required" });
    const ranked = await rankDiagnoses(symptoms, complaint);
    res.json({ ranked_diagnoses: ranked });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/graph/stats", async (req: Request, res: Response) => {
  try {
    const stats = await getGraphStats();
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 9: Risk Model ───────────────────────────────────────────────────────
router.post("/risk/score", async (req: Request, res: Response) => {
  try {
    const { case_id, complaint, symptoms, patient_context, modifiers } = req.body;
    if (!complaint || !symptoms) return res.status(400).json({ error: "complaint and symptoms required" });
    const score = await scoreRisk(case_id ?? "ANON", complaint, symptoms, patient_context ?? {}, modifiers ?? {});
    res.json(score);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/risk/train", async (req: Request, res: Response) => {
  try {
    const { features, outcome_admitted } = req.body;
    if (!features) return res.status(400).json({ error: "features array required" });
    await trainModel(features, outcome_admitted ?? false);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/risk/model-stats", async (req: Request, res: Response) => {
  try {
    const stats = await getModelStats();
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Level 10: Orchestrator ────────────────────────────────────────────────────
router.post("/orchestrate", async (req: Request, res: Response) => {
  try {
    const { max_cases, complaints_filter, dry_run } = req.body;
    const result = await runImprovementCycle({
      maxCases: max_cases ?? 50,
      complaintsFilter: complaints_filter,
      dryRun: dry_run ?? false,
    });
    res.json(result);
  } catch (e: any) {
    if (e.message.includes("already running")) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

router.get("/orchestrate/status", async (req: Request, res: Response) => {
  try {
    const status = getOrchestratorStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Full pipeline: trace → compare → classify → propose ──────────────────────
router.post("/pipeline/run", async (req: Request, res: Response) => {
  try {
    const { trace, gold_case_id } = req.body;
    if (!trace) return res.status(400).json({ error: "trace required" });
    await saveTrace(trace);

    let comparison = null;
    let classification = null;
    let proposal = null;

    if (gold_case_id) {
      const goldCases = await listGoldCases();
      const gold = goldCases.find(gc => gc.case_id === gold_case_id);
      if (gold) {
        comparison = compareToGold(trace, gold);
        if (!comparison.pass) {
          classification = classifyFailure(trace, comparison);
          proposal = await generateProposal(classification);
        }
      }
    }

    res.json({ trace_saved: true, comparison, classification, proposal });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Self-Improvement Audit Engine ─────────────────────────────────────────────
router.get("/audit", (_req: Request, res: Response) => {
  try {
    const report = runSystemAudit();
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/audit/component/:name", (req: Request, res: Response) => {
  try {
    const contract = ALL_CONTRACTS.find(c => c.component_name === req.params.name);
    if (!contract) return res.status(404).json({ error: "Component not found" });
    const result = auditComponent(contract);
    res.json({ contract, result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/audit/contracts", (_req: Request, res: Response) => {
  res.json({ contracts: ALL_CONTRACTS, total: ALL_CONTRACTS.length });
});

export default router;

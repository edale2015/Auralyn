import { Router } from "express";
import { loadComplaintConfig } from "../services/complaintConfigLoader";
import type { GoldenCase } from "./testGoldenRoutes";
import { goldenStore } from "./testGoldenRoutes";
import { reinforceOutcome } from "../learning/rlhfEngine";
import { getAllWeights } from "../learning/weightStore";

const router = Router();

// ─── Tree node / edge types ───────────────────────────────────────────────
export type NodeType = "stage" | "question" | "redflag" | "score_rule" | "disposition" | "dx";

export interface TreeNode {
  id:       string;
  label:    string;
  type:     NodeType;
  data?:    Record<string, any>;
  x?:       number;
  y?:       number;
  tested?:  boolean;
  covered?: boolean;
}

export interface TreeEdge {
  id:   string;
  from: string;
  to:   string;
}

// ─── Layout helpers ──────────────────────────────────────────────────────
const STAGE_X_SPACING  = 260;
const CHILD_X_SPACING  = 200;
const CHILD_Y_STEP     = 100;

const PIPELINE_STAGES  = [
  "INIT_CASE",
  "CC_NORMALIZE",
  "CORE_QUESTIONS",
  "RED_FLAG_GATE",
  "CLUSTER_SCORING",
  "DISPOSITION",
  "DONE",
];

// ─── GET /api/decision-tree/:complaint ──────────────────────────────────
router.get("/:complaint", async (req, res) => {
  const ccId = req.params.complaint.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");

  try {
    const cfg = await loadComplaintConfig(ccId);

    const nodes: TreeNode[] = [];
    const edges: TreeEdge[] = [];

    /* Stage spine */
    PIPELINE_STAGES.forEach((stage, si) => {
      nodes.push({ id: stage, label: stage.replace(/_/g, " "), type: "stage", x: si * STAGE_X_SPACING, y: 0, data: { stage } });
    });
    for (let i = 0; i < PIPELINE_STAGES.length - 1; i++) {
      edges.push({ id: `stage-${i}`, from: PIPELINE_STAGES[i], to: PIPELINE_STAGES[i + 1] });
    }

    if (!cfg) {
      /* Return bare pipeline even with no config */
      return res.json({ ok: true, complaint: ccId, nodes, edges, meta: { available: false } });
    }

    const coreQStageX   = 2 * STAGE_X_SPACING;
    const rfStageX      = 3 * STAGE_X_SPACING;
    const scoreStageX   = 4 * STAGE_X_SPACING;
    const dispStageX    = 5 * STAGE_X_SPACING;

    /* Core questions */
    cfg.coreQuestions.slice(0, 20).forEach((q, qi) => {
      const nid = `q_${q.qId}`;
      nodes.push({
        id: nid, label: q.questionText.slice(0, 60),
        type: "question", data: { qId: q.qId, category: q.category, answerType: q.answerType, askIf: q.askIf },
        x: coreQStageX - 80 + qi * CHILD_X_SPACING, y: CHILD_Y_STEP * (2 + (qi % 4)),
      });
      edges.push({ id: `e_q_${q.qId}`, from: "CORE_QUESTIONS", to: nid });
    });

    /* Red flag rules */
    cfg.redFlagRules.slice(0, 12).forEach((r, ri) => {
      const nid = `rf_${r.rfId}`;
      nodes.push({
        id: nid, label: r.label.slice(0, 50),
        type: "redflag", data: { rfId: r.rfId, severity: r.severity, action: r.action, trigger: r.triggerExpr },
        x: rfStageX - 60 + ri * CHILD_X_SPACING, y: CHILD_Y_STEP * (2 + (ri % 3)),
      });
      edges.push({ id: `e_rf_${r.rfId}`, from: "RED_FLAG_GATE", to: nid });
    });

    /* Cluster scoring rules — group by clusterId */
    const clusterMap = new Map<string, typeof cfg.clusterScoringRules>();
    for (const r of cfg.clusterScoringRules.slice(0, 40)) {
      if (!clusterMap.has(r.clusterId)) clusterMap.set(r.clusterId, []);
      clusterMap.get(r.clusterId)!.push(r);
    }
    let sciIdx = 0;
    for (const [clusterId, rules] of clusterMap.entries()) {
      const clusterNodeId = `cluster_${clusterId}`;
      nodes.push({
        id: clusterNodeId, label: clusterId,
        type: "score_rule", data: { clusterId, ruleCount: rules.length },
        x: scoreStageX - 80 + sciIdx * CHILD_X_SPACING, y: CHILD_Y_STEP * 2,
      });
      edges.push({ id: `e_sc_${clusterId}`, from: "CLUSTER_SCORING", to: clusterNodeId });

      rules.slice(0, 4).forEach((r, ri) => {
        const rnid = `rule_${r.ruleId}`;
        nodes.push({
          id: rnid, label: `${r.evidenceLabel.slice(0, 40)} (${r.points > 0 ? "+" : ""}${r.points})`,
          type: "score_rule", data: { ruleId: r.ruleId, points: r.points, when: r.whenExpr },
          x: scoreStageX - 80 + sciIdx * CHILD_X_SPACING, y: CHILD_Y_STEP * (3 + ri),
        });
        edges.push({ id: `e_r_${r.ruleId}`, from: clusterNodeId, to: rnid });
      });
      sciIdx++;
    }

    /* Disposition rules */
    cfg.dispositionRules.slice(0, 8).forEach((d, di) => {
      const nid = `disp_${d.dispRuleId}`;
      nodes.push({
        id: nid, label: `${d.dispositionLevel} (pri ${d.priority})`,
        type: "disposition", data: { dispRuleId: d.dispRuleId, level: d.dispositionLevel, when: d.whenExpr },
        x: dispStageX - 60 + di * CHILD_X_SPACING, y: CHILD_Y_STEP * (2 + (di % 3)),
      });
      edges.push({ id: `e_d_${d.dispRuleId}`, from: "DISPOSITION", to: nid });
    });

    /* DX candidates */
    cfg.dxCandidates.slice(0, 6).forEach((dx, di) => {
      const nid = `dx_${dx.DX_ID}`;
      nodes.push({
        id: nid, label: dx.DX_LABEL,
        type: "dx", data: { dxId: dx.DX_ID, baseScore: dx.BASE_SCORE, rank: dx.RANK },
        x: dispStageX + 20 + di * CHILD_X_SPACING, y: CHILD_Y_STEP * (4 + di % 2),
      });
      edges.push({ id: `e_dx_${dx.DX_ID}`, from: "DISPOSITION", to: nid });
    });

    res.json({
      ok: true,
      complaint: ccId,
      nodes,
      edges,
      meta: {
        available: true,
        questionCount:   cfg.coreQuestions.length,
        redFlagCount:    cfg.redFlagRules.length,
        scoringRules:    cfg.clusterScoringRules.length,
        dispositions:    cfg.dispositionRules.length,
        dxCandidates:    cfg.dxCandidates.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/decision-tree (list available complaints) ──────────────────
router.get("/", async (_req, res) => {
  const { listAvailableComplaints } = await import("../services/complaintConfigLoader");
  try {
    const list = await listAvailableComplaints();
    res.json({ ok: true, complaints: list.map(c => ({ id: c.ccId, label: c.ccLabel ?? c.ccId })) });
  } catch {
    // Fallback list for well-known complaints
    res.json({
      ok: true,
      complaints: [
        { id: "SORE_THROAT",       label: "Sore Throat" },
        { id: "EAR_PAIN",          label: "Ear Pain" },
        { id: "FLU_SYMPTOMS",      label: "Flu Symptoms" },
        { id: "SINUS_PRESSURE",    label: "Sinus Pressure" },
        { id: "COUGH",             label: "Cough" },
        { id: "FEVER",             label: "Fever" },
        { id: "ENT_FLU_LIKE_V1",   label: "ENT Flu-Like (v1)" },
      ],
    });
  }
});

// ─── GET /api/test/golden/failures  (add to test golden router via here) ─
export function getGoldenFailures(goldenStore: Map<string, GoldenCase>) {
  return Array.from(goldenStore.values()).filter(c => c.status === "fail");
}

// ─── Learning / fix router (mounted at /api/learning) ───────────────────
export const suggestFixRouter = Router();

suggestFixRouter.post("/suggest-fix", async (req, res) => {
  const { caseId, expected, actual, trace } = req.body ?? {};

  const expectedStr = JSON.stringify(expected ?? {});
  const actualStr   = JSON.stringify(actual   ?? {});

  // OpenAI-powered suggestion
  try {
    const { chatCompletion } = await import("../services/ai/chatgptClient");

    const prompt = `You are a medical AI systems architect reviewing a clinical triage rule engine.

A golden test case${caseId ? ` ("${caseId}")` : ""} has FAILED.

Expected output:
${expectedStr}

Actual output:
${actualStr}

Trace path:
${JSON.stringify(trace ?? [], null, 2)}

Provide a SHORT, actionable fix suggestion (1-3 sentences). Focus on:
- Which rule or weight might need adjustment
- Whether a condition is missing or incorrect
- Specific scoring change needed

Return JSON ONLY (no markdown):
{
  "problem": "<root cause in one sentence>",
  "suggestion": "<specific code/rule change to fix>",
  "confidence": "high|medium|low"
}`;

    const result = await chatCompletion(
      [{ role: "user", content: prompt }],
      { model: "gpt-4o-mini", maxTokens: 300 }
    );

    let parsed: any = {};
    try { parsed = JSON.parse(result.content); } catch { parsed = { problem: result.content, suggestion: "", confidence: "low" }; }
    res.json({ ok: true, ...parsed, source: "openai" });
  } catch {
    // Heuristic fallback
    const expDisp = (expected as any)?.disposition ?? "";
    const actDisp = (actual as any)?.status ?? "";
    res.json({
      ok: true,
      problem: `Output mismatch: expected "${expDisp}" but got "${actDisp}"`,
      suggestion: `Review scoring weights for this complaint. If disposition level is too low, increase cluster scoring points or tighten the condition expression (whenExpr) for the matching disposition rule.`,
      confidence: "medium",
      source: "heuristic",
    });
  }
});

// ─── POST /api/learning/run-cycle — RLHF learning pass over all golden cases ──
suggestFixRouter.post("/run-cycle", async (_req, res) => {
  const cases = Array.from(goldenStore.values());
  const adjustments: any[] = [];
  let processed = 0;

  for (const c of cases) {
    const result = c.result as any;
    const expected = c.expected as any;
    if (!result || !expected) continue;

    const predicted = {
      diagnosis: result.diagnosis ?? result.topDiagnosis ?? result.status ?? "unknown",
      triage:    result.triage ?? result.disposition ?? result.status ?? "unknown",
    };
    const actual = {
      diagnosis: expected.diagnosis ?? expected.complaint_id ?? "unknown",
      triage:    expected.disposition ?? expected.triage ?? "routine",
      correct:   c.status === "pass",
    };

    try {
      const r = reinforceOutcome(predicted, actual);
      adjustments.push({
        caseId: c.id,
        status: c.status,
        ...r,
      });
      processed++;
    } catch {}
  }

  const weights = getAllWeights();
  res.json({
    ok: true,
    processed,
    totalCases: cases.length,
    adjustments,
    currentWeights: weights,
    ranAt: new Date().toISOString(),
  });
});

export default router;

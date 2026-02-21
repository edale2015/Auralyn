import { Router, Request, Response } from "express";
import { runComplaintGraph } from "../services/complaintNodeRunner";
import { CaseStateSchema } from "../../shared/agentTypes";

const router = Router();

const activeSessions = new Map<string, any>();

function getOrCreateState(conversationId: string, overrides?: any): any {
  let state = activeSessions.get(conversationId);
  if (!state) {
    state = CaseStateSchema.parse({
      caseId: conversationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chiefComplaint: "",
      answers: {},
      routing: { state: "INTAKE_PENDING" },
    });
  }
  if (overrides) {
    if (overrides.chiefComplaint) state.chiefComplaint = overrides.chiefComplaint;
    if (overrides.demographics) state.demographics = { ...(state.demographics || {}), ...overrides.demographics };
    if (overrides.modifiers) state.modifiers = { ...(state.modifiers || {}), ...overrides.modifiers };
  }
  return state;
}

router.post("/start", async (req: Request, res: Response) => {
  try {
    const { conversationId, chiefComplaintText, demographics, modifiers } = req.body;

    if (!conversationId || !chiefComplaintText) {
      return res.status(400).json({ ok: false, error: "conversationId and chiefComplaintText are required" });
    }

    const state = getOrCreateState(conversationId, {
      chiefComplaint: chiefComplaintText,
      demographics,
      modifiers,
    });

    const ccId = chiefComplaintText.toLowerCase().trim().replace(/[\s-]+/g, "_");

    const result = await runComplaintGraph(state, ccId);
    activeSessions.set(conversationId, result.state);

    res.json({
      ok: true,
      done: result.done,
      pendingAction: result.pendingAction || null,
      routing: result.state.routing,
      currentNode: result.currentNode,
      events: result.events.slice(-5),
    });
  } catch (e: any) {
    console.error("[complaintIntake/start] error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.post("/answer", async (req: Request, res: Response) => {
  try {
    const { conversationId, questionId, answer } = req.body;

    if (!conversationId || !questionId || answer === undefined) {
      return res.status(400).json({ ok: false, error: "conversationId, questionId, and answer are required" });
    }

    const state = activeSessions.get(conversationId);
    if (!state) {
      return res.status(404).json({ ok: false, error: "Session not found. Call /start first." });
    }

    state.answers = state.answers || {};
    state.answers[questionId] = answer;
    state.updatedAt = new Date().toISOString();

    if (state.questionQueue) {
      state.questionQueue = state.questionQueue.map((q: any) =>
        q.questionId === questionId ? { ...q, answered: true } : q
      );
    }

    if (state.redFlagGate?.evaluated) {
      state.redFlagGate.evaluated = false;
    }
    state.scores = {};
    state.disposition = undefined;
    state.dispositionReasonCodes = [];
    state.recommendedActions = [];
    (state as any).caseConfidence = undefined;
    (state as any).activeClusters = [];

    const ccId = state.normalizedComplaint || state.chiefComplaint?.toLowerCase().trim().replace(/[\s-]+/g, "_") || "";

    const result = await runComplaintGraph(state, ccId);
    activeSessions.set(conversationId, result.state);

    res.json({
      ok: true,
      done: result.done,
      pendingAction: result.pendingAction || null,
      routing: result.state.routing,
      currentNode: result.currentNode,
      disposition: result.state.disposition,
      scores: result.state.scores,
      events: result.events.slice(-5),
    });
  } catch (e: any) {
    console.error("[complaintIntake/answer] error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

router.get("/session/:conversationId", async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const state = activeSessions.get(conversationId);
    if (!state) {
      return res.status(404).json({ ok: false, error: "Session not found" });
    }

    res.json({
      ok: true,
      caseId: state.caseId,
      chiefComplaint: state.chiefComplaint,
      normalizedComplaint: state.normalizedComplaint,
      routing: state.routing,
      disposition: state.disposition,
      scores: state.scores,
      activeClusters: state.activeClusters,
      answeredCount: Object.keys(state.answers || {}).length,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default router;

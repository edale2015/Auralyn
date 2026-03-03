import { Router } from "express";
import {
  appendMessage,
  createCase,
  getCase,
  mergeAnswers,
  setCaseState,
  setTriage,
} from "../services/caseService";
import { runTriage } from "../services/triageService";

export const casesRouter = Router();

casesRouter.post("/api/cases", async (req, res) => {
  try {
    const {
      channel,
      threadId,
      userId,
      complaintSlug,
      complaintDisplay,
      engine,
    } = req.body ?? {};
    if (!channel || !complaintSlug)
      return res.status(400).json({ error: "missing channel/complaintSlug" });

    const doc = await createCase({
      channel,
      threadId,
      userId,
      complaintSlug,
      complaintDisplay: complaintDisplay ?? complaintSlug,
      engine: engine ?? "GENERIC_V1",
    });

    res.json(doc);
  } catch (e: any) {
    console.error("[Cases] POST /api/cases error:", e);
    res.status(500).json({ error: e.message });
  }
});

casesRouter.get("/api/cases/:caseId", async (req, res) => {
  try {
    const doc = await getCase(req.params.caseId);
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(doc);
  } catch (e: any) {
    console.error("[Cases] GET error:", e);
    res.status(500).json({ error: e.message });
  }
});

casesRouter.post("/api/cases/:caseId/message", async (req, res) => {
  try {
    const { dir, channel, text, meta } = req.body ?? {};
    if (!dir || !channel || !text)
      return res.status(400).json({ error: "missing message fields" });

    await appendMessage(req.params.caseId, {
      ts: new Date().toISOString(),
      dir,
      channel,
      text,
      meta: meta ?? {},
    });

    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Cases] message error:", e);
    res.status(500).json({ error: e.message });
  }
});

casesRouter.post("/api/cases/:caseId/answers", async (req, res) => {
  try {
    const patch = req.body ?? {};
    const updated = await mergeAnswers(req.params.caseId, patch);
    res.json(updated);
  } catch (e: any) {
    console.error("[Cases] answers error:", e);
    res.status(500).json({ error: e.message });
  }
});

casesRouter.post("/api/cases/:caseId/triage", async (req, res) => {
  try {
    const doc = await getCase(req.params.caseId);
    if (!doc) return res.status(404).json({ error: "not found" });

    const triage = await runTriage({
      complaintSlug: doc.complaint.slug,
      answers: (doc.answers.structured ?? {}) as Record<string, unknown>,
      rulesetVersion: req.body?.rulesetVersion ?? "local",
      dxPriorityVersion: req.body?.dxPriorityVersion ?? "local",
    });

    const needsReview =
      triage.disposition === "er_send" ||
      triage.confidence === "LOW" ||
      (triage.rfTriggered?.length ?? 0) > 0;

    await setTriage(
      req.params.caseId,
      triage,
      needsReview ? "NEEDS_REVIEW" : "TRIAGED"
    );

    res.json({
      ok: true,
      triage,
      nextState: needsReview ? "NEEDS_REVIEW" : "TRIAGED",
    });
  } catch (e: any) {
    console.error("[Cases] triage error:", e);
    res.status(500).json({ error: e.message });
  }
});

casesRouter.post("/api/cases/:caseId/state", async (req, res) => {
  try {
    const { state } = req.body ?? {};
    if (!state) return res.status(400).json({ error: "missing state" });
    await setCaseState(req.params.caseId, state);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Cases] state error:", e);
    res.status(500).json({ error: e.message });
  }
});

import { Router } from "express";
import {
  getAllSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  seedDemoSessions,
} from "./sessionStore";
import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";

const router = Router();

seedDemoSessions();

router.get("/queue", (_req, res) => {
  res.json(getAllSessions());
});

router.get("/session/:id", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "Session not found" });
  res.json(s);
});

router.post("/session", async (req, res) => {
  try {
    const { id, complaint, answers } = req.body;
    const sessionId = id ?? `pt-${Date.now()}`;

    const flowResult = await runFullClinicalFlow({ complaint, answers });

    const session = createSession(sessionId, {
      complaint,
      age: answers?.age,
      disposition: (flowResult as any)?.scores?.disposition ?? "physician-review",
      riskLevel: (flowResult as any)?.safetyGate?.level?.toLowerCase() ?? "low",
      safetyFlags: (flowResult as any)?.safetyGate?.reasons ?? [],
      status: "pending",
    });

    res.json({ ok: true, session, flow: flowResult });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/approve/:id", (req, res) => {
  const session = updateSession(req.params.id, {
    status: "approved",
    approvedBy: req.body?.physicianId ?? "physician",
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ success: true, session });
});

router.post("/override/:id", (req, res) => {
  const session = updateSession(req.params.id, {
    status: "overridden",
    override: req.body,
    approvedBy: req.body?.physicianId ?? "physician",
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ success: true, session });
});

router.post("/escalate/:id", (req, res) => {
  const session = updateSession(req.params.id, {
    status: "escalated",
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ success: true, session });
});

router.delete("/session/:id", (req, res) => {
  const removed = deleteSession(req.params.id);
  res.json({ success: removed });
});

export default router;

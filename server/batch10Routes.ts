import { Router, Request, Response } from "express";

import { runPilot } from "./pilot/pilotOrchestrator";
import { checkEligibility, scrubClaim, revenueKPIs } from "./revenue/eligibility";
import { scheduleFollowup, cancelFollowup, getPendingFollowups } from "./patient/chatTriageBridge";
import { buildDeckMarkdown } from "./exec/deckBuilder";
import {
  saveConversation, getConversation, clearConversation,
  heartbeat, maintenanceLoop, stopMaintenanceLoop,
  triageBudget, optimalFacility,
} from "./ops/systemMonitor";

const router = Router();

// ── Pilot Orchestrator ──────────────────────────────────────────────────────
router.post("/pilot/orchestrate", async (req: Request, res: Response) => {
  try {
    const { patient, token } = req.body ?? {};
    if (!patient?.patientId) return res.status(400).json({ error: "patient.patientId required" });
    const result = await runPilot(patient, token ?? "");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Eligibility + Revenue ───────────────────────────────────────────────────
router.get("/revenue/eligibility/:patientId", async (req: Request, res: Response) => {
  try {
    const result = await checkEligibility(req.params.patientId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/revenue/scrub", (req: Request, res: Response) => {
  const claim = req.body;
  if (!claim) return res.status(400).json({ error: "claim body required" });
  res.json(scrubClaim(claim));
});

router.post("/revenue/kpis", (req: Request, res: Response) => {
  const { claims } = req.body ?? {};
  if (!Array.isArray(claims)) return res.status(400).json({ error: "claims[] required" });
  res.json(revenueKPIs(claims));
});

// ── Chat + Triage Bridge ────────────────────────────────────────────────────
router.post("/patient/chat-triage", async (req: Request, res: Response) => {
  try {
    const { text, msg } = req.body ?? {};
    const input = text ?? msg;
    if (!input) return res.status(400).json({ error: "text required" });
    const { patientChatTriage } = await import("./patient/chatTriageBridge");
    const result = await patientChatTriage(String(input));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/patient/followup/schedule", (req: Request, res: Response) => {
  const { patientId, minutes } = req.body ?? {};
  if (!patientId || !minutes) return res.status(400).json({ error: "patientId and minutes required" });
  scheduleFollowup(String(patientId), Number(minutes));
  res.json({ ok: true, patientId, minutes });
});

router.delete("/patient/followup/:patientId", (req: Request, res: Response) => {
  const cancelled = cancelFollowup(req.params.patientId);
  res.json({ cancelled, patientId: req.params.patientId });
});

router.get("/patient/followup/pending", (_req: Request, res: Response) => {
  res.json({ pending: getPendingFollowups() });
});

// ── Deck Builder ────────────────────────────────────────────────────────────
router.post("/exec/deck", (req: Request, res: Response) => {
  const metrics = req.body ?? {};
  const md = buildDeckMarkdown(metrics);
  res.json({ ok: true, markdown: md, length: md.length });
});

router.get("/exec/deck", (_req: Request, res: Response) => {
  const md = buildDeckMarkdown({ patients: 50_000, p95: 120, revenue: 10_000_000 });
  res.set("Content-Type", "text/plain").send(md);
});

// ── System Monitor ──────────────────────────────────────────────────────────
router.get("/ops/heartbeat", (_req: Request, res: Response) => {
  res.json(heartbeat());
});

router.post("/ops/conversation", (req: Request, res: Response) => {
  const { userId, msg } = req.body ?? {};
  if (!userId || !msg) return res.status(400).json({ error: "userId and msg required" });
  saveConversation(String(userId), msg);
  res.json({ ok: true, count: getConversation(userId).length });
});

router.get("/ops/conversation/:userId", (req: Request, res: Response) => {
  res.json(getConversation(req.params.userId));
});

router.delete("/ops/conversation/:userId", (req: Request, res: Response) => {
  clearConversation(req.params.userId);
  res.json({ ok: true });
});

router.post("/ops/maintenance/start", (req: Request, res: Response) => {
  const { intervalMs } = req.body ?? {};
  maintenanceLoop(intervalMs ?? 3_600_000);
  res.json({ ok: true });
});

router.post("/ops/maintenance/stop", (_req: Request, res: Response) => {
  stopMaintenanceLoop();
  res.json({ ok: true });
});

router.post("/ops/triage-budget", (req: Request, res: Response) => {
  const vitals = req.body;
  res.json({ level: triageBudget(vitals), vitals });
});

router.post("/ops/optimal-facility", (req: Request, res: Response) => {
  const { facilities } = req.body ?? {};
  if (!Array.isArray(facilities)) return res.status(400).json({ error: "facilities[] required" });
  res.json({ facility: optimalFacility(facilities) });
});

export default router;

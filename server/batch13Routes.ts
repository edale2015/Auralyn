import { Router, Request, Response } from "express";

import { runBranchWorkflow } from "./workflows/branchRunner";
import { addPatient, nextPatient, peekQueue, queueLength } from "./patient/clinicQueue";
import { runHighAutonomy } from "./autonomy/highAutonomy";
import {
  secondaryToModifiers, smartFollowup, dashboardInsights,
  safeExternalCall, drainNonCriticalQueue,
} from "./clinical/followupUtils";
import { registerStep } from "./workflows/registry";

const router = Router();

// Register branch-compatible built-in steps on init
registerStep("checkRisk",    i => ({ ...i, risk: i.risk ?? "low" }));
registerStep("notifyER",     i => ({ ...i, erNotified: true }));
registerStep("notifyRoutine",i => ({ ...i, routineNotified: true }));

// ── Branch Workflow ───────────────────────────────────────────────────────────
router.post("/workflows/branch/run", async (req: Request, res: Response) => {
  const { nodes, startId, input } = req.body ?? {};
  if (!Array.isArray(nodes) || !startId) {
    return res.status(400).json({ error: "nodes[] and startId required" });
  }
  try {
    const result = await runBranchWorkflow(nodes, startId, input ?? {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Clinic Queue ──────────────────────────────────────────────────────────────
router.post("/clinic/queue/add", (req: Request, res: Response) => {
  const patient = req.body ?? {};
  if (!patient.id) return res.status(400).json({ error: "patient.id required" });
  res.json(addPatient(patient));
});

router.post("/clinic/queue/next", (req: Request, res: Response) => {
  const p = nextPatient();
  if (!p) return res.status(204).send();
  res.json(p);
});

router.get("/clinic/queue/peek", (_req: Request, res: Response) => {
  res.json({ queue: peekQueue(), length: queueLength() });
});

// ── High Autonomy ─────────────────────────────────────────────────────────────
router.post("/autonomy/high", async (req: Request, res: Response) => {
  try {
    res.json(await runHighAutonomy(req.body ?? {}));
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Followup Utils ────────────────────────────────────────────────────────────
router.post("/clinical/secondary-to-modifiers", (req: Request, res: Response) => {
  res.json(secondaryToModifiers(req.body ?? {}));
});

router.post("/clinical/smart-followup", (req: Request, res: Response) => {
  const patient = req.body ?? {};
  res.json({ followup: smartFollowup(patient) });
});

router.post("/clinical/dashboard-insights", (req: Request, res: Response) => {
  res.json({ insights: dashboardInsights(req.body ?? {}) });
});

router.post("/integrations/safe-call", async (req: Request, res: Response) => {
  const { url, payload } = req.body ?? {};
  if (!url) return res.status(400).json({ error: "url required" });
  const result = await safeExternalCall(
    async (p: any) => {
      const r = await fetch(url, { method: "POST", body: JSON.stringify(p), headers: { "Content-Type": "application/json" } });
      return r.json();
    },
    payload ?? {}
  );
  res.json(result);
});

router.get("/integrations/queue/drain", (_req: Request, res: Response) => {
  res.json({ drained: drainNonCriticalQueue() });
});

// ── SMART OAuth Callback stub ─────────────────────────────────────────────────
router.get("/smart/callback", (req: Request, res: Response) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: "authorization code missing" });
  res.json({
    ok: true,
    message: "SMART token exchange stub — configure FHIR_BASE + EPIC_TOKEN for full OAuth",
    code,
  });
});

export default router;

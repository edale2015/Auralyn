import { Router, Request, Response } from "express";

import { getTenant, scopedQuery, listTenants, buildTenantMetrics } from "./tenancy/tenant";
import { sendToECWEncounter, safeEHR, syncSystems } from "./integrations/ecwAdapter";
import { computeSLO, onCallAlert, checkSLOAndAlert, anomalyCard, rankQuestions } from "./clinical/sloUtils";
import { epicTestPatientFlow } from "./integrations/epicSandbox";

const router = Router();

// ── Multi-Tenant ──────────────────────────────────────────────────────────────
router.get("/tenants", (_req: Request, res: Response) => {
  res.json({ tenants: listTenants() });
});

router.get("/tenants/stats", (req: Request, res: Response) => {
  const tenant = getTenant(req) || (req.query.tenant as string) || "default";
  const erRate = Math.random() * 0.4;
  const metrics = buildTenantMetrics(tenant, {
    patientCount: Math.floor(Math.random() * 300) + 50,
    avgLatencyMs: Math.floor(Math.random() * 800) + 200,
    erRate,
  });
  const slo = computeSLO({ errors: metrics.erRate > 0.3 ? 1 : 0, p95: metrics.avgLatencyMs * 1.2 });
  res.json({ ...metrics, slo });
});

// ── ECW Adapter ───────────────────────────────────────────────────────────────
router.post("/ecw/encounter", async (req: Request, res: Response) => {
  const { patientId, disposition, vitals } = req.body ?? {};
  if (!patientId || !disposition) {
    return res.status(400).json({ error: "patientId and disposition required" });
  }
  try {
    const result = await sendToECWEncounter({ patientId, disposition, vitals });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/ecw/sync", async (req: Request, res: Response) => {
  const { patientId, disposition, vitals } = req.body ?? {};
  if (!patientId || !disposition) {
    return res.status(400).json({ error: "patientId and disposition required" });
  }
  const result = await syncSystems({ patientId, disposition, vitals });
  res.json(result);
});

// ── SLO + Observability ───────────────────────────────────────────────────────
router.post("/slo/compute", async (req: Request, res: Response) => {
  const { errors = 0, p95 = 1000, ...rest } = req.body ?? {};
  const metrics = { errors: Number(errors), p95: Number(p95), ...rest };
  const slo = await checkSLOAndAlert(metrics);
  res.json(slo);
});

router.post("/slo/oncall", async (req: Request, res: Response) => {
  const { msg } = req.body ?? {};
  if (!msg) return res.status(400).json({ error: "msg required" });
  await onCallAlert(String(msg));
  res.json({ ok: true });
});

// ── QA — Rank Questions ────────────────────────────────────────────────────────
router.post("/qa/rank-questions", (req: Request, res: Response) => {
  const { questions, weights } = req.body ?? {};
  if (!Array.isArray(questions)) return res.status(400).json({ error: "questions[] required" });
  res.json({ questions: rankQuestions(questions, weights ?? {}) });
});

// ── Anomaly Card ──────────────────────────────────────────────────────────────
router.post("/monitoring/anomaly", (req: Request, res: Response) => {
  const data = req.body ?? {};
  res.json({ anomaly: anomalyCard({ erRate: Number(data.erRate ?? 0) }) });
});

// ── Epic Sandbox ──────────────────────────────────────────────────────────────
router.post("/epic/test", async (_req: Request, res: Response) => {
  try {
    const result = await epicTestPatientFlow(process.env.EPIC_TOKEN ?? "sandbox-token");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

export default router;

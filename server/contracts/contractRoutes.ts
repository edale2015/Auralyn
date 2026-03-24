import { Router } from "express";
import {
  registerInsurer, updateInsurerStatus, getInsurers, getInsurer,
  generateNegotiationStrategy, getContractSummary,
} from "./contractPipeline";
import { sendOutreach, getOutreachLog } from "./outreachBot";
import { runNegotiationCycle, getCycleHistory, startNegotiationWorker } from "./negotiationLoop";

const router = Router();

router.get("/insurers", (req, res) => {
  const status = req.query.status as any;
  res.json({ ok: true, insurers: getInsurers(status), summary: getContractSummary() });
});

router.get("/insurers/:payerId", (req, res) => {
  const insurer = getInsurer(req.params.payerId);
  if (!insurer) return res.status(404).json({ ok: false, error: "Insurer not found" });
  res.json({ ok: true, insurer });
});

router.post("/insurers", (req, res) => {
  const { payerId, name } = req.body;
  if (!payerId || !name) return res.status(400).json({ ok: false, error: "payerId and name required" });
  const insurer = registerInsurer({ payerId, name, status: "target", ...req.body });
  res.json({ ok: true, insurer });
});

router.patch("/insurers/:payerId/status", (req, res) => {
  const { status, agreedRate, notes } = req.body;
  if (!status) return res.status(400).json({ ok: false, error: "status required" });
  const updated = updateInsurerStatus(req.params.payerId, status, { agreedRate, notes });
  if (!updated) return res.status(404).json({ ok: false, error: "Insurer not found" });
  res.json({ ok: true, insurer: updated });
});

router.post("/insurers/:payerId/outreach", async (req, res) => {
  const insurer = getInsurer(req.params.payerId);
  if (!insurer) return res.status(404).json({ ok: false, error: "Insurer not found" });
  const result = await sendOutreach(insurer);
  if (result.success) updateInsurerStatus(insurer.payerId, "contacted");
  res.json({ ok: true, result });
});

router.post("/insurers/:payerId/strategy", (req, res) => {
  const insurer = getInsurer(req.params.payerId);
  if (!insurer) return res.status(404).json({ ok: false, error: "Insurer not found" });
  const strategy = generateNegotiationStrategy(insurer, req.body.performanceScore);
  res.json({ ok: true, strategy });
});

router.post("/cycle", async (req, res) => {
  const result = await runNegotiationCycle(req.body.performanceScore);
  res.json({ ok: true, ...result });
});

router.get("/cycle/history", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "20"));
  res.json({ ok: true, cycles: getCycleHistory(limit) });
});

router.get("/outreach/log", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json({ ok: true, log: getOutreachLog(limit) });
});

router.get("/summary", (_req, res) => {
  res.json({ ok: true, summary: getContractSummary() });
});

export { startNegotiationWorker };
export default router;

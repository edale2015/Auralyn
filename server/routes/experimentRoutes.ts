import { Router } from "express";
import {
  createExperiment,
  assignVariant,
  logABResult,
  concludeExperiment,
  getExperiment,
  getAllExperiments,
  getActiveExperiment,
  computeSignificance,
} from "../experiments/abTestingEngine";

const router = Router();

router.get("/", (_req, res) => {
  const experiments = getAllExperiments();
  res.json({ ok: true, experiments });
});

router.get("/active", (_req, res) => {
  const exp = getActiveExperiment();
  res.json({ ok: true, experiment: exp ?? null });
});

router.get("/:experimentId", (req, res) => {
  const exp = getExperiment(req.params.experimentId);
  if (!exp) return res.status(404).json({ ok: false, error: "Experiment not found" });
  const sig = computeSignificance(exp);
  res.json({ ok: true, experiment: exp, significance: sig });
});

router.post("/create", (req, res) => {
  try {
    const exp = createExperiment(req.body);
    res.json({ ok: true, experiment: exp });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/:experimentId/log", (req, res) => {
  try {
    logABResult({ experimentId: req.params.experimentId, ...req.body });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/:experimentId/assign", (req, res) => {
  const { caseId } = req.body;
  if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });
  const variant = assignVariant(caseId, req.params.experimentId);
  res.json({ ok: true, variant });
});

router.post("/:experimentId/conclude", (req, res) => {
  try {
    const exp = concludeExperiment(req.params.experimentId);
    res.json({ ok: true, experiment: exp });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;

import express from "express";
import { runSimulationBatch } from "../simulation/simulationRunner";
import { clearSimulationRuns, getSimulationRun, listSimulationRuns } from "../simulation/simulationStore";
import { getLearningStats } from "../simulation/simulationLearningBridge";
import { runProtocolBenchmark } from "../simulation/protocolBenchmarkEngine";
import { acie } from "../improvement/automatedImprovementEngine";
import { getImprovements, getImprovementStats } from "../improvement/improvementStore";

const router = express.Router();

router.post("/simulation-lab/run", async (req, res) => {
  try {
    const complaint = (req.body.complaint || "cough") as any;
    const count = Math.min(Number(req.body.count || 25), 500);
    const difficulty = (req.body.difficulty || "moderate") as any;

    const run = await runSimulationBatch({ complaint, count, difficulty });

    const improvement = acie.runFromSummary(run.summary);

    res.json({ ...run, improvement });
  } catch (error: any) {
    res.status(500).json({ error: "simulation_run_failed", detail: error?.message });
  }
});

router.get("/simulation-lab/runs", (_req, res) => {
  res.json(listSimulationRuns());
});

router.get("/simulation-lab/runs/:runId", (req, res) => {
  const run = getSimulationRun(req.params.runId);
  if (!run) return res.status(404).json({ error: "run_not_found" });
  res.json(run);
});

router.delete("/simulation-lab/runs", (_req, res) => {
  clearSimulationRuns();
  res.json({ ok: true });
});

router.get("/simulation-lab/learning", (_req, res) => {
  res.json(getLearningStats());
});

router.post("/simulation-lab/benchmark", (req, res) => {
  const result = runProtocolBenchmark(req.body);
  res.json(result);
});

router.get("/simulation-lab/improvements", (_req, res) => {
  res.json(getImprovements());
});

router.get("/simulation-lab/improvements/stats", (_req, res) => {
  res.json(getImprovementStats());
});

router.post("/simulation-lab/improvements/cycle", (req, res) => {
  const summary = req.body.summary;
  const result = acie.runFromSummary(summary);
  res.json(result);
});

export default router;

import { Router } from "express";
import { runSimulation, summarizeSimulation } from "../services/simulation/simulationEngine";

const router = Router();

router.get("/run", async (req, res) => {
  try {
    const n = Math.min(Number(req.query.n ?? 10_000), 100_000);
    const results = await runSimulation(n);
    const summary = summarizeSimulation(results);
    res.json({ summary, results: results.slice(0, 200) });
  } catch (err: any) {
    res.status(500).json({ error: "Simulation failed", detail: err?.message });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const n = Math.min(Number(req.query.n ?? 1_000), 50_000);
    const results = await runSimulation(n);
    const summary = summarizeSimulation(results);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: "Simulation summary failed", detail: err?.message });
  }
});

export default router;

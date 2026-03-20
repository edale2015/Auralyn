import express from "express";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { simulations } from "../../shared/schema";
import { desc } from "drizzle-orm";
import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";

const router = express.Router();
router.use(requireRole(["admin", "physician"]));

async function runSimulation(input: Record<string, any>) {
  const result = await runFullClinicalFlow({
    complaint: input.complaint ?? "general-triage",
    answers: input.answers ?? {},
    patientId: input.patientId,
    channel: input.channel ?? "web",
    metadata: input,
  });

  try {
    await db.insert(simulations).values({ input, result });
  } catch (e) {
    console.error("[SystemSimulation] DB write failed:", e);
  }

  return result;
}

router.post("/run", async (req, res) => {
  try {
    const result = await runSimulation(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Simulation failed" });
  }
});

router.post("/batch", async (req, res) => {
  const { inputs } = req.body;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return res.status(400).json({ error: "inputs array required" });
  }
  if (inputs.length > 20) {
    return res.status(400).json({ error: "Max 20 simulations per batch" });
  }
  try {
    const results = await Promise.all(inputs.map((input: any) => runSimulation(input)));
    res.json({ count: results.length, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Batch simulation failed" });
  }
});

router.get("/history", async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  try {
    const rows = await db.select().from(simulations).orderBy(desc(simulations.createdAt)).limit(limit);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

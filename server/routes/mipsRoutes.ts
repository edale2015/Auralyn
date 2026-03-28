import { Router } from "express";
import { computeMIPS, getMIPSSummary, type MIPSInputCase } from "../compliance/mipsEngine";

const router = Router();

router.post("/score", (req, res) => {
  try {
    const { cases } = req.body as { cases: MIPSInputCase[] };
    if (!Array.isArray(cases)) return res.status(400).json({ ok: false, error: "cases array required" });
    const score = computeMIPS(cases);
    res.json({ ok: true, score });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Demo with 50 simulated cases
router.get("/demo", (_req, res) => {
  const cases: MIPSInputCase[] = Array.from({ length: 50 }, (_, i) => ({
    caseId:      `demo-${i}`,
    correct:     Math.random() < 0.82,
    latencyMs:   180 + Math.random() * 200,
    safetyPassed: Math.random() < 0.95,
    billedAmount: 120 + Math.random() * 80,
    elr:         Math.random() < 0.6,
  }));
  const score = getMIPSSummary(cases);
  res.json({ ok: true, ...score });
});

export default router;

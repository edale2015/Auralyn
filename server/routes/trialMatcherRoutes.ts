import { Router } from "express";
import { matchTrials, getTrialRegistry } from "../research/trialMatcher";

const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, trials: getTrialRegistry() });
});

router.post("/match", (req, res) => {
  try {
    const { condition, age, keywords, icd10 } = req.body;
    if (!condition || age === undefined) {
      return res.status(400).json({ ok: false, error: "condition and age required" });
    }
    const matches = matchTrials({ condition, age: Number(age), keywords, icd10 });
    res.json({ ok: true, matches, total: matches.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Demo match
router.get("/demo", (_req, res) => {
  const matches = matchTrials({ condition: "otitis media", age: 8, icd10: "H66.90" });
  res.json({ ok: true, matches });
});

export default router;

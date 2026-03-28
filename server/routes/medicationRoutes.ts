import { Router } from "express";
import { reconcileMeds, type Medication } from "../agents/medicationReconciliationAgent";

const router = Router();

router.post("/reconcile", (req, res) => {
  try {
    const { reported, history } = req.body as { reported: Medication[]; history: Medication[] };
    if (!Array.isArray(reported) || !Array.isArray(history)) {
      return res.status(400).json({ ok: false, error: "reported and history must be arrays" });
    }
    const result = reconcileMeds(reported, history);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Demo endpoint — reconciles a sample patient list
router.get("/demo", (_req, res) => {
  const reported: Medication[] = [
    { name: "Warfarin", dose: "5mg" },
    { name: "Ibuprofen", dose: "400mg" },
    { name: "Lisinopril", dose: "10mg" },
  ];
  const history: Medication[] = [
    { name: "Warfarin", dose: "5mg" },
    { name: "Lisinopril", dose: "10mg" },
    { name: "Spironolactone", dose: "25mg" },
    { name: "Atorvastatin", dose: "20mg" },
  ];
  const result = reconcileMeds(reported, history);
  res.json({ ok: true, result, reported, history });
});

export default router;

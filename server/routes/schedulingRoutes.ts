import { Router } from "express";
import { getSlots, optimizeSchedule, scheduleSingleCase } from "../scheduling/smartScheduler";
import { getPhysicians, assignCase, releaseCase, getBalancerStats, pickBestPhysician } from "../scheduling/physicianBalancer";

const router = Router();

// Slots
router.get("/slots", (_req, res) => {
  res.json({ ok: true, slots: getSlots() });
});

// Optimize a batch of cases
router.post("/optimize", (req, res) => {
  try {
    const { cases } = req.body;
    if (!Array.isArray(cases)) return res.status(400).json({ ok: false, error: "cases must be array" });
    const slots = getSlots();
    const assignments = optimizeSchedule(slots, cases);
    res.json({ ok: true, assignments });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Schedule a single case
router.post("/assign", (req, res) => {
  try {
    const { caseId, urgency, specialty } = req.body;
    if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });
    const assignment = scheduleSingleCase({ caseId, urgency, specialty });
    res.json({ ok: true, assignment });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Physician balancer
router.get("/physicians", (_req, res) => {
  res.json({ ok: true, ...getBalancerStats() });
});

router.post("/physicians/pick", (req, res) => {
  try {
    const { specialty } = req.body;
    const result = pickBestPhysician(getPhysicians(), specialty);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/physicians/:id/assign-case", (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });
    const result = assignCase(caseId, req.params.id);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/physicians/:id/release", (_req, res) => {
  releaseCase(_req.params.id);
  res.json({ ok: true });
});

export default router;

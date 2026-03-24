import { Router } from "express";
import {
  registerPhysician, updatePerformance, updateHours, getPhysicians,
  generateSchedule, evaluateWorkforce, getWorkforceStats,
} from "./physicianRegistry";

const router = Router();

router.get("/physicians", (req, res) => {
  const activeOnly = req.query.active === "true";
  res.json({ ok: true, physicians: getPhysicians(activeOnly), stats: getWorkforceStats() });
});

router.post("/physicians", (req, res) => {
  const { id, name, specialties } = req.body;
  if (!id || !name || !Array.isArray(specialties)) {
    return res.status(400).json({ ok: false, error: "id, name, specialties[] required" });
  }
  const p = registerPhysician({
    id, name, specialties,
    hoursWorked: req.body.hoursWorked ?? 0,
    hoursPerWeek: req.body.hoursPerWeek ?? 40,
    performance: req.body.performance ?? 0.8,
    active: req.body.active ?? true,
    salary: req.body.salary,
    avgCasesPerHour: req.body.avgCasesPerHour ?? 3,
  });
  res.json({ ok: true, physician: p });
});

router.patch("/physicians/:id/performance", (req, res) => {
  const score = parseFloat(req.body.score);
  if (isNaN(score)) return res.status(400).json({ ok: false, error: "score required (0-1)" });
  updatePerformance(req.params.id, score);
  res.json({ ok: true, id: req.params.id, newScore: score });
});

router.patch("/physicians/:id/hours", (req, res) => {
  const hours = parseFloat(req.body.hours);
  if (isNaN(hours)) return res.status(400).json({ ok: false, error: "hours required" });
  updateHours(req.params.id, hours);
  res.json({ ok: true, id: req.params.id, hoursAdded: hours });
});

router.get("/schedule", (_req, res) => {
  res.json({ ok: true, schedule: generateSchedule() });
});

router.post("/evaluate", (req, res) => {
  const load = parseInt(String(req.body.totalActiveCases ?? req.body.load ?? "50"));
  const decision = evaluateWorkforce(load);
  res.json({ ok: true, decision });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: getWorkforceStats() });
});

export default router;

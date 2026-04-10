import { Router } from "express";
import { simulateHospital } from "./hospitalSimulator";

const router = Router();

router.get("/hospital", async (req, res) => {
  try {
    const hours    = Math.min(parseInt(req.query.hours as string ?? "24"), 720);
    const seed     = req.query.seed != null ? parseInt(req.query.seed as string) : undefined;
    const capacity = req.query.capacity != null ? parseInt(req.query.capacity as string) : undefined;

    const result = await simulateHospital(hours, { seed, capacity });
    res.json({ ok: true, simulation: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/hospital", async (req, res) => {
  try {
    const { hours = 24, seed, capacity, baseArrivalRate } = req.body ?? {};
    const result = await simulateHospital(hours, { seed, capacity, baseArrivalRate });
    res.json({ ok: true, simulation: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

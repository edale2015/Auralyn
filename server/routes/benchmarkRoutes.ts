import { Router } from "express";
import { compareBenchmarks, getNationalBenchmarks } from "../analytics/benchmarkEngine";

const router = Router();

router.get("/national", (_req, res) => {
  res.json({ ok: true, benchmarks: getNationalBenchmarks() });
});

router.post("/compare", (req, res) => {
  try {
    const report = compareBenchmarks(req.body);
    res.json({ ok: true, report });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Demo comparison using simulated Auralyn metrics
router.get("/demo", (_req, res) => {
  const report = compareBenchmarks({
    accuracy:            0.83,
    responseTimeMs:      215,
    safetyRate:          0.97,
    firstCallResolution: 0.74,
    physicianAgree:      0.85,
    denialRate:          0.14,
  });
  res.json({ ok: true, report });
});

export default router;

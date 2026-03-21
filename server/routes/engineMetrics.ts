import { Router } from "express";
import { listEngineMetrics } from "../repos/engineMetricsRepo";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const clinicId = String(req.query.clinicId || "") || undefined;
    const rows = await listEngineMetrics(clinicId);

    const enriched = rows.map((row: any) => {
      const totalRuns = Number(row.success_count) + Number(row.error_count);
      const avgLatencyMs = totalRuns > 0 ? Number(row.total_latency_ms) / totalRuns : 0;
      const errorRate = totalRuns > 0 ? Number(row.error_count) / totalRuns : 0;

      return {
        ...row,
        totalRuns,
        avgLatencyMs,
        errorRate,
        sloStatus: errorRate < 0.01 ? "healthy" : errorRate < 0.05 ? "warning" : "critical"
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch engine metrics" });
  }
});

export default router;

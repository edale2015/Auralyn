import { Router } from "express";
import { z } from "zod";
import { computeClinicianPerformance, getSystemPerformanceSummary } from "./performanceEngine";
import { generateCoachingReport } from "./coachingAgent";

const router = Router();

router.get("/system-summary", (_req, res) => {
  try {
    const summary = getSystemPerformanceSummary();
    res.json({ ok: true, ...summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:clinicianId", (req, res) => {
  try {
    const data = computeClinicianPerformance(req.params.clinicianId);
    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:clinicianId/coaching", (req, res) => {
  try {
    const report = generateCoachingReport(req.params.clinicianId);
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const bulkCoachingSchema = z.object({
  clinicianIds: z.array(z.string()).min(1),
});

router.post("/coaching/bulk", (req, res) => {
  const parsed = bulkCoachingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const reports = parsed.data.clinicianIds.map(id => generateCoachingReport(id));
    const highPriority = reports.filter(r => r.priority === "high" || r.priority === "critical").length;
    res.json({ ok: true, reports, highPriorityCount: highPriority, total: reports.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

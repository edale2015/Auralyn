import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  saveSimulationRun, listSimulationRuns,
  saveControlRun, listControlRuns,
  saveExecutiveSnapshot, listExecutiveSnapshots,
  seedExecutiveData,
} from "../services/executiveStore";
import { buildComplaintDrilldown, buildPhysicianDrilldown, getDemoComplaintDrilldown, getDemoPhysicianDrilldown } from "../services/executiveDrilldown";
import { buildExecutiveChartSeries } from "../services/executiveCharts";
import { applySnapshotFilters } from "../services/executiveFilters";
import { toCsv } from "../services/exportCsv";
import { buildCrossClinicComparison, getDemoCrossClinicData } from "../services/crossClinicComparison";
import { createAlert, listAlerts, seedDemoAlerts } from "../services/alertCenter";
import { buildWeeklyExecutiveEmail, getDemoEmailPreview } from "../services/weeklyExecutiveMailer";

const router = Router();
const auth = requireRole(["admin", "physician"]);

router.post("/seed", auth, (_req: Request, res: Response) => {
  try {
    const snapshotCount = seedExecutiveData();
    const alertCount = seedDemoAlerts();
    res.json({ success: true, snapshotCount, alertCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/simulation-runs", auth, (req: Request, res: Response) => {
  try {
    const { packId, complaint, strategyResults } = req.body;
    if (!packId || !complaint) return res.status(400).json({ error: "packId and complaint required" });
    const saved = saveSimulationRun(packId, complaint, Array.isArray(strategyResults) ? strategyResults : []);
    res.json({ saved });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/simulation-runs", auth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 200);
    res.json(listSimulationRuns(limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/control-runs", auth, (req: Request, res: Response) => {
  try {
    const { clinicId, input, output } = req.body;
    if (!clinicId) return res.status(400).json({ error: "clinicId required" });
    const saved = saveControlRun(clinicId, input ?? {}, output ?? {});
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/control-runs", auth, (req: Request, res: Response) => {
  try {
    const clinicId = typeof req.query.clinicId === "string" ? req.query.clinicId : undefined;
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 200);
    res.json(listControlRuns(clinicId, limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/snapshots", auth, (req: Request, res: Response) => {
  try {
    const p = req.body;
    if (!p.clinicId) return res.status(400).json({ error: "clinicId required" });
    const saved = saveExecutiveSnapshot({
      clinicId: String(p.clinicId),
      totalCases: Number(p.totalCases) || 0,
      reviewedCases: Number(p.reviewedCases) || 0,
      escalatedCases: Number(p.escalatedCases) || 0,
      overrideRate: Number(p.overrideRate) || 0,
      avgSatisfaction: Number(p.avgSatisfaction) || 0,
      avgCostPerCase: Number(p.avgCostPerCase) || 0,
      avgRevenuePerCase: Number(p.avgRevenuePerCase) || 0,
      complaintBreakdown: p.complaintBreakdown ?? {},
      physicianBreakdown: p.physicianBreakdown ?? {},
    });
    res.json(saved);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/snapshots/:clinicId", auth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 200);
    res.json(listExecutiveSnapshots(req.params.clinicId, limit));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/charts/:clinicId", auth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query.limit) || 30), 200);
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    const rows = listExecutiveSnapshots(req.params.clinicId, limit);
    const filtered = applySnapshotFilters(rows as any[], { clinicId: req.params.clinicId, startDate, endDate });
    res.json(buildExecutiveChartSeries(filtered as any));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/drilldown/complaints", auth, (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : getDemoComplaintDrilldown();
    res.json(buildComplaintDrilldown(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/drilldown/complaints/demo", auth, (_req: Request, res: Response) => {
  try {
    res.json(buildComplaintDrilldown(getDemoComplaintDrilldown()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/drilldown/physicians", auth, (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : getDemoPhysicianDrilldown();
    res.json(buildPhysicianDrilldown(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/drilldown/physicians/demo", auth, (_req: Request, res: Response) => {
  try {
    res.json(buildPhysicianDrilldown(getDemoPhysicianDrilldown()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/export/csv", auth, (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: "rows array required" });
    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="executive-export.csv"');
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/cross-clinic/compare", auth, (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : getDemoCrossClinicData();
    res.json(buildCrossClinicComparison(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/cross-clinic/demo", auth, (_req: Request, res: Response) => {
  try {
    res.json(buildCrossClinicComparison(getDemoCrossClinicData()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/alerts", auth, (req: Request, res: Response) => {
  try {
    const { type, entityId, severity, message } = req.body;
    if (!type || !entityId || !severity || !message) {
      return res.status(400).json({ error: "type, entityId, severity, message required" });
    }
    if (!["complaint", "physician", "clinic"].includes(type)) {
      return res.status(400).json({ error: "type must be complaint, physician, or clinic" });
    }
    if (!["watch", "critical"].includes(severity)) {
      return res.status(400).json({ error: "severity must be watch or critical" });
    }
    res.json(createAlert({ type, entityId, severity, message }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/alerts", auth, (req: Request, res: Response) => {
  try {
    const severity = req.query.severity === "watch" || req.query.severity === "critical"
      ? req.query.severity : undefined;
    res.json(listAlerts(severity));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/email/preview", auth, (req: Request, res: Response) => {
  try {
    const input = req.body.clinicId ? req.body : getDemoEmailPreview();
    res.json(buildWeeklyExecutiveEmail(input));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/email/demo", auth, (_req: Request, res: Response) => {
  try {
    res.json(buildWeeklyExecutiveEmail(getDemoEmailPreview()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

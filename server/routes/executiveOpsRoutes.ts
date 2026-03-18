import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { resolveAuthAwareFilters } from "../services/authAwareFilters";
import { listExecutiveSnapshots } from "../services/executiveStore";
import { buildExecutiveChartSeries } from "../services/executiveCharts";
import { saveDashboardView, listDashboardViews, deleteDashboardView } from "../services/dashboardViewsStore";
import { createWorkflowAlert, listWorkflowAlerts, acknowledgeWorkflowAlert, seedWorkflowAlerts } from "../services/alertsWorkflowStore";
import { buildWarehouseExport } from "../services/warehouseExport";
import { buildBenchmarks, getDemoBenchmarks } from "../services/benchmarks";
import { toCsv } from "../services/exportCsv";

const router = Router();
const auth = requireRole(["admin", "physician"]);

router.get("/auth-charts", auth, (req: Request, res: Response) => {
  try {
    const user = (res as any).locals?.authUser || { id: "admin", role: "admin", clinicId: "clinicA" };
    const filters = resolveAuthAwareFilters(
      {
        clinicId: req.query.clinicId ? String(req.query.clinicId) : undefined,
        startDate: req.query.startDate ? String(req.query.startDate) : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        physicianId: req.query.physicianId ? String(req.query.physicianId) : undefined,
        complaint: req.query.complaint ? String(req.query.complaint) : undefined,
      },
      { id: user.id || "admin", role: user.role || "admin", clinicId: user.clinicId || "clinicA" }
    );

    const snapshots = listExecutiveSnapshots(filters.clinicId!, 200);
    const series = buildExecutiveChartSeries(snapshots as any);
    res.json({ user: { id: user.id, role: user.role, clinicId: user.clinicId }, filters, series });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/saved-views", auth, (req: Request, res: Response) => {
  try {
    const user = (res as any).locals?.authUser || { id: "admin", clinicId: "clinicA" };
    const rows = listDashboardViews(user.id || "admin", user.clinicId || "clinicA");
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/saved-views", auth, (req: Request, res: Response) => {
  try {
    const user = (res as any).locals?.authUser || { id: "admin", clinicId: "clinicA" };
    const { name, viewType, filters } = req.body;
    if (!name || !viewType) return res.status(400).json({ error: "name and viewType required" });
    const row = saveDashboardView({
      userId: user.id || "admin",
      clinicId: user.clinicId || "clinicA",
      name,
      viewType,
      filters: filters ?? {},
    });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/saved-views/:id", auth, (req: Request, res: Response) => {
  try {
    const user = (res as any).locals?.authUser || { id: "admin" };
    const success = deleteDashboardView(Number(req.params.id), user.id || "admin");
    res.json({ success });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/alerts-workflow/seed", auth, (_req: Request, res: Response) => {
  try {
    const count = seedWorkflowAlerts();
    res.json({ success: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/alerts-workflow", auth, (req: Request, res: Response) => {
  try {
    const includeAcknowledged = req.query.includeAcknowledged !== "false";
    res.json(listWorkflowAlerts(includeAcknowledged));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/alerts-workflow", auth, (req: Request, res: Response) => {
  try {
    const { type, entityId, severity, message } = req.body;
    if (!type || !entityId || !severity || !message) {
      return res.status(400).json({ error: "type, entityId, severity, message required" });
    }
    res.json(createWorkflowAlert({ type, entityId, severity, message }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/alerts-workflow/:id/acknowledge", auth, (req: Request, res: Response) => {
  try {
    const user = (res as any).locals?.authUser || { id: "admin" };
    const result = acknowledgeWorkflowAlert(Number(req.params.id), user.id || "admin");
    if (!result) return res.status(404).json({ error: "Alert not found" });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/physician-cases/:physicianId", auth, (req: Request, res: Response) => {
  try {
    const physicianId = req.params.physicianId;
    res.json([
      { caseId: "case-1001", physicianId, complaint: "cough", patientName: "Jane Doe", riskLevel: "LOW", confidence: 0.91, finalDecision: "supportive care" },
      { caseId: "case-1002", physicianId, complaint: "dizziness", patientName: "John Roe", riskLevel: "HIGH", confidence: 0.61, finalDecision: "urgent evaluation" },
      { caseId: "case-1003", physicianId, complaint: "headache", patientName: "Alice Smith", riskLevel: "MODERATE", confidence: 0.78, finalDecision: "follow-up in 48h" },
      { caseId: "case-1004", physicianId, complaint: "chest_pain", patientName: "Bob Chen", riskLevel: "HIGH", confidence: 0.55, finalDecision: "immediate referral" },
    ]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/warehouse-export", auth, (_req: Request, res: Response) => {
  try {
    res.json(buildWarehouseExport());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/warehouse-export/csv", auth, (_req: Request, res: Response) => {
  try {
    const bundle = buildWarehouseExport();
    const csv = toCsv(bundle.facts_cases as any);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="warehouse-facts.csv"');
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/benchmarks", auth, (req: Request, res: Response) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : getDemoBenchmarks();
    res.json(buildBenchmarks(rows));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/benchmarks/demo", auth, (_req: Request, res: Response) => {
  try {
    res.json(buildBenchmarks(getDemoBenchmarks()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

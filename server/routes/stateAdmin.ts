import { Router } from "express";
import { listJobs } from "../repos/jobRepo";
import { listAuditLogs } from "../repos/auditRepo";
import { listOutcomes } from "../repos/outcomeRepo";
import { listMetrics } from "../repos/metricsRepo";
import { listSystemEvents } from "../repos/systemEventRepo";

const router = Router();

router.get("/api/state/jobs", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const queue = String(req.query.queue || "") || undefined;
    const clinicId = String(req.query.clinicId || "") || undefined;
    const rows = await listJobs(limit, queue, clinicId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list jobs" });
  }
});

router.get("/api/state/audit", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 200);
    const clinicId = String(req.query.clinicId || "") || undefined;
    const eventType = String(req.query.eventType || "") || undefined;
    const rows = await listAuditLogs(limit, clinicId, eventType);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list audit logs" });
  }
});

router.get("/api/state/outcomes", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);
    const clinicId = String(req.query.clinicId || "") || undefined;
    const rows = await listOutcomes(limit, clinicId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list outcomes" });
  }
});

router.get("/api/state/metrics", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 200);
    const metricGroup = String(req.query.group || "system");
    const metricName = String(req.query.name || "") || undefined;
    const clinicId = String(req.query.clinicId || "") || undefined;
    const rows = await listMetrics(metricGroup, metricName, limit, clinicId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list metrics" });
  }
});

router.get("/api/state/events", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 200);
    const severity = String(req.query.severity || "") || undefined;
    const rows = await listSystemEvents(limit, severity);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list system events" });
  }
});

export default router;

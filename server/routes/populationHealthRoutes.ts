// INDEPENDENT REVIEW FIX:
//   GET /cases returned individual patient case records (PHI) with zero authentication.
//   Heatmaps and outbreak data were also unprotected; while aggregated, they expose
//   clinic-specific epidemiological patterns that are proprietary + HIPAA-adjacent.
//   Added requireRole() to ALL endpoints, scoped to staff+ for read and physician/admin
//   for the write (/log) path.

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  logPopulationCase,
  getZipHeatmap,
  getComplaintHeatmap,
  getDiagnosisHeatmap,
  getOutbreakAlerts,
  getCohortStats,
  getRecentCases,
} from "../populationHealth/populationEngine";

const router = Router();

const requireStaff     = requireRole(["admin", "physician", "nurse", "staff"]);
const requirePhysician = requireRole(["admin", "physician"]);

router.get("/heatmap/zip", requireStaff, (_req, res) => {
  res.json({ ok: true, heatmap: getZipHeatmap() });
});

router.get("/heatmap/complaint", requireStaff, (_req, res) => {
  res.json({ ok: true, heatmap: getComplaintHeatmap() });
});

router.get("/heatmap/diagnosis", requireStaff, (_req, res) => {
  res.json({ ok: true, heatmap: getDiagnosisHeatmap() });
});

router.get("/outbreaks", requireStaff, (_req, res) => {
  res.json({ ok: true, alerts: getOutbreakAlerts() });
});

router.get("/cohort", requireStaff, (_req, res) => {
  res.json({ ok: true, stats: getCohortStats() });
});

// /cases returns individual case records — PHI — requires staff+ auth
router.get("/cases", requireStaff, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500); // cap at 500 to prevent bulk dumps
  res.json({ ok: true, cases: getRecentCases(limit) });
});

// /log writes population data — physician/admin only
router.post("/log", requirePhysician, (req, res) => {
  try {
    const { caseId, ...rest } = req.body;
    if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });
    logPopulationCase({ caseId, ...rest });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;

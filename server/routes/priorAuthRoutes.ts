// INDEPENDENT REVIEW FIX:
//   All prior-auth endpoints exposed insurance + clinical authorization data (PHI/PII)
//   with zero authentication. GET /queue dumps up to 100 PA records; GET /:paId
//   returns individual authorizations including diagnosis codes and clinical notes.
//   Added requireRole() guarding all routes; write operations are scoped to physician/admin.

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  buildPARequest, submitPA, appealPA,
  getPA, getAllPAs, getPAStats,
} from "../revenue/priorAuthEngine";

const router = Router();

const requireStaff     = requireRole(["admin", "physician", "nurse", "staff"]);
const requirePhysician = requireRole(["admin", "physician"]);

router.get("/queue", requireStaff, (_req, res) => {
  res.json({ ok: true, queue: getAllPAs(100), stats: getPAStats() });
});

router.get("/:paId", requireStaff, (req, res) => {
  const pa = getPA(req.params.paId);
  if (!pa) return res.status(404).json({ ok: false, error: "PA not found" });
  res.json({ ok: true, pa });
});

router.post("/create", requirePhysician, (req, res) => {
  try {
    const pa = buildPARequest(req.body);
    res.json({ ok: true, pa });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/:paId/submit", requirePhysician, async (req, res) => {
  try {
    const pa = await submitPA(req.params.paId);
    res.json({ ok: true, pa });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/:paId/appeal", requirePhysician, async (req, res) => {
  try {
    const { notes = "Additional clinical documentation provided." } = req.body;
    const pa = await appealPA(req.params.paId, notes);
    res.json({ ok: true, pa });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/stats/summary", requireStaff, (_req, res) => {
  res.json({ ok: true, stats: getPAStats() });
});

export default router;

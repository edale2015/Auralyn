import { Router } from "express";
import { addPatientJob, getJobStatus, getQueueStats } from "./patientQueue";
import { requireRole } from "../middleware/requireRole";

const router = Router();

router.post("/patient", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const jobId = await addPatientJob(req.body);
    res.json({ ok: true, jobId, message: "Patient queued for clinical processing" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/status/:jobId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const job = await getJobStatus(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ ok: true, job });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/stats", requireRole(["admin", "physician"]), (_req, res) => {
  res.json({ ok: true, stats: getQueueStats() });
});

export default router;

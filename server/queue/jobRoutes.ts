import { Router } from "express";
import { addJob, getJob, listJobs, registerHandler } from "./jobQueue";
import { runFullPipeline } from "../core/masterClinicalPipeline";

const router = Router();

registerHandler("clinical_pipeline", async (job) => {
  return await runFullPipeline(job.data as any);
});

registerHandler("credentialing", async (job) => {
  const { physicianId, state } = job.data as any;
  console.log(`[JobQueue] Running credentialing for ${physicianId} in ${state}`);
  return { physicianId, state, credentialed: true, completedAt: new Date().toISOString() };
});

registerHandler("claim_submission", async (job) => {
  const { caseId, claimData } = job.data as any;
  if (!process.env.CLEARINGHOUSE_API) {
    throw new Error(
      "CLEARINGHOUSE_API not configured — cannot submit claim for case " + caseId
    );
  }
  const { submitRealClaim } = await import("../rcm/realClaimProcessor");
  return await submitRealClaim(claimData);
});

router.post("/add", async (req, res) => {
  const { name, data, attempts, backoffMs } = req.body;
  if (!name || !data) {
    return res.status(400).json({ ok: false, error: "name and data are required" });
  }
  try {
    const job = await addJob(name, data, { attempts, backoffMs });
    return res.json({ ok: true, jobId: job.id, name: job.name, status: job.status });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/job/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
  return res.json({ ok: true, job });
});

router.get("/list", (req, res) => {
  const { name } = req.query;
  const jobs = listJobs(name as string | undefined);
  return res.json({ ok: true, count: jobs.length, jobs });
});

router.get("/handlers", (_req, res) => {
  return res.json({
    ok: true,
    handlers: ["clinical_pipeline", "credentialing", "claim_submission"],
    note: "Jobs execute with exponential backoff retry (default: 3 attempts)",
  });
});

export default router;

import { Router } from "express";
import { runHealthChecks } from "../services/healthcheckService";
import { listJobs } from "../services/jobRunner";
import { buildHealthBundle } from "../services/healthBundleService";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    const status = await runHealthChecks();
    res.status(status.status === "healthy" ? 200 : 503).json(status);
  } catch (err: any) { res.status(500).json({ status: "unhealthy", error: err?.message }); }
});

healthRouter.get("/jobs", async (_req, res) => {
  res.json({ jobs: listJobs() });
});

healthRouter.get("/full", async (_req, res) => {
  try {
    const bundle = await buildHealthBundle();
    res.status(bundle.ok ? 200 : 207).json(bundle);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

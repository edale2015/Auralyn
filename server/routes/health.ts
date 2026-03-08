import { Router } from "express";
import { runHealthChecks } from "../services/healthcheckService";
import { listJobs } from "../services/jobRunner";

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

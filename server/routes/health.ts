import { Router } from "express";
import { runHealthChecks } from "../services/healthcheckService";
import { listJobs } from "../services/jobRunner";
import { buildHealthBundle } from "../services/healthBundleService";
import { testDbConnection } from "../db/dbRouter";
import { ENV } from "../config/env";
import { getAllQueueHealth } from "../queue/queueHealth";

export const healthRouter = Router();

healthRouter.get("/livez", (_req, res) => {
  res.status(200).json({ status: "alive", uptime: process.uptime(), ts: new Date().toISOString() });
});

healthRouter.get("/readyz", async (_req, res) => {
  try {
    await testDbConnection();

    if (ENV.REDIS_URL) {
      const IORedis = (await import("ioredis")).default;
      const redis = new IORedis(ENV.REDIS_URL, { maxRetriesPerRequest: 1 });
      const pong = await redis.ping();
      await redis.disconnect();
      if (pong !== "PONG") throw new Error("Redis ping failed");
    }

    res.status(200).json({ status: "ready" });
  } catch (err: any) {
    res.status(503).json({ status: "not_ready", error: err?.message || "Readiness check failed" });
  }
});

healthRouter.get("/healthz/full", async (_req, res) => {
  const report: Record<string, any> = { ts: new Date().toISOString(), uptime: process.uptime(), checks: {} };
  let ok = true;

  try {
    await testDbConnection();
    report.checks.database = { ok: true };
  } catch (err: any) {
    ok = false;
    report.checks.database = { ok: false, error: err?.message || "DB failure" };
  }

  if (ENV.REDIS_URL) {
    try {
      const IORedis = (await import("ioredis")).default;
      const redis = new IORedis(ENV.REDIS_URL, { maxRetriesPerRequest: 1 });
      const pong = await redis.ping();
      await redis.disconnect();
      report.checks.redis = { ok: pong === "PONG" };
      if (pong !== "PONG") ok = false;
    } catch (err: any) {
      ok = false;
      report.checks.redis = { ok: false, error: err?.message || "Redis failure" };
    }
  } else {
    report.checks.redis = { ok: false, error: "REDIS_URL not configured" };
  }

  try {
    report.checks.queues = await getAllQueueHealth();
  } catch (err: any) {
    ok = false;
    report.checks.queues = { ok: false, error: err?.message || "Queue health failure" };
  }

  res.status(ok ? 200 : 503).json({ status: ok ? "healthy" : "degraded", ...report });
});

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

import { Router } from "express";
import { getAllQueueHealth } from "../queue/queueHealth";
import { listSystemEvents } from "../repos/systemEventRepo";
import { listRecentJobs } from "../repos/jobRepo";
import { listRecentMetricSnapshots } from "../repos/metricsRepo";
import { testDbConnection } from "../db";
import { getRedisOrNull } from "../queue/redis";

const router = Router();

router.get("/summary", async (_req, res) => {
  let database = { ok: false as boolean, error: undefined as string | undefined };
  let redis = { ok: false as boolean, error: undefined as string | undefined };

  try {
    await testDbConnection();
    database.ok = true;
  } catch (err: any) {
    database.error = err?.message || "DB failure";
  }

  try {
    const client = getRedisOrNull();
    if (client) {
      const pong = await client.ping();
      redis.ok = pong === "PONG";
      if (!redis.ok) redis.error = "Redis ping failed";
    } else {
      redis.error = "REDIS_URL not configured";
    }
  } catch (err: any) {
    redis.error = err?.message || "Redis failure";
  }

  const [queues, events, jobs, metrics] = await Promise.allSettled([
    getAllQueueHealth(),
    listSystemEvents(20),
    listRecentJobs(undefined, 20),
    listRecentMetricSnapshots(undefined, 50)
  ]);

  res.json({
    services: {
      api: { ok: true },
      database,
      redis
    },
    queues: queues.status === "fulfilled" ? queues.value : {},
    recentEvents: events.status === "fulfilled" ? events.value : [],
    recentJobs: jobs.status === "fulfilled" ? jobs.value : [],
    recentMetrics: metrics.status === "fulfilled" ? metrics.value : []
  });
});

export default router;

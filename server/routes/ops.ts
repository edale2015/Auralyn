import { Router } from "express";
import { getAllQueueHealth } from "../queue/queueHealth";
import { listSystemEvents } from "../repos/systemEventRepo";
import { listRecentJobs } from "../repos/jobRepo";
import { listRecentMetricSnapshots } from "../repos/metricsRepo";
import { testDbConnection } from "../db";
import { getRedisAsync } from "../queue/redis";

const router = Router();

router.get("/summary", async (_req, res) => {
  let database = { ok: false as boolean, error: undefined as string | undefined };
  let redis = { ok: false as boolean, configured: false as boolean, error: undefined as string | undefined };

  try {
    await testDbConnection();
    database.ok = true;
  } catch (err: any) {
    database.error = err?.message || "DB failure";
  }

  try {
    const client = await Promise.race([
      getRedisAsync(),
      new Promise<null>(r => setTimeout(() => r(null), 3000)),
    ]);
    if (client) {
      redis.configured = true;
      try {
        const pong = await Promise.race([
          client.ping(),
          new Promise<string>(r => setTimeout(() => r("TIMEOUT"), 2000)),
        ]);
        redis.ok = typeof pong === "string" && pong.toUpperCase() === "PONG";
        if (!redis.ok) redis.error = pong === "TIMEOUT" ? "Redis ping timed out" : "Redis ping failed";
      } catch (pingErr: any) {
        redis.ok = false;
        redis.error = "Redis ping failed";
      }
    } else {
      redis.configured = false;
      redis.ok = true; // not a failure — it's intentionally optional
    }
  } catch (err: any) {
    redis.configured = true;
    redis.error = "Redis connection failed";
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

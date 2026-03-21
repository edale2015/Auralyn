import { Router } from "express";
import { testDbConnection } from "../db";
import { getRedisOrNull } from "../queue/redis";
import { ENV } from "../config/env";

const router = Router();

router.get("/", async (_req, res) => {
  const checks: Record<string, any> = {
    database: { ok: false },
    redis: { ok: false },
    queueInfra: { ok: false },
    telemetry: { ok: false },
    twilio: { ok: false }
  };

  try {
    await testDbConnection();
    checks.database.ok = true;
  } catch (err: any) {
    checks.database.error = err?.message || "DB failure";
  }

  try {
    const client = getRedisOrNull();
    if (client) {
      const pong = await client.ping();
      checks.redis.ok = pong === "PONG";
      checks.queueInfra.ok = pong === "PONG";
      if (pong !== "PONG") {
        checks.redis.error = "Redis ping failed";
        checks.queueInfra.error = "Queue infra unavailable";
      }
    } else {
      checks.redis.error = "REDIS_URL not configured";
      checks.queueInfra.error = "Queue infra unavailable (no Redis)";
    }
  } catch (err: any) {
    const message = err?.message || "Redis failure";
    checks.redis.error = message;
    checks.queueInfra.error = message;
  }

  checks.telemetry.ok = Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  );
  if (!checks.telemetry.ok) {
    checks.telemetry.note = "No OTLP exporter configured";
  }

  checks.twilio.ok = Boolean(ENV.TWILIO_ACCOUNT_SID && ENV.TWILIO_AUTH_TOKEN);
  if (!checks.twilio.ok) {
    checks.twilio.note = "Twilio credentials missing";
  }

  res.json(checks);
});

export default router;

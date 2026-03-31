import { db } from "../db";
import { sql } from "drizzle-orm";

export interface ServiceHealth {
  name: string;
  status: "ok" | "degraded" | "error" | "pending";
  latencyMs: number | null;
  errorRate: number;
  lastChecked: string;
  detail: string;
}

async function probe(fn: () => Promise<void>): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

export async function measureIntegrationHealth(): Promise<ServiceHealth[]> {
  const now = new Date().toISOString();
  const results: ServiceHealth[] = [];

  // 1. PostgreSQL
  const pg = await probe(async () => { await db.execute(sql`SELECT 1`); });
  results.push({
    name: "PostgreSQL",
    status: pg.ok ? (pg.ms < 100 ? "ok" : "degraded") : "error",
    latencyMs: pg.ms,
    errorRate: pg.ok ? 0 : 1,
    lastChecked: now,
    detail: pg.ok ? `${pg.ms}ms round-trip` : "unreachable",
  });

  // 2. OpenAI / STT
  const hasOpenAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  results.push({
    name: "OpenAI / STT",
    status: hasOpenAI ? "ok" : "pending",
    latencyMs: null,
    errorRate: 0,
    lastChecked: now,
    detail: hasOpenAI ? "API key configured" : "No API key found",
  });

  // 3. Redis / Upstash
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    const redis = await probe(async () => {
      const r = await fetch(`${redisUrl}/ping`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      if (!r.ok) throw new Error("ping failed");
    });
    results.push({
      name: "Redis (Upstash)",
      status: redis.ok ? (redis.ms < 200 ? "ok" : "degraded") : "error",
      latencyMs: redis.ms,
      errorRate: redis.ok ? 0 : 1,
      lastChecked: now,
      detail: redis.ok ? `${redis.ms}ms PING` : "PING failed",
    });
  } else {
    results.push({ name: "Redis (Upstash)", status: "pending", latencyMs: null, errorRate: 0, lastChecked: now, detail: "Not configured" });
  }

  // 4. Telegram
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (tgToken) {
    const tg = await probe(async () => {
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
      const j = await r.json() as any;
      if (!j.ok) throw new Error("not ok");
    });
    results.push({
      name: "Telegram",
      status: tg.ok ? (tg.ms < 500 ? "ok" : "degraded") : "error",
      latencyMs: tg.ms,
      errorRate: tg.ok ? 0 : 0.05,
      lastChecked: now,
      detail: tg.ok ? `${tg.ms}ms getMe` : "API error",
    });
  } else {
    results.push({ name: "Telegram", status: "pending", latencyMs: null, errorRate: 0, lastChecked: now, detail: "Token not set" });
  }

  // 5. Twilio
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  if (twilioSid && twilioAuth) {
    const twilio = await probe(async () => {
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`,
        { headers: { Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64") } }
      );
      if (!r.ok) throw new Error("auth failed");
    });
    results.push({
      name: "Twilio",
      status: twilio.ok ? (twilio.ms < 800 ? "ok" : "degraded") : "error",
      latencyMs: twilio.ms,
      errorRate: twilio.ok ? 0 : 1,
      lastChecked: now,
      detail: twilio.ok ? `${twilio.ms}ms account verify` : "Auth failed",
    });
  } else {
    results.push({ name: "Twilio", status: "pending", latencyMs: null, errorRate: 0, lastChecked: now, detail: "Creds not set" });
  }

  // 6. FHIR
  const fhirUrl = process.env.FHIR_BASE_URL;
  if (fhirUrl) {
    const fhir = await probe(async () => {
      const r = await fetch(`${fhirUrl}/metadata`);
      if (!r.ok) throw new Error("metadata failed");
    });
    results.push({
      name: "FHIR R4",
      status: fhir.ok ? (fhir.ms < 1000 ? "ok" : "degraded") : "error",
      latencyMs: fhir.ms,
      errorRate: fhir.ok ? 0 : 1,
      lastChecked: now,
      detail: fhir.ok ? `${fhir.ms}ms /metadata` : "Unreachable",
    });
  } else {
    results.push({ name: "FHIR R4", status: "pending", latencyMs: null, errorRate: 0, lastChecked: now, detail: "Set FHIR_BASE_URL" });
  }

  // 7. ECW
  const ecwUrl = process.env.EHR_ENDPOINT;
  results.push({
    name: "ECW (EHR)",
    status: ecwUrl ? "pending" : "pending",
    latencyMs: null,
    errorRate: 0,
    lastChecked: now,
    detail: ecwUrl || "Set EHR_ENDPOINT to activate",
  });

  return results;
}

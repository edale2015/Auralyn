import { ENV } from "./env";
import { db } from "../db";
import { sql } from "drizzle-orm";

export type CheckResult = { name: string; ok: boolean; detail: string };

// ── Individual checks ─────────────────────────────────────────────────────────

async function checkDatabase(): Promise<CheckResult> {
  try {
    await db.execute(sql`SELECT 1`);
    return { name: "DATABASE", ok: true, detail: "Connected and responsive" };
  } catch (e: any) {
    return { name: "DATABASE", ok: false, detail: `Connection failed: ${e?.message ?? "unknown"}` };
  }
}

function checkJwtEntropy(): CheckResult {
  const secret = ENV.JWT_SECRET ?? "";
  const isProd = ENV.NODE_ENV === "production";
  // In production a short JWT secret is a critical security vulnerability —
  // 32 chars ≈ 256 bits of entropy for typical alphanumeric secrets.
  const minLength = isProd ? 32 : 12;
  const ok = secret.length >= minLength;
  return {
    name: "JWT_SECRET",
    ok,
    detail: ok
      ? `Set (${secret.length} chars)`
      : `Too short — ${secret.length} chars, need ≥${minLength} in ${ENV.NODE_ENV}`,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runStartupChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Database (async — must come first; everything else depends on it)
  results.push(await checkDatabase());

  // Secrets
  results.push(checkJwtEntropy());

  results.push({
    name: "SESSION_SECRET",
    ok: (ENV.SESSION_SECRET ?? "").length >= 12,
    detail: (ENV.SESSION_SECRET ?? "").length >= 12 ? "Set" : "Too short or missing",
  });

  // External services (non-fatal — logged as warnings, not errors)
  results.push({
    name: "OPENAI_API_KEY",
    ok: !!ENV.OPENAI_API_KEY,
    detail: ENV.OPENAI_API_KEY ? "Set" : "Missing — AI features disabled",
  });

  results.push({
    name: "TWILIO_AUTH_TOKEN",
    ok: !!ENV.TWILIO_AUTH_TOKEN,
    detail: ENV.TWILIO_AUTH_TOKEN ? "Set" : "Missing — WhatsApp disabled",
  });

  results.push({
    name: "TELEGRAM_BOT_TOKEN",
    ok: !!ENV.TELEGRAM_BOT_TOKEN,
    detail: ENV.TELEGRAM_BOT_TOKEN ? "Set" : "Missing — Telegram disabled",
  });

  results.push({
    name: "EHR_ENDPOINT",
    ok: !!ENV.EHR_ENDPOINT,
    detail: ENV.EHR_ENDPOINT ? `Configured: ${ENV.EHR_ENDPOINT}` : "Not set — using mock adapter",
  });

  return results;
}

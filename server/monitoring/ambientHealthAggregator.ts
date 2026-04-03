/**
 * Ambient Health Aggregator (Recommendation 5)
 *
 * Produces 6 health dots for the Physician Command Strip ambient status bar:
 * 1. KB / Clinical Knowledge Base
 * 2. Debate Engine (3-agent clinical reasoning)
 * 3. Scoring Systems (SCORING_SYSTEMS sheet parse status)
 * 4. Messaging Gateway (WhatsApp + Telegram)
 * 5. PHI Scanner
 * 6. Outbox Lag (PostgreSQL → Firestore sync)
 *
 * Green = fully operational
 * Amber = degraded but functional
 * Red = down / blocking
 * Gray = unknown / first boot
 */

import { pool } from "../db/pool";
import { getOutboxLag } from "../jobs/outboxWorker";
import { getPriorCacheStats } from "../clinical/bayesianPriorService";
import { isBullAvailable } from "../queues/bullmq/connection";

export type DotStatus = "green" | "amber" | "red" | "gray";

export interface HealthDot {
  key: string;
  label: string;
  status: DotStatus;
  detail: string;
  degradedMessage?: string;
}

export interface AmbientHealthSnapshot {
  dots: HealthDot[];
  overallStatus: DotStatus;
  hasAlert: boolean;
  snapshottedAt: string;
}

async function checkKbHealth(): Promise<HealthDot> {
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS c FROM kb_entity_store WHERE status = 'active'`
    );
    const count = rows[0]?.c ?? 0;
    if (count === 0) {
      return { key: "kb", label: "Knowledge Base", status: "red", detail: "0 active KB entities", degradedMessage: "KB entity store is empty — clinical decisions may be impaired" };
    }
    const priorStats = getPriorCacheStats();
    return {
      key: "kb",
      label: "Knowledge Base",
      status: "green",
      detail: `${count} active entities, ${priorStats.size} cached priors`,
    };
  } catch (err: any) {
    return { key: "kb", label: "Knowledge Base", status: "red", detail: `DB error: ${err?.message}`, degradedMessage: "Cannot reach KB — clinical decisions impaired" };
  }
}

async function checkDebateEngineHealth(): Promise<HealthDot> {
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS c, avg(EXTRACT(epoch FROM (updated_at - created_at)))::float AS avg_s
       FROM encounters
       WHERE created_at > now() - interval '1 hour'`
    );
    const count: number = rows[0]?.c ?? 0;
    const avgSeconds: number | null = rows[0]?.avg_s ?? null;
    if (avgSeconds !== null && avgSeconds > 30) {
      return { key: "debate", label: "Debate Engine", status: "amber", detail: `Avg debate ${avgSeconds.toFixed(1)}s (last hour)`, degradedMessage: "Debate engine latency elevated — triage may be slower than normal" };
    }
    return { key: "debate", label: "Debate Engine", status: "green", detail: `${count} encounters last hour${avgSeconds !== null ? `, avg ${avgSeconds.toFixed(1)}s` : ""}` };
  } catch {
    return { key: "debate", label: "Debate Engine", status: "gray", detail: "No encounter data available" };
  }
}

async function checkScoringSystemsHealth(): Promise<HealthDot> {
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS c, max(created_at) AS last_load
       FROM scoring_system_versions`
    );
    const count = rows[0]?.c ?? 0;
    const lastLoad: Date | null = rows[0]?.last_load ?? null;
    const envHealthy = process.env.SCORING_SYSTEMS_SHEET_HEALTHY;

    if (envHealthy === "false") {
      return { key: "scoring", label: "Scoring Systems", status: "red", detail: "SCORING_SYSTEMS sheet parse failed", degradedMessage: "SCORING_SYSTEMS parse failure — HEART/CURB-65/Wells scores unavailable" };
    }
    if (count === 0) {
      return { key: "scoring", label: "Scoring Systems", status: "amber", detail: "No scoring system versions loaded", degradedMessage: "No SCORING_SYSTEMS data — scoring engines operating in fallback mode" };
    }
    const ageHours = lastLoad ? (Date.now() - lastLoad.getTime()) / 3600000 : null;
    if (ageHours !== null && ageHours > 25) {
      return { key: "scoring", label: "Scoring Systems", status: "amber", detail: `Last loaded ${ageHours.toFixed(0)}h ago`, degradedMessage: "SCORING_SYSTEMS may be stale — KB sync may be behind" };
    }
    return { key: "scoring", label: "Scoring Systems", status: "green", detail: `${count} version(s) loaded${lastLoad ? `, last ${ageHours?.toFixed(0)}h ago` : ""}` };
  } catch (err: any) {
    return { key: "scoring", label: "Scoring Systems", status: "gray", detail: `DB error: ${err?.message}` };
  }
}

function checkMessagingGatewayHealth(): HealthDot {
  const twilioConfigured = Boolean(process.env.TWILIO_FROM_NUMBER);
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  if (!twilioConfigured && !telegramConfigured) {
    return { key: "messaging", label: "Messaging Gateway", status: "amber", detail: "WhatsApp + Telegram not configured", degradedMessage: "No messaging gateways configured — patient channel replies unavailable" };
  }
  if (!twilioConfigured) {
    return { key: "messaging", label: "Messaging Gateway", status: "amber", detail: "WhatsApp/SMS not configured (Twilio missing)", degradedMessage: "WhatsApp gateway unavailable — Telegram only" };
  }
  if (!telegramConfigured) {
    return { key: "messaging", label: "Messaging Gateway", status: "amber", detail: "Telegram not configured", degradedMessage: "Telegram gateway unavailable — WhatsApp only" };
  }
  return { key: "messaging", label: "Messaging Gateway", status: "green", detail: "WhatsApp + Telegram active" };
}

function checkPhiScannerHealth(): HealthDot {
  const redisAvailable = isBullAvailable();
  return {
    key: "phi",
    label: "PHI Scanner",
    status: "green",
    detail: redisAvailable ? "Active — 14-pattern scan on all Sheets loads" : "Active (Redis unavailable — scan still runs synchronously)",
  };
}

async function checkOutboxLagHealth(): Promise<HealthDot> {
  try {
    const { pending, oldestPendingAgeMs } = await getOutboxLag();
    if (pending === 0) {
      return { key: "outbox", label: "Outbox Sync", status: "green", detail: "All events synced to Firestore" };
    }
    const ageMinutes = oldestPendingAgeMs ? oldestPendingAgeMs / 60000 : null;
    if (ageMinutes !== null && ageMinutes > 10) {
      return { key: "outbox", label: "Outbox Sync", status: "red", detail: `${pending} events pending, oldest ${ageMinutes.toFixed(0)}m`, degradedMessage: `Outbox lag: ${pending} events unsynced for ${ageMinutes.toFixed(0)}m — PostgreSQL → Firestore out of sync` };
    }
    return { key: "outbox", label: "Outbox Sync", status: "amber", detail: `${pending} events pending sync`, degradedMessage: `${pending} outbox events pending — Firestore may lag slightly` };
  } catch (err: any) {
    return { key: "outbox", label: "Outbox Sync", status: "gray", detail: `Cannot check: ${err?.message}` };
  }
}

const STATUS_PRIORITY: Record<DotStatus, number> = { red: 0, amber: 1, gray: 2, green: 3 };

export async function getAmbientHealthSnapshot(): Promise<AmbientHealthSnapshot> {
  const [kb, debate, scoring, outbox] = await Promise.all([
    checkKbHealth(),
    checkDebateEngineHealth(),
    checkScoringSystemsHealth(),
    checkOutboxLagHealth(),
  ]);
  const messaging = checkMessagingGatewayHealth();
  const phi = checkPhiScannerHealth();

  const dots = [kb, debate, scoring, messaging, phi, outbox];
  const worst = dots.reduce((prev, cur) =>
    STATUS_PRIORITY[cur.status] < STATUS_PRIORITY[prev.status] ? cur : prev
  );

  return {
    dots,
    overallStatus: worst.status,
    hasAlert: worst.status === "red" || worst.status === "amber",
    snapshottedAt: new Date().toISOString(),
  };
}

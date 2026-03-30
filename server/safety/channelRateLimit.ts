/**
 * CROSS-CUTTING — Claude Rec: Channel Rate Limiting
 *
 * Without rate limiting, a patient (or bad actor) sending rapid-fire messages
 * can flood the debate engine with concurrent cases. This has two failure modes:
 *   1. Resource exhaustion — all engine threads blocked by one patient
 *   2. Quality degradation — rapid-fire intake = incomplete symptom collection
 *
 * Also protects against WhatsApp/Telegram webhook retry storms where the
 * channel delivers the same message 3–5 times in quick succession.
 */

import { logger } from "../utils/logger";

export interface ChannelRateLimit {
  maxCasesPerPatientPer24h: number;
  maxConcurrentCasesGlobal: number;
  burstWindowSeconds:       number;
  maxBurstMessages:         number;
  onLimitReached:           "queue" | "reject_with_message" | "route_to_physician";
}

export const DEFAULT_RATE_LIMIT: ChannelRateLimit = {
  maxCasesPerPatientPer24h: 3,
  maxConcurrentCasesGlobal: 100,
  burstWindowSeconds:       60,
  maxBurstMessages:         3,
  onLimitReached:           "reject_with_message",
};

export interface RateLimitDecision {
  allowed:      boolean;
  reason?:      string;
  retryAfterMs?: number;
  patientCaseCount24h?: number;
  action:       ChannelRateLimit["onLimitReached"] | "allowed";
}

// Per-patient message timestamps (keyed by hashed patient/session ID)
const patientTimestamps: Map<string, number[]> = new Map();
let activeGlobalCases = 0;

/**
 * Evaluate whether a new intake request should be allowed.
 *
 * @param patientKey  Hashed session/patient identifier (no PHI)
 * @param config      Rate limit configuration (defaults apply)
 */
export function evaluateRateLimit(
  patientKey: string,
  config: Partial<ChannelRateLimit> = {}
): RateLimitDecision {
  const limit = { ...DEFAULT_RATE_LIMIT, ...config };
  const now   = Date.now();

  // Global concurrency check
  if (activeGlobalCases >= limit.maxConcurrentCasesGlobal) {
    logger.warn("rate_limit_global_capacity", { activeGlobalCases, limit: limit.maxConcurrentCasesGlobal });
    return {
      allowed: false,
      reason:  "System at capacity — please try again in a few minutes",
      retryAfterMs: 60_000,
      action: limit.onLimitReached,
    };
  }

  const timestamps = patientTimestamps.get(patientKey) ?? [];
  const window24h  = now - 24 * 60 * 60 * 1000;
  const windowBurst = now - limit.burstWindowSeconds * 1000;

  const recent24h  = timestamps.filter(t => t > window24h);
  const recentBurst = timestamps.filter(t => t > windowBurst);

  // 24-hour case limit
  if (recent24h.length >= limit.maxCasesPerPatientPer24h) {
    logger.warn("rate_limit_daily_exceeded", { patientKey: patientKey.slice(0, 8), count: recent24h.length });
    return {
      allowed: false,
      reason:  `Daily limit of ${limit.maxCasesPerPatientPer24h} cases reached. Please call your provider or 911 if this is an emergency.`,
      retryAfterMs: window24h + 24 * 60 * 60 * 1000 - now,
      patientCaseCount24h: recent24h.length,
      action: limit.onLimitReached,
    };
  }

  // Burst window check (idempotency guard for webhook retries)
  if (recentBurst.length >= limit.maxBurstMessages) {
    logger.warn("rate_limit_burst_exceeded", { patientKey: patientKey.slice(0, 8), count: recentBurst.length });
    return {
      allowed: false,
      reason:  "Message received — your intake is being processed. Please wait before sending another message.",
      retryAfterMs: limit.burstWindowSeconds * 1000,
      action: "reject_with_message",
    };
  }

  recent24h.push(now);
  patientTimestamps.set(patientKey, recent24h.slice(-20));

  return { allowed: true, patientCaseCount24h: recent24h.length, action: "allowed" };
}

export function incrementActiveGlobalCases(): void {
  activeGlobalCases++;
}

export function decrementActiveGlobalCases(): void {
  activeGlobalCases = Math.max(0, activeGlobalCases - 1);
}

export function getActiveGlobalCaseCount(): number {
  return activeGlobalCases;
}

export function resetPatientTimestamps(patientKey: string): void {
  patientTimestamps.delete(patientKey);
}

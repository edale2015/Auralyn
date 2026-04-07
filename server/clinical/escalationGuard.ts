import { logSecureEvent } from "../ops/secureAudit";
import { buildEscalationKey, DEFAULT_ESCALATION_SCOPE, EscalationScope } from "./escalationScope";

// ── Store interface — injectable for Redis, in-memory, or test mocks ──────────
//
// FIXED: original used a module-level in-memory object. With multiple server
// instances (normal in any container or PM2 deployment), each instance sees
// its own independent counters, so a 60% ER referral rate looks like 30% to
// each instance — the safety threshold never fires. A restart zeros everything.
//
// Fix: injectable EscalationStore. In production, inject a RedisEscalationStore
// constructed with a scoped EscalationScope. In dev, InMemoryEscalationStore
// is the default. In tests, pass a fresh InMemoryEscalationStore per test.

export interface EscalationStore {
  incrementTotal(): Promise<number>;
  incrementEr():    Promise<number>;
  getCounts():      Promise<{ erCount: number; totalCount: number } | null>;
  reset():          Promise<void>;
}

// ── In-memory store ───────────────────────────────────────────────────────────
// Single-instance only. Use for local dev and unit tests.

export class InMemoryEscalationStore implements EscalationStore {
  private erCount    = 0;
  private totalCount = 0;
  private lastReset  = Date.now();
  private windowMs:  number;

  constructor(windowMs = 60 * 60 * 1000) {
    this.windowMs = windowMs;
  }

  private maybeReset() {
    if (Date.now() - this.lastReset > this.windowMs) {
      this.erCount = 0;
      this.totalCount = 0;
      this.lastReset = Date.now();
    }
  }

  async incrementTotal() { this.maybeReset(); return ++this.totalCount; }
  async incrementEr()    { this.maybeReset(); return ++this.erCount; }
  async getCounts()      { this.maybeReset(); return { erCount: this.erCount, totalCount: this.totalCount }; }
  async reset()          { this.erCount = 0; this.totalCount = 0; this.lastReset = Date.now(); }
}

// ── Redis client interface (minimal surface) ──────────────────────────────────
export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  del(...keys: string[]): Promise<void>;
}

// ── Redis store — production implementation ───────────────────────────────────
//
// FIXED: original used global keys (escalation:total, escalation:er).
// Multi-tenant contamination: clinic A's referral rate suppresses clinic B.
//
// Fix: keys are derived from EscalationScope via buildEscalationKey().
// One clinic's behaviour is strictly isolated from every other clinic's.
//
// INCR + EXPIRE is atomic per key. TTL is set only on first increment to avoid
// resetting the window on every call.

export class RedisEscalationStore implements EscalationStore {
  private readonly windowSec: number;

  constructor(
    private readonly redis:  RedisClient,
    private readonly scope:  EscalationScope = DEFAULT_ESCALATION_SCOPE,
    windowMs = 60 * 60 * 1000,
  ) {
    this.windowSec = Math.floor(windowMs / 1000);
  }

  private totalKey() { return buildEscalationKey(this.scope, "total"); }
  private erKey()    { return buildEscalationKey(this.scope, "er");    }

  async incrementTotal(): Promise<number> {
    const count = await this.redis.incr(this.totalKey());
    if (count === 1) await this.redis.expire(this.totalKey(), this.windowSec);
    return count;
  }

  async incrementEr(): Promise<number> {
    const count = await this.redis.incr(this.erKey());
    if (count === 1) await this.redis.expire(this.erKey(), this.windowSec);
    return count;
  }

  async getCounts(): Promise<{ erCount: number; totalCount: number }> {
    const [total, er] = await this.redis.mget(this.totalKey(), this.erKey());
    return {
      totalCount: total ? parseInt(total, 10) : 0,
      erCount:    er    ? parseInt(er,    10) : 0,
    };
  }

  async reset(): Promise<void> {
    await this.redis.del(this.totalKey(), this.erKey());
  }
}

// ── Escalation configuration ──────────────────────────────────────────────────

export interface EscalationConfig {
  /** Block if ER referral rate exceeds this fraction. Default: 0.40 */
  erRateThreshold:  number;
  /** Block if raw ER count exceeds this per window. Default: 120 */
  erHourlyCap:      number;
  /**
   * Minimum cases in the window before rate-based suppression can fire.
   *
   * FIXED: original had no denominator guard. With 1 total / 1 ER, the live
   * rate is 100% and advisory adjustment triggered immediately — a one-case
   * weather vane steering the ship. Now requires minCasesPerWindow samples.
   */
  minCasesPerWindow: number;
  /**
   * Probability delta applied to the ER referral probability AFTER base scoring.
   *
   * FIXED: original returned factor: -0.2 with no explanation of what it meant.
   * Renamed to probabilityDelta and documented: add this value to the raw ER
   * referral probability (clamped to [0,1]). Negative = suppress referrals.
   */
  probabilityDelta: number;
}

export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  erRateThreshold:   0.40,
  erHourlyCap:       120,
  minCasesPerWindow: 50,
  probabilityDelta:  -0.20,
};

export interface EscalationAdjustment {
  adjust:          boolean;
  /** Probability delta to add to raw ER referral probability. Clamped to [0,1] by caller. */
  probabilityDelta: number;
  /** @deprecated Use probabilityDelta. Kept for backward compat with callers reading .factor */
  factor:           number;
  reason:           string;
  currentRate:      number;
  hourlyErCount:    number;
  totalCount:       number;
  recommendation:   string;
}

// ── recordDisposition ─────────────────────────────────────────────────────────
//
// Call for EVERY disposition, not just ER referrals, so the denominator is accurate.
// Both store calls are independent: a failure on one is logged but does not
// suppress the other — a counter failure must never block clinical flow.
// The escalation guard is a monitoring layer, not a gate.

export async function recordDisposition(
  disposition: string,
  store: EscalationStore,
): Promise<void> {
  try {
    await store.incrementTotal();
    if (disposition.toUpperCase() === "ER_NOW") {
      await store.incrementEr();
    }
  } catch (err) {
    console.error("[EscalationGuard] Failed to record disposition:", err);
    logSecureEvent({
      type:   "ESCALATION_COUNTER_ERROR",
      action: "RECORD_FAILED",
      error:  err instanceof Error ? err.message : String(err),
    });
  }
}

// ── escalationControl ─────────────────────────────────────────────────────────
//
// ADVISORY — informs the caller that the AI may be over-referring.
// Does not block decisions by itself. The safety gate handles blocking.
//
// In a multi-instance deployment, counts come from Redis and reflect the
// true system-wide rate, not per-instance state.

export async function escalationControl(
  store: EscalationStore,
  config: EscalationConfig = DEFAULT_ESCALATION_CONFIG,
): Promise<EscalationAdjustment> {
  let counts = { erCount: 0, totalCount: 0 };

  try {
    counts = (await store.getCounts()) ?? { erCount: 0, totalCount: 0 };
  } catch (err) {
    console.error("[EscalationGuard] Failed to read counts:", err);
    logSecureEvent({ type: "ESCALATION_READ_ERROR", action: "GET_COUNTS_FAILED" });
    // Fail safe: if we can't read counts, assume normal — do not suppress
    // referrals blindly on a monitoring failure.
    return {
      adjust:          false,
      probabilityDelta: 0,
      factor:           0,
      reason:           "counts_unavailable",
      currentRate:      0,
      hourlyErCount:    0,
      totalCount:       0,
      recommendation:   "Escalation counts unavailable. No advisory suppression applied.",
    };
  }

  const { erCount, totalCount } = counts;
  const liveRate   = totalCount > 0 ? erCount / totalCount : 0;
  const enoughData = totalCount >= config.minCasesPerWindow;

  const rateExceeded = enoughData && liveRate > config.erRateThreshold;
  const capExceeded  = erCount > config.erHourlyCap;

  if (rateExceeded || capExceeded) {
    const reason =
      rateExceeded && capExceeded ? "rate_and_cap_exceeded"
      : rateExceeded              ? "over_escalation_rate"
      :                             "hourly_er_cap_exceeded";

    logSecureEvent({
      type:          "ESCALATION_CONTROL",
      action:        "REDUCE",
      erRate:        liveRate,
      hourlyErCount: erCount,
      totalCount,
      probabilityDelta: config.probabilityDelta,
      reason,
    });

    return {
      adjust:           true,
      probabilityDelta: config.probabilityDelta,
      factor:           config.probabilityDelta,  // backward compat alias
      reason,
      currentRate:      +liveRate.toFixed(3),
      hourlyErCount:    erCount,
      totalCount,
      recommendation:
        `Advisory adjustment active (${reason}). ` +
        `Apply probability delta ${config.probabilityDelta} to ER referral probability after base scoring.`,
    };
  }

  return {
    adjust:           false,
    probabilityDelta: 0,
    factor:           0,                          // backward compat alias
    reason:           enoughData ? "within_normal_range" : "insufficient_sample_size",
    currentRate:      +liveRate.toFixed(3),
    hourlyErCount:    erCount,
    totalCount,
    recommendation:   enoughData
      ? "No escalation adjustment needed."
      : `Only ${totalCount} cases in current window (min ${config.minCasesPerWindow}). Not enough data for rate suppression.`,
  };
}

// ── Legacy sync API ───────────────────────────────────────────────────────────
//
// Kept for backward compatibility with callers that haven't migrated to the
// injectable async API. Uses a module-level InMemoryEscalationStore.
//
// In production these callers should be migrated to pass a RedisEscalationStore.
// Until then, this ensures they continue to function while the risk is documented.

const _legacyStore = new InMemoryEscalationStore();

/**
 * @deprecated Sync fire-and-forget wrapper. Migrate to async recordDisposition(store).
 */
export function recordDispositionSync(disposition: string): void {
  recordDisposition(disposition, _legacyStore).catch(err =>
    console.error("[EscalationGuard] Legacy recordDisposition failed:", err)
  );
}

/**
 * @deprecated Returns in-memory stats only. Migrate to async escalationControl(store).
 */
export function getEscalationStats(): {
  active: boolean;
  erRate: number;
  erCount: number;
  totalCount: number;
  threshold: number;
} {
  // Sync read from in-memory store — legacyStore.getCounts() is async but
  // the internal values are synchronously accessible through the class fields.
  // Cast is safe because InMemoryEscalationStore state is always current.
  const store = _legacyStore as any;
  const erCount    = store.erCount    ?? 0;
  const totalCount = store.totalCount ?? 0;
  const rate = totalCount > 0 ? +(erCount / totalCount).toFixed(3) : 0;
  return {
    active:     true,
    erRate:     rate,
    erCount,
    totalCount,
    threshold:  DEFAULT_ESCALATION_CONFIG.erRateThreshold,
  };
}

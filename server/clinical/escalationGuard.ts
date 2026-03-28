import { logSecureEvent } from "../ops/secureAudit";

interface EscalationWindow {
  windowMs: number;
  erCount: number;
  totalCount: number;
  lastReset: number;
}

const window: EscalationWindow = {
  windowMs: 60 * 60 * 1000,
  erCount: 0,
  totalCount: 0,
  lastReset: Date.now(),
};

const ER_RATE_THRESHOLD = 0.40;
const MAX_ER_HOURLY = 120;

function resetWindowIfNeeded() {
  if (Date.now() - window.lastReset > window.windowMs) {
    window.erCount = 0;
    window.totalCount = 0;
    window.lastReset = Date.now();
  }
}

export function recordDisposition(disposition: string): void {
  resetWindowIfNeeded();
  window.totalCount++;
  if (disposition === "ER_NOW") window.erCount++;
}

export interface EscalationAdjustment {
  adjust: boolean;
  factor: number;
  reason: string;
  currentRate: number;
  hourlyErCount: number;
  recommendation: string;
}

export function escalationControl(input?: { erRate?: number }): EscalationAdjustment {
  resetWindowIfNeeded();

  const liveRate = window.totalCount > 0 ? window.erCount / window.totalCount : 0;
  const erRate = input?.erRate ?? liveRate;

  if (erRate > ER_RATE_THRESHOLD || window.erCount > MAX_ER_HOURLY) {
    const factor = -0.2;

    logSecureEvent({
      type: "ESCALATION_CONTROL",
      action: "REDUCE",
      erRate,
      hourlyErCount: window.erCount,
      factor,
    });

    return {
      adjust: true,
      factor,
      reason: erRate > ER_RATE_THRESHOLD ? "over-escalation-rate" : "hourly-er-cap-exceeded",
      currentRate: +erRate.toFixed(3),
      hourlyErCount: window.erCount,
      recommendation: "Review current triage parameters. Consider recalibrating ER threshold.",
    };
  }

  return {
    adjust: false,
    factor: 0,
    reason: "within-normal-range",
    currentRate: +erRate.toFixed(3),
    hourlyErCount: window.erCount,
    recommendation: "No escalation adjustment needed.",
  };
}

export function getEscalationStats() {
  resetWindowIfNeeded();
  const rate = window.totalCount > 0 ? +(window.erCount / window.totalCount).toFixed(3) : 0;
  return {
    active: true,
    erRate: rate,
    erCount: window.erCount,
    totalCount: window.totalCount,
    threshold: ER_RATE_THRESHOLD,
  };
}

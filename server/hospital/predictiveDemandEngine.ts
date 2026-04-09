/**
 * Predictive Demand Engine — "Weather radar for patient flow"
 *
 * Projects the next 1 and 4 hours of patient volume based on recent historical
 * data, current queue pressure, and wait-time signals.
 *
 * Used by the Hospital Brain to determine how hard to prepare before the surge
 * arrives — not just to react after it lands.
 */

export interface DemandPredictorInput {
  historicalVolumes: Array<{
    ts:           number;
    count:        number;
    erCount:      number;
    telemedCount: number;
    clinicCount:  number;
  }>;
  currentQueueSize:    number;
  averageWaitMinutes:  number;
  nowTs:               number;
}

export interface DemandForecast {
  nextHourVolume:    number;
  nextHourEr:        number;
  next4HourVolume:   number;
  queuePressureBoost: number;
  waitPressureBoost:  number;
  riskLevel:         "low" | "medium" | "high";
}

export function predictDemandWindow(input: DemandPredictorInput): DemandForecast {
  // Use last 24 data points as the rolling window
  const recent = input.historicalVolumes.slice(-24);

  const avgCount =
    recent.length > 0
      ? recent.reduce((s, r) => s + r.count, 0) / recent.length
      : 0;

  const avgEr =
    recent.length > 0
      ? recent.reduce((s, r) => s + r.erCount, 0) / recent.length
      : 0;

  // Apply multipliers for current queue/wait pressure
  const queuePressureBoost = input.currentQueueSize > 20 ? 1.2 : 1.0;
  const waitPressureBoost  = input.averageWaitMinutes > 30 ? 1.15 : 1.0;

  const nextHourVolume = Math.round(avgCount * queuePressureBoost * waitPressureBoost);
  const nextHourEr     = Math.round(avgEr * queuePressureBoost);

  const riskLevel: DemandForecast["riskLevel"] =
    nextHourVolume > 30 ? "high"   :
    nextHourVolume > 15 ? "medium" : "low";

  return {
    nextHourVolume,
    nextHourEr,
    next4HourVolume: nextHourVolume * 4,
    queuePressureBoost,
    waitPressureBoost,
    riskLevel,
  };
}

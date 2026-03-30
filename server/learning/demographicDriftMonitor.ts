/**
 * DOMAIN 5: Demographic Drift Monitor
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - SELF_CARE over-discharge monitoring (high SELF_CARE + low ER_NOW = over-discharge pattern)
 *   - overDischargeRisk: combined score flagging systematic over-discharge per group
 *   - selfCareRateByGroup in ParityAnalysis
 *   - Stratified minimum sample sizes: global=100, per-group=50, ER_NOW-only=20
 */

import { recordSLOValue } from "../observability/clinicalSLOs";
import { logger }         from "../utils/logger";
import { emitEvent }      from "../controlTower/eventBus";
import { MINIMUM_SAMPLE_SIZES } from "./safeDriftCircuitBreaker";

export type DemographicGroup =
  | "age_under_18"
  | "age_18_to_40"
  | "age_41_to_65"
  | "age_over_65"
  | "female"
  | "male"
  | "other_gender"
  | "pregnant"
  | "pediatric";

export interface DispositionCount {
  ER_NOW:      number;
  ER_URGENT:   number;
  URGENT_CARE: number;
  ROUTINE:     number;
  SELF_CARE:   number;
  total:       number;
}

const groupCounts: Record<string, DispositionCount> = {};
const globalCounts: DispositionCount = {
  ER_NOW: 0, ER_URGENT: 0, URGENT_CARE: 0, ROUTINE: 0, SELF_CARE: 0, total: 0,
};

function emptyCount(): DispositionCount {
  return { ER_NOW: 0, ER_URGENT: 0, URGENT_CARE: 0, ROUTINE: 0, SELF_CARE: 0, total: 0 };
}

export function recordDispositionForGroup(groups: DemographicGroup[], disposition: string): void {
  const key = disposition.toUpperCase() as keyof DispositionCount;
  globalCounts.total++;
  if (key in globalCounts && key !== "total") (globalCounts as any)[key]++;

  for (const group of groups) {
    if (!groupCounts[group]) groupCounts[group] = emptyCount();
    groupCounts[group].total++;
    if (key in groupCounts[group] && key !== "total") (groupCounts[group] as any)[key]++;
  }
}

export interface ParityAnalysis {
  globalErNowRate:    number;
  globalSelfCareRate: number;   // Claude rec: track over-discharge baseline
  groupParityResults: Array<{
    group:           DemographicGroup | string;
    erNowRate:       number;
    deltaFromGlobal: number;
    flagged:         boolean;
    sampleSize:      number;
  }>;
  // Claude rec: over-discharge monitoring
  selfCareRateByGroup: Array<{
    group:           DemographicGroup | string;
    selfCareRate:    number;
    deltaFromGlobal: number;
    flagged:         boolean;   // delta > 5% from global SELF_CARE rate
    sampleSize:      number;
  }>;
  // Combined: high SELF_CARE + low ER_NOW for same group = over-discharge pattern
  overDischargeRisk: Array<{
    group:     string;
    riskScore: number;   // 0–1 combined score
    flagged:   boolean;
  }>;
  maxDelta:      number;
  flaggedGroups: string[];
  analysisAt:    string;
}

const PARITY_THRESHOLD    = 0.05;
const OVERDISCHARGE_THRESHOLD = 0.05;

export function computeParityAnalysis(): ParityAnalysis {
  const globalTotal      = globalCounts.total || 1;
  const globalErNowRate  = globalCounts.ER_NOW  / globalTotal;
  const globalSelfCareRate = globalCounts.SELF_CARE / globalTotal;

  // ER_NOW undertriage analysis — use per-group min sample
  const groupResults = Object.entries(groupCounts)
    .filter(([, counts]) => counts.total >= MINIMUM_SAMPLE_SIZES.perGroupAnalysis)
    .map(([group, counts]) => {
      const erNowRate      = counts.ER_NOW / counts.total;
      const deltaFromGlobal = Math.abs(erNowRate - globalErNowRate);
      return {
        group: group as DemographicGroup,
        erNowRate, deltaFromGlobal,
        flagged:    deltaFromGlobal > PARITY_THRESHOLD,
        sampleSize: counts.total,
      };
    });

  // SELF_CARE over-discharge analysis
  const selfCareResults = Object.entries(groupCounts)
    .filter(([, counts]) => counts.total >= MINIMUM_SAMPLE_SIZES.perGroupAnalysis)
    .map(([group, counts]) => {
      const selfCareRate   = counts.SELF_CARE / counts.total;
      const deltaFromGlobal = selfCareRate - globalSelfCareRate;
      return {
        group:           group as DemographicGroup,
        selfCareRate,
        deltaFromGlobal: Math.abs(deltaFromGlobal),
        flagged:         deltaFromGlobal > OVERDISCHARGE_THRESHOLD,
        sampleSize:      counts.total,
      };
    });

  // Over-discharge risk: combined ER_NOW undertriage + SELF_CARE overtriage
  const overDischargeRisk = groupResults.map(g => {
    const selfCareEntry = selfCareResults.find(s => s.group === g.group);
    const erNowUnder    = Math.max(0, globalErNowRate - g.erNowRate);     // below global = undertriage
    const selfCareOver  = selfCareEntry ? Math.max(0, selfCareEntry.selfCareRate - globalSelfCareRate) : 0;
    const riskScore     = Math.min((erNowUnder + selfCareOver) / 2, 1.0);
    return {
      group:     g.group,
      riskScore,
      flagged:   riskScore > 0.03,
    };
  });

  const maxDelta     = groupResults.reduce((max, g) => Math.max(max, g.deltaFromGlobal), 0);
  const flaggedGroups = groupResults.filter(g => g.flagged).map(g => g.group);
  const flaggedOverDischarge = overDischargeRisk.filter(g => g.flagged).map(g => g.group);

  recordSLOValue("DEMOGRAPHIC_PARITY_DELTA", maxDelta);

  if (flaggedGroups.length > 0 || flaggedOverDischarge.length > 0) {
    logger.warn("demographic_parity_breach", {
      flaggedGroups, flaggedOverDischarge, maxDelta, globalErNowRate, globalSelfCareRate,
    });
    emitEvent({
      type:    "ALERT",
      payload: {
        message:  `Demographic parity breach: undertriage [${flaggedGroups.join(", ")}], over-discharge risk [${flaggedOverDischarge.join(", ")}]`,
        severity: "HIGH",
        maxDelta, flaggedGroups, flaggedOverDischarge,
      },
      timestamp: Date.now(),
    });
  }

  return {
    globalErNowRate,
    globalSelfCareRate,
    groupParityResults: groupResults,
    selfCareRateByGroup: selfCareResults,
    overDischargeRisk,
    maxDelta,
    flaggedGroups,
    analysisAt: new Date().toISOString(),
  };
}

export function getGroupDispositionCounts(): Record<string, DispositionCount> {
  return { ...groupCounts };
}

export function getGlobalDispositionCounts(): DispositionCount {
  return { ...globalCounts };
}

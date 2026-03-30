/**
 * MY ADDITION — DOMAIN 5: Demographic Drift Monitor
 *
 * Detects systematic undertriage (or overtriage) bias across demographic
 * groups. OCR has explicitly stated that algorithmic bias resulting in
 * disparate health outcomes is actionable under federal civil rights law
 * (ACA Section 1557).
 *
 * This module computes per-group disposition rate distributions and flags
 * when any group's ER_NOW rate differs by more than 5% from the global mean
 * (the DEMOGRAPHIC_PARITY_DELTA SLO target).
 *
 * No PHI is stored — only aggregate disposition counts per anonymous group.
 */

import { recordSLOValue } from "../observability/clinicalSLOs";
import { logger }         from "../utils/logger";
import { emitEvent }      from "../controlTower/eventBus";

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

export function recordDispositionForGroup(
  groups: DemographicGroup[],
  disposition: string
): void {
  const key = disposition.toUpperCase() as keyof DispositionCount;

  globalCounts.total++;
  if (key in globalCounts && key !== "total") {
    (globalCounts as any)[key]++;
  }

  for (const group of groups) {
    if (!groupCounts[group]) groupCounts[group] = emptyCount();
    groupCounts[group].total++;
    if (key in groupCounts[group] && key !== "total") {
      (groupCounts[group] as any)[key]++;
    }
  }
}

export interface ParityAnalysis {
  globalErNowRate:    number;
  groupParityResults: Array<{
    group:           DemographicGroup | string;
    erNowRate:       number;
    deltaFromGlobal: number;
    flagged:         boolean;
    sampleSize:      number;
  }>;
  maxDelta:           number;
  flaggedGroups:      string[];
  analysisAt:         string;
}

const PARITY_THRESHOLD = 0.05;   // 5% max delta — from DEMOGRAPHIC_PARITY_DELTA SLO
const MIN_SAMPLE_SIZE  = 30;     // Don't compute parity on tiny samples

export function computeParityAnalysis(): ParityAnalysis {
  const globalTotal  = globalCounts.total || 1;
  const globalErNowRate = globalCounts.ER_NOW / globalTotal;

  const groupResults = Object.entries(groupCounts)
    .filter(([, counts]) => counts.total >= MIN_SAMPLE_SIZE)
    .map(([group, counts]) => {
      const erNowRate      = counts.ER_NOW / counts.total;
      const deltaFromGlobal = Math.abs(erNowRate - globalErNowRate);
      return {
        group:           group as DemographicGroup,
        erNowRate,
        deltaFromGlobal,
        flagged:         deltaFromGlobal > PARITY_THRESHOLD,
        sampleSize:      counts.total,
      };
    });

  const maxDelta     = groupResults.reduce((max, g) => Math.max(max, g.deltaFromGlobal), 0);
  const flaggedGroups = groupResults.filter(g => g.flagged).map(g => g.group);

  // Record to clinical SLO tracker
  recordSLOValue("DEMOGRAPHIC_PARITY_DELTA", maxDelta);

  if (flaggedGroups.length > 0) {
    logger.warn("demographic_parity_breach", {
      flaggedGroups, maxDelta, globalErNowRate,
    });
    emitEvent({
      type: "ALERT",
      payload: {
        message:  `Demographic parity breach: groups [${flaggedGroups.join(", ")}] differ by >${PARITY_THRESHOLD * 100}% from global ER_NOW rate`,
        severity: "HIGH",
        maxDelta, flaggedGroups,
      },
      timestamp: Date.now(),
    });
  }

  return {
    globalErNowRate,
    groupParityResults: groupResults,
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

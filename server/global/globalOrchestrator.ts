/**
 * Global Orchestrator
 *
 * "Healthcare operating system for populations — at planetary scale."
 *
 * Groups national/regional nodes by continent, computes per-continent
 * health signals, identifies underloaded regions for demand redistribution,
 * and feeds the pandemic engine with the aggregated global patient stream.
 *
 * Architecture:
 *   Patient → Clinical Brain → Hospital Brain → Regional → National
 *                                                               ↓
 *                                                        Global Layer
 *                                                        (this file)
 */

import { type RegionalSummaryInput }  from "../national/federationEngine";
import { detectPandemicSignals, simulateSpread, earlyWarningSystem }
                                      from "./pandemicEngine";
import { enforceGlobalPolicy }        from "./globalPolicyLayer";

export interface GlobalRegionInput extends RegionalSummaryInput {
  continent?: string;   // "North America" | "Europe" | "Asia" | "Africa" | "Oceania" | "South America"
  country?:   string;   // ISO2 code
}

export interface ContinentSignal {
  continent:    string;
  volume:       number;
  trend:        "spiking" | "stable" | "declining";
  avgStrain:    number;
  regionCount:  number;
}

export interface GlobalOrchestrationInput {
  traceId?: string;
  regions:  GlobalRegionInput[];
  simInput?: {
    R0?:              number;
    population?:      number;
    initialInfected?: number;
  };
}

export interface GlobalOrchestrationOutput {
  continentSignals:           ContinentSignal[];
  recommendedRedistribution:  string[];   // underloaded region names
  overloadedRegions:          string[];
  pandemic:                   ReturnType<typeof detectPandemicSignals>;
  simulation:                 ReturnType<typeof simulateSpread>;
  earlyWarning:               ReturnType<typeof earlyWarningSystem>;
  policy:                     ReturnType<typeof enforceGlobalPolicy>;
  summary: {
    totalGlobalPatients:  number;
    hotContinents:        number;
    pandemicAlert:        boolean;
    redistributionNeeded: boolean;
    globalAlertLevel:     "green" | "yellow" | "orange" | "red";
  };
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc: Record<string, T[]>, item) => {
    const key = fn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function computeTrend(regions: GlobalRegionInput[]): ContinentSignal["trend"] {
  const hasCritical = regions.some(r => r.surgeState.status === "critical");
  const hasSurge    = regions.some(r => r.surgeState.status === "surge");
  const allStable   = regions.every(r => r.capacityState.systemState === "stable");
  if (hasCritical) return "spiking";
  if (hasSurge)    return "spiking";
  if (allStable)   return "stable";
  return "stable";
}

export function runGlobalOrchestration(
  input: GlobalOrchestrationInput
): GlobalOrchestrationOutput {
  const { regions } = input;

  // ── Step 1: Group by continent ────────────────────────────────────────────
  const byContinent = groupBy(regions, r => r.continent ?? "North America");

  const continentSignals: ContinentSignal[] = Object.entries(byContinent).map(
    ([continent, cRegions]) => ({
      continent,
      volume:      cRegions.reduce((s, r) => s + r.summary.totalPatients, 0),
      trend:       computeTrend(cRegions),
      avgStrain:   cRegions.reduce((s, r) => s + r.capacityState.strainScore, 0) / cRegions.length,
      regionCount: cRegions.length,
    })
  ).sort((a, b) => b.volume - a.volume);

  // ── Step 2: Redistribution targets ───────────────────────────────────────
  const underloaded = regions
    .filter(r => r.capacityState.systemState === "stable" && r.capacityState.strainScore < 4)
    .map(r => r.regionName);

  const overloaded = regions
    .filter(r => r.capacityState.systemState === "critical" || r.capacityState.strainScore >= 8)
    .map(r => r.regionName);

  // ── Step 3: Pandemic detection ────────────────────────────────────────────
  const allPatients = regions.flatMap(r =>
    r.populationSignals.topComplaints.flatMap(c =>
      Array.from({ length: Math.min(c.count, 50) }, () => ({
        patientId: `${r.regionName}-${c.complaint}`,
        symptoms:  [c.complaint],
      }))
    )
  );
  const pandemic = detectPandemicSignals({ patients: allPatients });

  // ── Step 4: Spread simulation ─────────────────────────────────────────────
  const totalInfected = allPatients.length;
  const simulation    = simulateSpread({
    R0:              input.simInput?.R0             ?? 1.5,
    population:      input.simInput?.population     ?? 1_000_000,
    initialInfected: input.simInput?.initialInfected ?? totalInfected,
  });

  // ── Step 5: Early warning ─────────────────────────────────────────────────
  const earlyWarning = earlyWarningSystem({
    respiratoryCluster: pandemic.respiratoryCluster,
    giCluster:          pandemic.giCluster,
    trend:              continentSignals.some(c => c.trend === "spiking") ? "spiking" : "stable",
  });

  // ── Step 6: Policy (default jurisdiction for global ops) ─────────────────
  const policy = enforceGlobalPolicy({ country: "US" });

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalGlobalPatients = regions.reduce((s, r) => s + r.summary.totalPatients, 0);
  const hotContinents       = continentSignals.filter(c => c.trend === "spiking").length;

  const globalAlertLevel: GlobalOrchestrationOutput["summary"]["globalAlertLevel"] =
    pandemic.alert || overloaded.length > regions.length * 0.5 ? "red"    :
    pandemic.giCluster || hotContinents > 0                    ? "orange" :
    overloaded.length > 0                                      ? "yellow" : "green";

  return {
    continentSignals,
    recommendedRedistribution: underloaded,
    overloadedRegions:         overloaded,
    pandemic,
    simulation,
    earlyWarning,
    policy,
    summary: {
      totalGlobalPatients,
      hotContinents,
      pandemicAlert:        pandemic.alert,
      redistributionNeeded: overloaded.length > 0,
      globalAlertLevel,
    },
  };
}

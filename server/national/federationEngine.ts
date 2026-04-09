/**
 * Federation Engine — Multi-Region Coordination
 *
 * "Unifies all regional states into a single national picture."
 *
 * Ingests the outputs of each regional orchestrator and computes:
 *   - Total national patient volume
 *   - ER demand nationwide
 *   - Average load / strain across all regions
 *   - Per-region status (load + surge level)
 *   - Regional health tier: which regions are stable, strained, or critical
 *
 * This is the entry point for the national layer — all other national
 * modules consume the federation output as their primary input.
 */

export interface RegionalSummaryInput {
  regionName:       string;
  continent?:       string;   // used by global layer (default: "North America")
  state?:           string;   // e.g. "NY"
  summary: {
    totalPatients:  number;
    erSuggested:    number;   // patients routed to ER
  };
  capacityState: {
    strainScore:    number;   // 0–10 scale
    systemState:    "stable" | "strained" | "critical";
  };
  surgeState: {
    status:         "none" | "watch" | "surge" | "critical";
  };
  populationSignals: {
    topComplaints:  Array<{ complaint: string; count: number }>;
  };
}

export interface FederationOutput {
  totalPatients:    number;
  totalER:          number;
  avgStrainScore:   number;
  avgLoad:          number;   // normalized 0–1 alias for avgStrainScore / 10
  criticalRegions:  string[];
  surgeRegions:     string[];
  stableRegions:    string[];
  regions:          Array<{
    name:       string;
    load:       string;       // systemState
    surge:      string;       // surgeState.status
    patients:   number;
    strainScore: number;
  }>;
}

export function aggregateRegionalStates(regions: RegionalSummaryInput[]): FederationOutput {
  if (regions.length === 0) {
    return {
      totalPatients: 0, totalER: 0,
      avgStrainScore: 0, avgLoad: 0,
      criticalRegions: [], surgeRegions: [], stableRegions: [],
      regions: [],
    };
  }

  const totalPatients  = regions.reduce((s, r) => s + r.summary.totalPatients, 0);
  const totalER        = regions.reduce((s, r) => s + r.summary.erSuggested,   0);
  const avgStrainScore = regions.reduce((s, r) => s + r.capacityState.strainScore, 0) / regions.length;

  const criticalRegions = regions.filter(r => r.capacityState.systemState === "critical").map(r => r.regionName);
  const surgeRegions    = regions.filter(r => r.surgeState.status === "surge" || r.surgeState.status === "critical").map(r => r.regionName);
  const stableRegions   = regions.filter(r => r.capacityState.systemState === "stable").map(r => r.regionName);

  return {
    totalPatients,
    totalER,
    avgStrainScore,
    avgLoad: Math.min(1, avgStrainScore / 10),
    criticalRegions,
    surgeRegions,
    stableRegions,
    regions: regions.map(r => ({
      name:        r.regionName,
      load:        r.capacityState.systemState,
      surge:       r.surgeState.status,
      patients:    r.summary.totalPatients,
      strainScore: r.capacityState.strainScore,
    })),
  };
}

/**
 * Pandemic Engine — WHO-Scale Outbreak Detection + Spread Simulation
 *
 * Three sub-modules:
 *
 * 1. detectPandemicSignals
 *    Scans the global patient stream for syndromic clustering patterns
 *    that indicate emerging respiratory or GI outbreaks. Thresholds are
 *    calibrated for the global scale (100+ vs. regional 5+).
 *
 * 2. simulateSpread (simplified SIR model)
 *    Given an R0 value, current infected count, and population size,
 *    projects next-day and next-week caseloads. Used for capacity planning
 *    and early resource pre-positioning.
 *
 * 3. earlyWarningSystem
 *    Converts pandemic signals + trend into a concrete action recommendation.
 *    Output feeds the global command center and optional CDC/WHO export.
 */

// ── Pandemic Signal Detection ─────────────────────────────────────────────────

export interface PandemicPatientInput {
  patientId?: string;
  symptoms:   string[];
}

export interface PandemicSignalOutput {
  symptomCounts:      Record<string, number>;
  clusters:           Array<[string, number]>;   // [symptom, count] for clusters > 100
  respiratoryCluster: boolean;
  giCluster:          boolean;
  alert:              boolean;
  topSymptom:         string | null;
  riskLevel:          "low" | "medium" | "high" | "critical";
}

export function detectPandemicSignals(input: { patients: PandemicPatientInput[] }): PandemicSignalOutput {
  const symptomCounts: Record<string, number> = {};

  for (const p of input.patients) {
    for (const s of p.symptoms) {
      symptomCounts[s] = (symptomCounts[s] || 0) + 1;
    }
  }

  const clusters = Object.entries(symptomCounts)
    .filter(([, count]) => count > 100) as Array<[string, number]>;

  const cough  = symptomCounts["cough"]    ?? 0;
  const fever  = symptomCounts["fever"]    ?? 0;
  const vomit  = symptomCounts["vomiting"] ?? 0;
  const diarr  = symptomCounts["diarrhea"] ?? 0;

  const respiratoryCluster = cough > 200 && fever > 200;
  const giCluster          = vomit > 150 && diarr > 150;

  // Lower thresholds for early detection (before hard >200 threshold)
  const earlyRespiratory = cough > 50 && fever > 50;
  const earlyGI          = vomit > 30 && diarr > 30;

  const alert = respiratoryCluster || giCluster;

  const riskLevel: PandemicSignalOutput["riskLevel"] =
    respiratoryCluster || giCluster ? "critical" :
    earlyRespiratory || earlyGI     ? "high"     :
    clusters.length > 0             ? "medium"   : "low";

  const topSymptom = Object.entries(symptomCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    symptomCounts,
    clusters,
    respiratoryCluster,
    giCluster,
    alert,
    topSymptom,
    riskLevel,
  };
}

// ── SIR-Style Spread Simulation ───────────────────────────────────────────────

export interface SpreadSimInput {
  R0?:              number;   // basic reproduction number (default 1.5)
  population?:      number;   // susceptible population (default 100k)
  initialInfected?: number;   // seed infected count (default 10)
}

export interface SpreadSimOutput {
  current:        number;
  nextDay:        number;
  nextWeek:       number;
  nextMonth:      number;
  riskLevel:      "low" | "medium" | "high" | "critical";
  peakEstimate:   number;   // rough peak (when herd immunity reached)
  herdThreshold:  number;   // 1 - 1/R0
}

export function simulateSpread(input: SpreadSimInput): SpreadSimOutput {
  const R0         = input.R0             ?? 1.5;
  const population = input.population     ?? 100_000;
  const infected   = input.initialInfected ?? 10;

  const nextDay    = Math.round(infected * R0);
  const nextWeek   = Math.round(nextDay   * R0 * 3.5);   // ~half-week generation time
  const nextMonth  = Math.round(nextDay   * Math.pow(R0, 10));

  // Herd immunity threshold
  const herdThreshold = Math.round(population * (1 - 1 / Math.max(1, R0)));
  const peakEstimate  = Math.round(population * 0.3 * R0); // rough logistic peak

  const riskLevel: SpreadSimOutput["riskLevel"] =
    nextDay > 10_000 ? "critical" :
    nextDay > 1_000  ? "high"     :
    nextDay > 100    ? "medium"   : "low";

  return {
    current: infected,
    nextDay,
    nextWeek:   Math.min(nextWeek,  population),
    nextMonth:  Math.min(nextMonth, population),
    riskLevel,
    peakEstimate:  Math.min(peakEstimate, population),
    herdThreshold,
  };
}

// ── Early Warning System ──────────────────────────────────────────────────────

export interface EarlyWarningInput {
  respiratoryCluster: boolean;
  giCluster:          boolean;
  trend:              "spiking" | "stable" | "declining";
}

export interface EarlyWarningOutput {
  alert:        string | null;
  action:       string | null;
  severity:     "none" | "watch" | "warning" | "critical";
}

export function earlyWarningSystem(input: EarlyWarningInput): EarlyWarningOutput {
  if (input.respiratoryCluster && input.trend === "spiking") {
    return {
      alert:    "Respiratory outbreak emerging — multi-region spike in cough + fever",
      action:   "Increase telemed capacity + reduce ER overload + notify public health",
      severity: "critical",
    };
  }

  if (input.respiratoryCluster) {
    return {
      alert:    "Respiratory cluster detected — cough + fever co-occurrence above threshold",
      action:   "Pre-position telemed agents + alert regional medical directors",
      severity: "warning",
    };
  }

  if (input.giCluster) {
    return {
      alert:    "GI outbreak detected — vomiting + diarrhea co-occurrence above threshold",
      action:   "Public health notification + activate GI triage fast path",
      severity: "warning",
    };
  }

  if (input.trend === "spiking") {
    return {
      alert:    "Volume spiking across regions — no specific syndrome identified yet",
      action:   "Monitor for syndrome crystallization + pre-position capacity",
      severity: "watch",
    };
  }

  return { alert: null, action: null, severity: "none" };
}

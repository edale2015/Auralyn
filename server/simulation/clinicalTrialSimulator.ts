/**
 * Clinical Trial Simulator — AI vs Baseline comparative effectiveness research
 * Runs N simulated patients through AI intervention pathway vs baseline
 * Outputs: mortality reduction, ICU avoidance, LOS reduction
 * FDA evidence generation: prove AI effectiveness before submission
 */

import { runDigitalTwin }        from "../digitalTwin/digitalTwinEngine";
import { generateInterventions } from "../intervention/autonomousCopilot";
import { detectSepsisRisk }      from "../sepsis/sepsisEngine";

export interface TrialPatient {
  id:            string;
  vitals:        { hr: number; spo2: number; temp: number; systolicBP?: number; sbp?: number; rr?: number };
  symptoms?:     string[];
  interventions?: string[];
  history?:      any[];
}

export interface PatientOutcome {
  patientId:      string;
  baselineICUProb: number;
  aiICUProb:       number;
  icuProbReduction:number;
  baselineDet:     number;
  aiDet:           number;
  detReduction:    number;
  interventionCount:number;
  tteBaseline:     number;
  tteAI:           number;
}

export interface TrialSummary {
  patients:              number;
  avgICUReduction:       number;
  avgDetReduction:       number;
  icuAvoidanceRate:      number;    // % patients who avoided ICU with AI
  avgTTEImprovement:     number;    // minutes gained
  estimatedMortalityRed: number;    // modelled
  fdaEvidence:           boolean;   // true if icuAvoidanceRate > 20%
  outcomes:              PatientOutcome[];
  generatedAt:           string;
}

// Apply AI intervention effect to digital twin inputs
function applyInterventionEffect(
  patient:       TrialPatient,
  interventions: Awaited<ReturnType<typeof generateInterventions>>
): TrialPatient {
  const extras: string[] = [];
  for (const bundle of interventions) {
    for (const act of bundle.actions) {
      if (act.action.includes("fluid"))   extras.push("fluids");
      if (act.action.includes("oxygen"))  extras.push("oxygen");
    }
  }
  return { ...patient, interventions: [...(patient.interventions ?? []), ...extras] };
}

export async function runTrial(patients: TrialPatient[]): Promise<TrialSummary> {
  const outcomes: PatientOutcome[] = [];

  for (const p of patients) {
    // Baseline (no AI intervention)
    const baselineTwin = runDigitalTwin(p, 180);

    // Detect sepsis for co-pilot
    const sepsisResult = detectSepsisRisk({
      id:       p.id,
      vitals:   { ...p.vitals, systolicBP: p.vitals.systolicBP ?? p.vitals.sbp ?? 120 },
      symptoms: p.symptoms ?? [],
    });

    const patientWithSepsis: any = { ...p, sepsisRisk: sepsisResult };

    // Generate AI interventions
    const interventions = await generateInterventions(patientWithSepsis);

    // AI-augmented simulation
    const augmented = applyInterventionEffect(p, interventions);
    const aiTwin    = runDigitalTwin(augmented, 180);

    outcomes.push({
      patientId:        p.id,
      baselineICUProb:  baselineTwin.icuProb,
      aiICUProb:        aiTwin.icuProb,
      icuProbReduction: Math.max(0, baselineTwin.icuProb - aiTwin.icuProb),
      baselineDet:      baselineTwin.deteriorationProb,
      aiDet:            aiTwin.deteriorationProb,
      detReduction:     Math.max(0, baselineTwin.deteriorationProb - aiTwin.deteriorationProb),
      interventionCount:interventions.length,
      tteBaseline:      baselineTwin.tteMinutes,
      tteAI:            aiTwin.tteMinutes,
    });
  }

  const n = outcomes.length || 1;

  const avgICUReduction   = outcomes.reduce((s, o) => s + o.icuProbReduction, 0) / n;
  const avgDetReduction   = outcomes.reduce((s, o) => s + o.detReduction,     0) / n;
  const icuAvoided        = outcomes.filter((o) => o.aiICUProb < o.baselineICUProb).length;
  const icuAvoidanceRate  = icuAvoided / n;

  const avgTTEBaseline    = outcomes.filter((o) => o.tteBaseline > 0).reduce((s, o) => s + o.tteBaseline, 0) / Math.max(1, outcomes.filter((o) => o.tteBaseline > 0).length);
  const avgTTEAI          = outcomes.filter((o) => o.tteAI > 0).reduce((s, o) => s + o.tteAI, 0)          / Math.max(1, outcomes.filter((o) => o.tteAI > 0).length);
  const avgTTEImprovement = Math.max(0, avgTTEAI - avgTTEBaseline);

  // Conservative mortality model: 1% reduction per 10% ICU avoidance
  const estimatedMortalityRed = Math.min(0.15, avgICUReduction * 0.1);

  return {
    patients:              outcomes.length,
    avgICUReduction:       Math.round(avgICUReduction   * 1000) / 1000,
    avgDetReduction:       Math.round(avgDetReduction   * 1000) / 1000,
    icuAvoidanceRate:      Math.round(icuAvoidanceRate  * 1000) / 1000,
    avgTTEImprovement:     Math.round(avgTTEImprovement * 10)   / 10,
    estimatedMortalityRed: Math.round(estimatedMortalityRed * 1000) / 1000,
    fdaEvidence:           icuAvoidanceRate > 0.20,
    outcomes,
    generatedAt:           new Date().toISOString(),
  };
}

# Digital Twin & Synthetic Case Generation

## Review Prompt

Review this simulation and case generation layer.
Focus on:
  - Realism of generated patient cases
  - Adequate edge-case coverage (sepsis, shock, PE, ACS, stroke)
  - Biases in synthetic data that could hide validation gaps
  - Whether the digital twin accurately reflects real clinical deterioration
  - Failure to stress-test dangerous corner cases

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/simulation/digitalTwin.ts

```ts
type ClinicState = {
  patientsPerDay: number;
  avgRevenue: number;
  denialRate: number;
  capacity: number;
  payerMix: Record<string, number>;
};

export class DigitalTwin {
  private state: ClinicState;
  private history: Array<{ timestamp: string; state: ClinicState }> = [];

  constructor(initial?: Partial<ClinicState>) {
    this.state = {
      patientsPerDay: initial?.patientsPerDay ?? 50,
      avgRevenue: initial?.avgRevenue ?? 120,
      denialRate: initial?.denialRate ?? 0.08,
      capacity: initial?.capacity ?? 0.65,
      payerMix: initial?.payerMix ?? {
        medicare: 0.3,
        medicaid: 0.15,
        aetna: 0.15,
        united: 0.12,
        cigna: 0.08,
        bcbs: 0.1,
        humana: 0.05,
        self_pay: 0.05
      }
    };
  }

  update(data: Partial<ClinicState>) {
    this.history.push({
      timestamp: new Date().toISOString(),
      state: { ...this.state }
    });

    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    this.state = { ...this.state, ...data };
  }

  getState(): ClinicState {
    return { ...this.state };
  }

  getHistory() {
    return [...this.history];
  }

  getProjectedDailyRevenue(): number {
    return this.state.patientsPerDay * this.state.avgRevenue * (1 - this.state.denialRate);
  }

  getProjectedMonthlyRevenue(): number {
    return this.getProjectedDailyRevenue() * 22;
  }
}

export const digitalTwin = new DigitalTwin();
```

### server/simulation/digitalTwinEngine.ts

```ts
export interface SimulationScenario {
  scenario: string;
  intervention: "none" | "treatment" | "delay";
  riskScore: number;
  outcome: string;
  timeToEvent: string;
  recommendation: string;
}

export function runDigitalTwin(params: { result: any }): SimulationScenario[] {
  const baseRisk = params.result.trajectory?.riskScore ?? params.result.uncertainty ?? 0.35;

  const calc = (delta: number) => {
    const r = Math.max(0, Math.min(1, baseRisk + delta));
    const outcome = r > 0.75 ? "High likelihood of deterioration" : r > 0.50 ? "Moderate risk — close monitoring needed" : r > 0.30 ? "Low-moderate risk — watchful waiting" : "Low risk — stable";
    const time = r > 0.75 ? "< 2 hours" : r > 0.50 ? "2-12 hours" : r > 0.30 ? "12-48 hours" : "stable";
    return { riskScore: Math.round(r * 1000) / 1000, outcome, timeToEvent: time };
  };

  return [
    { scenario: "No Action", intervention: "none", ...calc(+0.25), recommendation: "Do not delay — deterioration likely without intervention" },
    { scenario: "Immediate Treatment", intervention: "treatment", ...calc(-0.28), recommendation: "Initiate treatment now for best outcome trajectory" },
    { scenario: "Delayed Care (4-6h)", intervention: "delay", ...calc(+0.38), recommendation: "Avoid delay — 4-6 hour lag substantially worsens prognosis" },
  ];
}
```

### server/validation/fullCaseGenerator.ts

```ts
/**
 * Full case generator — produces 1 000+ synthetic golden cases
 * across five major complaint domains.
 *
 * Cases include both clean presentations and adversarial variants
 * (sparse observations, contradictions, missing critical features).
 */

import { GoldenCase, GoldenCaseObservation } from "./goldenCaseTypes";

function rnd(prob: number): boolean {
  return Math.random() > (1 - prob);
}

// ─── PE (pulmonary embolism) ───────────────────────────────────────────────

function generatePE(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `pe_${i}`,
    complaint:   "shortness_of_breath",
    title:       `PE Case ${i}`,
    observations: [
      { feature: "sob",                  value: true },
      { feature: "tachycardia",          value: rnd(0.8) },
      { feature: "pleuritic_chest_pain", value: rnd(0.6) },
      { feature: "normal_o2",            value: rnd(0.3) }, // adversarial
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "shortness_of_breath",
      requiredFeaturesAnyOf: ["sob"],
      stronglyExpectedFeaturesAnyOf: ["tachycardia", "pleuritic_chest_pain"],
    },
    expectedTopDiagnosis:    "pe",
    expectedDisposition:     "ed",
    minimumSafeDisposition:  "ed",
    redFlagCount:            1,
  }));
}

// ─── ACS (acute coronary syndrome) ────────────────────────────────────────

function generateACS(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `acs_${i}`,
    complaint:   "chest_pain",
    title:       `ACS Case ${i}`,
    observations: [
      { feature: "chest_pain",           value: true },
      { feature: "radiation_left_arm",   value: rnd(0.6) },
      { feature: "diaphoresis",          value: rnd(0.5) },
      { feature: "nausea",               value: rnd(0.4) },
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "chest_pain",
      requiredFeaturesAnyOf: ["chest_pain"],
      stronglyExpectedFeaturesAnyOf: ["radiation_left_arm", "diaphoresis"],
    },
    expectedTopDiagnosis:    "acs",
    expectedDisposition:     "ed",
    minimumSafeDisposition:  "ed",
    redFlagCount:            1,
  }));
}

// ─── Sepsis ────────────────────────────────────────────────────────────────

function generateSepsis(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `sepsis_${i}`,
    complaint:   "fever",
    title:       `Sepsis Case ${i}`,
    observations: [
      { feature: "fever",       value: true },
      { feature: "tachycardia", value: true },
      { feature: "hypotension", value: rnd(0.4) },
      { feature: "altered_ms",  value: rnd(0.3) },
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "fever",
      requiredFeaturesAnyOf: ["fever"],
    },
    expectedTopDiagnosis:    "sepsis",
    expectedDisposition:     "ed",
    minimumSafeDisposition:  "ed",
    redFlagCount:            2,
  }));
}

// ─── Stroke ────────────────────────────────────────────────────────────────

function generateStroke(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `stroke_${i}`,
    complaint:   "neurologic",
    title:       `Stroke Case ${i}`,
    observations: [
      { feature: "facial_droop",     value: rnd(0.7) },
      { feature: "arm_weakness",     value: rnd(0.8) },
      { feature: "speech_difficulty",value: true },
      { feature: "sudden_onset",     value: rnd(0.9) },
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "neurologic",
      requiredFeaturesAnyOf: ["facial_droop", "arm_weakness", "speech_difficulty"],
    },
    expectedTopDiagnosis:    "stroke",
    expectedDisposition:     "call_911",
    minimumSafeDisposition:  "call_911",
    redFlagCount:            2,
  }));
}

// ─── Pediatric fever ───────────────────────────────────────────────────────

function generatePeds(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `peds_${i}`,
    complaint:   "fever",
    title:       `Peds Fever Case ${i}`,
    observations: [
      { feature: "fever",           value: true },
      { feature: "lethargy",        value: rnd(0.5) },
      { feature: "normal_activity", value: rnd(0.4) }, // contradiction
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "fever",
      requiredFeaturesAnyOf: ["fever"],
    },
    expectedDisposition:    "ed",
    minimumSafeDisposition: "ed",
    redFlagCount:           1,
  }));
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Generate 1 000 synthetic cases (200 per domain). */
export function generateFullCaseSet(): GoldenCase[] {
  return [
    ...generatePE(200),
    ...generateACS(200),
    ...generateSepsis(200),
    ...generateStroke(200),
    ...generatePeds(200),
  ];
}

/** Seed pack: 6 hand-crafted canonical cases for CI smoke tests. */
export const seedGoldenCases: GoldenCase[] = [
  {
    id: "pe_seed_1", complaint: "shortness_of_breath", title: "PE classic pleuritic pain",
    observations: [
      { feature: "sob",                  value: true },
      { feature: "pleuritic_chest_pain", value: true },
      { feature: "tachycardia",          value: true },
    ],
    presentationProfile: { complaint: "shortness_of_breath", requiredFeaturesAnyOf: ["sob"] },
    expectedTopDiagnosis: "pe", expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 1,
  },
  {
    id: "acs_seed_1", complaint: "chest_pain", title: "Typical ACS",
    observations: [
      { feature: "chest_pain",         value: true },
      { feature: "radiation_left_arm", value: true },
      { feature: "diaphoresis",        value: true },
    ],
    presentationProfile: { complaint: "chest_pain", requiredFeaturesAnyOf: ["chest_pain"] },
    expectedTopDiagnosis: "acs", expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 1,
  },
  {
    id: "sepsis_seed_1", complaint: "fever", title: "Sepsis pattern",
    observations: [
      { feature: "fever",       value: true },
      { feature: "tachycardia", value: true },
      { feature: "hypotension", value: true },
    ],
    presentationProfile: { complaint: "fever", requiredFeaturesAnyOf: ["fever"] },
    expectedTopDiagnosis: "sepsis", expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 2,
  },
  {
    id: "stroke_seed_1", complaint: "neurologic", title: "Stroke FAST positive",
    observations: [
      { feature: "facial_droop",      value: true },
      { feature: "arm_weakness",      value: true },
      { feature: "speech_difficulty", value: true },
    ],
    presentationProfile: { complaint: "neurologic", requiredFeaturesAnyOf: ["facial_droop", "arm_weakness"] },
    expectedTopDiagnosis: "stroke", expectedDisposition: "call_911", minimumSafeDisposition: "call_911", redFlagCount: 2,
  },
  {
    id: "pna_seed_1", complaint: "cough", title: "Classic pneumonia",
    observations: [
      { feature: "fever", value: true },
      { feature: "cough", value: true },
      { feature: "sob",   value: true },
    ],
    presentationProfile: { complaint: "cough", requiredFeaturesAnyOf: ["cough"] },
    expectedTopDiagnosis: "pneumonia", expectedDisposition: "urgent_care",
  },
  {
    id: "peds_seed_1", complaint: "fever", title: "Pediatric fever lethargy",
    observations: [
      { feature: "fever",   value: true },
      { feature: "lethargy",value: true },
    ],
    presentationProfile: { complaint: "fever", requiredFeaturesAnyOf: ["fever"] },
    expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 1,
  },
];
```

### server/simulation/clinicalScenarioGenerator.ts

```ts
import { scenarioTemplates } from "./scenarioTemplates";
import { generateScenarioVariables, ScenarioVariables } from "./scenarioRandomizer";

export interface ClinicalScenario {
  complaint: string;
  narrative: string;
  variables: ScenarioVariables;
}

export function generateClinicalScenario(complaint: string): ClinicalScenario | null {
  const templates = scenarioTemplates[complaint];
  if (!templates || templates.length === 0) return null;

  const template = templates[Math.floor(Math.random() * templates.length)];
  const vars = generateScenarioVariables();

  let narrative = template;
  Object.entries(vars).forEach(([k, v]) => {
    narrative = narrative.replace(`{${k}}`, String(v));
  });

  return { complaint, narrative, variables: vars };
}

export function generateScenarioBatch(complaint: string, count: number): ClinicalScenario[] {
  const results: ClinicalScenario[] = [];
  const actual = Math.min(count, 100);

  for (let i = 0; i < actual; i++) {
    const scenario = generateClinicalScenario(complaint);
    if (scenario) results.push(scenario);
  }

  return results;
}

export function getAvailableComplaints(): string[] {
  return Object.keys(scenarioTemplates);
}
```

### server/simulation/clinicalTrialSimulator.ts

```ts
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
```

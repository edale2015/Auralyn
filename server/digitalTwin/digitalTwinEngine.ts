/**
 * Digital Twin Engine — forward physiological simulation
 * Simulates patient state over a configurable horizon using physics-inspired drift
 * Outputs: deterioration probability, ICU probability, time-to-event
 */

export interface TwinState {
  hr:   number;
  sbp:  number;
  rr:   number;
  spo2: number;
  temp: number;
}

export interface TwinResult {
  patientId:         string;
  horizonMinutes:    number;
  steps:             number;
  deteriorationProb: number;
  icuProb:           number;
  tteMinutes:        number;        // -1 if no ICU threshold crossed
  trajectory:        Array<{ step: number; state: TwinState }>;
  riskSummary:       "STABLE" | "WATCH" | "DETERIORATING" | "ICU_IMMINENT";
}

export interface TwinPatient {
  id:            string;
  vitals:        { hr: number; spo2: number; temp: number; systolicBP?: number; sbp?: number; rr?: number };
  symptoms?:     string[];
  interventions?: string[];
}

function noise(n: number, magnitude = 2): number {
  return n + (Math.random() - 0.5) * magnitude;
}

function stepDynamics(state: TwinState, inputs: { infection: boolean; fluids: boolean; oxygen: boolean }): TwinState {
  let { hr, sbp, rr, spo2, temp } = state;

  if (inputs.infection) { hr += 2; rr += 1; temp += 0.1; }
  if (inputs.fluids)    { sbp += 3; hr -= 1; }
  if (inputs.oxygen)    { spo2 = Math.min(spo2 + 1, 100); }

  // Hypoxia feedback
  if (spo2 < 92) rr += 1;

  // Autonomic compensation for hypotension
  if (sbp < 90) hr += 3;

  return {
    hr:   noise(hr, 1.5),
    sbp:  noise(sbp, 2),
    rr:   noise(rr, 1),
    spo2: Math.min(100, Math.max(60, noise(spo2, 1))),
    temp: noise(temp, 0.05),
  };
}

function isDeteriorating(s: TwinState): boolean {
  return s.sbp < 90 || s.spo2 < 90 || s.rr > 28;
}

function isICUNeed(s: TwinState): boolean {
  return s.sbp < 85 || s.spo2 < 88 || s.rr > 32 || s.hr > 140;
}

export function runDigitalTwin(patient: TwinPatient, horizonMinutes = 180): TwinResult {
  const symptoms      = patient.symptoms ?? [];
  const interventions = patient.interventions ?? [];

  let state: TwinState = {
    hr:   patient.vitals.hr,
    sbp:  patient.vitals.systolicBP ?? patient.vitals.sbp ?? 120,
    rr:   patient.vitals.rr ?? 16,
    spo2: patient.vitals.spo2,
    temp: patient.vitals.temp,
  };

  const inputs = {
    infection: symptoms.includes("fever") || symptoms.includes("chills"),
    fluids:    interventions.includes("fluids"),
    oxygen:    interventions.includes("oxygen"),
  };

  const STEP_MIN     = 5;
  const steps        = Math.floor(horizonMinutes / STEP_MIN);
  const trajectory: Array<{ step: number; state: TwinState }> = [];

  let detCount     = 0;
  let icuCount     = 0;
  let firstICUStep = -1;

  for (let i = 0; i < steps; i++) {
    state = stepDynamics(state, inputs);
    if (i % 6 === 0) trajectory.push({ step: i, state: { ...state } }); // sample every 30 min

    if (isDeteriorating(state)) detCount++;
    if (isICUNeed(state)) {
      icuCount++;
      if (firstICUStep === -1) firstICUStep = i;
    }
  }

  const deteriorationProb = steps > 0 ? detCount / steps : 0;
  const icuProb           = steps > 0 ? icuCount / steps : 0;
  const tteMinutes        = firstICUStep === -1 ? -1 : firstICUStep * STEP_MIN;

  const riskSummary: TwinResult["riskSummary"] =
    icuProb > 0.6              ? "ICU_IMMINENT" :
    deteriorationProb > 0.4    ? "DETERIORATING" :
    deteriorationProb > 0.1    ? "WATCH" :
    "STABLE";

  return {
    patientId: patient.id,
    horizonMinutes,
    steps,
    deteriorationProb: Math.round(deteriorationProb * 1000) / 1000,
    icuProb:           Math.round(icuProb           * 1000) / 1000,
    tteMinutes,
    trajectory,
    riskSummary,
  };
}

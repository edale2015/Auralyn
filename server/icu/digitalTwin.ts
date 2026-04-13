/**
 * Digital Twin Simulation Engine
 * Projects patient trajectory over N hours using stochastic vitals modeling.
 * Used for "what-if" clinical planning and ICU resource forecasting.
 */

import { computeRisk, type PatientState } from "./predictiveEngine";

export interface VitalSnapshot {
  hour: number;
  hr: number;
  sbp: number;
  spo2: number;
  rr: number;
  temp: number;
  deteriorationScore: number;
  riskLabel: string;
}

export interface TwinSimulation {
  patientId: string;
  hours: number;
  trajectory: VitalSnapshot[];
  peakDeterioration: number;
  predictedOutcome: "STABLE" | "WORSENING" | "CRITICAL_TRANSFER";
  transferHour?: number;
}

/**
 * Simulate patient trajectory using bounded random walk around current vitals.
 * In production, replace with a trained LSTM or Kalman filter model.
 */
export function simulatePatient(patient: PatientState, hours = 6): TwinSimulation {
  const trajectory: VitalSnapshot[] = [];
  let state = {
    ...patient,
    vitals: { ...patient.vitals },
  };

  let peakDeterioration = 0;
  let transferHour: number | undefined;

  for (let h = 0; h < hours; h++) {
    // Stochastic drift — real system would use trained coefficients
    state.vitals.hr   = Math.max(40,  Math.min(200, state.vitals.hr   + (Math.random() - 0.45) * 6));
    state.vitals.sbp  = Math.max(60,  Math.min(200, state.vitals.sbp  - (Math.random() - 0.40) * 4));
    state.vitals.spo2 = Math.max(70,  Math.min(100, state.vitals.spo2 + (Math.random() - 0.55) * 2));
    state.vitals.rr   = Math.max(8,   Math.min(45,  state.vitals.rr   + (Math.random() - 0.45) * 2));
    state.vitals.temp = Math.max(35,  Math.min(41,  state.vitals.temp + (Math.random() - 0.50) * 0.2));

    const risk = computeRisk(state);
    if (risk.deteriorationScore > peakDeterioration) peakDeterioration = risk.deteriorationScore;

    if (risk.riskLabel === "CRITICAL" && !transferHour) {
      transferHour = h;
    }

    trajectory.push({
      hour: h,
      hr: Math.round(state.vitals.hr),
      sbp: Math.round(state.vitals.sbp),
      spo2: Math.round(state.vitals.spo2 * 10) / 10,
      rr: Math.round(state.vitals.rr),
      temp: Math.round(state.vitals.temp * 10) / 10,
      deteriorationScore: Math.round(risk.deteriorationScore * 100) / 100,
      riskLabel: risk.riskLabel,
    });
  }

  let predictedOutcome: TwinSimulation["predictedOutcome"] = "STABLE";
  if (peakDeterioration >= 0.75) predictedOutcome = "CRITICAL_TRANSFER";
  else if (peakDeterioration >= 0.4) predictedOutcome = "WORSENING";

  return {
    patientId: patient.id,
    hours,
    trajectory,
    peakDeterioration: Math.round(peakDeterioration * 100) / 100,
    predictedOutcome,
    transferHour,
  };
}

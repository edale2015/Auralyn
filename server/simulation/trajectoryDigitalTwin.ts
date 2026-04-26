import type { PatientVitals } from "../agents/brainOrchestrator";
import { runDigitalTwin, type SimulationScenario } from "./digitalTwinEngine";

export interface TrajectoryTwinResult {
  scenarios: SimulationScenario[];
  trend: {
    direction: "improving" | "stable" | "worsening";
    deltaRisk: number;
    signals: string[];
  };
  caveat: string;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function latestDelta(prior: PatientVitals[], current: PatientVitals, key: keyof PatientVitals): number {
  const previous = prior.filter(p => typeof p[key] === "number").slice(-1)[0];
  if (!previous) return 0;
  return Number(current[key]) - Number(previous[key]);
}

export function runTrajectoryDigitalTwin(params: {
  current: PatientVitals;
  priorVitals?: PatientVitals[];
  baseRisk: number;
}): TrajectoryTwinResult {
  const prior = params.priorVitals ?? [];
  const signals: string[] = [];
  let deltaRisk = 0;

  const spo2Delta = latestDelta(prior, params.current, "spo2");
  const hrDelta = latestDelta(prior, params.current, "hr");
  const sbpDelta = latestDelta(prior, params.current, "sbp");
  const rrDelta = latestDelta(prior, params.current, "rr");

  if (spo2Delta <= -3) { deltaRisk += 0.12; signals.push(`SpO2 falling ${Math.abs(spo2Delta)} points`); }
  if (hrDelta >= 20) { deltaRisk += 0.08; signals.push(`HR rising ${hrDelta} bpm`); }
  if (sbpDelta <= -20) { deltaRisk += 0.10; signals.push(`SBP falling ${Math.abs(sbpDelta)} mmHg`); }
  if (rrDelta >= 6) { deltaRisk += 0.06; signals.push(`RR rising ${rrDelta}/min`); }

  if (spo2Delta >= 3) { deltaRisk -= 0.06; signals.push(`SpO2 improving ${spo2Delta} points`); }
  if (hrDelta <= -20) { deltaRisk -= 0.04; signals.push(`HR improving ${Math.abs(hrDelta)} bpm`); }
  if (sbpDelta >= 20 && params.current.sbp < 160) { deltaRisk -= 0.04; signals.push(`SBP recovering ${sbpDelta} mmHg`); }

  const adjustedRisk = clamp01(params.baseRisk + deltaRisk);
  const direction = deltaRisk > 0.05 ? "worsening" : deltaRisk < -0.05 ? "improving" : "stable";

  return {
    scenarios: runDigitalTwin({ result: { trajectory: { riskScore: adjustedRisk } } }),
    trend: {
      direction,
      deltaRisk: Math.round(deltaRisk * 1000) / 1000,
      signals: signals.length ? signals : ["No material short-term trend detected"],
    },
    caveat: "Trajectory twin is a decision-support simulation, not a clinically validated deterioration model. Use only with physician review and local validation.",
  };
}

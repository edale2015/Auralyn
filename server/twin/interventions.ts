/**
 * server/twin/interventions.ts
 * Clinical intervention effects on twin state.
 *
 * Each function applies an immediate physiologic delta, then
 * compareScenarios() runs two parallel simulations (baseline vs treated).
 *
 * Intervention magnitudes are approximate; calibrate with outcomes data.
 */

import { type TwinState, simulateTwinV2 } from "./twinV2";

// ── Individual interventions ──────────────────────────────────────────────────

/** IV fluid bolus — raises MAP, reduces lactate. */
export function giveFluids(s: TwinState): TwinState {
  return {
    ...s,
    map:     (s.map     ?? 70) + 5,
    lactate: Math.max(0, (s.lactate ?? 2) - 0.3),
  };
}

/** Supplemental oxygen — raises SpO₂. */
export function giveOxygen(s: TwinState): TwinState {
  return {
    ...s,
    spo2: Math.min(100, (s.spo2 ?? 90) + 4),
  };
}

/** Vasopressors — raises MAP, sets vasopressor flag. */
export function startPressor(s: TwinState): TwinState {
  return {
    ...s,
    vasopressors: true,
    map:          (s.map ?? 65) + 10,
  };
}

/** Mechanical ventilation — sets vent flag, raises SpO₂. */
export function intubate(s: TwinState): TwinState {
  return {
    ...s,
    onVent: true,
    spo2:   Math.min(100, (s.spo2 ?? 82) + 6),
  };
}

// ── Scenario comparison ───────────────────────────────────────────────────────
export interface ScenarioComparison {
  baseline:     TwinState[];
  intervention: TwinState[];
}

/**
 * Runs two 12-step simulations:
 *   baseline     — no intervention from current state
 *   intervention — fluids + oxygen + pressors applied before simulation
 */
export function compareScenarios(initial: TwinState): ScenarioComparison {
  const baseline     = simulateTwinV2(initial);
  const treated      = startPressor(giveFluids(giveOxygen(initial)));
  const intervention = simulateTwinV2(treated);
  return { baseline, intervention };
}

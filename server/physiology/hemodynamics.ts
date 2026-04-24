/**
 * server/physiology/hemodynamics.ts
 * Shock severity composite score [0–1]
 * Based on MAP, lactate, and vasopressor requirement.
 */

export interface Hemodynamics {
  map?:          number;   // mmHg
  lactate?:      number;   // mmol/L
  vasopressors?: boolean;
}

/**
 * Returns a shock score in [0, 1].
 * ≥0.6 → cardiogenic/distributive shock territory.
 * ≥0.9 → refractory shock.
 */
export function shockScore(h: Hemodynamics): number {
  let s = 0;
  if (h.map != null && h.map < 65) s += 0.4;
  if (h.lactate != null && h.lactate >= 2) s += 0.3;
  if (h.vasopressors) s += 0.3;
  return Math.min(1, s);
}

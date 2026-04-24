/**
 * server/physiology/sepsis.ts
 * Tunable logistic-regression sepsis probability model.
 * Current weights are conservative; tune with RLHF governor on outcome data.
 *
 * Returns probability in [0, 1].
 *   < 0.3   → Low risk
 *   0.3–0.6 → Moderate risk — close monitoring
 *   0.6–0.8 → High risk — sepsis likely
 *   > 0.8   → Very high risk — possible septic shock
 */

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface SepsisInputs {
  sofa:     number;
  lactate?: number;   // mmol/L
  map?:     number;   // mmHg
  temp?:    number;   // °F
  hr?:      number;   // bpm
  rr?:      number;   // /min
}

export function sepsisProbability(i: SepsisInputs): number {
  const x =
    0.25  * i.sofa +
    0.80  * (i.lactate ?? 0) +
   -0.05  * (i.map   ?? 70) +
    0.03  * ((i.temp  ?? 98.6) - 98.6) +
    0.01  * (i.hr    ?? 80) +
    0.02  * (i.rr    ?? 16) -
    5.0;

  return Math.max(0, Math.min(1, sigmoid(x)));
}

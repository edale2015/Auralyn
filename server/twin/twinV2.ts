/**
 * server/twin/twinV2.ts
 * Digital Twin V2 — time-series physiologic simulation.
 *
 * Architecture:
 *   stepDynamics()  — stochastic physiology drift (replace with learned model)
 *   enrich()        — re-compute derived scores (SOFA, sepsisProb, shock, resp)
 *   simulateTwinV2() — returns array of enriched states over `steps` time steps
 *
 * Each step represents ~1 hour of clinical time.
 */

import { computeSOFA }       from "../physiology/sofa";
import { shockScore }        from "../physiology/hemodynamics";
import { respRisk }          from "../physiology/respiratory";
import { sepsisProbability } from "../physiology/sepsis";

export interface TwinState {
  t:             number;
  hr?:           number;
  rr?:           number;
  temp?:         number;
  map?:          number;
  spo2?:         number;
  lactate?:      number;
  onVent?:       boolean;
  vasopressors?: boolean;

  labs: {
    platelets?:  number;
    bilirubin?:  number;
    creatinine?: number;
    gcs?:        number;
  };

  sofa?:       number;
  sepsisProb?: number;
  shock?:      number;
  resp?:       number;
}

// ── Stochastic physiology drift ───────────────────────────────────────────────
// Gaussian noise around current values; replace with an outcome-learned model.
function noise(v: number, magnitude: number): number {
  return v + (Math.random() - 0.5) * magnitude;
}

function stepDynamics(s: TwinState): TwinState {
  return {
    ...s,
    t:       s.t + 1,
    hr:      noise(s.hr   ?? 80,   4),
    rr:      noise(s.rr   ?? 16,   2),
    temp:    noise(s.temp  ?? 98.6, 0.2),
    map:     noise(s.map   ?? 75,   3),
    spo2:    noise(s.spo2  ?? 95,   1.5),
    lactate: Math.max(0, noise(s.lactate ?? 1.5, 0.2)),
    labs: {
      ...s.labs,
      creatinine: Math.max(0.5, noise(s.labs.creatinine ?? 1.0, 0.1)),
    },
  };
}

// ── Derived score enrichment ──────────────────────────────────────────────────
function enrich(s: TwinState): TwinState {
  const { total: sofa } = computeSOFA(
    { map: s.map, spo2: s.spo2, onVent: s.onVent, vasopressors: s.vasopressors },
    s.labs,
  );

  const shock = shockScore({
    map:          s.map,
    lactate:      s.lactate,
    vasopressors: s.vasopressors,
  });

  const resp = respRisk(s.spo2, s.onVent);

  const sepsisProb = sepsisProbability({
    sofa,
    lactate: s.lactate,
    map:     s.map,
    temp:    s.temp,
    hr:      s.hr,
    rr:      s.rr,
  });

  return { ...s, sofa, shock, resp, sepsisProb };
}

// ── Main simulation ───────────────────────────────────────────────────────────
export function simulateTwinV2(initial: TwinState, steps = 12): TwinState[] {
  let s  = enrich({ ...initial, t: 0 });
  const out: TwinState[] = [s];

  for (let i = 0; i < steps; i++) {
    s = enrich(stepDynamics(s));
    out.push(s);
  }

  return out;
}

/**
 * patientGenerator.ts — Randomized clinical patient generator
 *
 * Article 28b (Command Center): "generatePatient() — creates a patient with:
 *   age: 1-90
 *   vitals: HR (60-140), RR (12-35), Temp (36-40), SBP (80-180), SpO2 (85-100)
 *   symptoms: random subset of [fever, cough, sob, confusion, chest pain]
 *   labs: lactate (0.5-6), WBC (3-20)"
 *
 * Purpose: fuel the multi-patient simulator, validation harness,
 *  RLHF weight updater, and golden case generator with realistic
 *  synthetic data before real patient data is available.
 *
 * Clinical plausibility:
 *   Parameter ranges cover the full clinical spectrum from healthy to critical.
 *   Lactate > 2 = sepsis marker. SpO2 < 92 = supplemental O2 needed.
 *   SBP < 90 = shock. NEWS2 > 7 = urgent escalation.
 */

import { randomUUID } from "crypto";

export interface PatientVitals {
  hr:   number;   // heart rate bpm (60-140)
  rr:   number;   // respiratory rate breaths/min (12-35)
  temp: number;   // temperature °C (36-40)
  sbp:  number;   // systolic BP mmHg (80-180)
  spo2: number;   // oxygen saturation % (85-100)
}

export interface PatientLabs {
  lactate: number;  // mmol/L (0.5-6)
  wbc:     number;  // × 10⁹/L (3-20)
}

export type Symptom = "fever" | "cough" | "sob" | "confusion" | "chest pain";

export interface SyntheticPatient {
  id:       string;
  age:      number;
  vitals:   PatientVitals;
  symptoms: Symptom[];
  labs:     PatientLabs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

const ALL_SYMPTOMS: Symptom[] = ["fever", "cough", "sob", "confusion", "chest pain"];

function pickSymptoms(): Symptom[] {
  return ALL_SYMPTOMS.filter(() => Math.random() > 0.5);
}

// ── generatePatient ───────────────────────────────────────────────────────────

export function generatePatient(): SyntheticPatient {
  return {
    id:      randomUUID(),
    age:     Math.floor(Math.random() * 90) + 1,
    vitals:  {
      hr:   rand(60,  140),
      rr:   rand(12,  35),
      temp: rand(36,  40),
      sbp:  rand(80,  180),
      spo2: rand(85,  100),
    },
    symptoms: pickSymptoms(),
    labs: {
      lactate: rand(0.5, 6),
      wbc:     rand(3,   20),
    },
  };
}

// ── Cohort generators ─────────────────────────────────────────────────────────

export function generateSepsisCohort(n: number): SyntheticPatient[] {
  return Array.from({ length: n }, () => {
    const p = generatePatient();
    // Skew toward sepsis: elevated lactate, low SBP, high RR
    p.labs.lactate = rand(2.1, 6);
    p.vitals.sbp   = rand(80, 105);
    p.vitals.rr    = rand(22, 35);
    p.symptoms     = [...new Set([...p.symptoms, "fever"])];
    return p;
  });
}

export function generateHealthyCohort(n: number): SyntheticPatient[] {
  return Array.from({ length: n }, () => {
    const p = generatePatient();
    p.labs.lactate = rand(0.5, 1.8);
    p.vitals.sbp   = rand(110, 160);
    p.vitals.rr    = rand(12, 20);
    p.vitals.spo2  = rand(95, 100);
    return p;
  });
}

export function generateMixedCohort(n: number, sepsisRatio = 0.3): SyntheticPatient[] {
  const sepsisCount = Math.round(n * sepsisRatio);
  return [
    ...generateSepsisCohort(sepsisCount),
    ...generateHealthyCohort(n - sepsisCount),
  ].sort(() => Math.random() - 0.5);
}

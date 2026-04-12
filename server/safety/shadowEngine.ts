/**
 * Shadow Safety Engine — Invisible Safety Layer
 * "Not visible, but changes perception" — applies malpractice-protection
 * overrides to the token set before output is generated.
 *
 * Complements the existing safetyGuard.ts / globalSafety.ts in this directory.
 */

import type { ClinicalTokenSet } from "../core/clinicalTokens";

export interface ShadowOverride {
  rule:    string;
  applied: boolean;
  detail?: string;
}

export function applyShadowSafety(tokens: ClinicalTokenSet): ClinicalTokenSet & { shadowOverrides: ShadowOverride[] } {
  const overrides: ShadowOverride[] = [];

  // ── Rule 1: Sepsis detection ──────────────────────────────────────────────
  const sepsisPosterior = tokens.posterior["sepsis"] ?? 0;
  const sepsisModifiers = tokens.modifiers["fever"] && tokens.modifiers["tachycardia"];
  if (sepsisPosterior > 0.2 || sepsisModifiers) {
    tokens.redFlags.push("possible_sepsis");
    tokens.riskLevel            = "critical";
    tokens.requiresPhysicianReview = true;
    overrides.push({ rule: "sepsis_override", applied: true, detail: `Sepsis probability ${(sepsisPosterior * 100).toFixed(0)}% or fever+tachycardia modifiers` });
  } else {
    overrides.push({ rule: "sepsis_override", applied: false });
  }

  // ── Rule 2: Pulmonary Embolism lock ───────────────────────────────────────
  const pePosterior = tokens.posterior["pe"] ?? tokens.posterior["pulmonary_embolism"] ?? 0;
  if (pePosterior > 0.15) {
    tokens.allowedDiagnoses     = ["pulmonary_embolism"];
    tokens.requiresPhysicianReview = true;
    if (!tokens.redFlags.includes("possible_pe")) tokens.redFlags.push("possible_pe");
    overrides.push({ rule: "pe_override", applied: true, detail: `PE probability ${(pePosterior * 100).toFixed(0)}%` });
  } else {
    overrides.push({ rule: "pe_override", applied: false });
  }

  // ── Rule 3: ACS safety floor ──────────────────────────────────────────────
  const acsPosterior = tokens.posterior["acs"] ?? tokens.posterior["mi"] ?? 0;
  if (acsPosterior > 0.30 && !tokens.allowedDiagnoses.includes("acs")) {
    if (tokens.allowedDiagnoses.length > 0) {
      tokens.allowedDiagnoses = ["acs", ...tokens.allowedDiagnoses].slice(0, 2);
    }
    if (!tokens.redFlags.includes("possible_acs")) tokens.redFlags.push("possible_acs");
    overrides.push({ rule: "acs_safety_floor", applied: true, detail: `ACS probability ${(acsPosterior * 100).toFixed(0)}%` });
  } else {
    overrides.push({ rule: "acs_safety_floor", applied: false });
  }

  // ── Rule 4: Hypoxia escalation ────────────────────────────────────────────
  if (tokens.modifiers["hypoxia"] && tokens.riskLevel !== "critical") {
    tokens.riskLevel = "critical";
    tokens.requiresPhysicianReview = true;
    overrides.push({ rule: "hypoxia_escalation", applied: true, detail: "SpO2 < 92% detected" });
  } else {
    overrides.push({ rule: "hypoxia_escalation", applied: false });
  }

  // ── Rule 5: Age-based modifier (> 75) ────────────────────────────────────
  if (tokens.age && tokens.age > 75 && tokens.riskLevel === "low") {
    tokens.riskLevel = "moderate";
    overrides.push({ rule: "elderly_upgrade", applied: true, detail: `Age ${tokens.age} → moderate floor` });
  } else {
    overrides.push({ rule: "elderly_upgrade", applied: false });
  }

  return { ...tokens, shadowOverrides: overrides };
}

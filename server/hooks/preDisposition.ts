/**
 * Pre-Disposition Hook — deterministic safety override before any final decision
 * Red flags always override agent decisions and bump to ER_IMMEDIATE
 * Applied as the LAST step in the pipeline — ensures physician intent is preserved
 */

import { logEvent } from "../ops/auditEvents";

export type DispositionLevel = "ER_IMMEDIATE" | "ICU_ADMIT" | "URGENT_CARE" | "OBSERVE" | "DISCHARGE";

export interface HookInput {
  patientId:    string;
  redFlags?:    string[];
  vitals?:      { hr?: number; spo2?: number; systolicBP?: number; sbp?: number; rr?: number };
  level?:       string;
  disposition?: DispositionLevel | string;
  confidence?:  number;
  reason?:      string;
}

export interface HookResult {
  disposition:     DispositionLevel | string;
  reason:          string;
  overridden:      boolean;
  originalDecision?: string;
  safetyTriggered: boolean;
  appliedHooks:    string[];
}

const RED_FLAG_TERMS = [
  "chest pain", "stroke", "sepsis", "cardiac arrest", "respiratory failure",
  "anaphylaxis", "gi bleed", "suicidal", "altered mental status",
];

export function preDispositionHook(patient: HookInput, decision: Partial<HookInput>): HookResult {
  const appliedHooks: string[] = [];
  let overridden  = false;
  let disposition = decision.disposition ?? "OBSERVE";
  let reason      = decision.reason ?? "Agent decision";

  const redFlags = patient.redFlags ?? [];
  const vitals   = patient.vitals ?? {};
  const sbp      = vitals.systolicBP ?? vitals.sbp ?? 120;
  const spo2     = vitals.spo2 ?? 98;

  // ── Hook 1: Red flag override ────────────────────────────────────────────
  if (redFlags.length > 0) {
    appliedHooks.push("red_flag_override");
    overridden  = true;
    disposition = "ER_IMMEDIATE";
    reason      = `Red flag present: ${redFlags.join(", ")}`;
  }

  // ── Hook 2: Vital sign floor ─────────────────────────────────────────────
  if (sbp < 80 && disposition !== "ER_IMMEDIATE") {
    appliedHooks.push("hypotension_floor");
    overridden  = true;
    disposition = "ER_IMMEDIATE";
    reason      = `Severe hypotension SBP ${sbp} — overrides agent decision`;
  }

  if (spo2 < 88 && !["ER_IMMEDIATE", "ICU_ADMIT"].includes(disposition as string)) {
    appliedHooks.push("hypoxia_floor");
    overridden  = true;
    disposition = "ICU_ADMIT";
    reason      = `Critical hypoxia SpO2 ${spo2}% — escalation required`;
  }

  // ── Hook 3: CRITICAL triage level ────────────────────────────────────────
  if (patient.level === "CRITICAL" && !["ER_IMMEDIATE", "ICU_ADMIT"].includes(disposition as string)) {
    appliedHooks.push("critical_triage_floor");
    overridden  = true;
    disposition = "ICU_ADMIT";
    reason      = "CRITICAL triage level — minimum disposition is ICU admit";
  }

  // ── Hook 4: Low confidence escalation ────────────────────────────────────
  if ((decision.confidence ?? 1) < 0.6 && disposition === "DISCHARGE") {
    appliedHooks.push("low_confidence_escalation");
    overridden  = true;
    disposition = "OBSERVE";
    reason      = `Confidence ${decision.confidence} < 0.6 — cannot discharge without physician review`;
  }

  const result: HookResult = {
    disposition,
    reason,
    overridden,
    originalDecision: overridden ? (decision.disposition ?? "OBSERVE") : undefined,
    safetyTriggered:  appliedHooks.length > 0,
    appliedHooks,
  };

  if (overridden) {
    logEvent({ actor: "pre_disposition_hook", action: "hook:override", entityType: "patient", entityId: patient.patientId, details: result });
  }

  return result;
}

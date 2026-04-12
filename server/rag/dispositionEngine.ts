/**
 * Disposition Engine — converts clinical reasoning into a structured disposition decision
 * Dispositions: HOME | URGENT_CARE | ER | ICU
 * Deterministic rule engine — consistent output for same inputs (FDA requirement)
 */

import type { ClinicalReasoningOutput } from "./clinicalReasoner";
import type { SafetyGateResult }        from "./safetyGate";
import type { RoutingResult }           from "./clinicalQueryRouter";

export type Disposition = "HOME" | "URGENT_CARE" | "ER" | "ICU";

export interface DispositionOutput {
  disposition:  Disposition;
  confidence:   number;
  reason:       string;
  instructions: string[];
  followUp:     string;
  overrideApplied: boolean;
  overrideReason?: string;
}

const URGENCY_MAP: Record<ClinicalReasoningOutput["urgency"], Disposition> = {
  immediate: "ER",
  urgent:    "URGENT_CARE",
  routine:   "HOME",
};

const ESCALATION_INDICATORS = [
  "icu", "intensive care", "intubat", "ventilat", "vasopressor",
  "hemodynamic instab", "shock", "cardiac arrest", "multi-organ",
];

const ER_INDICATORS = [
  "emergency", "immediate", "emergent", "stat", "code", "911",
  "life-threatening", "critical", "stemi", "stroke", "sepsis", "pes",
];

function pickDisposition(reasoning: ClinicalReasoningOutput, route: RoutingResult["route"]): {
  disposition: Disposition; confidence: number; reason: string;
} {
  const combinedText = [
    ...reasoning.nextSteps,
    reasoning.summary,
    ...reasoning.differentialDiagnosis.map((d) => d.diagnosis),
  ].join(" ").toLowerCase();

  // ICU indicators override everything
  if (ESCALATION_INDICATORS.some((i) => combinedText.includes(i))) {
    return { disposition: "ICU", confidence: 0.91, reason: "Clinical reasoning indicates ICU-level care required" };
  }

  // ER indicators or immediate urgency
  if (reasoning.urgency === "immediate" || route === "ACUTE_HIGH_RISK" ||
      ER_INDICATORS.some((i) => combinedText.includes(i))) {
    return { disposition: "ER", confidence: 0.88, reason: "High-acuity query + urgent reasoning — ER evaluation required" };
  }

  const base = URGENCY_MAP[reasoning.urgency];

  // High-likelihood DDx confidence boost
  const highLikelihoodDDx = reasoning.differentialDiagnosis.filter((d) => d.likelihood === "high");
  const confidence = base === "HOME"
    ? Math.min(0.85, 0.65 + (highLikelihoodDDx.length === 0 ? 0.10 : 0))
    : Math.min(0.90, 0.72 + highLikelihoodDDx.length * 0.05);

  return { disposition: base, confidence, reason: `Urgency: ${reasoning.urgency} — routine clinical management appropriate` };
}

function buildInstructions(disposition: Disposition, reasoning: ClinicalReasoningOutput): string[] {
  const base = reasoning.nextSteps.slice(0, 4);

  const additions: Record<Disposition, string[]> = {
    ICU:         ["Transfer to ICU immediately", "Notify intensivist"],
    ER:          ["Go to nearest emergency department now", "Do not drive yourself — call 911 or have someone drive you"],
    URGENT_CARE: ["Seek urgent care within 2-4 hours", "Return to ER if symptoms worsen"],
    HOME:        ["Rest and monitor symptoms", "Return if fever > 103°F, worsening pain, or new symptoms"],
  };

  return [...base, ...additions[disposition]];
}

function followUpText(disposition: Disposition): string {
  const map: Record<Disposition, string> = {
    ICU:         "Continuous monitoring — no follow-up needed until stabilized",
    ER:          "Follow up with primary care within 24-48 hours after ER discharge",
    URGENT_CARE: "Follow up with primary care within 48-72 hours",
    HOME:        "Follow up with primary care within 5-7 days if symptoms persist",
  };
  return map[disposition];
}

export function computeDisposition(
  reasoning:  ClinicalReasoningOutput,
  gateResult: SafetyGateResult,
  route:      RoutingResult
): DispositionOutput {
  // Safety gate override: emergency always → ER minimum
  if (gateResult.decision === "ESCALATE_EMERGENCY") {
    return {
      disposition:     "ER",
      confidence:      0.98,
      reason:          `Safety gate override: ${gateResult.reason}`,
      instructions:    ["Call 911 immediately", ...gateResult.immediateActions, ...reasoning.nextSteps.slice(0, 2)],
      followUp:        followUpText("ER"),
      overrideApplied: true,
      overrideReason:  "Emergency detected before retrieval — safety gate short-circuited pipeline",
    };
  }

  if (gateResult.decision === "ESCALATE_HIGH_RISK") {
    const { disposition, confidence, reason } = pickDisposition(reasoning, route.route);
    const final = disposition === "HOME" ? "URGENT_CARE" : disposition;
    return {
      disposition:     final,
      confidence:      Math.max(confidence, 0.82),
      reason,
      instructions:    buildInstructions(final, reasoning),
      followUp:        followUpText(final),
      overrideApplied: final !== disposition,
      overrideReason:  final !== disposition ? "High-risk gate: HOME upgraded to URGENT_CARE" : undefined,
    };
  }

  const { disposition, confidence, reason } = pickDisposition(reasoning, route.route);

  return {
    disposition,
    confidence,
    reason,
    instructions:    buildInstructions(disposition, reasoning),
    followUp:        followUpText(disposition),
    overrideApplied: false,
  };
}

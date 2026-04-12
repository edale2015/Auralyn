/**
 * Safety Gate — pre-retrieval emergency escalation check
 * Short-circuits the pipeline and returns immediate action if a life-threatening
 * emergency is detected. Never blocks retrieval for false positives.
 *
 * This runs BEFORE any KB lookup so there is zero latency for critical alerts.
 */

import { analyzeSymptomText } from "../triage/symptomTextAnalyzer";

export type GateDecision = "PASS" | "ESCALATE_EMERGENCY" | "ESCALATE_HIGH_RISK";

export interface SafetyGateResult {
  decision:         GateDecision;
  escalated:        boolean;
  immediateActions: string[];
  riskLevel:        string;
  redFlags:         string[];
  reason:           string;
  passedAt:         string;
}

const EMERGENCY_PHRASES: string[] = [
  "cardiac arrest", "not breathing", "no pulse", "cpr", "choking",
  "drowning", "anaphylaxis", "airway blocked", "unconscious", "overdose",
  "active bleeding", "massive hemorrhage", "gunshot", "stab wound",
  "severe allergic reaction", "can't breathe", "cannot breathe",
  "heart stopped",
];

export function runSafetyGate(query: string): SafetyGateResult {
  const lower = query.toLowerCase();

  // Fast path: check explicit emergency phrases first
  const emergencyMatch = EMERGENCY_PHRASES.find((p) => lower.includes(p));

  if (emergencyMatch) {
    return {
      decision:         "ESCALATE_EMERGENCY",
      escalated:        true,
      immediateActions: ["Call 911 immediately", "Begin CPR if trained", "Do not delay — this is a medical emergency"],
      riskLevel:        "CRITICAL",
      redFlags:         [emergencyMatch],
      reason:           `Explicit emergency phrase: "${emergencyMatch}"`,
      passedAt:         new Date().toISOString(),
    };
  }

  // Use symptom text analyzer for co-occurrence based detection
  const analysis = analyzeSymptomText(query);

  if (analysis.riskLevel === "CRITICAL") {
    return {
      decision:         "ESCALATE_EMERGENCY",
      escalated:        true,
      immediateActions: ["Seek emergency care immediately", "Call 911 if life-threatening", "Do not wait — go to ER"],
      riskLevel:        "CRITICAL",
      redFlags:         analysis.redFlags,
      reason:           analysis.reasoning,
      passedAt:         new Date().toISOString(),
    };
  }

  if (analysis.riskLevel === "HIGH") {
    return {
      decision:         "ESCALATE_HIGH_RISK",
      escalated:        true,
      immediateActions: ["Seek urgent medical evaluation", "Go to urgent care or ER", "Do not self-treat"],
      riskLevel:        "HIGH",
      redFlags:         analysis.redFlags,
      reason:           analysis.reasoning,
      passedAt:         new Date().toISOString(),
    };
  }

  return {
    decision:         "PASS",
    escalated:        false,
    immediateActions: [],
    riskLevel:        analysis.riskLevel,
    redFlags:         analysis.redFlags,
    reason:           "No emergency detected — proceeding with retrieval",
    passedAt:         new Date().toISOString(),
  };
}

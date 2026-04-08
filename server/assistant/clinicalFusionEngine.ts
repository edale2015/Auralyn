export type FusionPriority = "routine" | "urgent" | "emergency";

export interface FusionInput {
  differential: Array<{ diagnosis: string; confidence: number; urgency?: string }>;
  safetyAlerts: Array<{ message: string; severity: string }>;
  urgency: { level: string; score: number };
  contradictions: Array<{ diagnosis: string; conflict: string }>;
  debateWinner?: { agentId: string; conclusion: string; confidence: number } | null;
  uncertainty: number;
}

export interface FusionOutput {
  finalPriority: FusionPriority;
  dominantSignal: string;
  reasoningSummary: string;
  conflictsDetected: string[];
  reinforcingSignals: string[];
  overrideApplied: boolean;
}

export function runClinicalFusion(input: FusionInput): FusionOutput {
  const { safetyAlerts, urgency, differential, contradictions, debateWinner, uncertainty } = input;

  const conflicts: string[] = [];
  const reinforcing: string[] = [];

  // ───── 1. SAFETY DOMINATES EVERYTHING ─────────────────────────────────────
  if (safetyAlerts.length > 0) {
    // Cross-check: debate also says emergency?
    if (debateWinner?.conclusion === "emergency" || debateWinner?.agentId === "safety_engine") {
      reinforcing.push("debate_confirms_emergency");
    }
    // Cross-check: differential mentions high-urgency dx?
    const highUrgencyDx = differential.find(d => d.urgency === "emergency" || d.urgency === "critical");
    if (highUrgencyDx) reinforcing.push(`high_urgency_dx:${highUrgencyDx.diagnosis}`);

    return {
      finalPriority: "emergency",
      dominantSignal: "safety_alert",
      reasoningSummary: `Safety alerts present — clinical fusion forces emergency: ${safetyAlerts.slice(0, 2).map(a => a.message).join("; ")}`,
      conflictsDetected: conflicts,
      reinforcingSignals: reinforcing,
      overrideApplied: true,
    };
  }

  // ───── 2. DEBATE WINNER SAYS EMERGENCY (even without formal safety alert) ──
  if (debateWinner?.conclusion === "emergency" && (debateWinner?.confidence ?? 0) >= 0.70) {
    reinforcing.push("agent_debate_emergency_winner");
    return {
      finalPriority: "emergency",
      dominantSignal: "debate_engine",
      reasoningSummary: `Agent debate produced emergency winner (${debateWinner.agentId}, confidence ${(debateWinner.confidence * 100).toFixed(0)}%)`,
      conflictsDetected: conflicts,
      reinforcingSignals: reinforcing,
      overrideApplied: true,
    };
  }

  // ───── 3. CONTRADICTION + HIGH UNCERTAINTY → ESCALATE ────────────────────
  if (contradictions.length > 0 && uncertainty > 0.55) {
    conflicts.push(...contradictions.slice(0, 2).map(c => `${c.diagnosis}: ${c.conflict}`));
    return {
      finalPriority: "urgent",
      dominantSignal: "contradiction_uncertainty",
      reasoningSummary: `${contradictions.length} clinical contradiction(s) with high uncertainty (${(uncertainty * 100).toFixed(0)}%) — escalated to urgent`,
      conflictsDetected: conflicts,
      reinforcingSignals: reinforcing,
      overrideApplied: false,
    };
  }

  // ───── 4. URGENCY SCORE ───────────────────────────────────────────────────
  if (urgency.level === "urgent" || urgency.level === "emergency" || urgency.level === "critical" || urgency.score >= 0.60) {
    if (differential.length > 0 && differential[0].confidence > 0.55) {
      reinforcing.push(`differential_supports:${differential[0].diagnosis}`);
    }
    if (debateWinner?.conclusion === "urgent") reinforcing.push("debate_confirms_urgent");
    return {
      finalPriority: "urgent",
      dominantSignal: "urgency_score",
      reasoningSummary: `High urgency score (${(urgency.score * 100).toFixed(0)}%) — level: ${urgency.level}`,
      conflictsDetected: conflicts,
      reinforcingSignals: reinforcing,
      overrideApplied: false,
    };
  }

  // ───── 5. CONFLICT: low urgency but high uncertainty ─────────────────────
  if (urgency.score < 0.40 && uncertainty > 0.55) {
    conflicts.push(`low_urgency(${(urgency.score * 100).toFixed(0)}%) + high_uncertainty(${(uncertainty * 100).toFixed(0)}%) mismatch`);
  }

  // ───── 6. DIFFERENTIAL-DRIVEN ─────────────────────────────────────────────
  const topDx = differential[0]?.diagnosis ?? "unknown";
  if (differential.length > 0 && differential[0].confidence > 0.65) {
    reinforcing.push(`strong_differential:${topDx}`);
  }

  return {
    finalPriority: "routine",
    dominantSignal: "differential",
    reasoningSummary: `Routine — top differential: ${topDx} (${differential.length > 0 ? (differential[0].confidence * 100).toFixed(0) + "% confidence" : "no differential"})`,
    conflictsDetected: conflicts,
    reinforcingSignals: reinforcing,
    overrideApplied: false,
  };
}

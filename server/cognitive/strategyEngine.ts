import type { ClinicalMonologue } from "./monologueEngine";
import type { DebateCouncilResult } from "./debateCouncil";

export type ClinicalStrategy = "rule_out" | "reassure" | "escalate" | "observe" | "admit";

export function selectStrategy(
  monologue: ClinicalMonologue,
  debate:    DebateCouncilResult
): ClinicalStrategy {
  // Hard escalation gates
  if (monologue.uncertainty_level > 0.7)    return "rule_out";
  if (debate.disagreementScore > 0.5)       return "escalate";
  if (monologue.dangerous_misses.length > 2) return "rule_out";

  // Use the monologue's own recommendation if below escalation threshold
  const rec = monologue.recommended_strategy;
  if (rec === "rule_out" || rec === "escalate") return rec;

  // High-confidence consensus → reassure
  if (debate.confidence > 0.8 && monologue.uncertainty_level < 0.3) return "reassure";

  return rec === "observe" ? "observe" : "observe";
}

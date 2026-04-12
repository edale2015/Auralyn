import type { ClinicalMonologue } from "./monologueEngine";
import type { DebateCouncilResult } from "./debateCouncil";

export interface SafePlan {
  final_diagnosis:   string;
  suppressedActions: string[];
  biasCorrections:   string[];
}

export function applyBiasGuards({
  plan,
  monologue,
}: {
  plan:      DebateCouncilResult;
  monologue: ClinicalMonologue;
}): SafePlan {
  const suppressedActions: string[] = [];
  const biasCorrections:   string[] = [];
  let diagnosis = plan.final_diagnosis;

  // Over-treatment suppression
  if (monologue.bias_flags.includes("over-treatment")) {
    suppressedActions.push("antibiotics_removed_pending_culture");
    biasCorrections.push("antibiotic_stewardship_applied");
  }

  // Anchoring bias
  if (monologue.bias_flags.includes("anchoring_single_symptom")) {
    biasCorrections.push("broadened_differential_using_graph");
  }

  // Premature closure guard — if disagreement is high, flag it
  if (plan.disagreementScore > 0.4) {
    biasCorrections.push("premature_closure_flag_applied");
  }

  // Availability bias: if PE/ACS not in differential but symptoms suggest it
  const missedHigh = plan.graphCandidates.filter((c) =>
    (c.disease === "PE" || c.disease === "ACS") &&
    !plan.opinions.some((o) => o.diagnosis.includes(c.disease))
  );
  if (missedHigh.length > 0) {
    biasCorrections.push(`availability_bias_corrected:${missedHigh.map((m) => m.disease).join(",")}`);
  }

  return { final_diagnosis: diagnosis, suppressedActions, biasCorrections };
}

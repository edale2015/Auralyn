import { SkillContext } from "../skills/shared/skillTypes";

export type ChartNoteBlock = {
  hpi: string;
  assessment: string;
  plan: string[];
  redFlags: string[];
  disposition: string;
};

export function buildChartNoteBlock(context: SkillContext): ChartNoteBlock {
  const normalized = context.priorSkillOutputs?.normalize_patient_story?.result ?? {};
  const differential = context.priorSkillOutputs?.generate_differential?.result ?? {};
  const assessmentPlan = context.priorSkillOutputs?.generate_assessment_plan?.result ?? {};
  const redFlags = context.priorSkillOutputs?.detect_red_flags?.result?.red_flag_hits ?? [];
  const disposition =
    context.priorSkillOutputs?.determine_disposition?.result?.disposition ?? "unknown";

  const affirmed = normalized.associated_symptoms ?? [];
  const negated = normalized.negated_symptoms ?? [];

  const hpi = [
    context.rawText ? `Patient reports: ${context.rawText}` : "",
    affirmed.length ? `Affirmed: ${affirmed.join(", ")}` : "",
    negated.length ? `Negated: ${negated.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const assessment =
    assessmentPlan.assessment ||
    `Top differential: ${(differential.differential_list ?? [])
      .slice(0, 3)
      .map((d: any) => d.diagnosis)
      .join(", ")}`;

  return {
    hpi,
    assessment,
    plan: assessmentPlan.plan ?? [],
    redFlags: redFlags.map((r: any) => r.label ?? r.id ?? String(r)),
    disposition,
  };
}

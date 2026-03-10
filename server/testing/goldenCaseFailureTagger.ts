export type FailureTag =
  | "wrong_complaint"
  | "wrong_disposition"
  | "wrong_score"
  | "missed_red_flag"
  | "wrong_differential"
  | "missed_affirmed_symptom"
  | "missed_negated_symptom"
  | "other";

export function tagFailures(failures: string[]): FailureTag[] {
  const tags = new Set<FailureTag>();

  for (const failure of failures) {
    const f = failure.toLowerCase();

    if (f.includes("complaint_id")) {
      tags.add("wrong_complaint");
    } else if (f.includes("disposition")) {
      tags.add("wrong_disposition");
    } else if (f.includes("clinical_score")) {
      tags.add("wrong_score");
    } else if (f.includes("red_flag_hits")) {
      tags.add("missed_red_flag");
    } else if (f.includes("top_differential")) {
      tags.add("wrong_differential");
    } else if (f.includes("affirmed_symptoms")) {
      tags.add("missed_affirmed_symptom");
    } else if (f.includes("negated_symptoms")) {
      tags.add("missed_negated_symptom");
    } else {
      tags.add("other");
    }
  }

  return [...tags];
}

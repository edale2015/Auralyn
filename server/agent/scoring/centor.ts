import type { CaseState } from "../../../shared/agentTypes";

type Tri = "yes" | "no" | "not_sure";

function tri(v: unknown): Tri | null {
  if (v === "yes" || v === "no" || v === "not_sure") return v;
  return null;
}

export function computeCentor(state: CaseState): { centor: number; inputsUsed: string[] } {
  const a = state.answers;

  const fever = tri(a["Q_FEVER"]);
  const cough = tri(a["Q_COUGH"]);
  const exudate = tri(a["Q_TONSILLAR_EXUDATE"]);
  const nodes = tri(a["Q_TENDER_ANT_CERV_NODES"]);

  let score = 0;
  const used = ["Q_FEVER", "Q_COUGH", "Q_TONSILLAR_EXUDATE", "Q_TENDER_ANT_CERV_NODES"];

  if (fever === "yes") score += 1;
  if (cough === "no") score += 1;
  if (exudate === "yes") score += 1;
  if (nodes === "yes") score += 1;

  const age = state.demographics?.age;
  if (typeof age === "number") {
    if (age >= 3 && age <= 14) score += 1;
    else if (age >= 45) score -= 1;
  }

  return { centor: Math.max(0, score), inputsUsed: used };
}

export const CENTOR_REQUIRED_QS = [
  "Q_FEVER",
  "Q_COUGH",
  "Q_TONSILLAR_EXUDATE",
  "Q_TENDER_ANT_CERV_NODES",
] as const;

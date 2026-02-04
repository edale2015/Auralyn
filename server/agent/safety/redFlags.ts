import type { CaseState } from "../../../shared/agentTypes";

export function detectRedFlags(state: CaseState): string[] {
  const a = state.answers;
  const flags: string[] = [];

  if (a["Q_SHORTNESS_OF_BREATH"] === "yes") flags.push("RF_SOB");
  if (a["Q_CHEST_PAIN"] === "yes") flags.push("RF_CHEST_PAIN");
  if (a["Q_STRIDOR"] === "yes") flags.push("RF_STRIDOR");
  if (a["Q_UNABLE_TO_SWALLOW_SALIVA"] === "yes") flags.push("RF_DROOLING");

  return flags;
}

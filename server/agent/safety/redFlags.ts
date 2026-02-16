import type { CaseState } from "../../../shared/agentTypes";

export function detectRedFlags(state: CaseState): string[] {
  const a = state.answers;
  const flags: string[] = [];

  if (a["Q_SHORTNESS_OF_BREATH"] === "yes") flags.push("RF_SOB");
  if (a["Q_CHEST_PAIN"] === "yes") flags.push("RF_CHEST_PAIN");
  if (a["Q_STRIDOR"] === "yes") flags.push("RF_STRIDOR");
  if (a["Q_UNABLE_TO_SWALLOW_SALIVA"] === "yes") flags.push("RF_DROOLING");

  if (a["Q_HTN_NEURO_DEFICIT"] === "yes") flags.push("RF_HTN_EMERGENCY_NEURO");
  if (a["Q_HTN_VISION_LOSS"] === "yes") flags.push("RF_HTN_EMERGENCY_VISION");
  if (a["Q_HTN_SEVERE_HEADACHE"] === "yes" && a["Q_CHEST_PAIN"] === "yes") flags.push("RF_HTN_EMERGENCY_MULTI");
  if (a["Q_HTN_PREGNANCY_SEVERE"] === "yes") flags.push("RF_HTN_PREGNANCY_EMERGENCY");

  if (a["Q_DM_ALTERED_MENTAL_STATUS"] === "yes") flags.push("RF_DKA_HHS");
  if (a["Q_DM_PERSISTENT_VOMITING"] === "yes" && a["Q_DM_DEHYDRATION"] === "yes") flags.push("RF_DKA_HHS");
  if (a["Q_DM_KUSSMAUL"] === "yes") flags.push("RF_DKA_HHS");
  if (a["Q_DM_SEVERE_HYPO"] === "yes") flags.push("RF_SEVERE_HYPOGLYCEMIA");

  if (state.htn?.endOrganSymptoms && state.htn.endOrganSymptoms.length > 0) {
    const critical = ["neuro_deficit", "vision_loss", "pulmonary_edema", "aortic_dissection"];
    if (state.htn.endOrganSymptoms.some(s => critical.includes(s))) {
      flags.push("RF_HTN_EMERGENCY");
    }
  }

  if (state.dm?.ketoneRisk && a["Q_DM_FRUITY_BREATH"] === "yes") {
    flags.push("RF_DKA_HHS");
  }

  return [...new Set(flags)];
}

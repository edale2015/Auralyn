export type FlowSpec = {
  system: string;
  flowId: string;
  chiefComplaint: string;
  redFlagYesQuestionIds: string[];
  tags?: string[];
};

export const FLOW_SPECS: FlowSpec[] = [
  { system: "CARDIO", flowId: "CARDIO_CHEST_PAIN_V1", chiefComplaint: "CHEST_PAIN", redFlagYesQuestionIds: ["CARD_CP_03", "CARD_CP_06", "CARD_CP_13"] },
  { system: "CARDIO", flowId: "CARDIO_PALPITATIONS_V1", chiefComplaint: "PALPITATIONS", redFlagYesQuestionIds: ["CARD_PALP_03", "CARD_PALP_06"] },
  { system: "CARDIO", flowId: "CARDIO_SYNCOPE_V1", chiefComplaint: "SYNCOPE", redFlagYesQuestionIds: ["CARD_SYNC_02", "CARD_SYNC_05"] },
  { system: "UROGYN", flowId: "UROGYN_TESTICULAR_PAIN_V1", chiefComplaint: "TESTICULAR_PAIN", redFlagYesQuestionIds: ["URO_TEST_01"], tags: ["torsion"] },
  { system: "UROGYN", flowId: "UROGYN_VAGINAL_BLEEDING_V1", chiefComplaint: "VAGINAL_BLEEDING", redFlagYesQuestionIds: ["URO_VB_01", "URO_VB_02"], tags: ["pregnancy"] },
  { system: "EMERG", flowId: "EMERG_CRITICAL_V1", chiefComplaint: "CRITICAL_EMERGENCY", redFlagYesQuestionIds: ["EMERG_01", "EMERG_02", "EMERG_04"], tags: ["hard_stop"] },
  { system: "TRAUMA", flowId: "TRAUMA_MAJOR_V1", chiefComplaint: "MAJOR_TRAUMA", redFlagYesQuestionIds: ["TRM_02", "TRM_09", "TRM_17"], tags: ["major_trauma"] },
  { system: "OPHTH", flowId: "OPHTH_VISION_LOSS_V1", chiefComplaint: "VISION_LOSS", redFlagYesQuestionIds: ["OPHTH_VL_01", "OPHTH_VL_02"] },
  { system: "NEURO", flowId: "NEURO_WEAKNESS_V1", chiefComplaint: "WEAKNESS", redFlagYesQuestionIds: ["NEURO_WEAK_01", "NEURO_WEAK_03"], tags: ["stroke"] },
  { system: "ENT", flowId: "ENT_FLU_LIKE_V1", chiefComplaint: "FLU_SYMPTOMS", redFlagYesQuestionIds: ["ENT_FLU_RF_01", "ENT_FLU_RF_02"] },
  { system: "DERM", flowId: "DERM_BURNS_V1", chiefComplaint: "BURNS", redFlagYesQuestionIds: ["DERM_BURN_01", "DERM_BURN_02"] },
];

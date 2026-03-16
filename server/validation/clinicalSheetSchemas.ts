export const requiredSheetSchemas: Record<string, string[]> = {
  COMPLAINT_REGISTRY: [
    "CC_ID",
    "CC_LABEL",
    "ENABLED",
    "SYSTEM",
    "GRAPH_ID",
    "CORE_QUESTIONS_VERSION",
    "RED_FLAG_SET_ID",
    "SCORING_ID",
    "DISPOSITION_SET_ID",
    "OUTPUT_TEMPLATE_SET_ID",
  ],
  CORE_QUESTIONS: [
    "CC_ID",
    "VERSION",
    "ORDER",
    "QUESTION_ID",
    "QUESTION_TEXT",
    "ANSWER_TYPE",
    "REQUIRED",
    "MAPS_TO_FIELD",
  ],
  DISPOSITION_RULES: [
    "DISP_SET_ID",
    "DISP_RULE_ID",
    "CC_ID",
    "PRIORITY",
    "WHEN_EXPR",
    "DISPOSITION_LEVEL",
    "RATIONALE_TEMPLATE_ID",
    "CONFIDENCE_HINT",
  ],
  CLUSTER_SCORING_RULES: [
    "CC_ID",
    "VERSION",
    "CLUSTER_ID",
    "POINTS",
    "WHEN_EXPR",
    "EVIDENCE_FIELDS",
  ],
  RED_FLAG_RULES: [
    "CC_ID",
    "VERSION",
    "RULE_ID",
    "PRIORITY",
    "WHEN_EXPR",
  ],
  OUTPUT_TEMPLATES: [
    "TEMPLATE_ID",
    "TEMPLATE_TYPE",
    "TITLE",
    "BODY",
  ],
  GLOBAL_SECONDARY: [
    "System",
    "Chief_Complaint",
    "Cluster",
    "Diagnosis_ID",
    "Question_ID",
    "Question_Text",
    "Question_Type",
    "Ask_Order",
    "Bundle_ID",
  ],
};

export const requiredSheets = Object.keys(requiredSheetSchemas);

export const allowedDispositionLevels = new Set([
  "SELF_CARE",
  "SELF_CARE_OK",
  "PRIMARY_CARE",
  "URGENT_CARE",
  "URGENT_CARE_TODAY",
  "ED_NOW",
  "ER_NOW",
  "CALL_911",
]);

export const allowedAnswerTypes = new Set([
  "boolean",
  "yesno",
  "choice",
  "multiple",
  "number",
  "text",
  "scale",
  "date",
]);

export const allowedConfidenceHints = new Set([
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERY_HIGH",
]);

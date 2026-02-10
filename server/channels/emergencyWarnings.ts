export interface EmergencyWarningTemplate {
  id: string;
  version: string;
  flowId: string;
  text: string;
  severity: "critical" | "high" | "moderate";
  ruleRef: string;
}

const EMERGENCY_WARNINGS: EmergencyWarningTemplate[] = [
  {
    id: "EMERG_WARN_CRITICAL",
    version: "v3",
    flowId: "EMERG_CRITICAL_V1",
    text: "This may be an emergency. If someone is unresponsive, not breathing, or bleeding heavily, call 911 now.",
    severity: "critical",
    ruleRef: "EMERG_CRITICAL_RULE_001",
  },
  {
    id: "EMERG_WARN_TRAUMA",
    version: "v3",
    flowId: "TRAUMA_MAJOR_V1",
    text: "This may require urgent emergency evaluation. If severe pain, head injury, bleeding, or confusion, go to the ER now.",
    severity: "critical",
    ruleRef: "TRAUMA_MAJOR_RULE_001",
  },
  {
    id: "EMERG_WARN_VAGINAL_BLEED",
    version: "v3",
    flowId: "UROGYN_VAGINAL_BLEEDING_V1",
    text: "If you may be pregnant and have bleeding with pain, dizziness, or heavy bleeding, go to the ER now.",
    severity: "high",
    ruleRef: "UROGYN_VAGBLEED_RULE_001",
  },
  {
    id: "EMERG_WARN_TESTICULAR",
    version: "v3",
    flowId: "UROGYN_TESTICULAR_PAIN_V1",
    text: "Sudden severe testicular pain can be an emergency (torsion). If severe/sudden, go to the ER now.",
    severity: "high",
    ruleRef: "UROGYN_TESTPAIN_RULE_001",
  },
  {
    id: "EMERG_WARN_VISION_LOSS",
    version: "v3",
    flowId: "OPHTH_VISION_LOSS_V1",
    text: "Sudden vision loss can be an emergency. If sudden or worsening, go to the ER now.",
    severity: "high",
    ruleRef: "OPHTH_VISION_RULE_001",
  },
  {
    id: "EMERG_WARN_NEURO_WEAKNESS",
    version: "v3",
    flowId: "NEURO_WEAKNESS_V1",
    text: "New weakness, facial droop, or trouble speaking can be a stroke. Call 911 or go to the ER now.",
    severity: "critical",
    ruleRef: "NEURO_STROKE_RULE_001",
  },
];

const warningsByFlowId = new Map<string, EmergencyWarningTemplate>();
for (const w of EMERGENCY_WARNINGS) {
  warningsByFlowId.set(w.flowId, w);
}

export function getEmergencyWarning(flowId: string): EmergencyWarningTemplate | null {
  return warningsByFlowId.get(flowId) ?? null;
}

export function getAllEmergencyWarnings(): EmergencyWarningTemplate[] {
  return [...EMERGENCY_WARNINGS];
}

export interface EmergencyWarningLogEntry {
  templateId: string;
  templateVersion: string;
  flowId: string;
  ruleRef: string;
  severity: string;
  conversationId: string;
  timestamp: string;
}

export function buildWarningLogEntry(
  template: EmergencyWarningTemplate,
  conversationId: string,
): EmergencyWarningLogEntry {
  return {
    templateId: template.id,
    templateVersion: template.version,
    flowId: template.flowId,
    ruleRef: template.ruleRef,
    severity: template.severity,
    conversationId,
    timestamp: new Date().toISOString(),
  };
}

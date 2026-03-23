export interface ClinicalAction {
  type: string;
  riskScore: number;
  requiresConsent?: boolean;
  invasive?: boolean;
  toolRequired?: string;
  patientId?: string;
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  requiresPhysicianOverride?: boolean;
  warnings?: string[];
}

const HIGH_RISK_THRESHOLD = 0.7;
const MODERATE_RISK_THRESHOLD = 0.4;

const INVASIVE_ACTIONS = new Set([
  "otoscopy",
  "oral_exam",
  "swab",
  "ekg_lead_placement",
  "auscultation",
  "blood_draw",
]);

export function clinicalSafetyCheck(action: ClinicalAction): GuardrailResult {
  const warnings: string[] = [];

  if (action.riskScore > HIGH_RISK_THRESHOLD) {
    return {
      allowed: false,
      reason: `Risk score ${action.riskScore.toFixed(2)} exceeds threshold ${HIGH_RISK_THRESHOLD}`,
      requiresPhysicianOverride: true,
      warnings,
    };
  }

  if (action.invasive && !action.requiresConsent) {
    return {
      allowed: false,
      reason: "Invasive action requires documented patient consent",
      requiresPhysicianOverride: false,
      warnings,
    };
  }

  if (INVASIVE_ACTIONS.has(action.type) && !action.toolRequired) {
    warnings.push(`Action type '${action.type}' should specify required tool`);
  }

  if (action.riskScore > MODERATE_RISK_THRESHOLD) {
    warnings.push(`Moderate risk score ${action.riskScore.toFixed(2)} — clinician oversight recommended`);
  }

  if (!action.patientId) {
    warnings.push("No patient ID attached to action — ensure traceability");
  }

  return { allowed: true, warnings };
}

export function batchGuardrailCheck(actions: ClinicalAction[]): {
  passed: ClinicalAction[];
  blocked: Array<{ action: ClinicalAction; result: GuardrailResult }>;
} {
  const passed: ClinicalAction[] = [];
  const blocked: Array<{ action: ClinicalAction; result: GuardrailResult }> = [];

  for (const action of actions) {
    const result = clinicalSafetyCheck(action);
    if (result.allowed) passed.push(action);
    else blocked.push({ action, result });
  }

  return { passed, blocked };
}

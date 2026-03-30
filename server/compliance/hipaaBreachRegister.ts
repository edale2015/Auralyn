/**
 * MY ADDITION — DOMAIN 2: HIPAA Breach Risk Register
 *
 * Implements SUMMARY DELIVERABLE C from the Claude 7-Domain Review:
 * a live risk register of identified HIPAA breach exposure pathways,
 * each with a risk level, the triggering condition, and mitigation status.
 *
 * This register is surfaced at GET /api/compliance/breach-register and
 * reviewed by the HIPAA Security Officer. It also provides audit evidence
 * that the organization actively identifies and manages breach risks
 * (45 CFR §164.308(a)(1) — Risk Analysis requirement).
 */

export type BreachRiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type MitigationStatus = "IMPLEMENTED" | "IN_PROGRESS" | "PLANNED" | "ACCEPTED";

export interface BreachRiskEntry {
  id:                  string;
  title:               string;
  hipaaSection:        string;    // e.g., "45 CFR §164.312(b)"
  fdaImpact:           string;
  triggerCondition:    string;
  riskLevel:           BreachRiskLevel;
  mitigationStatus:    MitigationStatus;
  mitigationNotes:     string;
  implementedControls: string[];  // which files/systems implement the mitigation
  lastReviewedAt?:     string;
}

export const BREACH_RISK_REGISTER: BreachRiskEntry[] = [
  {
    id: "BR-001",
    title: "Corrupted Intake Misclassification — Safety Veto Blind Spot",
    hipaaSection: "45 CFR §164.400 (Breach Notification Rule)",
    fdaImpact: "Class II → Class III SaMD if no independent safety path",
    triggerCondition: "LLM corrupts/misclassifies chest pain as musculoskeletal; all 3 agents debate on bad data; missed ER_NOW causes patient harm; legal discovery of case record exposes PHI",
    riskLevel: "CRITICAL",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "Independent safety path in server/safety/independentSafetyPath.ts evaluates raw text independently of LLM pipeline. Contradiction detector flags upstream corruption.",
    implementedControls: ["server/safety/independentSafetyPath.ts", "server/safety/hardStopRules.ts"],
  },
  {
    id: "BR-002",
    title: "Missed Testicular Torsion / Pediatric Epiglottitis",
    hipaaSection: "45 CFR §164.400 — decision log discovery during litigation",
    fdaImpact: "Class III exposure without hard-stop bypass",
    triggerCondition: "Life-threatening condition debated rather than hard-stopped; patient harm; full platform decision logs exposed in legal discovery",
    riskLevel: "CRITICAL",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "10 absolute hard-stop rules bypass debate engine entirely. Pediatric SIRS screening with age-stratified thresholds.",
    implementedControls: ["server/safety/hardStopRules.ts", "server/safety/pediatricSafetyRules.ts"],
  },
  {
    id: "BR-003",
    title: "Immutable Audit Trail — Missing Verification",
    hipaaSection: "45 CFR §164.312(b) — Audit Controls",
    fdaImpact: "Cannot demonstrate tamper-free record to FDA auditors",
    triggerCondition: "OCR audit finds no audit chain verification capability — write-only hash chain without read-verification fails §164.312(b). Tier 3 OCR penalty: $10K–$50K per violation.",
    riskLevel: "CRITICAL",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "auditVerifier.ts implements full chain verification + Merkle batch verification. Exposed at GET /api/compliance/audit-verify.",
    implementedControls: ["server/audit/auditVerifier.ts"],
  },
  {
    id: "BR-004",
    title: "Autonomous Policy Evolution — Unapproved Device Modification",
    hipaaSection: "FDA PCCP Framework (2023 Marketing Submission Recommendations)",
    fdaImpact: "Every autonomous policy update = unapproved device modification",
    triggerCondition: "RLHF promotes policy without human review gate. Constitutes autonomous adaptation of clinical algorithm under FDA's PCCP framework.",
    riskLevel: "HIGH",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "policyProposalGate.ts enforces human-gated policy promotion. Drift-locked check prevents proposals during active drift.",
    implementedControls: ["server/compliance/policyProposalGate.ts"],
  },
  {
    id: "BR-005",
    title: "ER_NOW Delivery Without Physician Pre-Approval",
    hipaaSection: "FDA SaMD Class III exposure",
    fdaImpact: "Autonomous disposition delivery → PMA required (not 510k)",
    triggerCondition: "ER_NOW or ER_URGENT disposition delivered to patient without physician review; system operating as autonomous diagnostic device",
    riskLevel: "CRITICAL",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "physicianCheckpoint.ts creates approval record for all ER_NOW, ER_URGENT, URGENT_CARE. 10-minute timeout auto-escalates and pages on-call.",
    implementedControls: ["server/compliance/physicianCheckpoint.ts"],
  },
  {
    id: "BR-006",
    title: "Google Sheets as Clinical Rule Store",
    hipaaSection: "45 CFR §164.308(b) — Business Associate Agreement",
    fdaImpact: "No SLA, no HIPAA BAA by default, no transactional consistency",
    triggerCondition: "Unauthorized Google account holder accesses symptom patterns / disposition thresholds; Google infrastructure compromise exposes PHI-adjacent data",
    riskLevel: "HIGH",
    mitigationStatus: "PLANNED",
    mitigationNotes: "Recommended migration: Sheets as editor UI only, rules stored in PostgreSQL with version history and staged promotion. Requires HIPAA BAA from Google or full migration.",
    implementedControls: [],
  },
  {
    id: "BR-007",
    title: "Demographic Undertriage Bias — ACA Section 1557",
    hipaaSection: "ACA §1557 — Nondiscrimination in Health Programs",
    fdaImpact: "OCR actionable for algorithmic bias causing disparate health outcomes",
    triggerCondition: "Learning loop drifts to systematically undertriage a demographic group (e.g., women with chest pain). HIPAA civil rights exposure + state mandatory reporting.",
    riskLevel: "HIGH",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "demographicDriftMonitor.ts tracks per-group ER_NOW rates. DEMOGRAPHIC_PARITY_DELTA SLO triggers alert at >5% disparity.",
    implementedControls: ["server/learning/demographicDriftMonitor.ts", "server/observability/clinicalSLOs.ts"],
  },
];

let riskRegisterLastUpdated = new Date().toISOString();

export function getBreachRiskRegister(): {
  register: BreachRiskEntry[];
  summary: { critical: number; high: number; medium: number; low: number; implemented: number; pending: number };
  lastUpdated: string;
} {
  const summary = {
    critical:    BREACH_RISK_REGISTER.filter(r => r.riskLevel === "CRITICAL").length,
    high:        BREACH_RISK_REGISTER.filter(r => r.riskLevel === "HIGH").length,
    medium:      BREACH_RISK_REGISTER.filter(r => r.riskLevel === "MEDIUM").length,
    low:         BREACH_RISK_REGISTER.filter(r => r.riskLevel === "LOW").length,
    implemented: BREACH_RISK_REGISTER.filter(r => r.mitigationStatus === "IMPLEMENTED").length,
    pending:     BREACH_RISK_REGISTER.filter(r => r.mitigationStatus !== "IMPLEMENTED").length,
  };
  return { register: BREACH_RISK_REGISTER, summary, lastUpdated: riskRegisterLastUpdated };
}

export function updateMitigationStatus(
  id: string,
  status: MitigationStatus,
  notes?: string
): boolean {
  const entry = BREACH_RISK_REGISTER.find(r => r.id === id);
  if (!entry) return false;
  entry.mitigationStatus = status;
  if (notes) entry.mitigationNotes = notes;
  entry.lastReviewedAt = new Date().toISOString();
  riskRegisterLastUpdated = new Date().toISOString();
  return true;
}

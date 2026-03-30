/**
 * HIPAA Breach Risk Register
 *
 * Live register of identified HIPAA breach exposure pathways.
 * Satisfies 45 CFR §164.308(a)(1) Risk Analysis requirement.
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - BR-008: WhatsApp/Telegram PHI in unencrypted application logs
 *   - BR-009: RLHF training data containing identifiable symptom patterns
 */

export type BreachRiskLevel  = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type MitigationStatus = "IMPLEMENTED" | "IN_PROGRESS" | "PLANNED" | "ACCEPTED";

export interface BreachRiskEntry {
  id:                  string;
  title:               string;
  hipaaSection:        string;
  fdaImpact:           string;
  triggerCondition:    string;
  riskLevel:           BreachRiskLevel;
  mitigationStatus:    MitigationStatus;
  mitigationNotes:     string;
  implementedControls: string[];
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
    mitigationNotes: "15 absolute hard-stop rules bypass debate engine entirely (expanded from 10 in Round 2 to include HS-011–015: aortic dissection, elderly sepsis, PTA, CO poisoning, meningitis). Pediatric SIRS screening with age-stratified thresholds.",
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
    mitigationNotes: "auditVerifier.ts implements full chain verification + Merkle batch verification. Scheduled nightly batch + weekly full chain verification added in Round 2 per OCR requirement (evidence of regular integrity checking).",
    implementedControls: ["server/audit/auditVerifier.ts", "server/audit/scheduledAuditVerifier.ts"],
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
    mitigationNotes: "physicianCheckpoint.ts creates approval record for all ER_NOW, ER_URGENT, URGENT_CARE. Tier-specific timeouts added in Round 2: ER_NOW=5min, ER_URGENT=10min, URGENT_CARE=20min.",
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
    mitigationNotes: "Phase 1 (2 weeks): Add Google Workspace HIPAA BAA — fastest fix, Google offers BAA for Workspace customers. Phase 2 (4 weeks): Sheets as editor UI only, rules stored in PostgreSQL with staged promotion. Phase 3 (8 weeks): Full ClinicalRuleStore implementation.",
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
    mitigationNotes: "demographicDriftMonitor.ts tracks per-group ER_NOW rates and now also SELF_CARE over-discharge rates (Round 2). DEMOGRAPHIC_PARITY_DELTA SLO triggers alert at >5% disparity.",
    implementedControls: ["server/learning/demographicDriftMonitor.ts", "server/observability/clinicalSLOs.ts"],
  },
  // ── Claude Review Round 2 Additions ──────────────────────────────────────
  {
    id: "BR-008",
    title: "WhatsApp/Telegram PHI in Unencrypted Application Logs",
    hipaaSection: "45 CFR §164.312(a)(2)(iv) — Encryption and Decryption",
    fdaImpact: "HIPAA breach if PHI in logs — channel payload logs may contain patient messages",
    triggerCondition: "Patient messages containing PHI (symptoms, age, complaints) logged to application logs in plaintext. WhatsApp/Telegram webhook payloads written to stdout/log files without scrubbing.",
    riskLevel: "HIGH",
    mitigationStatus: "IMPLEMENTED",
    mitigationNotes: "PHI scrubber middleware in server/middleware/phiScrubber.ts strips patient-identifiable content from all channel payloads before logging. Logs only metadata: timestamp, channel type, message hash, case ID. Confirmed via CHANNEL_PAYLOAD_SCRUBBED audit event.",
    implementedControls: ["server/middleware/phiScrubber.ts"],
  },
  {
    id: "BR-009",
    title: "RLHF Training Data Containing Identifiable Symptom Patterns",
    hipaaSection: "45 CFR §164.502 — Minimum Necessary; 45 CFR §164.514(b) — Safe Harbor De-identification",
    fdaImpact: "PHI in training dataset — requires de-identification per Safe Harbor before RLHF use",
    triggerCondition: "Outcome logger captures raw patient text for RLHF training without de-identification. Symptom patterns + age + channel = potentially re-identifiable PHI under Safe Harbor analysis.",
    riskLevel: "HIGH",
    mitigationStatus: "PLANNED",
    mitigationNotes: "Training data must be de-identified per Safe Harbor (§164.514(b)) or Expert Determination before use in RLHF pipeline. Minimum: strip 18 Safe Harbor identifiers from outcomeLogger before writing to training store. Recommend Expert Determination review for symptom pattern datasets.",
    implementedControls: [],
  },
];

let riskRegisterLastUpdated = new Date().toISOString();

export function getBreachRiskRegister(): {
  register:    BreachRiskEntry[];
  summary:     { critical: number; high: number; medium: number; low: number; implemented: number; pending: number };
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

export function updateMitigationStatus(id: string, status: MitigationStatus, notes?: string): boolean {
  const entry = BREACH_RISK_REGISTER.find(r => r.id === id);
  if (!entry) return false;
  entry.mitigationStatus = status;
  if (notes) entry.mitigationNotes = notes;
  entry.lastReviewedAt = new Date().toISOString();
  riskRegisterLastUpdated = new Date().toISOString();
  return true;
}

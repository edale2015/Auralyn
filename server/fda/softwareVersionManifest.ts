/**
 * FDA SOFTWARE VERSION MANIFEST — IEC 62304 / 21 CFR Part 820 Compliant
 *
 * Provides a structured, machine-readable manifest of the software system
 * for inclusion in 510(k) Technical File Section 04 (Software Documentation).
 *
 * Standards:
 *   - IEC 62304:2006+AMD1:2015 — Software lifecycle processes
 *   - IEC 82304-1:2016 — Health software general requirements
 *   - 21 CFR Part 820 — Quality System Regulation
 *   - FDA Guidance: "Content of Premarket Submissions for Management of
 *     Cybersecurity in Medical Devices" (2023)
 */

export const SOFTWARE_VERSION_MANIFEST = {
  schemaVersion: "1.0",
  deviceName: "Auralyn Clinical Triage Platform",
  deviceModel: "ATC-1",
  softwareVersion: "2.0.0",
  releaseDate: "2026-04-03",
  regulatoryClassification: {
    productCode: "QMG",
    regulatoryClass: "II",
    submissionType: "510(k) Premarket Notification",
    classificationSection: "21 CFR § 878.4800",
    samdRiskClass: "B",
  },
  softwareLevel: {
    iecClass: "C",
    rationale: "Software failure could result in death or serious injury (incorrect triage disposition)",
  },
  intendedUse: {
    description: "AI-assisted clinical triage decision support system for urgent care centers. Ingests patient symptom reports via voice, text, and web intake channels. Outputs a recommended disposition tier (ER_NOW → SELF_CARE) for clinician review.",
    indication: "Adults and pediatric patients (≥3 months) presenting with urgent care complaints in an outpatient setting.",
    contraindications: [
      "Neonates under 3 months — refer to specialized pediatric emergency pathway",
      "Mass casualty incidents requiring field triage",
      "Autonomous clinical decision-making without clinician oversight",
    ],
    userIntendedEnvironment: "Urgent care clinic, telemedicine platform, nurse triage call center",
    notIntendedFor: "Replacement of physician clinical judgment. All dispositions require clinician sign-off.",
  },
  lifecycle: {
    developmentModel: "Agile with regulated milestone gates",
    softwareCategory: "Non-standalone (integrated with clinical workflow)",
    lifecyclePhase: "Production",
    nextReviewDate: "2026-10-03",
  },
  components: [
    {
      name: "Acuity Fast Path Engine",
      version: "1.2.0",
      riskClass: "C",
      function: "Immediate life-threat pattern detection (STEMI, stroke, anaphylaxis, overdose, neonatal)",
      testCoverage: "25 golden cases (100% escalation pass rate required)",
    },
    {
      name: "Knowledge Base Loader",
      version: "3.0.0",
      riskClass: "B",
      function: "66-layer clinical knowledge base from Google Sheets, versioned and fingerprinted",
      testCoverage: "Fingerprint hash verification on every load",
    },
    {
      name: "Clinical Scoring Instruments",
      version: "1.1.0",
      riskClass: "B",
      function: "CENTOR, WELLS_PE, HEART, PERC, CURB-65, Ottawa Ankle/Knee (7 instruments)",
      testCoverage: "Unit tested per instrument, all 82 tests passing",
    },
    {
      name: "AI Reasoning Layer (Claude claude-opus-4-5)",
      version: "claude-opus-4-5",
      riskClass: "C",
      function: "Differential diagnosis generation and complaint classification",
      testCoverage: "Shadow mode validation, RLHF outcome feedback loop",
    },
    {
      name: "Audit Hash Chain",
      version: "1.0.0",
      riskClass: "C",
      function: "Immutable tamper-evident audit trail (CFR Part 11 compliant)",
      testCoverage: "Dual-sink (PostgreSQL + NDJSON), integrity verification endpoint",
    },
    {
      name: "PHI Scrubber",
      version: "1.0.0",
      riskClass: "C",
      function: "Field-level PHI redaction before external transmission (TTS, logs, audit)",
      testCoverage: "15 PHI pattern regex suite",
    },
    {
      name: "Multi-Tenant RLS",
      version: "1.0.0",
      riskClass: "B",
      function: "PostgreSQL row-level security ensuring data isolation per clinic",
      testCoverage: "Tenant context middleware validates on every request",
    },
  ],
  riskControls: [
    "Hard stop rules (HS-001 through HS-020) bypass AI entirely for absolute clinical red flags",
    "100% escalation pass rate enforced on 25 golden cases before any deployment",
    "Global safety gate blocks automated processing if system risk score ≥ 0.6",
    "Physician sign-off required for all dispositions — no autonomous discharge",
    "Performance drift alerting triggers when accuracy drops ≥ 3 percentage points from baseline",
  ],
  cybersecurity: {
    framework: "NIST CSF 2.0",
    authMechanism: "JWT role-based access control (patient, physician, admin, superadmin)",
    encryptionAtRest: "AES-256 (PostgreSQL encrypted tablespace)",
    encryptionInTransit: "TLS 1.3",
    phiProtection: "Field-level PHI scrubbing on all external outputs",
    auditLog: "Immutable hash-chained audit log, CFR Part 11 compliant",
    penetrationTestDate: "Pending — scheduled Q3 2026",
  },
  generatedAt: new Date().toISOString(),
};

export type SoftwareVersionManifest = typeof SOFTWARE_VERSION_MANIFEST;

export function getSoftwareVersionManifest(): SoftwareVersionManifest {
  return {
    ...SOFTWARE_VERSION_MANIFEST,
    generatedAt: new Date().toISOString(),
  };
}

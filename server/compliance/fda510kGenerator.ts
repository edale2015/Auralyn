import { getPerformanceStats } from "./performanceRegistry";
import { MODEL } from "./modelVersionEngine";
import { MODEL_VERSION } from "./modelRegistry";
import { listExtendedScoringSystems } from "../engines/scoring/index";
import { listScoringSystems } from "../services/scoring/scoringRegistry";
import { getICD10Catalog } from "../billing/codingEngine";

export interface FDA510kNarrative {
  generatedAt: string;
  modelVersion: string;
  sections: Array<{
    sectionNumber: string;
    title: string;
    content: string;
  }>;
  metrics: {
    totalValidationCases: number;
    accuracy: number;
    avgConfidence: number;
    avgLatencyMs: number;
    packBreakdown: Record<string, { total: number; correct: number; accuracy: number }>;
    scoringSystemCount: number;
    icd10MappingCount: number;
  };
}

export function generateFDA510kNarrative(): FDA510kNarrative {
  const stats = getPerformanceStats();
  const coreSystems = listScoringSystems();
  const extendedSystems = listExtendedScoringSystems();
  const icd10Catalog = getICD10Catalog();
  const totalScoringCount = coreSystems.length + extendedSystems.length;
  const icd10Count = Object.keys(icd10Catalog).length;

  const sections = [
    {
      sectionNumber: "01",
      title: "Device Description",
      content: `ClinicalBrain is a Software as a Medical Device (SaMD) clinical decision support system operating in assistive mode. The system combines rule-based clinical scoring (${totalScoringCount} validated scoring systems), reinforcement learning from physician feedback (RLHF), adaptive case memory, and structured clinical pathways to provide triage recommendations, differential diagnoses, and care planning guidance.

The system operates under a human-in-the-loop paradigm where all high-risk outputs (ER triage, critical diagnoses) require mandatory physician review before any clinical action is taken. The device does not make autonomous discharge or treatment decisions.

Software Version: ${MODEL.version}
Rules Engine: ${MODEL.rulesVersion}
Scoring Engine: ${MODEL.scoringVersion}
Safety Engine: ${MODEL.safetyVersion}
Model Registry Version: ${MODEL_VERSION}`,
    },
    {
      sectionNumber: "02",
      title: "Intended Use / Indications for Use",
      content: `ClinicalBrain is intended for use by licensed healthcare professionals as a clinical decision support tool to assist in:
- Initial patient triage and acuity assessment
- Differential diagnosis generation based on structured symptom intake
- Evidence-based clinical scoring (including ${coreSystems.map(s => s.name).join(", ")}, and ${extendedSystems.length} extended scoring systems)
- ICD-10/CPT billing code suggestion (${icd10Count} mapped diagnoses)
- Care plan generation with return precautions

The device is NOT intended for:
- Autonomous clinical decision-making without physician oversight
- Emergency triage without concurrent clinical evaluation
- Pediatric patients under 2 years without explicit physician supervision
- Replacement of clinical judgment in complex or ambiguous presentations`,
    },
    {
      sectionNumber: "03",
      title: "System Architecture",
      content: `The unified clinical pipeline processes each case through a deterministic, auditable sequence:

1. Complaint Detection → Natural language complaint classification
2. Pack-Driven Intake → Structured yes/no question flow from validated complaint packs
3. Modifier Application → Age, pregnancy, immunocompromised, medication modifiers
4. Rule/Cluster Evaluation → Weighted scoring against diagnosis clusters
5. Clinical Scoring → ${totalScoringCount} evidence-based scoring calculators
6. RLHF Weight Application → Reinforcement-adjusted diagnosis confidence
7. Safety Override Layer → Hard blocks for critical diagnosis under-triage
8. Risk Classification → LOW / MEDIUM / HIGH / CRITICAL risk stratification
9. Physician Review Gate → Mandatory review for HIGH/CRITICAL cases
10. Audit Trail → Full decision trace with model version metadata

All pipeline stages produce immutable trace records for regulatory audit.`,
    },
    {
      sectionNumber: "04",
      title: "Risk Analysis (ISO 14971)",
      content: `Primary Identified Hazard: Under-triage of critical conditions (ACS, PE, Stroke, Meningitis, Sepsis, Aortic Dissection, Ectopic Pregnancy).

Risk Mitigations Implemented:
- HARD SAFETY BLOCK: System prevents routine discharge of any critical diagnosis (enforced at pipeline level, cannot be bypassed)
- PHYSICIAN REVIEW GATE: All ER-level triage and critical diagnoses require physician review before action
- LOW CONFIDENCE FLAG: Cases with confidence < 60% are automatically flagged for physician review
- CONTINUOUS MONITORING: Real-time performance metrics with p95 latency tracking and error rate monitoring
- OUTCOME LEARNING: Physician override patterns are captured and fed back into reinforcement learning
- SIMULATION VALIDATION: High-scale simulation engine (1000+ cases per pack) validates system behavior under synthetic load

Residual Risk: Acceptable under assistive-mode operation with mandatory physician oversight for all high-risk outputs.`,
    },
    {
      sectionNumber: "05",
      title: "Clinical Evaluation & Performance",
      content: `Validation Performance Metrics (Live System):
- Total Validation Cases: ${stats.total}
- Overall Accuracy: ${stats.accuracy}%
- Average Confidence Score: ${stats.avgConfidence}
- Average Processing Latency: ${stats.avgLatencyMs}ms
- Correct Classifications: ${stats.correct}
- Incorrect Classifications: ${stats.incorrect}

Performance by Clinical Pack:
${Object.entries(stats.byPack).map(([pack, data]) =>
  `  - ${pack}: ${data.accuracy}% accuracy (${data.correct}/${data.total} correct)`
).join("\n") || "  - No pack-level data recorded yet"}

Clinical Scoring Systems Validated:
Core Systems: ${coreSystems.map(s => s.name).join(", ")}
Extended Systems: ${extendedSystems.map(s => `${s.name} (${s.category})`).join(", ")}

Validation Methodology:
- Synthetic case generation across all complaint packs
- Retrospective comparison against physician-determined ground truth
- Continuous outcome feedback integration via RLHF
- Golden case regression testing for critical pathways`,
    },
    {
      sectionNumber: "06",
      title: "Software Documentation (IEC 62304)",
      content: `Software Development Lifecycle:
- Development Environment: Node.js/TypeScript (server), React/TypeScript (client)
- Version Control: Git with checkpoint-based rollback capability
- Configuration Management: Versioned model registry (${MODEL_VERSION}), rules versioning (${MODEL.rulesVersion}), scoring versioning (${MODEL.scoringVersion})

Software Architecture:
- Unified Clinical Pipeline with deterministic execution order
- Modular engine architecture: ${totalScoringCount} scoring engines, adaptive mapping, outcome learning
- Complete audit trail with immutable trace records
- Role-based access control (Admin, Physician roles)
- AES-256-CBC encryption for PHI at rest
- PHI redaction in all log outputs

Software Change Management:
- All model version changes logged in compliance registry
- Automated regression testing via golden case validation
- Performance impact analysis before production deployment`,
    },
    {
      sectionNumber: "07",
      title: "Verification & Validation",
      content: `Verification Activities:
- Unit testing of all clinical scoring calculators
- Integration testing of pipeline stages
- End-to-end case flow validation
- API contract testing for all 30+ route groups

Validation Activities:
- High-scale simulation (1000+ cases per complaint pack, 10+ complaint systems)
- Golden case regression suite
- Physician override analysis for systematic bias detection
- Outcome tracking with RLHF feedback integration

Current Validation Results:
  Total Cases Processed: ${stats.total}
  System Accuracy: ${stats.accuracy}%
  Average Decision Confidence: ${stats.avgConfidence}
  Processing Latency (avg): ${stats.avgLatencyMs}ms`,
    },
    {
      sectionNumber: "08",
      title: "Cybersecurity (FDA Guidance)",
      content: `Security Architecture:
- Transport Layer: TLS 1.2+ enforced for all communications
- Authentication: JWT-based role authentication with configurable expiration
- Authorization: Role-based access control (requireRole middleware on all clinical routes)
- Encryption at Rest: AES-256-CBC for PHI fields (name, DOB, phone, SSN, email, address, MRN)
- PHI Protection: Automated redaction of PHI patterns in all log outputs (SSN, phone, email, DOB, MRN patterns)
- Rate Limiting: Request-level rate limiting to prevent abuse
- Audit Logging: Rolling 10,000-entry audit log with action tracking
- Access Logging: PHI access logging with user/resource/timestamp tracking

Vulnerability Management:
- No PHI stored in frontend code or client-side storage
- Secrets managed via environment variables (never committed to source)
- Webhook endpoints (Telegram, WhatsApp) operate without auth by design but do not expose PHI`,
    },
    {
      sectionNumber: "09",
      title: "Post-Market Surveillance Plan",
      content: `Continuous Monitoring Systems:
- Real-time performance metrics (total requests, error rate, p95 latency, avg latency)
- Outcome learning engine tracking predicted vs actual diagnosis accuracy
- Auto-tune engine detecting systematic failure patterns and suggesting rule improvements
- Physician override pattern analysis for under-triage detection

Incident Response:
- Automated alerts for error rate > 5% or latency spikes > 2000ms
- Physician escalation for all blocked unsafe discharges
- Full case audit export capability for regulatory review

Periodic Re-validation:
- Scheduled simulation runs across all complaint packs
- Golden case regression testing after any model update
- Performance registry analysis with pack-level accuracy tracking
- RLHF weight drift monitoring`,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    modelVersion: `${MODEL.version} (rules: ${MODEL.rulesVersion}, scoring: ${MODEL.scoringVersion}, safety: ${MODEL.safetyVersion})`,
    sections,
    metrics: {
      totalValidationCases: stats.total,
      accuracy: stats.accuracy,
      avgConfidence: stats.avgConfidence,
      avgLatencyMs: stats.avgLatencyMs,
      packBreakdown: stats.byPack,
      scoringSystemCount: totalScoringCount,
      icd10MappingCount: icd10Count,
    },
  };
}

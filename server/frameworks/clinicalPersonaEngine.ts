/**
 * clinicalPersonaEngine.ts — BMAD Method clinical translation
 *
 * Article 26 — BMAD: "Breakthrough Method for Agile AI-Driven Development.
 *  Simulates an entire agile development team using 12+ specialized AI personas.
 *  Party Mode enables multiple personas to collaborate within a single session.
 *  Scale-adaptive intelligence adjusts documentation rigor based on project complexity."
 *
 * Clinical translation:
 *  The physician is not a solo actor — they lead a team of specialized cognitive
 *  agents (triage, pharmacy, nursing, quality, architecture). BMAD Party Mode lets
 *  the physician summon any persona to consult on a case mid-session.
 *
 * 4-phase clinical BMAD cycle:
 *   Analysis:      Clinical Brief — problem, constraints, risk level
 *   Planning:      Care Pathways — user stories → clinical orders with criteria
 *   Solutioning:   Protocol Architect designs minimal safe pathway; order set proposed
 *   Implementation: Execute iteratively through small order cycles, updated artifacts each pass
 *
 * Scale-adaptive intelligence:
 *   routine (ESI 4-5):        one-paragraph Clinical Brief, no full ceremony
 *   moderate (ESI 3):         full Brief + simplified Care Pathways
 *   complex (ESI 1-2):        full 4-phase cycle with traceability artifacts
 *   multi-organ:              full + multi-persona Party Mode mandatory
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PersonaRole =
  | "ClinicalAnalyst"
  | "ClinicalArchitect"
  | "TriageSpecialist"
  | "PharmacistAdvisor"
  | "NursingCoordinator"
  | "QualityAuditor";

export type ComplexityLevel = "routine" | "moderate" | "complex" | "multi_organ";
export type PhaseType = "analysis" | "planning" | "solutioning" | "implementation";
export type PhaseStatus = "pending" | "active" | "complete" | "blocked";

export interface ClinicalPersona {
  role:            PersonaRole;
  expertise:       string;
  responsibilities: string[];
  constraints:     string[];
  expectedOutputs: string[];
}

export interface ClinicalBrief {
  problemStatement: string;
  constraints:      string[];
  riskLevel:        ComplexityLevel;
  estimatedResources: string[];
}

export interface ClinicalUserStory {
  id:               string;
  persona:          PersonaRole;
  story:            string;          // "As a [PersonaRole], I need [action] so that [outcome]"
  acceptanceCriteria: string[];
}

export interface PhaseArtifact {
  phase:     PhaseType;
  type:      string;
  content:   string;
  authoredBy: PersonaRole;
  createdAt:  Date;
}

export interface BMADSession {
  id:          string;
  patientId?:  string;
  complexity:  ComplexityLevel;
  activePhase: PhaseType;
  phases:      Record<PhaseType, PhaseStatus>;
  personas:    PersonaRole[];       // Party Mode: all active personas in this session
  artifacts:   PhaseArtifact[];
  traceLog:    string[];            // audit trail — every decision
  createdAt:   Date;
  updatedAt:   Date;
}

// ── Clinical Persona Definitions ──────────────────────────────────────────────

export const CLINICAL_PERSONAS: Record<PersonaRole, ClinicalPersona> = {
  ClinicalAnalyst: {
    role:            "ClinicalAnalyst",
    expertise:       "Clinical epidemiology, risk stratification, evidence synthesis",
    responsibilities: [
      "Author Clinical Brief (one-page problem statement + constraints)",
      "Assess patient complexity and assign scale-adaptive ceremony level",
      "Identify red flags and contraindications",
      "Map presenting complaint to differential diagnoses",
    ],
    constraints: [
      "Must not recommend treatments — analysis only",
      "Must cite evidence tier for every risk statement (Level A/B/C/D)",
    ],
    expectedOutputs: ["ClinicalBrief", "DifferentialDiagnosisList", "RiskStratificationReport"],
  },
  ClinicalArchitect: {
    role:            "ClinicalArchitect",
    expertise:       "Care pathway design, protocol engineering, order set composition",
    responsibilities: [
      "Design minimal safe care pathway (no over-treatment)",
      "Compose order sets with dependency-ordered sequence",
      "Define interface contracts between clinical modules (triage → pharmacy → nursing)",
      "Validate pathway against local formulary and capacity constraints",
    ],
    constraints: [
      "Must not implement — design only",
      "Every pathway decision must map to a cited guideline",
    ],
    expectedOutputs: ["CarePathwayDesign", "OrderSetTemplate", "InterfaceContracts"],
  },
  TriageSpecialist: {
    role:            "TriageSpecialist",
    expertise:       "Emergency Severity Index, vital sign interpretation, disposition",
    responsibilities: [
      "Assign ESI triage level within 120 seconds",
      "Identify immediate life threats (airway, breathing, circulation)",
      "Predict resource requirements",
      "Initiate time-sensitive protocols (STEMI, stroke, sepsis)",
    ],
    constraints: [
      "Must never defer ESI assignment past 5 minutes",
      "ESI 1-2 requires physician notification within 2 minutes",
    ],
    expectedOutputs: ["ESIAssignment", "ResourcePrediction", "ProtocolTriggers"],
  },
  PharmacistAdvisor: {
    role:            "PharmacistAdvisor",
    expertise:       "Clinical pharmacology, drug interactions, dose optimization",
    responsibilities: [
      "Review all drug orders for interactions and contraindications",
      "Optimize doses for renal/hepatic function, age, weight",
      "Flag allergy cross-reactivity",
      "Verify formulary availability and suggest alternatives",
    ],
    constraints: [
      "Must not prescribe independently — advisory role only",
      "All recommendations require prescriber co-sign",
    ],
    expectedOutputs: ["DrugReviewReport", "DoseOptimizationPlan", "InteractionAlerts"],
  },
  NursingCoordinator: {
    role:            "NursingCoordinator",
    expertise:       "Nursing assessment, patient flow, care coordination",
    responsibilities: [
      "Translate physician orders into nursing workflows",
      "Monitor and escalate vital sign changes",
      "Coordinate between departments (lab, radiology, pharmacy)",
      "Document care milestones and patient response",
    ],
    constraints: [
      "Must document every patient contact within 15 minutes",
      "Cannot administer medications without two-nurse verification for high-alert drugs",
    ],
    expectedOutputs: ["NursingWorkflowPlan", "MonitoringSchedule", "EscalationCriteria"],
  },
  QualityAuditor: {
    role:            "QualityAuditor",
    expertise:       "Clinical quality metrics, HIPAA compliance, outcome measurement",
    responsibilities: [
      "Verify every clinical decision maps to a measurable outcome",
      "Audit care pathway for HIPAA and regulatory compliance",
      "Generate quality metrics: door-to-physician time, antibiotic timing, LOS",
      "Identify process deviations and near-misses for FMEA",
    ],
    constraints: [
      "Must not alter clinical decisions — audit only",
      "Must flag every deviation from evidence-based guidelines",
    ],
    expectedOutputs: ["QualityReport", "ComplianceAudit", "OutcomeMetrics"],
  },
};

// ── Scale-adaptive ceremony ───────────────────────────────────────────────────

export interface ComplexityProfile {
  level:          ComplexityLevel;
  ceremonyLevel:  "minimal" | "standard" | "full" | "enterprise";
  requiredPhases: PhaseType[];
  requiredPersonas: PersonaRole[];
  artifactDepth:  "brief" | "moderate" | "comprehensive";
  description:    string;
}

export const COMPLEXITY_PROFILES: Record<ComplexityLevel, ComplexityProfile> = {
  routine: {
    level:            "routine",
    ceremonyLevel:    "minimal",
    requiredPhases:   ["analysis"],
    requiredPersonas: ["TriageSpecialist"],
    artifactDepth:    "brief",
    description:      "ESI 4-5, simple chief complaint. One-paragraph Brief. No full ceremony needed.",
  },
  moderate: {
    level:            "moderate",
    ceremonyLevel:    "standard",
    requiredPhases:   ["analysis", "planning"],
    requiredPersonas: ["TriageSpecialist", "ClinicalAnalyst"],
    artifactDepth:    "moderate",
    description:      "ESI 3, multi-system complaint. Full Brief + simplified Care Pathway.",
  },
  complex: {
    level:            "complex",
    ceremonyLevel:    "full",
    requiredPhases:   ["analysis", "planning", "solutioning", "implementation"],
    requiredPersonas: ["ClinicalAnalyst", "ClinicalArchitect", "TriageSpecialist", "PharmacistAdvisor"],
    artifactDepth:    "comprehensive",
    description:      "ESI 1-2, critical presentation. Full 4-phase cycle with traceability.",
  },
  multi_organ: {
    level:            "multi_organ",
    ceremonyLevel:    "enterprise",
    requiredPhases:   ["analysis", "planning", "solutioning", "implementation"],
    requiredPersonas: ["ClinicalAnalyst", "ClinicalArchitect", "TriageSpecialist", "PharmacistAdvisor", "NursingCoordinator", "QualityAuditor"],
    artifactDepth:    "comprehensive",
    description:      "Multi-organ failure / polytrauma. All 6 personas in Party Mode mandatory.",
  },
};

// ── Session store ─────────────────────────────────────────────────────────────

const _sessions = new Map<string, BMADSession>();
let   _seq      = 1;
function nextId(): string { return `bmad_${Date.now()}_${_seq++}`; }

// ── BMAD session lifecycle ────────────────────────────────────────────────────

export function assessComplexity(input: {
  esiLevel?: number;
  organSystemCount?: number;
  criticalVitals?: boolean;
  multiDrugInteractions?: boolean;
}): ComplexityLevel {
  const { esiLevel = 3, organSystemCount = 1, criticalVitals = false, multiDrugInteractions = false } = input;
  if (organSystemCount >= 3 || (criticalVitals && organSystemCount >= 2)) return "multi_organ";
  if (esiLevel <= 2 || criticalVitals) return "complex";
  if (esiLevel === 3 || multiDrugInteractions || organSystemCount === 2) return "moderate";
  return "routine";
}

export function createBMADSession(input: {
  patientId?: string;
  complexity: ComplexityLevel;
  additionalPersonas?: PersonaRole[];
}): BMADSession {
  const profile  = COMPLEXITY_PROFILES[input.complexity];
  const personas = Array.from(new Set([...profile.requiredPersonas, ...(input.additionalPersonas ?? [])]));
  const id       = nextId();
  const session: BMADSession = {
    id,
    patientId:  input.patientId,
    complexity: input.complexity,
    activePhase: profile.requiredPhases[0],
    phases: {
      analysis:       "pending",
      planning:       "pending",
      solutioning:    "pending",
      implementation: "pending",
    },
    personas,
    artifacts: [],
    traceLog:  [`[${new Date().toISOString()}] Session created. Complexity: ${input.complexity}. Personas: ${personas.join(", ")}.`],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  session.phases[profile.requiredPhases[0]] = "active";
  _sessions.set(id, session);
  return session;
}

export function advancePhase(sessionId: string, artifact: Omit<PhaseArtifact, "createdAt">): BMADSession | null {
  const s = _sessions.get(sessionId);
  if (!s) return null;

  // Complete current phase
  s.phases[s.activePhase] = "complete";
  s.artifacts.push({ ...artifact, createdAt: new Date() });
  s.traceLog.push(`[${new Date().toISOString()}] Phase ${s.activePhase} completed by ${artifact.authoredBy}. Artifact: ${artifact.type}.`);

  // Advance to next required phase
  const profile     = COMPLEXITY_PROFILES[s.complexity];
  const currentIdx  = profile.requiredPhases.indexOf(s.activePhase);
  const nextPhase   = profile.requiredPhases[currentIdx + 1];

  if (nextPhase) {
    s.activePhase         = nextPhase;
    s.phases[nextPhase]   = "active";
    s.traceLog.push(`[${new Date().toISOString()}] Advancing to phase: ${nextPhase}.`);
  }

  s.updatedAt = new Date();
  return s;
}

// BMAD Party Mode: summon additional persona to consult
export function summonPersona(sessionId: string, persona: PersonaRole, reason: string): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  if (!s.personas.includes(persona)) {
    s.personas.push(persona);
    s.traceLog.push(`[${new Date().toISOString()}] Party Mode: ${persona} summoned. Reason: ${reason}`);
    s.updatedAt = new Date();
  }
  return true;
}

export function addArtifact(sessionId: string, artifact: Omit<PhaseArtifact, "createdAt">): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  s.artifacts.push({ ...artifact, createdAt: new Date() });
  s.traceLog.push(`[${new Date().toISOString()}] Artifact added: ${artifact.type} by ${artifact.authoredBy}.`);
  s.updatedAt = new Date();
  return true;
}

export function getSession(sessionId: string): BMADSession | undefined {
  return _sessions.get(sessionId);
}

export function listSessions(): BMADSession[] {
  return Array.from(_sessions.values());
}

export function getPersonaDefinition(role: PersonaRole): ClinicalPersona {
  return CLINICAL_PERSONAS[role];
}

export function getComplexityProfile(level: ComplexityLevel): ComplexityProfile {
  return COMPLEXITY_PROFILES[level];
}

// Generate a Clinical Brief (Analysis phase artifact) for a patient
export function generateClinicalBrief(input: {
  chiefComplaint:    string;
  constraints:       string[];
  complexity:        ComplexityLevel;
  knownRisks?:       string[];
}): ClinicalBrief {
  return {
    problemStatement: `Clinical challenge: ${input.chiefComplaint}. Complexity: ${input.complexity}. Ceremony: ${COMPLEXITY_PROFILES[input.complexity].ceremonyLevel}.`,
    constraints:      input.constraints,
    riskLevel:        input.complexity,
    estimatedResources: COMPLEXITY_PROFILES[input.complexity].requiredPersonas.map(
      (p) => `${p}: ${CLINICAL_PERSONAS[p].expectedOutputs.join(", ")}`
    ),
  };
}

// Generate clinical user stories for Planning phase
export function generateUserStories(complexity: ComplexityLevel): ClinicalUserStory[] {
  const profile = COMPLEXITY_PROFILES[complexity];
  return profile.requiredPersonas.map((persona, i) => ({
    id:     `us_${i + 1}`,
    persona,
    story:  `As a ${persona}, I need to ${CLINICAL_PERSONAS[persona].responsibilities[0].toLowerCase()} so that patient safety is maintained.`,
    acceptanceCriteria: CLINICAL_PERSONAS[persona].expectedOutputs.map((o) => `${o} is produced and validated.`),
  }));
}

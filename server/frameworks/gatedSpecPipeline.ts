/**
 * gatedSpecPipeline.ts — SpecKit clinical translation
 *
 * Article 26 — SpecKit: "Specifications don't serve code; code serves specifications.
 *  A strict, sequential workflow with explicit checkpoints. You cannot advance to
 *  the next phase until the current phase is validated."
 *
 * Clinical translation:
 *  "Care pathways don't serve convenience; care serves protocol."
 *  Before a physician can order treatment, they must first have an approved spec.
 *  Before a nurse can execute, there must be an approved plan.
 *  The chain is: Constitution → Specify → Plan → Orders → Execute.
 *
 * Clinical artifact set (SpecKit equivalent):
 *   constitution:  Governing principles for clinical decision-making (never violate these)
 *   spec:          Clinical Brief — what to treat, user journeys, acceptance criteria
 *   plan:          Treatment Plan — implementation strategy, resource requirements
 *   data_model:    Patient Data Model — inputs/outputs, schema, EHR bindings
 *   tasks:         Clinical Orders — actionable, testable order list from the plan
 *   research:      Evidence Base — citations, guideline sources, evidence tier
 *
 * Gates:
 *   constitution → spec:   constitution must be ratified
 *   spec → plan:           spec completeness ≥ 80% and approved
 *   plan → tasks:          plan has resource estimates and risk mitigation
 *   tasks → execute:       all tasks have acceptance criteria and test conditions
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelinePhase =
  | "constitution" | "specify" | "plan"
  | "tasks" | "execute" | "complete";

export type GateStatus = "locked" | "open" | "passed" | "failed";

export interface PipelineGate {
  fromPhase:   PipelinePhase;
  toPhase:     PipelinePhase;
  status:      GateStatus;
  validations: GateValidation[];
  passedAt?:   Date;
  failReason?: string;
}

export interface GateValidation {
  rule:     string;
  passed:   boolean;
  message:  string;
}

export interface ClinicalConstitution {
  principles:       string[];   // governing principles — these cannot be violated
  prohibitions:     string[];   // what can NEVER happen under any circumstance
  ratifiedBy:       string;
  ratifiedAt:       Date;
}

export interface ClinicalSpec {
  chiefComplaint:   string;
  targetOutcome:    string;
  userJourneys:     string[];   // who does what, in what order
  acceptanceCriteria: string[];
  outOfScope:       string[];
  completenessScore: number;    // 0-100
}

export interface TreatmentPlan {
  strategy:         string;
  phases:           string[];
  resourceEstimate: string;
  riskMitigation:   string[];
  timeline:         string;
  researchSources:  string[];
}

export interface PatientDataModel {
  inputs:     Record<string, string>;  // fieldName → type/description
  outputs:    Record<string, string>;
  schema:     string;
  ehrBindings: string[];
}

export interface ClinicalOrder {
  id:                 string;
  description:        string;
  persona:            string;
  acceptanceCriteria: string[];
  testConditions:     string[];
  priority:           "stat" | "urgent" | "routine";
  status:             "pending" | "active" | "complete" | "cancelled";
}

export interface SpecPipeline {
  id:            string;
  patientId?:    string;
  currentPhase:  PipelinePhase;
  gates:         Partial<Record<`${PipelinePhase}_to_${PipelinePhase}`, PipelineGate>>;
  artifacts: {
    constitution?: ClinicalConstitution;
    spec?:         ClinicalSpec;
    plan?:         TreatmentPlan;
    dataModel?:    PatientDataModel;
    orders:        ClinicalOrder[];
    research:      string[];          // citation list
  };
  createdAt:     Date;
  updatedAt:     Date;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _pipelines = new Map<string, SpecPipeline>();
let   _seq       = 1;
function nextId() { return `spec_pipe_${Date.now()}_${_seq++}`; }

// ── Default clinical constitution ─────────────────────────────────────────────

export const DEFAULT_CONSTITUTION: Omit<ClinicalConstitution, "ratifiedBy" | "ratifiedAt"> = {
  principles: [
    "First do no harm — every intervention must have a clear clinical indication.",
    "Evidence over intuition — all clinical decisions must cite a Level A/B guideline.",
    "Patient safety over throughput — never rush a safety check to see more patients.",
    "Minimal intervention — choose the least invasive effective option first.",
    "Transparency — every decision must be documentable and auditable.",
    "Equity — identical clinical criteria regardless of insurance, ethnicity, or socioeconomic status.",
  ],
  prohibitions: [
    "NEVER discharge a patient with NEWS2 ≥ 5 without senior physician sign-off.",
    "NEVER administer a known allergen without documented physician override.",
    "NEVER skip antibiotic stewardship review for broad-spectrum agents.",
    "NEVER allow a prescription without both dose and route confirmed.",
  ],
};

// ── Gate validation rules ─────────────────────────────────────────────────────

function validateConstitutionToSpec(pipeline: SpecPipeline): GateValidation[] {
  const c = pipeline.artifacts.constitution;
  return [
    { rule: "Constitution ratified",   passed: !!c?.ratifiedBy,  message: c?.ratifiedBy ? `Ratified by ${c.ratifiedBy}` : "No ratification found" },
    { rule: "Principles defined",      passed: (c?.principles.length ?? 0) >= 3, message: c ? `${c.principles.length} principles` : "Missing" },
    { rule: "Prohibitions defined",    passed: (c?.prohibitions.length ?? 0) >= 1, message: c ? `${c.prohibitions.length} prohibitions` : "Missing" },
  ];
}

function validateSpecToPlan(pipeline: SpecPipeline): GateValidation[] {
  const s = pipeline.artifacts.spec;
  return [
    { rule: "Chief complaint documented",  passed: (s?.chiefComplaint?.length ?? 0) >= 10, message: s ? "Present" : "Missing" },
    { rule: "Acceptance criteria present", passed: (s?.acceptanceCriteria?.length ?? 0) >= 1, message: s ? `${s.acceptanceCriteria.length} criteria` : "Missing" },
    { rule: "User journeys defined",       passed: (s?.userJourneys?.length ?? 0) >= 1, message: s ? `${s.userJourneys.length} journeys` : "Missing" },
    { rule: "Completeness ≥ 80%",          passed: (s?.completenessScore ?? 0) >= 80, message: s ? `${s.completenessScore}%` : "0%" },
  ];
}

function validatePlanToTasks(pipeline: SpecPipeline): GateValidation[] {
  const p = pipeline.artifacts.plan;
  return [
    { rule: "Strategy documented",       passed: (p?.strategy?.length ?? 0) >= 10, message: p ? "Present" : "Missing" },
    { rule: "Risk mitigation present",   passed: (p?.riskMitigation?.length ?? 0) >= 1, message: p ? `${p.riskMitigation.length} mitigations` : "Missing" },
    { rule: "Resource estimate present", passed: (p?.resourceEstimate?.length ?? 0) > 0, message: p?.resourceEstimate ?? "Missing" },
    { rule: "Research sources cited",    passed: (p?.researchSources?.length ?? 0) >= 1, message: p ? `${p.researchSources.length} sources` : "Missing" },
  ];
}

function validateTasksToExecute(pipeline: SpecPipeline): GateValidation[] {
  const orders = pipeline.artifacts.orders;
  const allHaveCriteria = orders.every((o) => o.acceptanceCriteria.length >= 1);
  const allHaveTests    = orders.every((o) => o.testConditions.length >= 1);
  return [
    { rule: "At least 1 order",              passed: orders.length >= 1, message: `${orders.length} orders` },
    { rule: "All orders have criteria",      passed: allHaveCriteria, message: allHaveCriteria ? "All present" : "Some orders missing criteria" },
    { rule: "All orders have test conditions", passed: allHaveTests, message: allHaveTests ? "All present" : "Some orders missing test conditions" },
    { rule: "Data model present",            passed: !!pipeline.artifacts.dataModel, message: pipeline.artifacts.dataModel ? "Present" : "Missing" },
  ];
}

type GateKey = `${PipelinePhase}_to_${PipelinePhase}`;

function runGate(pipeline: SpecPipeline, from: PipelinePhase, to: PipelinePhase): PipelineGate {
  const gateKey: GateKey = `${from}_to_${to}`;
  let validations: GateValidation[] = [];
  if (from === "constitution" && to === "specify")   validations = validateConstitutionToSpec(pipeline);
  if (from === "specify"      && to === "plan")       validations = validateSpecToPlan(pipeline);
  if (from === "plan"         && to === "tasks")      validations = validatePlanToTasks(pipeline);
  if (from === "tasks"        && to === "execute")    validations = validateTasksToExecute(pipeline);

  const passed = validations.length > 0 && validations.every((v) => v.passed);
  const gate: PipelineGate = {
    fromPhase: from, toPhase: to,
    status:      passed ? "passed" : "failed",
    validations,
    passedAt:    passed ? new Date() : undefined,
    failReason:  passed ? undefined : validations.filter((v) => !v.passed).map((v) => v.rule).join("; "),
  };
  pipeline.gates[gateKey] = gate;
  return gate;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createPipeline(patientId?: string): SpecPipeline {
  const id = nextId();
  const p: SpecPipeline = {
    id,
    patientId,
    currentPhase: "constitution",
    gates:        {},
    artifacts:    { orders: [], research: [] },
    createdAt:    new Date(),
    updatedAt:    new Date(),
  };
  _pipelines.set(id, p);
  return p;
}

export function setConstitution(pipelineId: string, ratifiedBy: string, overrides?: Partial<typeof DEFAULT_CONSTITUTION>): SpecPipeline | null {
  const p = _pipelines.get(pipelineId);
  if (!p) return null;
  p.artifacts.constitution = {
    ...DEFAULT_CONSTITUTION,
    ...overrides,
    ratifiedBy,
    ratifiedAt: new Date(),
  };
  p.updatedAt = new Date();
  return p;
}

export function setSpec(pipelineId: string, spec: ClinicalSpec): PipelineGate | null {
  const p = _pipelines.get(pipelineId);
  if (!p) return null;
  p.artifacts.spec = spec;
  p.updatedAt      = new Date();
  const gate       = runGate(p, "constitution", "specify");
  if (gate.status === "passed") p.currentPhase = "specify";
  return gate;
}

export function setPlan(pipelineId: string, plan: TreatmentPlan): PipelineGate | null {
  const p = _pipelines.get(pipelineId);
  if (!p) return null;
  p.artifacts.plan = plan;
  p.updatedAt      = new Date();
  const gate       = runGate(p, "specify", "plan");
  if (gate.status === "passed") p.currentPhase = "plan";
  return gate;
}

export function setDataModel(pipelineId: string, dataModel: PatientDataModel): void {
  const p = _pipelines.get(pipelineId);
  if (!p) return;
  p.artifacts.dataModel = dataModel;
  p.updatedAt = new Date();
}

export function addOrder(pipelineId: string, order: Omit<ClinicalOrder, "id" | "status">): ClinicalOrder | null {
  const p = _pipelines.get(pipelineId);
  if (!p) return null;
  const o: ClinicalOrder = { ...order, id: `ord_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, status: "pending" };
  p.artifacts.orders.push(o);
  p.updatedAt = new Date();
  return o;
}

export function tryAdvanceToExecute(pipelineId: string): PipelineGate | null {
  const p = _pipelines.get(pipelineId);
  if (!p) return null;
  const planGate = runGate(p, "plan", "tasks");
  if (planGate.status !== "passed") return planGate;
  const execGate = runGate(p, "tasks", "execute");
  if (execGate.status === "passed") p.currentPhase = "execute";
  return execGate;
}

export function getPipeline(id: string): SpecPipeline | undefined {
  return _pipelines.get(id);
}

export function listPipelines(): SpecPipeline[] {
  return Array.from(_pipelines.values());
}

export function computeSpecCompleteness(spec: Partial<ClinicalSpec>): number {
  let score = 0;
  if ((spec.chiefComplaint?.length ?? 0) >= 10)           score += 25;
  if ((spec.targetOutcome?.length ?? 0) >= 10)            score += 15;
  if ((spec.userJourneys?.length ?? 0) >= 1)              score += 20;
  if ((spec.acceptanceCriteria?.length ?? 0) >= 2)        score += 25;
  if ((spec.outOfScope?.length ?? 0) >= 1)                score += 15;
  return score;
}

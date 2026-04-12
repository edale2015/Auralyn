/**
 * agentTriadRegistry.ts — The Shared Triad across all 5 frameworks
 *
 * Article 26: "Before diving into differences, it helps to see what these
 *  frameworks have in common. Despite their philosophical disagreements, every
 *  framework in this comparison structures its intelligence around the same
 *  three primitives:
 *
 *  AGENTS: The personas or roles the system adopts. BMAD calls them personas.
 *   GSD calls them subagents. Superpowers calls them skills that trigger
 *   contextually. The terminology varies, but the concept is identical: a bounded
 *   context of expertise with defined responsibilities.
 *
 *  WORKFLOWS: The sequences that connect agents into pipelines. Every framework
 *   agrees that unstructured prompting produces garbage; the disagreement is over
 *   how much structure is enough.
 *
 *  SKILLS: The atomic capabilities agents perform. A reusable unit of work with
 *   defined inputs and outputs."
 *
 * Article 26 — Hybrid composition strategies:
 *   SpecKit + GSD:       "Strongest specification layer with strongest execution layer"
 *   BMAD + Superpowers:  "Enterprise planning with TDD quality guarantees"
 *   OpenSpec + Superpowers: "Lowest ceremony that still enforces testing discipline"
 *
 * Article 26: "The triad pattern (Agent, Workflow, Skill) that all these frameworks
 *  share makes composition possible. They are building blocks, not monoliths."
 *
 * Clinical translation: This is the unified registry that lets Auralyn compose
 *  any of the 5 framework patterns on the fly, or combine them in hybrids.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FrameworkSource = "BMAD" | "SpecKit" | "OpenSpec" | "GSD" | "Superpowers";

// TRIAD PRIMITIVE 1: AGENTS
export interface TriadAgent {
  id:              string;
  name:            string;
  framework:       FrameworkSource;
  role:            string;      // bounded context of expertise
  responsibilities: string[];
  constraints:     string[];    // what this agent must NOT do
  inputs:          string[];
  outputs:         string[];
  maxParallel:     number;      // 1 = singleton, Infinity = unlimited
  requiresFreshContext: boolean;  // GSD principle: fresh context per task
}

// TRIAD PRIMITIVE 2: WORKFLOWS
export interface TriadWorkflow {
  id:          string;
  name:        string;
  framework:   FrameworkSource;
  description: string;
  phases:      WorkflowPhase[];
  gated:       boolean;          // SpecKit: gated = true, GSD: gated = false (execution-first)
  parallelizable: boolean;       // GSD: parallel waves
  ceremonyLevel: "minimal" | "standard" | "full" | "enterprise";
}

export interface WorkflowPhase {
  name:         string;
  order:        number;
  agents:       string[];       // agent ids that participate
  skills:       string[];       // skill ids to invoke
  gate?:        GateCondition;
}

export interface GateCondition {
  type:     "auto" | "human";
  criteria: string[];
}

// TRIAD PRIMITIVE 3: SKILLS
export interface TriadSkill {
  id:          string;
  name:        string;
  framework:   FrameworkSource;
  description: string;
  inputs:      Record<string, string>;    // name → type
  outputs:     Record<string, string>;
  triggers:    string[];                  // conditions that auto-invoke this skill
  testable:    boolean;                   // Superpowers: all skills are testable
  preTest?:    string;                    // Superpowers TDD: the failing test that must exist first
}

// HYBRID COMBINATION
export interface HybridStrategy {
  id:          string;
  name:        string;
  frameworks:  FrameworkSource[];
  description: string;
  useCase:     string;
  tradeOff:    string;
  agents:      TriadAgent[];
  workflows:   TriadWorkflow[];
  skills:      TriadSkill[];
}

// ── Registry store ────────────────────────────────────────────────────────────

const _agents:    Map<string, TriadAgent>    = new Map();
const _workflows: Map<string, TriadWorkflow> = new Map();
const _skills:    Map<string, TriadSkill>    = new Map();
const _hybrids:   Map<string, HybridStrategy> = new Map();

// ── Registration API ──────────────────────────────────────────────────────────

export function registerAgent(agent: TriadAgent): void {
  _agents.set(agent.id, agent);
}

export function registerWorkflow(workflow: TriadWorkflow): void {
  _workflows.set(workflow.id, workflow);
}

export function registerSkill(skill: TriadSkill): void {
  _skills.set(skill.id, skill);
}

export function registerHybrid(hybrid: HybridStrategy): void {
  _hybrids.set(hybrid.id, hybrid);
}

// ── Query API ─────────────────────────────────────────────────────────────────

export function getAgent(id: string): TriadAgent | undefined           { return _agents.get(id); }
export function getWorkflow(id: string): TriadWorkflow | undefined     { return _workflows.get(id); }
export function getSkill(id: string): TriadSkill | undefined           { return _skills.get(id); }
export function getHybrid(id: string): HybridStrategy | undefined      { return _hybrids.get(id); }

export function listAgents(framework?: FrameworkSource): TriadAgent[] {
  const all = Array.from(_agents.values());
  return framework ? all.filter((a) => a.framework === framework) : all;
}

export function listWorkflows(framework?: FrameworkSource): TriadWorkflow[] {
  const all = Array.from(_workflows.values());
  return framework ? all.filter((w) => w.framework === framework) : all;
}

export function listSkills(framework?: FrameworkSource): TriadSkill[] {
  const all = Array.from(_skills.values());
  return framework ? all.filter((s) => s.framework === framework) : all;
}

export function listHybrids(): HybridStrategy[] {
  return Array.from(_hybrids.values());
}

export function getTriadSummary(): {
  agents: number; workflows: number; skills: number; hybrids: number;
  byFramework: Record<FrameworkSource, { agents: number; workflows: number; skills: number }>;
} {
  const frameworks: FrameworkSource[] = ["BMAD", "SpecKit", "OpenSpec", "GSD", "Superpowers"];
  const byFramework = {} as Record<FrameworkSource, { agents: number; workflows: number; skills: number }>;
  for (const f of frameworks) {
    byFramework[f] = {
      agents:    listAgents(f).length,
      workflows: listWorkflows(f).length,
      skills:    listSkills(f).length,
    };
  }
  return {
    agents:    _agents.size,
    workflows: _workflows.size,
    skills:    _skills.size,
    hybrids:   _hybrids.size,
    byFramework,
  };
}

// ── Pre-seeded triad: clinical implementations of all 5 frameworks ─────────────

function seed(): void {
  // ── AGENTS ──────────────────────────────────────────────────────────────────

  // BMAD personas
  const bmadPersonas: Omit<TriadAgent, "id">[] = [
    { name: "ClinicalAnalyst",    framework: "BMAD", role: "Risk stratification, evidence synthesis",    responsibilities: ["Author Clinical Brief", "Assign complexity level"], constraints: ["No treatment recommendations"], inputs: ["chiefComplaint", "vitals"], outputs: ["ClinicalBrief", "DifferentialList"], maxParallel: 1, requiresFreshContext: false },
    { name: "ClinicalArchitect",  framework: "BMAD", role: "Care pathway design, order set composition", responsibilities: ["Design minimal safe pathway", "Order set template"], constraints: ["No implementation — design only"], inputs: ["ClinicalBrief"], outputs: ["CarePathway", "OrderSetTemplate"], maxParallel: 1, requiresFreshContext: false },
    { name: "TriageSpecialist",   framework: "BMAD", role: "ESI assignment, life threat identification",  responsibilities: ["Assign ESI within 120s", "Trigger time-sensitive protocols"], constraints: ["Never defer ESI > 5 min"], inputs: ["vitals", "chiefComplaint"], outputs: ["ESILevel", "ProtocolTriggers"], maxParallel: 2, requiresFreshContext: false },
    { name: "PharmacistAdvisor",  framework: "BMAD", role: "Drug review, dose optimization",             responsibilities: ["Review all drug orders", "Flag interactions"], constraints: ["Advisory only — no prescribing"], inputs: ["OrderSet", "patientWeight", "renalFunction"], outputs: ["DrugReview", "InteractionAlerts"], maxParallel: 1, requiresFreshContext: false },
    { name: "NursingCoordinator", framework: "BMAD", role: "Care coordination, workflow translation",    responsibilities: ["Translate orders to nursing workflows"], constraints: ["Document every contact < 15 min"], inputs: ["ClinicalOrders"], outputs: ["NursingWorkflow", "MonitoringSchedule"], maxParallel: 3, requiresFreshContext: false },
    { name: "QualityAuditor",     framework: "BMAD", role: "Quality metrics, compliance audit",         responsibilities: ["Generate quality metrics", "Audit compliance"], constraints: ["Audit only — no alterations"], inputs: ["SessionTrace"], outputs: ["QualityReport", "ComplianceAudit"], maxParallel: 1, requiresFreshContext: false },
  ];

  // GSD agents (fresh context required)
  const gsdAgents: Omit<TriadAgent, "id">[] = [
    { name: "ClinicalResearcher", framework: "GSD", role: "Parallel patient context investigation", responsibilities: ["Investigate patient history, labs, meds, notes simultaneously"], constraints: ["Read-only — no modifications"], inputs: ["patientId"], outputs: ["ResearchFindings"], maxParallel: 4, requiresFreshContext: true },
    { name: "ClinicalPlanner",    framework: "GSD", role: "Convert research into execution plan",  responsibilities: ["Build wave-based clinical execution plan"], constraints: ["Plan only — no implementation"], inputs: ["ResearchFindings[]"], outputs: ["ExecutionPlan"], maxParallel: 1, requiresFreshContext: true },
    { name: "PlanChecker",        framework: "GSD", role: "Validate plan before execution",        responsibilities: ["Validate plan against guidelines before execution begins"], constraints: ["Validation only — cannot modify plan"], inputs: ["ExecutionPlan"], outputs: ["CheckReport"], maxParallel: 1, requiresFreshContext: true },
    { name: "WaveExecutor",       framework: "GSD", role: "Task implementation in fresh context",  responsibilities: ["Execute clinical task in isolated fresh context"], constraints: ["One task per context — no carryover"], inputs: ["WaveTask"], outputs: ["TaskResult"], maxParallel: Infinity, requiresFreshContext: true },
    { name: "ClinicalVerifier",   framework: "GSD", role: "Goal-backward verification",           responsibilities: ["Verify completed work: 'What must be TRUE?'"], constraints: ["Verify observable outcomes — not task completion"], inputs: ["TaskResult", "SuccessCriteria"], outputs: ["VerificationReport"], maxParallel: Infinity, requiresFreshContext: true },
    { name: "ClinicalDebugger",   framework: "GSD", role: "Hypothesis-based error diagnosis",     responsibilities: ["Build and test goal-backward hypotheses when something breaks"], constraints: ["Science method — hypothesis then test"], inputs: ["FailedGoal"], outputs: ["DebugHypotheses"], maxParallel: 1, requiresFreshContext: true },
  ];

  // Superpowers agents
  const spAgents: Omit<TriadAgent, "id">[] = [
    { name: "BrainstormGate",         framework: "Superpowers", role: "Hard gate — no intervention until design approved", responsibilities: ["Force design proposal before any action"], constraints: ["No implementation until gate passes"], inputs: ["objective"], outputs: ["DesignProposal", "GateDecision"], maxParallel: 1, requiresFreshContext: false },
    { name: "TDDEnforcer",            framework: "Superpowers", role: "Delete-and-rewrite TDD iron law",                  responsibilities: ["Require success criteria before intervention", "Delete intervention if TDD skipped"], constraints: ["Cannot allow implementation without test criteria"], inputs: ["intervention"], outputs: ["TDDProtocol"], maxParallel: 1, requiresFreshContext: false },
    { name: "SpecComplianceReviewer", framework: "Superpowers", role: "Stage 1 review — spec compliance",                responsibilities: ["Verify output complies with the spec"], constraints: ["Stage 1 must pass before Stage 2"], inputs: ["output", "spec"], outputs: ["ComplianceReport"], maxParallel: 2, requiresFreshContext: true },
    { name: "QualityReviewer",        framework: "Superpowers", role: "Stage 2 review — clinical quality",               responsibilities: ["Verify clinical quality of output"], constraints: ["Cannot pass if Stage 1 failed"], inputs: ["output", "ComplianceReport"], outputs: ["QualityReport"], maxParallel: 2, requiresFreshContext: true },
    { name: "RationalizationGuard",   framework: "Superpowers", role: "Anti-social-engineering guardrail",               responsibilities: ["Detect and block named rationalizations"], constraints: ["Cannot be disabled — always active"], inputs: ["agentText"], outputs: ["RationalizationAlert[]"], maxParallel: 1, requiresFreshContext: false },
  ];

  const allAgents = [...bmadPersonas, ...gsdAgents, ...spAgents];
  allAgents.forEach((a, i) => registerAgent({ ...a, id: `agent_${a.framework.toLowerCase()}_${i + 1}` }));

  // ── WORKFLOWS ────────────────────────────────────────────────────────────────

  const workflows: Omit<TriadWorkflow, "id">[] = [
    {
      name: "BMAD 4-Phase Clinical Cycle",    framework: "BMAD",
      description: "Analysis→Planning→Solutioning→Implementation with Party Mode persona collaboration",
      gated: true, parallelizable: false, ceremonyLevel: "full",
      phases: [
        { name: "Analysis",       order: 1, agents: ["ClinicalAnalyst"],                      skills: ["risk_stratify", "brief_author"] },
        { name: "Planning",       order: 2, agents: ["ClinicalAnalyst", "TriageSpecialist"],  skills: ["user_story_generate", "care_pathway_outline"] },
        { name: "Solutioning",    order: 3, agents: ["ClinicalArchitect", "PharmacistAdvisor"], skills: ["pathway_design", "order_set_compose"], gate: { type: "human", criteria: ["ClinicalArchitect approved pathway"] } },
        { name: "Implementation", order: 4, agents: ["NursingCoordinator", "QualityAuditor"], skills: ["order_execute", "quality_audit"], gate: { type: "human", criteria: ["Physician signed all orders"] } },
      ],
    },
    {
      name: "SpecKit Gated Clinical Pipeline", framework: "SpecKit",
      description: "Constitution→Specify→Plan→Tasks→Execute with explicit phase gates",
      gated: true, parallelizable: false, ceremonyLevel: "full",
      phases: [
        { name: "Constitution", order: 1, agents: [], skills: ["constitution_ratify"], gate: { type: "human", criteria: ["Constitution ratified by governance"] } },
        { name: "Specify",      order: 2, agents: ["ClinicalAnalyst"], skills: ["spec_author"], gate: { type: "auto", criteria: ["Completeness ≥ 80%"] } },
        { name: "Plan",         order: 3, agents: ["ClinicalArchitect"], skills: ["plan_compose"], gate: { type: "auto", criteria: ["Risk mitigation present", "Research cited"] } },
        { name: "Tasks",        order: 4, agents: ["ClinicalArchitect", "PharmacistAdvisor"], skills: ["order_generate"], gate: { type: "auto", criteria: ["All orders have acceptance criteria and test conditions"] } },
        { name: "Execute",      order: 5, agents: ["NursingCoordinator"], skills: ["order_execute"] },
      ],
    },
    {
      name: "GSD Wave-Based Clinical Execution", framework: "GSD",
      description: "4 parallel researchers → planner → checker → wave executors → verifiers",
      gated: false, parallelizable: true, ceremonyLevel: "standard",
      phases: [
        { name: "Research (×4 parallel)", order: 1, agents: ["ClinicalResearcher"], skills: ["patient_research"] },
        { name: "Plan",                   order: 2, agents: ["ClinicalPlanner"],    skills: ["plan_from_research"] },
        { name: "Plan Check",             order: 3, agents: ["PlanChecker"],        skills: ["validate_plan"], gate: { type: "auto", criteria: ["Plan passes all safety checks"] } },
        { name: "Wave Execute",           order: 4, agents: ["WaveExecutor"],       skills: ["execute_task"] },
        { name: "Verify",                 order: 5, agents: ["ClinicalVerifier"],   skills: ["goal_backward_verify"] },
      ],
    },
    {
      name: "Superpowers TDD-First Clinical Pipeline", framework: "Superpowers",
      description: "Brainstorm→TestDefine→Implement→SpecReview→QualityReview",
      gated: true, parallelizable: false, ceremonyLevel: "full",
      phases: [
        { name: "Brainstorm", order: 1, agents: ["BrainstormGate", "RationalizationGuard"], skills: ["design_proposal"], gate: { type: "human", criteria: ["Design approved by physician"] } },
        { name: "TestDefine", order: 2, agents: ["TDDEnforcer"],            skills: ["success_criteria_define"], gate: { type: "auto", criteria: ["≥1 success criterion defined"] } },
        { name: "Implement",  order: 3, agents: ["WaveExecutor"],           skills: ["execute_task"] },
        { name: "SpecReview", order: 4, agents: ["SpecComplianceReviewer"], skills: ["spec_compliance_review"], gate: { type: "human", criteria: ["Spec compliance passed"] } },
        { name: "QualityReview", order: 5, agents: ["QualityReviewer"],     skills: ["clinical_quality_review"], gate: { type: "human", criteria: ["Quality review passed"] } },
      ],
    },
  ];

  workflows.forEach((w, i) => registerWorkflow({ ...w, id: `wf_${w.framework.toLowerCase()}_${i + 1}` }));

  // ── SKILLS ───────────────────────────────────────────────────────────────────

  const skills: Omit<TriadSkill, "id">[] = [
    { name: "risk_stratify",           framework: "BMAD",        description: "Stratify patient risk into routine/moderate/complex/multi_organ",       inputs: { esiLevel: "number", organSystems: "number" }, outputs: { complexity: "ComplexityLevel" }, triggers: ["patient_arrives"], testable: true, preTest: "Complexity classification matches expected for ESI input" },
    { name: "spec_author",             framework: "SpecKit",      description: "Author structured Clinical Spec with acceptance criteria",              inputs: { chiefComplaint: "string", constraints: "string[]" }, outputs: { spec: "ClinicalSpec", completeness: "number" }, triggers: ["constitution_ratified"], testable: true, preTest: "Spec completeness ≥ 80%" },
    { name: "delta_protocol_change",   framework: "OpenSpec",     description: "Record ADDED/MODIFIED/REMOVED protocol delta with change isolation",   inputs: { changeType: "ADDED|MODIFIED|REMOVED", protocol: "string" }, outputs: { deltaId: "string" }, triggers: ["protocol_update_requested"], testable: true, preTest: "Delta hash verifiable" },
    { name: "patient_research",        framework: "GSD",          description: "Parallel investigation of patient vitals, labs, meds, notes",          inputs: { patientId: "string", domain: "string" }, outputs: { findings: "ResearchFindings" }, triggers: ["patient_arrives", "new_wave_start"], testable: true, preTest: "Research completes with non-empty findings" },
    { name: "goal_backward_verify",    framework: "GSD",          description: "Goal-backward: 'What must be TRUE for this patient to be stable?'",    inputs: { goal: "string", observations: "string[]" }, outputs: { hypotheses: "DebugHypothesis[]", result: "boolean" }, triggers: ["wave_complete"], testable: true, preTest: "At least 1 hypothesis tested with observable result" },
    { name: "rationalization_check",   framework: "Superpowers",  description: "Detect named rationalizations in agent text, block if critical",       inputs: { text: "string" }, outputs: { detected: "ClinicalRationalization[]", blocked: "boolean" }, triggers: ["any_agent_output"], testable: true, preTest: "Known rationalization patterns are detected" },
    { name: "success_criteria_define", framework: "Superpowers",  description: "Define measurable success criteria BEFORE intervention (TDD iron law)", inputs: { interventionName: "string" }, outputs: { protocol: "TDDProtocol" }, triggers: ["brainstorm_approved"], testable: true, preTest: "Protocol has ≥1 criterion before intervention starts" },
    { name: "context_rot_check",       framework: "GSD",          description: "Monitor context utilization, flag degradation zone, recommend reset",   inputs: { tokenCount: "number", maxTokens: "number" }, outputs: { zone: "ContextHealthZone", recommendation: "string" }, triggers: ["token_count_update"], testable: true, preTest: "Zone correctly classified per 0/30/50/70/80% thresholds" },
  ];

  skills.forEach((s, i) => registerSkill({ ...s, id: `skill_${s.framework.toLowerCase()}_${i + 1}` }));

  // ── HYBRID COMPOSITIONS ───────────────────────────────────────────────────────

  const hybrids: Omit<HybridStrategy, "id">[] = [
    {
      name:        "SpecKit + GSD: Specify Then Execute",
      frameworks:  ["SpecKit", "GSD"],
      description: "Article 26: 'Use SpecKit's specification process to define requirements, then hand off to GSD's execution engine for parallel implementation.'",
      useCase:     "Greenfield clinical modules where requirements are unclear but implementation needs to be fast and parallel.",
      tradeOff:    "Strongest spec layer + strongest execution layer, but doubles tooling complexity.",
      agents:    [
        ...listAgents("SpecKit"),
        ...listAgents("GSD").filter((a) => ["ClinicalPlanner", "WaveExecutor", "ClinicalVerifier"].includes(a.name)),
      ],
      workflows: [listWorkflows("SpecKit")[0], listWorkflows("GSD")[0]].filter(Boolean),
      skills:    [...listSkills("SpecKit"), ...listSkills("GSD")],
    },
    {
      name:        "BMAD + Superpowers: Enterprise Planning + TDD Quality",
      frameworks:  ["BMAD", "Superpowers"],
      description: "Article 26: 'Use BMAD's persona-based planning for architecture, then Superpowers' TDD enforcement for implementation.'",
      useCase:     "Enterprise clinical deployments that need BMAD's traceability with Superpowers' code quality guarantees.",
      tradeOff:    "Maximum traceability + maximum quality. Highest ceremony overhead.",
      agents:    [
        ...listAgents("BMAD"),
        ...listAgents("Superpowers"),
      ],
      workflows: [listWorkflows("BMAD")[0], listWorkflows("Superpowers")[0]].filter(Boolean),
      skills:    [...listSkills("BMAD"), ...listSkills("Superpowers")],
    },
    {
      name:        "OpenSpec + Superpowers: Low-Ceremony Brownfield",
      frameworks:  ["OpenSpec", "Superpowers"],
      description: "Article 26: 'Use OpenSpec's delta specs for change management on brownfield projects, then Superpowers' quality gates for execution. Lowest ceremony combination that still enforces testing discipline.'",
      useCase:     "Ongoing changes to existing clinical protocols — iterative, low ceremony, still enforces testing discipline.",
      tradeOff:    "Lowest overhead that still enforces TDD. Risk: delta specs may not capture full architectural impact.",
      agents:    listAgents("Superpowers"),
      workflows: [listWorkflows("Superpowers")[0]].filter(Boolean),
      skills:    [
        listSkills("OpenSpec")[0],
        ...listSkills("Superpowers"),
      ].filter(Boolean),
    },
  ];

  hybrids.forEach((h, i) => registerHybrid({ ...h, id: `hybrid_${i + 1}` }));
}

// Run seed on module load
seed();

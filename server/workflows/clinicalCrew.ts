/**
 * Clinical Crew (CrewAI equivalent)
 *
 * Article — CrewAI:
 *   "CrewAI creates teams of AI agents that collaborate on complex tasks.
 *   In CrewAI you define: Agents (with a role, goal, and backstory), Tasks
 *   (assigned to specific agents), and a Crew (a collection of agents working
 *   toward a shared goal). The crew manager coordinates who does what and when.
 *   Agents can delegate subtasks to each other."
 *
 * What's already present:
 *   - agentCoordinator.ts     — registerAgent + task scheduler with TTL
 *   - multiAgentCoordinator.ts — O(1) task assignment/completion map
 *   - debateEngine.ts          — parallel voting, one round
 *   - clinicalConsensusOrchestrator.ts — specialist council
 *
 * What's missing:
 *   The CrewAI model is hierarchical sequential delegation, not parallel voting:
 *     - Manager decides task order and which specialist to call first
 *     - Each specialist produces a structured output
 *     - The next specialist builds on the previous one's output
 *     - The Executor takes the final synthesized plan and implements it
 *
 *   Clinical equivalent:
 *     Attending (Manager):
 *       "I need: (1) risk stratification, (2) specialist input on cardiac risk,
 *        (3) medication safety check, then I'll decide disposition"
 *     Internist (Specialist 1): runs risk scoring, produces HEART = 4
 *     Cardiologist (Specialist 2): reviews HEART 4 + ECG, recommends obs
 *     Pharmacist (Specialist 3): checks medication interactions
 *     Attending (Manager): synthesizes → OBSERVATION + troponin trend
 *     NP (Executor): writes orders, documents in EHR
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrewRole = "manager" | "specialist" | "executor";
export type TaskStatus = "pending" | "running" | "complete" | "failed" | "delegated";

export interface CrewTask {
  taskId:         string;
  name:           string;
  description:    string;
  assignedTo:     string;    // agent id
  dependsOn?:     string[];  // taskIds that must complete first
  input:          Record<string, unknown>;
  output?:        Record<string, unknown>;
  status:         TaskStatus;
  startedAt?:     string;
  completedAt?:   string;
  latencyMs?:     number;
  delegatedTo?:   string;    // agent id if delegated
}

export interface CrewAgent {
  id:          string;
  name:        string;
  role:        CrewRole;
  specialty:   string;    // e.g. "cardiology", "pharmacology", "triage"
  goalPrompt:  string;    // what this agent is trying to achieve
  /**
   * Execute a task. Receives the task input + outputs from all previously
   * completed tasks (the accumulated context). Returns structured output.
   */
  execute: (
    task:           CrewTask,
    crewContext:    Record<string, unknown>,
    completedOutputs: Record<string, Record<string, unknown>>
  ) => Promise<Record<string, unknown>>;
  /**
   * (Manager only) Plan tasks given the goal.
   * Returns the ordered list of task definitions.
   */
  planTasks?: (
    goal:     string,
    context:  Record<string, unknown>
  ) => Promise<Omit<CrewTask, "taskId" | "status">[]>;
}

export interface CrewDefinition {
  crewId:   string;
  name:     string;
  goal:     string;
  manager:  CrewAgent;
  agents:   CrewAgent[];   // specialists + executors
}

export interface CrewRunResult {
  runId:          string;
  crewId:         string;
  crewName:       string;
  goal:           string;
  status:         "success" | "partial" | "failed";
  tasks:          CrewTask[];
  finalOutput:    Record<string, unknown>;
  durationMs:     number;
  agentOutputs:   Record<string, Record<string, unknown>>;   // agentId → output
  managerSummary: string;
  startedAt:      string;
}

// ── Dependency resolver ───────────────────────────────────────────────────────

function getReadyTasks(tasks: CrewTask[]): CrewTask[] {
  const complete = new Set(tasks.filter((t) => t.status === "complete").map((t) => t.taskId));
  return tasks.filter(
    (t) => t.status === "pending" &&
    (t.dependsOn ?? []).every((dep) => complete.has(dep))
  );
}

// ── Crew runner ───────────────────────────────────────────────────────────────

/**
 * Run a clinical crew.
 * The Manager plans tasks, then tasks are executed in dependency order.
 * Each agent receives all previously completed outputs (crew context).
 */
export async function runClinicalCrew(
  crew:    CrewDefinition,
  context: Record<string, unknown>
): Promise<CrewRunResult> {
  const runId    = `crew-${randomUUID().slice(0, 8)}`;
  const startedAt= new Date().toISOString();
  const tStart   = Date.now();

  const agentMap = new Map<string, CrewAgent>();
  agentMap.set(crew.manager.id, crew.manager);
  for (const a of crew.agents) agentMap.set(a.id, a);

  // Step 1: Manager plans the task list
  let tasks: CrewTask[] = [];
  if (crew.manager.planTasks) {
    const planned = await crew.manager.planTasks(crew.goal, context);

    // First pass: assign taskIds and build a name→taskId map
    const nameToId = new Map<string, string>();
    const withIds = planned.map((t) => {
      const taskId = `task-${randomUUID().slice(0, 6)}`;
      nameToId.set(t.name, taskId);
      return { ...t, taskId, status: "pending" as TaskStatus };
    });

    // Second pass: resolve dependsOn names to taskIds
    tasks = withIds.map((t) => ({
      ...t,
      dependsOn: (t.dependsOn ?? []).map((dep) => nameToId.get(dep) ?? dep),
    }));
  } else {
    throw new Error(`Crew manager "${crew.manager.name}" has no planTasks() — cannot orchestrate crew`);
  }

  const completedOutputs: Record<string, Record<string, unknown>> = {};
  const agentOutputs:     Record<string, Record<string, unknown>> = {};
  let failCount = 0;

  // Step 2: Execute tasks in dependency order
  const MAX_ITERATIONS = tasks.length * 2;  // prevent infinite loop
  let iterations       = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const ready = getReadyTasks(tasks);
    if (ready.length === 0) break;

    for (const task of ready) {
      task.status    = "running";
      task.startedAt = new Date().toISOString();
      const tStep    = Date.now();

      const agent = agentMap.get(task.assignedTo);
      if (!agent) {
        task.status = "failed";
        task.output = { error: `Agent not found: ${task.assignedTo}` };
        failCount++;
        continue;
      }

      try {
        const crewCtx = { ...context, ...Object.values(completedOutputs).reduce((acc, o) => ({ ...acc, ...o }), {}) };
        const output  = await agent.execute(task, crewCtx, completedOutputs);

        task.output      = output;
        task.status      = "complete";
        task.completedAt = new Date().toISOString();
        task.latencyMs   = Date.now() - tStep;

        completedOutputs[task.taskId] = output;
        agentOutputs[agent.id]        = { ...(agentOutputs[agent.id] ?? {}), ...output };
      } catch (err) {
        task.status      = "failed";
        task.completedAt = new Date().toISOString();
        task.latencyMs   = Date.now() - tStep;
        task.output      = { error: err instanceof Error ? err.message : String(err) };
        failCount++;
      }
    }
  }

  // Step 3: Manager synthesizes final output
  const managerSynthesis = await crew.manager.execute(
    {
      taskId:      "synthesis",
      name:        "Final Synthesis",
      description: `Synthesize all specialist outputs for: ${crew.goal}`,
      assignedTo:  crew.manager.id,
      input:       context,
      status:      "running",
    },
    { ...context, ...Object.values(agentOutputs).reduce((acc, o) => ({ ...acc, ...o }), {}) },
    completedOutputs
  );

  const finalOutput: Record<string, unknown> = {
    goal: crew.goal,
    ...managerSynthesis,
    crewOutputs: agentOutputs,
  };

  const managerSummary = buildManagerSummary(crew, tasks, managerSynthesis, failCount);

  return {
    runId,
    crewId:   crew.crewId,
    crewName: crew.name,
    goal:     crew.goal,
    status:   failCount === 0 ? "success" : failCount < tasks.length ? "partial" : "failed",
    tasks,
    finalOutput,
    durationMs:     Date.now() - tStart,
    agentOutputs,
    managerSummary,
    startedAt,
  };
}

function buildManagerSummary(
  crew:     CrewDefinition,
  tasks:    CrewTask[],
  synthesis:Record<string, unknown>,
  failCount:number
): string {
  const complete = tasks.filter((t) => t.status === "complete").length;
  const lines    = [
    `## ${crew.name} — ${crew.goal}`,
    `Manager: ${crew.manager.name} | Specialists: ${crew.agents.length} | Tasks: ${complete}/${tasks.length} completed, ${failCount} failed`,
    ``,
  ];
  for (const t of tasks) {
    const icon  = t.status === "complete" ? "✓" : t.status === "failed" ? "✗" : "○";
    const agent = crew.agents.find((a) => a.id === t.assignedTo) ?? crew.manager;
    lines.push(`  ${icon} [${agent.specialty}] ${t.name} (${t.latencyMs ?? 0}ms)`);
    if (t.output && !t.output.error) {
      const preview = JSON.stringify(t.output).slice(0, 80);
      lines.push(`     → ${preview}...`);
    }
    if (t.output?.error) lines.push(`     ✗ ${t.output.error}`);
  }
  lines.push(`\nSynthesis: ${JSON.stringify(synthesis).slice(0, 200)}`);
  return lines.join("\n");
}

// ── Built-in clinical crew factory ───────────────────────────────────────────

/**
 * Build a standard chest pain evaluation crew:
 *   Manager (Attending) → Internist (risk scoring) → Cardiologist (ECG + troponin)
 *   → Pharmacist (medication safety) → NP (order executor)
 */
export function buildChestPainCrew(): CrewDefinition {
  const attending: CrewAgent = {
    id: "attending", name: "Attending Physician", role: "manager", specialty: "emergency-medicine",
    goalPrompt: "Determine safe disposition for chest pain patient with HEART scoring",

    async planTasks(goal, context): Promise<Omit<CrewTask, "taskId" | "status">[]> {
      return [
        {
          name: "Risk Stratification", description: "Calculate HEART score and NEWS2",
          assignedTo: "internist", dependsOn: [], input: context,
        },
        {
          name: "Cardiac Assessment", description: "Review ECG findings and troponin trend",
          assignedTo: "cardiologist", dependsOn: [], input: context,
        },
        {
          name: "Medication Safety", description: "Check for anticoagulant/antiplatelet contraindications",
          assignedTo: "pharmacist", dependsOn: ["Risk Stratification"], input: context,
        },
        {
          name: "Order Entry", description: "Write and sign orders per specialist recommendations",
          assignedTo: "np-executor", dependsOn: ["Cardiac Assessment", "Medication Safety"], input: context,
        },
      ];
    },

    async execute(_task, crewCtx, completedOutputs): Promise<Record<string, unknown>> {
      const heartScore   = Object.values(completedOutputs).find((o) => o.heartScore !== undefined)?.heartScore ?? "unknown";
      const disposition  = Number(heartScore) <= 3 ? "DISCHARGE with outpatient follow-up"
                         : Number(heartScore) <= 6 ? "OBSERVE — troponin trend monitoring"
                         : "ADMIT — cardiology consultation";
      return {
        managerDecision: disposition,
        heartScore,
        rationale: `HEART score ${heartScore}: ${disposition}`,
        confidence: 0.85,
      };
    },
  };

  const internist: CrewAgent = {
    id: "internist", name: "Internal Medicine", role: "specialist", specialty: "internal-medicine",
    goalPrompt: "Calculate clinical risk scores",
    async execute(task, crewCtx): Promise<Record<string, unknown>> {
      const hr    = Number(crewCtx.hr ?? 80);
      const sbp   = Number(crewCtx.sbp ?? 120);
      const age   = Number(crewCtx.age ?? 50);
      // Simplified HEART score calculation
      const history   = 1; // moderately suspicious
      const ecg       = 0; // normal
      const ageScore  = age < 45 ? 0 : age < 65 ? 1 : 2;
      const riskFactor= 1; // at least one
      const troponin  = 0; // normal
      const heartScore = history + ecg + ageScore + riskFactor + troponin;
      const news2     = (hr > 100 ? 1 : 0) + (sbp < 100 ? 2 : 0);
      return { heartScore, news2, ageScore, riskTier: heartScore <= 3 ? "low" : heartScore <= 6 ? "intermediate" : "high" };
    },
  };

  const cardiologist: CrewAgent = {
    id: "cardiologist", name: "Cardiology Consult", role: "specialist", specialty: "cardiology",
    goalPrompt: "Evaluate cardiac risk and ECG findings",
    async execute(task, crewCtx): Promise<Record<string, unknown>> {
      const hasSTElevation = crewCtx.stElevation === true;
      const troponin       = Number(crewCtx.troponin ?? 0);
      return {
        ecgInterpretation: hasSTElevation ? "STEMI — activate cath lab" : "Non-diagnostic ST changes",
        troponinStatus:    troponin > 0.04 ? "POSITIVE — acute MI" : "NEGATIVE",
        cardiacRisk:       hasSTElevation || troponin > 0.04 ? "HIGH" : "INTERMEDIATE",
        recommendation:    hasSTElevation ? "URGENT PCI" : troponin > 0.04 ? "NSTEMI protocol" : "Serial troponin Q3h",
      };
    },
  };

  const pharmacist: CrewAgent = {
    id: "pharmacist", name: "Clinical Pharmacist", role: "specialist", specialty: "pharmacology",
    goalPrompt: "Verify medication safety for chest pain management",
    async execute(task, crewCtx, completedOutputs): Promise<Record<string, unknown>> {
      const anticoagulated = crewCtx.anticoagulated === true;
      const allergyPenicillin = (crewCtx.allergies as string[] ?? []).includes("penicillin");
      const warnings: string[] = [];
      if (anticoagulated) warnings.push("Patient anticoagulated — heparin dosing requires adjustment");
      if (allergyPenicillin) warnings.push("Penicillin allergy documented");
      return {
        medicationSafe:  warnings.length === 0,
        warnings,
        recommendedMeds: ["Aspirin 325mg loading", "Sublingual NTG PRN chest pain"],
        contraindicationFound: warnings.length > 0,
      };
    },
  };

  const npExecutor: CrewAgent = {
    id: "np-executor", name: "Nurse Practitioner", role: "executor", specialty: "order-entry",
    goalPrompt: "Implement specialist plan via order entry",
    async execute(task, crewCtx, completedOutputs): Promise<Record<string, unknown>> {
      const allOutputs  = Object.values(completedOutputs).reduce((acc, o) => ({ ...acc, ...o }), {} as Record<string, unknown>);
      const ordersPlaced: string[] = [];
      if (allOutputs.recommendation) ordersPlaced.push(String(allOutputs.recommendation));
      if (allOutputs.recommendedMeds) ordersPlaced.push(...(allOutputs.recommendedMeds as string[]));
      ordersPlaced.push("Continuous cardiac monitoring", "IV access x2", "NPO status");
      return { ordersPlaced, ordersCount: ordersPlaced.length, documentedAt: new Date().toISOString() };
    },
  };

  return {
    crewId:  "chest-pain-crew",
    name:    "Chest Pain Evaluation Crew",
    goal:    "Risk-stratify and safely disposition chest pain patient",
    manager: attending,
    agents:  [internist, cardiologist, pharmacist, npExecutor],
  };
}

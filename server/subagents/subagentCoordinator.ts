/**
 * subagentCoordinator.ts — Hub-and-spoke subagent delegation
 *
 * Article 27c (Subagents): "Every time Claude Code spawns a subagent, it is
 *  making a deliberate architectural choice: split work across isolated,
 *  specialized workers."
 *
 * 4 built-in subagent types (Article 27c):
 *   Explore       — Model: Haiku (fast), Tools: Read/Grep/Glob, Purpose: code search,
 *                   supports thoroughness levels: quick/medium/very_thorough
 *   Plan          — Model: inherits main, Tools: read-only, Purpose: research during plan mode
 *   General-purpose — Model: inherits main, Tools: ALL, Purpose: complex multi-step tasks
 *   Bash          — Model: inherits main, Tools: Bash only, Purpose: terminal commands
 *
 * 5-step delegation flow:
 *   1. Task Identification — factors: context pollution? tool restriction? parallelizable?
 *   2. Delegation via Agent tool — pass subtask + system prompt + allowed tools + model
 *   3. Autonomous Execution — isolated context window, no main-context visibility
 *   4. Return of Results — ONLY summary returns to parent (not the full transcript)
 *   5. Resumption — resume via agentId, preserving accumulated context
 *
 * Hub-and-spoke rule: Subagents NEVER communicate directly with each other.
 *   Instructions flow main→subagent. Summaries flow subagent→main.
 *   "If Agent A talks to Agent B, which talks to Agent C, good luck tracing a problem."
 *
 * Agent Teams (full mesh): For when agents genuinely need real-time peer coordination.
 *   Mailbox-based message passing. Each agent has its own independent context window.
 *
 * Explore-Plan-Execute pattern (Article 27c best practice):
 *   Step 1: Explore agent maps the relevant code/data → summary
 *   Step 2: Plan agent takes summary → designs implementation approach
 *   Step 3: General-purpose agent implements plan with full tool access
 *
 * Custom agent YAML frontmatter fields:
 *   name, description, model, tools, disallowedTools, permissionMode, maxTurns
 *
 * Clinical translation:
 *   Explore: read patient history — never modify, read-only scout
 *   Plan:    design care pathway from exploration findings
 *   General-purpose: execute clinical orders (full access, physician-supervised)
 *   Bash:    run validation scripts, lab calculators, drug interaction checks
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuiltinSubagentType = "explore" | "plan" | "general_purpose" | "bash";
export type ThoroughnessLevel   = "quick" | "medium" | "very_thorough";
export type DelegationFactor    = "extensive_exploration" | "tool_restriction" | "parallelizable" | "custom_agent_match";
export type SubagentStatus      = "pending" | "running" | "complete" | "failed" | "resumed";
export type TeamCommunication   = "hub_and_spoke" | "full_mesh";

export interface SubagentDefinition {
  id:           string;
  name:         string;
  description:  string;    // THE most important field — how main agent decides when to delegate
  type:         BuiltinSubagentType | "custom";
  model:        string;    // "haiku" for Explore (fast/cheap), "inherit" otherwise
  tools:        string[];  // "read-only" | specific tool names
  disallowedTools: string[];
  permissionMode?: "plan" | "full";
  maxTurns?:    number;
  systemPrompt?: string;
  thoroughness?: ThoroughnessLevel;  // Explore only
}

export interface SubagentInstance {
  agentId:      string;           // unique — used for resumption
  definition:   SubagentDefinition;
  taskDescription: string;
  contextId:    string;           // isolated context window ID
  status:       SubagentStatus;
  parentRunId?: string;           // hub-and-spoke: always has a parent
  parallelGroup?: string;         // group ID if running in parallel with siblings
  summary?:     string;           // ONLY thing returned to parent (not full transcript)
  iterations:   number;
  createdAt:    Date;
  completedAt?: Date;
}

export interface DelegationDecision {
  shouldDelegate:  boolean;
  factors:         DelegationFactor[];
  recommendedType: BuiltinSubagentType | "custom";
  reasoning:       string;
  canParallelize:  boolean;
}

export interface ExecPlanEChain {
  id:          string;
  sessionId:   string;
  goal:        string;
  stage:       "explore" | "plan" | "execute" | "complete";
  exploreAgent?: SubagentInstance;
  planAgent?:   SubagentInstance;
  executeAgent?: SubagentInstance;
  exploreSummary?: string;
  planSummary?:    string;
  result?:         string;
  createdAt:       Date;
  updatedAt:       Date;
}

// Agent Teams: full mesh communication
export interface AgentTeamMessage {
  fromAgentId: string;
  toAgentId:   string;
  subject:     string;
  content:     string;
  at:          Date;
}

export interface AgentTeam {
  id:          string;
  name:        string;
  agents:      SubagentInstance[];
  mailbox:     Record<string, AgentTeamMessage[]>;  // agentId → messages
  pattern:     TeamCommunication;
  createdAt:   Date;
}

// ── Built-in subagent definitions ─────────────────────────────────────────────

export const BUILTIN_DEFINITIONS: Record<BuiltinSubagentType, SubagentDefinition> = {
  explore: {
    id:           "builtin_explore",
    name:         "explore",
    description:  "Explores codebases and patient records to find relevant files and data. Read-only. Use when extensive file exploration would pollute main context. Supports quick/medium/very_thorough modes.",
    type:         "explore",
    model:        "haiku",    // Fast and cheap — Haiku for exploration
    tools:        ["read_file", "grep", "glob"],
    disallowedTools: ["write_file", "edit_file", "execute"],
    permissionMode: "plan",
    thoroughness:  "medium",
  },
  plan: {
    id:           "builtin_plan",
    name:         "plan",
    description:  "Researches the codebase to inform a strategy during plan mode. Read-only. Breaks down complex tasks into actionable steps. Use in plan mode only.",
    type:         "plan",
    model:        "inherit",
    tools:        ["read_file", "grep", "glob"],
    disallowedTools: ["write_file", "edit_file", "execute"],
    permissionMode: "plan",
  },
  general_purpose: {
    id:           "builtin_general",
    name:         "general-purpose",
    description:  "Handles complex multi-step tasks requiring full capability access including file modifications. Use for tasks that need to read, write, edit, and execute in a single context.",
    type:         "general_purpose",
    model:        "inherit",
    tools:        ["read_file", "write_file", "edit_file", "ls", "glob", "grep", "execute"],
    disallowedTools: [],
    permissionMode: "full",
  },
  bash: {
    id:           "builtin_bash",
    name:         "bash",
    description:  "Executes terminal commands in a separate context, keeping shell output out of the main conversation. Use for running tests, installing dependencies, git operations.",
    type:         "bash",
    model:        "inherit",
    tools:        ["execute"],
    disallowedTools: ["read_file", "write_file", "edit_file"],
    permissionMode: "full",
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

const _definitions  = new Map<string, SubagentDefinition>();
const _instances    = new Map<string, SubagentInstance>();
const _chains       = new Map<string, ExecPlanEChain>();
const _teams        = new Map<string, AgentTeam>();

// Seed built-ins
Object.values(BUILTIN_DEFINITIONS).forEach((d) => _definitions.set(d.id, d));

// ── Custom agent registration ─────────────────────────────────────────────────
// Article: "Custom agent definitions — YAML frontmatter with name, description,
//  model, tools, disallowedTools, permissionMode, maxTurns, systemPrompt"

export function registerCustomAgent(def: Omit<SubagentDefinition, "id" | "type">): SubagentDefinition {
  const id  = `custom_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const full = { ...def, id, type: "custom" as const };
  _definitions.set(id, full);
  return full;
}

// ── Delegation decision (5-step flow Step 1) ──────────────────────────────────
// Article: "Main agent considers:
//   Does the task require extensive file exploration that would clutter context?
//   Would restricting tool access improve safety for this subtask?
//   Can parts of the task run in parallel for faster completion?
//   Does a custom agent's description match the work being requested?"

export function decideDelegation(taskDescription: string, requestedTools?: string[]): DelegationDecision {
  const desc     = taskDescription.toLowerCase();
  const factors: DelegationFactor[] = [];

  // Factor 1: Extensive exploration
  const explorationKeywords = ["explore", "find all", "search", "scan", "investigate", "map", "locate", "discover", "list all"];
  if (explorationKeywords.some((k) => desc.includes(k))) factors.push("extensive_exploration");

  // Factor 2: Tool restriction improves safety
  const readOnlyKeywords = ["read", "review", "analyze", "audit", "check", "examine", "assess"];
  const hasModifyKeywords = ["write", "edit", "modify", "update", "create", "delete", "execute", "run"];
  if (readOnlyKeywords.some((k) => desc.includes(k)) && !hasModifyKeywords.some((k) => desc.includes(k))) {
    factors.push("tool_restriction");
  }

  // Factor 3: Can parallelize
  const parallelKeywords = ["parallel", "simultaneously", "at the same time", "concurrently", "while also", "in parallel"];
  if (parallelKeywords.some((k) => desc.includes(k))) factors.push("parallelizable");

  // Factor 4: Custom agent match
  const customAgents = Array.from(_definitions.values()).filter((d) => d.type === "custom");
  const matched      = customAgents.find((d) => {
    const dTerms = d.description.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    return dTerms.some((t) => desc.includes(t));
  });
  if (matched) factors.push("custom_agent_match");

  const shouldDelegate = factors.length > 0;

  // Choose type
  let recommendedType: BuiltinSubagentType | "custom" = "general_purpose";
  if (factors.includes("custom_agent_match"))       recommendedType = "custom";
  else if (factors.includes("extensive_exploration")) recommendedType = "explore";
  else if (factors.includes("tool_restriction"))     recommendedType = "explore";
  else if (desc.includes("bash") || desc.includes("shell") || /run (the )?test|run tests|test suite/.test(desc) || desc.includes("execute") || desc.includes("terminal command")) {
    recommendedType = "bash";
  }

  return {
    shouldDelegate,
    factors,
    recommendedType,
    reasoning: shouldDelegate
      ? `Delegating because: ${factors.join(", ")}. Recommended: ${recommendedType}`
      : "Task does not need delegation — keep in main context",
    canParallelize: factors.includes("parallelizable"),
  };
}

// ── Spawn subagent ────────────────────────────────────────────────────────────

export function spawnSubagent(
  type:            BuiltinSubagentType | "custom",
  taskDescription: string,
  parentRunId?:    string,
  parallelGroup?:  string,
  customDefId?:    string,
): SubagentInstance {
  const def = type === "custom" && customDefId
    ? _definitions.get(customDefId) ?? BUILTIN_DEFINITIONS.general_purpose
    : BUILTIN_DEFINITIONS[type as BuiltinSubagentType] ?? BUILTIN_DEFINITIONS.general_purpose;

  const instance: SubagentInstance = {
    agentId:        `agent_${Date.now()}_${randomUUID().slice(0, 8)}`,
    definition:     def,
    taskDescription,
    contextId:      `ctx_${randomUUID()}`,   // isolated context — clean slate
    status:         "running",
    parentRunId,
    parallelGroup,
    iterations:     0,
    createdAt:      new Date(),
  };
  _instances.set(instance.agentId, instance);
  return instance;
}

// ── Hub-and-spoke: return summary (only summary goes to parent) ───────────────

export function completeSubagent(agentId: string, summary: string): SubagentInstance | null {
  const inst = _instances.get(agentId);
  if (!inst) return null;
  // Article: "Only this final result enters the parent conversation. If the
  //  subagent read 200 files during exploration, the main agent sees a
  //  concise summary, not 200 file contents."
  inst.status      = "complete";
  inst.summary     = summary;
  inst.completedAt = new Date();
  return inst;
}

export function failSubagent(agentId: string, error: string): SubagentInstance | null {
  const inst = _instances.get(agentId);
  if (!inst) return null;
  inst.status  = "failed";
  inst.summary = `ERROR: ${error}`;
  inst.completedAt = new Date();
  return inst;
}

// ── Subagent resumption ───────────────────────────────────────────────────────
// Article: "The main agent can resume the subagent by sending a SendMessage
//  with that agentId. The subagent picks up from its previous state, preserving
//  all accumulated context. Always prefer resuming over restarting."

export function resumeSubagent(agentId: string, additionalInstruction: string): SubagentInstance | null {
  const inst = _instances.get(agentId);
  if (!inst) return null;
  if (inst.status === "complete" || inst.status === "failed") {
    // Article: "Use SendMessage with the stored agentId to continue where it left off"
    inst.status    = "resumed";
    inst.iterations += 1;
    inst.taskDescription = `${inst.taskDescription}\n\n[RESUMED] ${additionalInstruction}`;
    // Critically: same contextId — preserves accumulated knowledge
  }
  return inst;
}

// ── Explore-Plan-Execute chain ────────────────────────────────────────────────

export function createEPEChain(sessionId: string, goal: string): ExecPlanEChain {
  const chain: ExecPlanEChain = {
    id:        `epe_${Date.now()}`,
    sessionId, goal,
    stage:     "explore",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  _chains.set(chain.id, chain);
  return chain;
}

export function advanceEPEChain(chainId: string, stageSummary: string): ExecPlanEChain | null {
  const chain = _chains.get(chainId);
  if (!chain) return null;

  if (chain.stage === "explore") {
    chain.exploreAgent   = spawnSubagent("explore", `Map clinical data for: ${chain.goal}`);
    chain.exploreSummary = stageSummary;
    chain.stage          = "plan";
  } else if (chain.stage === "plan") {
    chain.planAgent      = spawnSubagent("plan", `Design care pathway based on: ${chain.exploreSummary}`);
    chain.planSummary    = stageSummary;
    chain.stage          = "execute";
  } else if (chain.stage === "execute") {
    chain.executeAgent   = spawnSubagent("general_purpose", `Execute: ${chain.planSummary}`);
    chain.result         = stageSummary;
    chain.stage          = "complete";
  }

  chain.updatedAt = new Date();
  return chain;
}

// ── Agent Teams (full mesh) ───────────────────────────────────────────────────
// Article: "Agent Teams use full mesh communication where agents talk to each
//  other directly through a mailbox-based messaging system."

export function createAgentTeam(name: string, agentTypes: Array<BuiltinSubagentType | "custom">): AgentTeam {
  const agents = agentTypes.map((t) => spawnSubagent(t, `${name} team member (${t})`));
  const mailbox: Record<string, AgentTeamMessage[]> = {};
  agents.forEach((a) => { mailbox[a.agentId] = []; });

  const team: AgentTeam = {
    id:       `team_${Date.now()}`,
    name,
    agents,
    mailbox,
    pattern:  "full_mesh",
    createdAt: new Date(),
  };
  _teams.set(team.id, team);
  return team;
}

export function sendTeamMessage(teamId: string, fromAgentId: string, toAgentId: string, subject: string, content: string): boolean {
  const team = _teams.get(teamId);
  if (!team) return false;
  if (!team.mailbox[toAgentId]) return false;
  // Full mesh: any agent can message any other (vs hub-and-spoke which only goes through main)
  team.mailbox[toAgentId].push({ fromAgentId, toAgentId, subject, content, at: new Date() });
  return true;
}

export function readTeamMailbox(teamId: string, agentId: string): AgentTeamMessage[] {
  const team = _teams.get(teamId);
  return team?.mailbox[agentId] ?? [];
}

// ── Query API ─────────────────────────────────────────────────────────────────

export function getSubagentInstance(agentId: string): SubagentInstance | undefined  { return _instances.get(agentId); }
export function listSubagentInstances(parentRunId?: string): SubagentInstance[] {
  const all = Array.from(_instances.values());
  return parentRunId ? all.filter((i) => i.parentRunId === parentRunId) : all;
}
export function getEPEChain(chainId: string): ExecPlanEChain | undefined             { return _chains.get(chainId); }
export function getAgentTeam(teamId: string): AgentTeam | undefined                  { return _teams.get(teamId); }
export function listDefinitions(): SubagentDefinition[]                               { return Array.from(_definitions.values()); }
export function getBuiltinDefinitions(): typeof BUILTIN_DEFINITIONS                   { return BUILTIN_DEFINITIONS; }

// Description quality check for custom agents
// Article: "Good descriptions are action-oriented, specific, and bounded."
export function validateAgentDescription(description: string): {
  isActionOriented: boolean;
  isSpecific:       boolean;
  isBounded:        boolean;
  score:            number;
  feedback:         string;
} {
  const startsWithVerb   = /^(Reviews?|Analyzes?|Explores?|Executes?|Audits?|Monitors?|Verifies?|Generates?|Processes?|Extracts?|Runs?|Searches?|Checks?|Assesses?|Coordinates?|Handles?|Performs?|Validates?|Delegates?)\b/i.test(description.trim());
  const isSpecific       = /\b(\w+\.py|\w+\.ts|OWASP|ESI|NEWS2|JSON|XML|YAML|REST|SQL|NoSQL)\b/i.test(description);
  const hasBoundary      = /\b(do not|don't|only|never|exclusively|not for|avoid)\b/i.test(description);
  const score            = (startsWithVerb ? 40 : 0) + (isSpecific ? 35 : 0) + (hasBoundary ? 25 : 0);

  const feedback = score >= 80 ? "Strong description — main agent will delegate accurately."
    : score >= 50 ? "Adequate. Add specificity (file types, technologies) and a boundary clause."
    : "Weak description. Start with a verb, name specific technologies, and clarify what NOT to use this for.";

  return { isActionOriented: startsWithVerb, isSpecific, isBounded: hasBoundary, score, feedback };
}

/**
 * subagentRunner.ts — Isolated-context subagent execution with model routing
 *
 * Article insight (§9): "Subagents are specialised AI assistants that run in their
 * own context window with their own system prompt, tool access, and permissions.
 * Only a summary comes back to your main conversation. Control costs — route simpler
 * tasks to faster, cheaper models like Haiku instead of running everything through
 * a more expensive model."
 *
 * Clinical translation:
 *   - Each subagent gets its own isolated message history (never shared with others)
 *   - allowedTools enforced before any tool call executes
 *   - model field routes: "haiku" → gpt-3.5-class, "sonnet" → gpt-4o-mini,
 *     "opus" → gpt-4o (safety-critical tasks only)
 *   - Only the SubagentResult.summary comes back to the orchestrator
 *
 * Built-in clinical subagents registered at the bottom of this file.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type SubagentModel = "haiku" | "sonnet" | "opus";

export interface SubagentSpec {
  name:         string;
  description:  string;
  systemPrompt: string;
  allowedTools: string[];          // tool name prefixes; "*" means unrestricted
  model:        SubagentModel;
  maxTokens:    number;
  readOnly:     boolean;           // if true, no write-class tools allowed
  tags:         string[];          // e.g. ["screening", "safety-critical", "billing"]
}

export interface SubagentMessage {
  role:    "system" | "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export interface SubagentRunInput {
  task:      string;             // plain-language task for the subagent
  payload:   Record<string, unknown>;  // structured data
  sessionId?: string;
  patientId?: string;
}

export interface SubagentResult {
  subagentName:  string;
  model:         SubagentModel;
  summary:       string;          // ONLY this returns to orchestrator
  findings:      Record<string, unknown>;
  toolsInvoked:  string[];
  tokensUsed:    number;
  latencyMs:     number;
  contextLines:  number;          // how many messages were in isolated context
  blocked:       string[];        // tool calls that were blocked by allowedTools
  error?:        string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const _registry = new Map<string, SubagentSpec>();

export function defineSubagent(spec: SubagentSpec): void {
  if (_registry.has(spec.name)) {
    throw new Error(`Subagent already registered: ${spec.name}`);
  }
  _registry.set(spec.name, { ...spec });
}

export function listSubagents(): SubagentSpec[] {
  return [..._registry.values()];
}

export function getSubagentSpec(name: string): SubagentSpec | undefined {
  return _registry.get(name);
}

export function undefineSubagent(name: string): boolean {
  return _registry.delete(name);
}

// ── Tool access enforcement ───────────────────────────────────────────────────

function isToolAllowed(toolName: string, spec: SubagentSpec): boolean {
  if (spec.allowedTools.includes("*")) return true;
  if (spec.readOnly && toolName.startsWith("write:")) return false;
  return spec.allowedTools.some((allowed) =>
    toolName === allowed || toolName.startsWith(allowed.replace("*", ""))
  );
}

// ── Model routing ─────────────────────────────────────────────────────────────

const MODEL_COST_TOKENS_PER_SECOND: Record<SubagentModel, number> = {
  haiku:  200_000,  // fastest, cheapest — screening tasks
  sonnet: 120_000,  // balanced — general clinical analysis
  opus:   40_000,   // slowest, most capable — safety-critical only
};

export function routeModel(spec: SubagentSpec): SubagentModel {
  // Safety-critical always uses opus regardless of spec
  if (spec.tags.includes("safety-critical")) return "opus";
  // Billing/coding tasks use haiku (simple pattern matching)
  if (spec.tags.includes("billing") || spec.tags.includes("coding")) return "haiku";
  // Screening tasks use haiku
  if (spec.tags.includes("screening") && !spec.tags.includes("safety-critical")) return "haiku";
  return spec.model;
}

// ── Simulated tool executor (in production: delegates to real tool registry) ──

async function simulateToolExecution(
  toolName: string,
  input: Record<string, unknown>,
  spec: SubagentSpec
): Promise<{ output: string; blocked: boolean }> {
  if (!isToolAllowed(toolName, spec)) {
    return {
      output: `[BLOCKED] Tool "${toolName}" is not in allowedTools for subagent "${spec.name}"`,
      blocked: true,
    };
  }
  // Simulate latency proportional to model speed
  const baseMs = MODEL_COST_TOKENS_PER_SECOND[routeModel(spec)] / 10_000;
  await new Promise((r) => setTimeout(r, Math.floor(baseMs)));
  return {
    output: JSON.stringify({ status: "ok", tool: toolName, input: Object.keys(input), subagent: spec.name }),
    blocked: false,
  };
}

// ── Core runner ───────────────────────────────────────────────────────────────

export async function runSubagent(
  name: string,
  input: SubagentRunInput
): Promise<SubagentResult> {
  const spec = _registry.get(name);
  if (!spec) {
    return {
      subagentName: name, model: "haiku", summary: `No subagent registered: ${name}`,
      findings: {}, toolsInvoked: [], tokensUsed: 0, latencyMs: 0, contextLines: 0,
      blocked: [], error: `Subagent "${name}" not found`,
    };
  }

  const model = routeModel(spec);
  const t0    = Date.now();

  // Isolated context — never shared with other subagents or main orchestrator
  const isolatedContext: SubagentMessage[] = [
    { role: "system",    content: spec.systemPrompt },
    { role: "user",      content: `Task: ${input.task}\n\nPayload: ${JSON.stringify(input.payload, null, 2)}` },
  ];

  const toolsInvoked: string[] = [];
  const blocked:      string[] = [];
  let   tokensUsed              = isolatedContext.reduce((n, m) => n + m.content.length / 4, 0);

  // Derive tools to call from payload keys (simulation: each payload key becomes a tool read)
  const toolCalls = Object.keys(input.payload).map((k) => `read:${k}`);

  for (const toolName of toolCalls) {
    const { output, blocked: wasBlocked } = await simulateToolExecution(toolName, input.payload, spec);
    if (wasBlocked) {
      blocked.push(toolName);
    } else {
      toolsInvoked.push(toolName);
    }
    isolatedContext.push({ role: "tool", content: output, toolName });
    tokensUsed += output.length / 4;
  }

  // Build summary — only this leaves the subagent's context
  const summary = buildSummary(spec, input, toolsInvoked, blocked, model);
  isolatedContext.push({ role: "assistant", content: summary });
  tokensUsed += summary.length / 4;

  return {
    subagentName:  spec.name,
    model,
    summary,                         // ← only this propagates to orchestrator
    findings:      extractFindings(input, toolsInvoked),
    toolsInvoked,
    tokensUsed:    Math.round(tokensUsed),
    latencyMs:     Date.now() - t0,
    contextLines:  isolatedContext.length,
    blocked,
  };
}

function buildSummary(
  spec:  SubagentSpec,
  input: SubagentRunInput,
  tools: string[],
  blocked: string[],
  model: SubagentModel
): string {
  const parts = [
    `[${spec.name.toUpperCase()} · ${model}] Task: ${input.task}.`,
    tools.length    ? `Tools used: ${tools.join(", ")}.` : "No tools invoked.",
    blocked.length  ? `Blocked (out-of-scope): ${blocked.join(", ")}.` : "",
    input.patientId ? `Patient: ${input.patientId}.` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function extractFindings(
  input: SubagentRunInput,
  toolsInvoked: string[]
): Record<string, unknown> {
  return {
    taskCompleted:  true,
    toolCount:      toolsInvoked.length,
    payloadKeys:    Object.keys(input.payload),
    sessionId:      input.sessionId,
  };
}

// ── Run multiple subagents in parallel ───────────────────────────────────────

export async function runSubagentTeam(
  tasks: Array<{ subagentName: string; input: SubagentRunInput }>
): Promise<SubagentResult[]> {
  return Promise.all(tasks.map(({ subagentName, input }) => runSubagent(subagentName, input)));
}

// ── Built-in clinical subagents ───────────────────────────────────────────────
// Registered once at module load

defineSubagent({
  name:        "vitals-screener",
  description: "Screens vital signs for immediately life-threatening abnormalities (quick, cheap)",
  systemPrompt:
    "You are a vitals screening agent. Assess HR, BP, RR, SpO2, temperature for critical ranges. " +
    "Return: CRITICAL / ABNORMAL / NORMAL with specific values. Never suggest treatments.",
  allowedTools: ["read:vitals", "read:patient_demographics"],
  model:        "haiku",
  maxTokens:    256,
  readOnly:     true,
  tags:         ["screening", "vitals"],
});

defineSubagent({
  name:        "lab-analyzer",
  description: "Interprets CBC, BMP, cardiac biomarkers, coag panel against reference ranges",
  systemPrompt:
    "You are a laboratory interpretation agent. Identify critical lab values, delta changes, " +
    "and pattern combinations (e.g., troponin + EKG changes). Return structured findings only.",
  allowedTools: ["read:labs", "read:vitals", "read:patient_history"],
  model:        "sonnet",
  maxTokens:    512,
  readOnly:     true,
  tags:         ["labs", "diagnostics"],
});

defineSubagent({
  name:        "red-flag-scanner",
  description: "Scans chief complaint and history for red-flag symptoms requiring immediate escalation",
  systemPrompt:
    "You are a red-flag detection agent. Identify symptoms indicating immediately life-threatening " +
    "conditions: stroke, MI, aortic dissection, sepsis, PE, ectopic pregnancy. Output: flag list only.",
  allowedTools: ["read:chief_complaint", "read:hpi", "read:medications"],
  model:        "haiku",
  maxTokens:    256,
  readOnly:     true,
  tags:         ["screening", "safety-critical"],
});

defineSubagent({
  name:        "medication-checker",
  description: "Checks proposed medications for contraindications, allergies, and drug interactions",
  systemPrompt:
    "You are a clinical pharmacist agent. Check each proposed medication against patient allergies, " +
    "current medications, renal/hepatic function, and weight-based dosing. Flag ALL concerns. " +
    "Err on the side of caution — missing a dangerous interaction is never acceptable.",
  allowedTools: ["read:medications", "read:allergies", "read:labs", "read:patient_history"],
  model:        "opus",
  maxTokens:    1024,
  readOnly:     true,
  tags:         ["medications", "safety-critical"],
});

defineSubagent({
  name:        "billing-coder",
  description: "Assigns CPT/ICD-10 codes based on documented diagnoses and procedures",
  systemPrompt:
    "You are a medical billing coding agent. Assign the most specific CPT and ICD-10 codes that " +
    "are supported by documentation. Never upcode. Flag incomplete documentation.",
  allowedTools: ["read:diagnoses", "read:procedures", "read:documentation"],
  model:        "haiku",
  maxTokens:    512,
  readOnly:     true,
  tags:         ["billing", "coding"],
});

defineSubagent({
  name:        "discharge-planner",
  description: "Generates discharge instructions, follow-up timing, and return precautions",
  systemPrompt:
    "You are a discharge planning agent. Based on the final diagnosis, generate: (1) patient-friendly " +
    "instructions in plain language, (2) follow-up appointment timing, (3) return precautions " +
    "(when to come back immediately). Always include medication reconciliation.",
  allowedTools: ["read:diagnoses", "read:medications", "read:patient_demographics", "read:vitals"],
  model:        "sonnet",
  maxTokens:    1024,
  readOnly:     true,
  tags:         ["discharge", "patient-education"],
});

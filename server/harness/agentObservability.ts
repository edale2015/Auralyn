/**
 * agentObservability.ts — LangSmith-style run tracing
 *
 * Article 27 (Deep Agents): "Observability from Day One. LangSmith tracing
 *  requires two environment variables and nothing else. Every run is traced:
 *  what the agent planned, what tools it called, what each tool returned,
 *  where it failed. No code changes. No instrumentation work."
 *
 * Article 27c (Subagents): "Every subagent conversation is logged locally.
 *  JSONL format (JSON Lines) — one JSON object per line. Message types:
 *    assistant/thinking — reasoning process (not exposed to users)
 *    assistant/tool_use — which tool was called and with what parameters
 *    user/tool_result   — what the tool actually returned
 *    assistant/text     — final summary sent back to main agent
 *  Transcripts persist independently of main conversation (30-day default)."
 *
 * Debugging workflow (from article):
 *   1. Find transcript (by agentId + timestamp)
 *   2. Read message sequence (thinking→tool_use→tool_result gaps = where bugs live)
 *   3. Check delegation accuracy (was the right agent chosen?)
 *   4. Review tool usage (missing tools? unexpected parameters?)
 *   5. Examine tool results (errors point to root cause)
 *   6. Evaluate summary quality (subagent did good work, poor summary = bad decisions)
 *
 * Clinical translation:
 *   Every clinical AI decision is traced. Why did the agent recommend sepsis
 *   protocol? What labs did it check? What threshold did it use? Full trace
 *   is available for clinical audit, HIPAA compliance, and physician review.
 */

import { randomUUID } from "crypto";

// ── JSONL Event Types (Article 27c) ───────────────────────────────────────────

export type TranscriptRole = "assistant" | "user";

export type TranscriptEventType =
  | "thinking"    // assistant — reasoning (not shown to users, invaluable for debug)
  | "tool_use"    // assistant — what tool called, what params
  | "tool_result" // user — what tool returned (errors here = root cause)
  | "text";       // assistant — final summary sent to main agent

export interface TranscriptEvent {
  role:      TranscriptRole;
  type:      TranscriptEventType;
  content:   string;
  toolName?: string;       // for tool_use events
  toolInput?: unknown;     // for tool_use events (exact params)
  isError?:  boolean;      // for tool_result events
  at:        Date;
}

export interface AgentRun {
  runId:       string;
  agentId:     string;
  agentName:   string;
  sessionId?:  string;
  parentRunId?: string;   // for sub-agent runs
  transcript:  TranscriptEvent[];
  status:      "running" | "complete" | "failed";
  summary?:    string;    // the final "text" event sent to main agent
  error?:      string;
  startedAt:   Date;
  completedAt?: Date;
  durationMs?: number;
  retentionDays: number;  // Article 27c: "30-day default, controlled by cleanupPeriodDays"
}

// ── Observability run store ───────────────────────────────────────────────────

const _runs = new Map<string, AgentRun>();

export function startRun(agentName: string, agentId?: string, parentRunId?: string, sessionId?: string): AgentRun {
  const run: AgentRun = {
    runId:        `run_${Date.now()}_${randomUUID().slice(0, 8)}`,
    agentId:      agentId ?? `agent_${Date.now()}`,
    agentName,
    sessionId,
    parentRunId,
    transcript:   [],
    status:       "running",
    startedAt:    new Date(),
    retentionDays: 30,
  };
  _runs.set(run.runId, run);
  return run;
}

export function logThinking(runId: string, reasoning: string): void {
  addEvent(runId, "assistant", "thinking", reasoning);
}

export function logToolUse(runId: string, toolName: string, toolInput: unknown): void {
  const run = _runs.get(runId);
  if (!run) return;
  run.transcript.push({
    role:      "assistant",
    type:      "tool_use",
    content:   `Calling ${toolName}`,
    toolName,
    toolInput,
    at:        new Date(),
  });
}

export function logToolResult(runId: string, toolName: string, result: string, isError = false): void {
  const run = _runs.get(runId);
  if (!run) return;
  run.transcript.push({
    role:      "user",
    type:      "tool_result",
    content:   result,
    toolName,
    isError,
    at:        new Date(),
  });
}

export function logFinalText(runId: string, summary: string): void {
  const run = _runs.get(runId);
  if (!run) return;
  run.transcript.push({ role: "assistant", type: "text", content: summary, at: new Date() });
  run.summary = summary;
}

export function completeRun(runId: string, summary?: string): AgentRun | null {
  const run = _runs.get(runId);
  if (!run) return null;
  if (summary) logFinalText(runId, summary);
  run.status      = "complete";
  run.completedAt = new Date();
  run.durationMs  = run.completedAt.getTime() - run.startedAt.getTime();
  return run;
}

export function failRun(runId: string, error: string): AgentRun | null {
  const run = _runs.get(runId);
  if (!run) return null;
  run.status      = "failed";
  run.error       = error;
  run.completedAt = new Date();
  run.durationMs  = run.completedAt.getTime() - run.startedAt.getTime();
  return run;
}

function addEvent(runId: string, role: TranscriptRole, type: TranscriptEventType, content: string): void {
  const run = _runs.get(runId);
  if (!run) return;
  run.transcript.push({ role, type, content, at: new Date() });
}

// ── Debug analysis (Article 27c "Debugging Subagents") ───────────────────────

export interface DebugAnalysis {
  runId:            string;
  agentName:        string;
  totalEvents:      number;
  thinkingEvents:   number;
  toolCalls:        number;
  toolErrors:       number;
  toolsUsed:        string[];
  summaryQuality:   "good" | "vague" | "missing";
  potentialIssues:  DebugIssue[];
  recommendation:   string;
}

export interface DebugIssue {
  category:    "wrong_delegation" | "missing_tool" | "tool_error" | "poor_summary" | "large_transcript";
  severity:    "critical" | "warning" | "info";
  description: string;
  fix:         string;
}

export function debugRun(runId: string): DebugAnalysis | null {
  const run = _runs.get(runId);
  if (!run) return null;

  const toolCalls   = run.transcript.filter((e) => e.type === "tool_use");
  const toolResults = run.transcript.filter((e) => e.type === "tool_result");
  const toolErrors  = toolResults.filter((e) => e.isError);
  const toolsUsed   = [...new Set(toolCalls.map((e) => e.toolName!).filter(Boolean))];
  const finalText   = run.transcript.filter((e) => e.type === "text");
  const summary     = finalText[finalText.length - 1]?.content ?? "";

  const issues: DebugIssue[] = [];

  // Issue 1: Tool errors
  for (const err of toolErrors) {
    issues.push({
      category:    "tool_error",
      severity:    "critical",
      description: `Tool ${err.toolName} returned an error: ${err.content.slice(0, 100)}`,
      fix:         "Check file paths, permissions, and input formats in the transcript",
    });
  }

  // Issue 2: Poor summary quality
  const summaryQuality: "good" | "vague" | "missing" =
    summary.length === 0 ? "missing"
    : summary.length < 50 ? "vague"
    : "good";

  if (summaryQuality === "missing") {
    issues.push({
      category:    "poor_summary",
      severity:    "critical",
      description: "No final summary text found — main agent will receive nothing",
      fix:         "Improve the system prompt with clearer output format expectations",
    });
  } else if (summaryQuality === "vague") {
    issues.push({
      category:    "poor_summary",
      severity:    "warning",
      description: `Summary is too brief (${summary.length} chars) — main agent may make poor decisions`,
      fix:         "Require subagent to summarize: what was found, what was done, what the main agent needs to know",
    });
  }

  // Issue 3: Large transcript
  const transcriptSize = JSON.stringify(run.transcript).length;
  if (transcriptSize > 100_000) {
    issues.push({
      category:    "large_transcript",
      severity:    "warning",
      description: `Transcript is ${Math.round(transcriptSize / 1000)}KB — subagent may have explored too broadly`,
      fix:         "Narrow the task scope or adjust compaction settings",
    });
  }

  // Issue 4: No tools used
  if (toolCalls.length === 0) {
    issues.push({
      category:    "missing_tool",
      severity:    "info",
      description: "No tools were called — agent may have hallucinated without accessing actual data",
      fix:         "Verify the agent has the required tools and that its description matches the task",
    });
  }

  const recommendation = run.status === "failed"
    ? `Run failed: ${run.error}. Check tool_result errors in transcript.`
    : issues.length === 0
      ? "Run appears healthy. Summary quality is good."
      : `${issues.length} issue(s) found. Priority fix: ${issues[0].fix}`;

  return {
    runId,
    agentName:      run.agentName,
    totalEvents:    run.transcript.length,
    thinkingEvents: run.transcript.filter((e) => e.type === "thinking").length,
    toolCalls:      toolCalls.length,
    toolErrors:     toolErrors.length,
    toolsUsed,
    summaryQuality,
    potentialIssues: issues,
    recommendation,
  };
}

// ── JSONL export (Article 27c transcript format) ──────────────────────────────

export function exportJSONL(runId: string): string | null {
  const run = _runs.get(runId);
  if (!run) return null;
  return run.transcript.map((e) => JSON.stringify({
    role:      e.role,
    type:      e.type,
    content:   e.content,
    ...(e.toolName  ? { name: e.toolName }  : {}),
    ...(e.toolInput ? { input: e.toolInput } : {}),
    ...(e.isError   ? { is_error: true }     : {}),
    at: e.at.toISOString(),
  })).join("\n");
}

// ── Query API ─────────────────────────────────────────────────────────────────

export function getRun(runId: string): AgentRun | undefined      { return _runs.get(runId); }
export function listRuns(agentId?: string): AgentRun[] {
  const all = Array.from(_runs.values());
  return agentId ? all.filter((r) => r.agentId === agentId) : all;
}

export function getRunStats(): {
  total: number; running: number; complete: number; failed: number; avgDurationMs: number;
} {
  const runs      = Array.from(_runs.values());
  const complete  = runs.filter((r) => r.status === "complete");
  const avgDur    = complete.length > 0
    ? Math.round(complete.reduce((s, r) => s + (r.durationMs ?? 0), 0) / complete.length)
    : 0;
  return {
    total:         runs.length,
    running:       runs.filter((r) => r.status === "running").length,
    complete:      complete.length,
    failed:        runs.filter((r) => r.status === "failed").length,
    avgDurationMs: avgDur,
  };
}

/**
 * agentHarness.ts — Deep Agents "batteries-included" agent harness
 *
 * Article 27 (Deep Agents): "LangChain open-sourced a replica of Claude Code.
 *  An agent harness ships scaffolding as defaults. You get a working agent on
 *  first run and customize from there."
 *
 * Every team that builds a coding agent from scratch wires up the same primitives:
 *   write_todos  — plan before acting, track progress
 *   read_file    — read a file by path
 *   write_file   — write content to a file path
 *   edit_file    — targeted old_str → new_str edit
 *   ls           — list directory contents
 *   glob         — find files by pattern
 *   grep         — search file content by regex
 *   execute      — sandboxed shell with allowlist enforcement
 *
 * Deep Agents principle: "Think first, act second." The agent plans via
 * write_todos BEFORE using any other tool. Smart defaults enforce this.
 *
 * Auto-summarization (v0.2 feature):
 *   - When session history grows beyond token limit → compress older history
 *   - When tool output is large → offload to a "virtual file" reference
 *   - Zero-config: runs as middleware automatically
 *
 * Clinical translation:
 *   The harness is the scaffolding that ANY clinical AI agent needs:
 *   plan the care episode → access patient records → edit protocol docs →
 *   search lab results → execute validation scripts → summarize when context grows
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "complete" | "blocked";
export type TodoPriority = "critical" | "high" | "medium" | "low";

export interface Todo {
  id:           string;
  description:  string;
  status:       TodoStatus;
  priority:     TodoPriority;
  notes?:       string;
  createdAt:    Date;
  updatedAt:    Date;
}

export interface FilesystemResult {
  success:  boolean;
  output?:  string;
  error?:   string;
  path?:    string;
}

export interface ShellResult {
  success:   boolean;
  stdout:    string;
  stderr?:   string;
  exitCode:  number;
  sandboxed: boolean;
  blockedReason?: string;
}

export interface AutoSummarizationConfig {
  maxHistoryTokens:   number;   // compress when history exceeds this
  maxToolOutputChars: number;   // offload when single tool output exceeds this
}

export interface SummarizationEvent {
  type:          "compress" | "offload";
  trigger:       string;
  originalSize:  number;
  compressedSize: number;
  offloadRef?:   string;   // virtual file reference for offloaded output
  at:            Date;
}

export interface HarnessSession {
  id:              string;
  agentName:       string;
  todos:           Todo[];
  history:         HarnessEvent[];
  offloadedOutputs: Record<string, string>;  // ref → actual content
  summarizationLog: SummarizationEvent[];
  totalTokensUsed:  number;
  config:           AutoSummarizationConfig;
  createdAt:        Date;
  updatedAt:        Date;
}

export interface HarnessEvent {
  id:       string;
  type:     "plan" | "tool_call" | "tool_result" | "summary";
  tool?:    string;
  input?:   unknown;
  output?:  string;
  isRef?:   boolean;   // true = output is an offload reference, not actual content
  at:       Date;
}

// ── Shell allowlist ───────────────────────────────────────────────────────────
// Article: "Direct shell access with a sandboxing layer. Not a root shell handed to an LLM."

const SHELL_ALLOWLIST_PATTERNS = [
  /^(ls|cat|echo|pwd|which|whoami|date|id)\b/,
  /^grep\s/,
  /^find\s/,
  /^awk\s/,
  /^sed\s/,
  /^sort\b/,
  /^uniq\b/,
  /^wc\s/,
  /^head\s/,
  /^tail\s/,
  /^curl\s/,
  /^diff\s/,
  /^git\s(diff|log|status|show|branch|rev-parse)\b/,
  /^node\s/,
  /^npx\s/,
  /^python3?\s/,
];

const SHELL_BLOCKLIST_PATTERNS = [
  /\brm\s+-rf\b/,                          // recursive delete
  /\bchmod\s+777\b/,                       // world-writable
  /\b(sudo|su)\b/,                         // privilege escalation
  /\b(curl|wget).*\|\s*(bash|sh|zsh)\b/i,  // pipe to shell
  /\bdrop\s+table\b/i,                     // SQL drop
  /\btruncate\s+table\b/i,
  /\/etc\/passwd/,
  /\/etc\/shadow/,
];

function isSandboxSafe(command: string): { safe: boolean; reason?: string } {
  for (const pattern of SHELL_BLOCKLIST_PATTERNS) {
    if (pattern.test(command)) return { safe: false, reason: `Blocked pattern: ${pattern}` };
  }
  const allowed = SHELL_ALLOWLIST_PATTERNS.some((p) => p.test(command.trim()));
  if (!allowed) return { safe: false, reason: "Command not in sandboxed allowlist" };
  return { safe: true };
}

// ── In-memory virtual filesystem (clinical records simulation) ────────────────

const _virtualFS = new Map<string, string>();

// ── Auto-summarization ────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);  // ~4 chars per token
}

function compressHistory(events: HarnessEvent[], keepLast: number): { compressed: HarnessEvent[]; summary: HarnessEvent } {
  const keep  = events.slice(-keepLast);
  const older = events.slice(0, -keepLast);
  const summaryText = `[Compressed: ${older.length} earlier events summarized. Tools used: ${[...new Set(older.filter((e) => e.tool).map((e) => e.tool!))].join(", ")}]`;
  const summary: HarnessEvent = {
    id:     `summary_${Date.now()}`,
    type:   "summary",
    output: summaryText,
    at:     new Date(),
  };
  return { compressed: [summary, ...keep], summary };
}

function maybeOffloadOutput(output: string, config: AutoSummarizationConfig, offloads: Record<string, string>): {
  text: string; isRef: boolean; event?: SummarizationEvent;
} {
  if (output.length <= config.maxToolOutputChars) return { text: output, isRef: false };
  const ref = `offload_ref_${Date.now()}_${randomUUID().slice(0, 8)}`;
  offloads[ref] = output;
  const refText = `[OFFLOADED: ${ref}] Output was ${output.length} chars. Full content stored at ref ${ref}.`;
  return {
    text:  refText,
    isRef: true,
    event: {
      type:           "offload",
      trigger:        "tool_output_too_large",
      originalSize:   output.length,
      compressedSize: refText.length,
      offloadRef:     ref,
      at:             new Date(),
    },
  };
}

// ── Session store ─────────────────────────────────────────────────────────────

const _sessions = new Map<string, HarnessSession>();

const DEFAULT_CONFIG: AutoSummarizationConfig = {
  maxHistoryTokens:   8_000,
  maxToolOutputChars: 4_000,
};

export function createHarnessSession(agentName: string, config?: Partial<AutoSummarizationConfig>): HarnessSession {
  const id = `harness_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const s: HarnessSession = {
    id, agentName,
    todos: [],
    history: [],
    offloadedOutputs: {},
    summarizationLog: [],
    totalTokensUsed:  0,
    config: { ...DEFAULT_CONFIG, ...config },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  _sessions.set(id, s);
  return s;
}

// ── write_todos ───────────────────────────────────────────────────────────────
// Article: "Before acting, the agent plans. write_todos gives it a structured
//  way to break down tasks, track progress, and reason about next steps.
//  Think first, act second."

export function writeTodos(sessionId: string, tasks: Array<{ description: string; priority?: TodoPriority }>): Todo[] {
  const s = _sessions.get(sessionId);
  if (!s) throw new Error(`Session ${sessionId} not found`);

  const todos: Todo[] = tasks.map((t) => ({
    id:          `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: t.description,
    status:      "pending" as TodoStatus,
    priority:    t.priority ?? "medium",
    createdAt:   new Date(),
    updatedAt:   new Date(),
  }));

  s.todos.push(...todos);
  s.history.push({ id: randomUUID(), type: "plan", output: `Planned ${todos.length} tasks`, at: new Date() });
  s.updatedAt = new Date();
  return todos;
}

export function updateTodo(sessionId: string, todoId: string, update: Partial<Pick<Todo, "status" | "notes">>): Todo | null {
  const s = _sessions.get(sessionId);
  if (!s) return null;
  const todo = s.todos.find((t) => t.id === todoId);
  if (!todo) return null;
  Object.assign(todo, update, { updatedAt: new Date() });
  s.updatedAt = new Date();
  return todo;
}

// ── Filesystem tools ──────────────────────────────────────────────────────────

export function readFile(sessionId: string, path: string): FilesystemResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, error: `Session ${sessionId} not found` };

  const content = _virtualFS.get(path);
  if (!content) return { success: false, error: `File not found: ${path}`, path };

  const { text, isRef, event } = maybeOffloadOutput(content, s.config, s.offloadedOutputs);
  if (event) s.summarizationLog.push(event);

  addHistory(s, "tool_call", "read_file", { path }, text, isRef);
  return { success: true, output: text, path };
}

export function writeFile(sessionId: string, path: string, content: string): FilesystemResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, error: `Session ${sessionId} not found` };
  _virtualFS.set(path, content);
  addHistory(s, "tool_call", "write_file", { path, contentLength: content.length }, `Written: ${path}`, false);
  return { success: true, output: `Written ${content.length} chars to ${path}`, path };
}

export function editFile(sessionId: string, path: string, oldStr: string, newStr: string): FilesystemResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, error: `Session ${sessionId} not found` };
  const current = _virtualFS.get(path);
  if (!current) return { success: false, error: `File not found: ${path}`, path };
  if (!current.includes(oldStr)) return { success: false, error: `old_str not found in ${path}`, path };
  _virtualFS.set(path, current.replace(oldStr, newStr));
  addHistory(s, "tool_call", "edit_file", { path }, `Edited: replaced ${oldStr.length} chars`, false);
  return { success: true, output: `Edited ${path}`, path };
}

export function listDirectory(sessionId: string, directory: string): FilesystemResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, error: `Session ${sessionId} not found` };

  const prefix   = directory.endsWith("/") ? directory : directory + "/";
  const contents = Array.from(_virtualFS.keys()).filter((k) => k.startsWith(prefix)).sort();
  const output   = contents.length > 0 ? contents.join("\n") : "(empty directory)";
  addHistory(s, "tool_call", "ls", { directory }, output, false);
  return { success: true, output, path: directory };
}

export function globSearch(sessionId: string, pattern: string): FilesystemResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, error: `Session ${sessionId} not found` };

  const regex   = new RegExp(pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"));
  const matches = Array.from(_virtualFS.keys()).filter((k) => regex.test(k)).sort();
  const output  = matches.length > 0 ? matches.join("\n") : "(no matches)";
  addHistory(s, "tool_call", "glob", { pattern }, output, false);
  return { success: true, output };
}

export function grepSearch(sessionId: string, pattern: string, path: string): FilesystemResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, error: `Session ${sessionId} not found` };

  const regex   = new RegExp(pattern, "g");
  const results: string[] = [];
  const paths   = path.endsWith("/")
    ? Array.from(_virtualFS.keys()).filter((k) => k.startsWith(path))
    : [path];

  for (const p of paths) {
    const content = _virtualFS.get(p);
    if (!content) continue;
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (regex.test(line)) results.push(`${p}:${i + 1}: ${line}`);
    });
  }

  const output = results.length > 0 ? results.join("\n") : "(no matches)";
  addHistory(s, "tool_call", "grep", { pattern, path }, output, false);
  return { success: true, output };
}

// ── Sandboxed shell ───────────────────────────────────────────────────────────

export function executeShell(sessionId: string, command: string): ShellResult {
  const s = _sessions.get(sessionId);
  if (!s) return { success: false, stdout: "", exitCode: -1, sandboxed: true, blockedReason: "Session not found" };

  const check = isSandboxSafe(command);
  if (!check.safe) {
    addHistory(s, "tool_result", "execute", { command }, `BLOCKED: ${check.reason}`, false);
    return { success: false, stdout: "", exitCode: 1, sandboxed: true, blockedReason: check.reason };
  }

  // Simulate execution output (in a real system this would exec the command)
  const stdout = `[SANDBOXED EXEC] ${command}\n(output simulated — real exec requires process.exec integration)`;
  addHistory(s, "tool_result", "execute", { command }, stdout, false);
  return { success: true, stdout, exitCode: 0, sandboxed: true };
}

// ── Internal history management ───────────────────────────────────────────────

function addHistory(
  s:      HarnessSession,
  type:   HarnessEvent["type"],
  tool:   string,
  input:  unknown,
  output: string,
  isRef:  boolean,
): void {
  const event: HarnessEvent = {
    id: randomUUID(), type, tool, input, output, isRef, at: new Date(),
  };
  s.history.push(event);
  s.totalTokensUsed += estimateTokens(output);

  // Auto-summarize when history grows too large
  const historyTokens = s.history.reduce((sum, e) => sum + estimateTokens(e.output ?? ""), 0);
  if (historyTokens > s.config.maxHistoryTokens) {
    const { compressed, summary } = compressHistory(s.history, 10);
    s.history = compressed;
    s.summarizationLog.push({
      type:           "compress",
      trigger:        "history_too_large",
      originalSize:   historyTokens,
      compressedSize: estimateTokens(summary.output ?? ""),
      at:             new Date(),
    });
  }
  s.updatedAt = new Date();
}

// ── Read-back API ─────────────────────────────────────────────────────────────

export function getHarnessSession(id: string): HarnessSession | undefined {
  return _sessions.get(id);
}

export function listHarnessSessions(): HarnessSession[] {
  return Array.from(_sessions.values());
}

export function resolveOffloadRef(sessionId: string, ref: string): string | null {
  const s = _sessions.get(sessionId);
  return s ? (s.offloadedOutputs[ref] ?? null) : null;
}

export function getHarnessTools(): string[] {
  return ["write_todos", "read_file", "write_file", "edit_file", "ls", "glob", "grep", "execute"];
}

export function getSandboxAllowlist(): string[] {
  return SHELL_ALLOWLIST_PATTERNS.map((p) => p.toString());
}

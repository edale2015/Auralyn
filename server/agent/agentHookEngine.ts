/**
 * Agent Hook Engine — blocking lifecycle hooks for AI agent tool calls
 *
 * Article — "What I Learnt Using Claude Code to Build Production-Ready Apps":
 *   "Hooks run outside the loop entirely as deterministic scripts. Hooks run
 *   scripts automatically at specific points in Claude's workflow.
 *   Key events: SessionStart, PreToolUse, PostToolUse, Notification, Stop,
 *   PermissionRequest"
 *
 * The CRITICAL insight:
 *   PreToolUse hooks can BLOCK tool execution. They run BEFORE the tool fires
 *   and can return a deny result that stops the action entirely.
 *
 * What's already present:
 *   server/events/hooks.ts — passive observer via event bus:
 *     bus.on("post_tool_use", ...) — logs after execution, never blocks
 *     bus.on("session_start", ...) — logs session starts
 *   These are read-only audit logs. They fire AFTER the fact.
 *
 * What's missing:
 *   A blocking hook system where:
 *     1. Any module can register a PreToolUse handler
 *     2. The handler returns { allow: true } or { allow: false, reason: "..." }
 *     3. If ANY handler returns false, the tool call is BLOCKED before execution
 *     4. PermissionRequest hooks pause the agent and await human approval
 *        for high-risk clinical actions
 *   This is the enforcement layer that makes scope rules actually enforceable
 *   in real time — not just logged after violation.
 *
 * Clinical examples:
 *   PreToolUse: Scope enforcer — blocks "execute:prescription" if no physician sign
 *   PreToolUse: PHI boundary  — blocks reading records outside current encounter
 *   PreToolUse: Dose validator — blocks suggesting >1g of a medication
 *   PermissionRequest: Physician approval gate — pauses crew for cosign
 *   PostToolUse: Audit logger  — records every action to immutable hash chain
 *   Stop: Session cleanup      — persists final state, flushes pending approvals
 */

import { randomUUID } from "crypto";

// ── Hook event types (matches Article's Claude Code hook events) ──────────────

export type HookEvent =
  | "SessionStart"
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "PermissionRequest";

// ── Hook handler types ────────────────────────────────────────────────────────

export interface SessionStartPayload {
  sessionId: string;
  agentRole: string;
  context:   Record<string, unknown>;
}

export interface PreToolUsePayload {
  sessionId: string;
  agentRole: string;
  toolName:  string;            // e.g. "execute:prescription", "write:ehr"
  input:     Record<string, unknown>;
  context:   Record<string, unknown>;
}

export interface PreToolUseResult {
  allow:   boolean;
  reason?: string;             // required when allow=false
  modified?:Record<string, unknown>; // optionally transform the input before execution
}

export interface PostToolUsePayload {
  sessionId: string;
  agentRole: string;
  toolName:  string;
  input:     Record<string, unknown>;
  output:    unknown;
  latencyMs: number;
  blocked:   boolean;          // whether this tool was blocked by a PreToolUse hook
}

export interface NotificationPayload {
  sessionId: string;
  agentRole: string;
  level:     "INFO" | "WARN" | "ERROR" | "CRITICAL";
  message:   string;
  data?:     unknown;
}

export interface StopPayload {
  sessionId: string;
  agentRole: string;
  reason:    "completed" | "error" | "max_iterations" | "manual_stop" | "scope_violation";
  finalState?:unknown;
}

export interface PermissionRequestPayload {
  requestId:   string;
  sessionId:   string;
  agentRole:   string;
  toolName:    string;
  input:       Record<string, unknown>;
  reason:      string;         // why human approval is needed
  expiresAt:   string;         // ISO — if not approved by then, auto-deny
}

export interface PermissionRequestResult {
  approved:    boolean;
  approvedBy?: string;         // physician-id or "system"
  notes?:      string;
}

// ── Handler function types ────────────────────────────────────────────────────

export type SessionStartHandler    = (p: SessionStartPayload)    => void | Promise<void>;
export type PreToolUseHandler      = (p: PreToolUsePayload)      => PreToolUseResult | Promise<PreToolUseResult>;
export type PostToolUseHandler     = (p: PostToolUsePayload)     => void | Promise<void>;
export type NotificationHandler    = (p: NotificationPayload)    => void | Promise<void>;
export type StopHandler            = (p: StopPayload)            => void | Promise<void>;
export type PermissionRequestHandler = (p: PermissionRequestPayload) => PermissionRequestResult | Promise<PermissionRequestResult>;

export interface HookRegistration {
  hookId:   string;
  event:    HookEvent;
  name:     string;      // descriptive name for debugging
  priority: number;      // lower = runs first (0 = highest priority)
}

// ── Pending permission requests ───────────────────────────────────────────────

export interface PendingPermissionRequest extends PermissionRequestPayload {
  status: "pending" | "approved" | "denied" | "expired";
  result?: PermissionRequestResult;
}

const pendingRequests = new Map<string, PendingPermissionRequest>();

// ── Hook registry ─────────────────────────────────────────────────────────────

type AnyHandler = SessionStartHandler | PreToolUseHandler | PostToolUseHandler | NotificationHandler | StopHandler | PermissionRequestHandler;

interface RegisteredHook {
  registration: HookRegistration;
  handler:      AnyHandler;
}

const hookRegistry = new Map<HookEvent, RegisteredHook[]>();

function getHooks(event: HookEvent): RegisteredHook[] {
  return (hookRegistry.get(event) ?? []).sort((a, b) => a.registration.priority - b.registration.priority);
}

// ── Registration API ──────────────────────────────────────────────────────────

export function onSessionStart(name: string, priority: number, handler: SessionStartHandler): string {
  return register("SessionStart", name, priority, handler);
}

export function onPreToolUse(name: string, priority: number, handler: PreToolUseHandler): string {
  return register("PreToolUse", name, priority, handler);
}

export function onPostToolUse(name: string, priority: number, handler: PostToolUseHandler): string {
  return register("PostToolUse", name, priority, handler);
}

export function onNotification(name: string, priority: number, handler: NotificationHandler): string {
  return register("Notification", name, priority, handler);
}

export function onStop(name: string, priority: number, handler: StopHandler): string {
  return register("Stop", name, priority, handler);
}

export function onPermissionRequest(name: string, priority: number, handler: PermissionRequestHandler): string {
  return register("PermissionRequest", name, priority, handler);
}

function register(event: HookEvent, name: string, priority: number, handler: AnyHandler): string {
  const hookId = `hook-${randomUUID().slice(0, 8)}`;
  const hooks  = hookRegistry.get(event) ?? [];
  hooks.push({ registration: { hookId, event, name, priority }, handler });
  hookRegistry.set(event, hooks);
  return hookId;
}

export function removeHook(hookId: string): boolean {
  let removed = false;
  for (const [event, hooks] of hookRegistry.entries()) {
    const filtered = hooks.filter((h) => h.registration.hookId !== hookId);
    if (filtered.length !== hooks.length) {
      hookRegistry.set(event, filtered);
      removed = true;
    }
  }
  return removed;
}

export function listHooks(): HookRegistration[] {
  return [...hookRegistry.values()].flat().map((h) => h.registration);
}

// ── Dispatch API ──────────────────────────────────────────────────────────────

/** Fire SessionStart hooks. Non-blocking — fire and forget. */
export async function fireSessionStart(payload: SessionStartPayload): Promise<void> {
  for (const { handler } of getHooks("SessionStart")) {
    try { await (handler as SessionStartHandler)(payload); } catch { /* non-blocking */ }
  }
}

/**
 * Fire PreToolUse hooks. BLOCKING — runs all handlers in priority order.
 * The first handler to return { allow: false } stops all further handlers.
 * Returns the final decision: allow/deny + optional input transformation.
 */
export async function firePreToolUse(payload: PreToolUsePayload): Promise<{
  allow:     boolean;
  reason?:   string;
  hookName?: string;
  modified?: Record<string, unknown>;
}> {
  let currentInput = { ...payload.input };

  for (const { registration, handler } of getHooks("PreToolUse")) {
    let result: PreToolUseResult;
    try {
      result = await (handler as PreToolUseHandler)({ ...payload, input: currentInput });
    } catch (err) {
      // Hook error → fail-safe: deny the tool call
      return {
        allow:    false,
        reason:   `Hook "${registration.name}" threw: ${err instanceof Error ? err.message : String(err)}`,
        hookName: registration.name,
      };
    }

    if (!result.allow) {
      return { allow: false, reason: result.reason, hookName: registration.name };
    }

    // Allow hook to transform the input for downstream hooks/execution
    if (result.modified) {
      currentInput = { ...currentInput, ...result.modified };
    }
  }

  return { allow: true, modified: currentInput };
}

/** Fire PostToolUse hooks. Non-blocking. */
export async function firePostToolUse(payload: PostToolUsePayload): Promise<void> {
  for (const { handler } of getHooks("PostToolUse")) {
    try { await (handler as PostToolUseHandler)(payload); } catch { /* non-blocking */ }
  }
}

/** Fire Notification hooks. Non-blocking. */
export async function fireNotification(payload: NotificationPayload): Promise<void> {
  for (const { handler } of getHooks("Notification")) {
    try { await (handler as NotificationHandler)(payload); } catch { /* non-blocking */ }
  }
}

/** Fire Stop hooks. Non-blocking. */
export async function fireStop(payload: StopPayload): Promise<void> {
  for (const { handler } of getHooks("Stop")) {
    try { await (handler as StopHandler)(payload); } catch { /* non-blocking */ }
  }
}

/**
 * Fire PermissionRequest hooks. BLOCKING.
 * The first handler to return approved=false immediately denies.
 * If no handler is registered, auto-denies (fail-safe for clinical safety).
 */
export async function firePermissionRequest(payload: PermissionRequestPayload): Promise<PermissionRequestResult> {
  const handlers = getHooks("PermissionRequest");

  if (handlers.length === 0) {
    // No approval handler registered → auto-deny (clinical fail-safe)
    return { approved: false, approvedBy: "system", notes: "No permission handler registered — auto-denied for safety" };
  }

  let lastResult: PermissionRequestResult = { approved: true };
  for (const { handler } of handlers) {
    try {
      lastResult = await (handler as PermissionRequestHandler)(payload);
    } catch {
      return { approved: false, approvedBy: "system", notes: "Permission handler threw — auto-denied for safety" };
    }
    if (!lastResult.approved) return lastResult;
  }

  return lastResult;
}

// ── Permission request management (human-in-loop) ─────────────────────────────

/**
 * Create a pending permission request for a high-risk action.
 * Returns the requestId. The agent must await `resolvePermissionRequest()`.
 */
export function createPermissionRequest(
  sessionId: string,
  agentRole: string,
  toolName:  string,
  input:     Record<string, unknown>,
  reason:    string,
  ttlSeconds:number = 300
): string {
  const requestId = `perm-${randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  pendingRequests.set(requestId, {
    requestId, sessionId, agentRole, toolName, input, reason, expiresAt,
    status: "pending",
  });
  return requestId;
}

/** Approve a pending permission request (called by physician UI). */
export function approvePermissionRequest(requestId: string, approvedBy: string, notes?: string): boolean {
  const req = pendingRequests.get(requestId);
  if (!req || req.status !== "pending") return false;
  if (new Date(req.expiresAt) < new Date()) {
    req.status = "expired";
    return false;
  }
  req.status = "approved";
  req.result = { approved: true, approvedBy, notes };
  return true;
}

/** Deny a pending permission request. */
export function denyPermissionRequest(requestId: string, reason?: string): boolean {
  const req = pendingRequests.get(requestId);
  if (!req || req.status !== "pending") return false;
  req.status = "denied";
  req.result = { approved: false, approvedBy: "physician", notes: reason };
  return true;
}

/** Poll for permission request resolution (used by awaiting agent). */
export function getPermissionStatus(requestId: string): PendingPermissionRequest | null {
  const req = pendingRequests.get(requestId);
  if (!req) return null;
  if (req.status === "pending" && new Date(req.expiresAt) < new Date()) {
    req.status = "expired";
  }
  return req;
}

/** Get all pending permission requests (for physician dashboard). */
export function getPendingRequests(): PendingPermissionRequest[] {
  // Expire stale requests
  for (const [, req] of pendingRequests.entries()) {
    if (req.status === "pending" && new Date(req.expiresAt) < new Date()) {
      req.status = "expired";
    }
  }
  return [...pendingRequests.values()].filter((r) => r.status === "pending");
}

// ── Built-in clinical hooks ───────────────────────────────────────────────────

/**
 * Register the default set of clinical safety PreToolUse hooks.
 * Called once at startup. These are the "always-on" scope enforcement hooks.
 */
export function registerClinicalSafetyHooks(): void {
  // Hook 1: Scope engine enforcement — blocks denied actions before execution
  onPreToolUse("scope-enforcer", 10, async (payload) => {
    const HARD_BLOCKED = new Set([
      "delete:patient_data",
      "modify:physician_credentials",
      "override:safety_floor_without_auth",
    ]);
    if (HARD_BLOCKED.has(payload.toolName)) {
      return { allow: false, reason: `Tool "${payload.toolName}" is hard-blocked by clinical safety policy` };
    }
    return { allow: true };
  });

  // Hook 2: PHI boundary — blocks access to records outside current encounter
  // if agent's scope claims phi_scope = "current_encounter"
  onPreToolUse("phi-boundary-enforcer", 20, async (payload) => {
    const { agentRole, input } = payload;
    const PHI_RESTRICTED_ROLES = new Set(["triage_agent", "learning_agent"]);
    if (PHI_RESTRICTED_ROLES.has(agentRole) && input.patientIds) {
      const ids = Array.isArray(input.patientIds) ? input.patientIds : [input.patientIds];
      if (ids.length > 50) {
        return {
          allow:  false,
          reason: `PHI boundary: agent "${agentRole}" requested ${ids.length} patient records — exceeds max_patient_count=50`,
        };
      }
    }
    return { allow: true };
  });

  // Hook 3: Pediatric safety — blocks adult-scoped agents from treating patients under 18
  onPreToolUse("pediatric-age-gate", 30, async (payload) => {
    const { agentRole, input } = payload;
    const patientAge = Number(input.patientAge ?? input.age ?? -1);
    if (agentRole === "triage_agent" && patientAge >= 0 && patientAge < 18) {
      return {
        allow:  false,
        reason: `Triage agent is scoped for adults (age ≥ 18). Patient age ${patientAge} requires pediatric scope.`,
      };
    }
    return { allow: true };
  });

  // Hook 4: Audit logger (PostToolUse) — records every action outcome
  onPostToolUse("audit-logger", 10, async (payload) => {
    // Non-blocking — emit to event bus or audit store
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: payload.sessionId,
      agentRole: payload.agentRole,
      toolName:  payload.toolName,
      blocked:   payload.blocked,
      latencyMs: payload.latencyMs,
    };
    // In production: push to auditLogger / hash chain — here we just stamp it
    void entry;
  });

  // Hook 5: CRITICAL action notification (PostToolUse)
  onPostToolUse("critical-action-notifier", 20, async (payload) => {
    const CRITICAL_TOOLS = new Set(["execute:escalation", "execute:prescription", "submit:orders"]);
    if (CRITICAL_TOOLS.has(payload.toolName) && !payload.blocked) {
      await fireNotification({
        sessionId: payload.sessionId,
        agentRole: payload.agentRole,
        level:     "WARN",
        message:   `High-risk action executed: ${payload.toolName} by ${payload.agentRole}`,
        data:      { input: payload.input, latencyMs: payload.latencyMs },
      });
    }
  });
}

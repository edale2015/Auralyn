/**
 * hookMatcherConfig.ts — Declarative pattern-based hook configuration
 *
 * Article insight (§11 — "Use hooks for deterministic behaviour"):
 *   "Add to .claude/settings.json:
 *    { 'PostToolUse': [{ 'matcher': 'Edit|Write', 'hooks': [{ ... }] }] }"
 *
 * Current agentHookEngine.ts fires all registered handlers on every tool call —
 * no filtering. This module adds a declarative config layer: hooks only fire when
 * toolName, agentRole, and/or payload fields match their configured regex patterns.
 *
 * Clinical benefit: A PHI-write audit hook should NOT fire when the agent reads
 * vitals (that would be 90% false noise). A matcher narrows it to "write:ehr|write:phi*".
 *
 * Integration: hookMatcherConfig.evaluateMatchers() is called inside agentHookEngine
 * PreToolUse/PostToolUse chain before dispatching to registered handlers.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type MatcherHookType =
  | "PreToolUse"
  | "PostToolUse"
  | "SessionStart"
  | "SessionStop"
  | "PermissionRequest";

export type MatcherAction =
  | "allow"        // pass-through, log only
  | "block"        // return { allow: false } immediately
  | "warn"         // allow but attach warning
  | "require-cosign" // mark as needing physician sign-off
  | "route-cheap-model" // routing hint: delegate to haiku-class
  | "audit"        // write to audit trail
  | "notify";      // fire notification event

export interface HookMatcherConfig {
  id:           string;
  hookType:     MatcherHookType;
  toolMatcher:  string;   // regex pattern on toolName; "*" = all
  agentMatcher: string;   // regex pattern on agentRole; "*" = all roles
  action:       MatcherAction;
  message:      string;   // human-readable description of what fires
  severity:     "low" | "medium" | "high" | "critical";
  enabled:      boolean;
  tags:         string[];
  metadata?:    Record<string, unknown>;
}

export interface MatcherEvalInput {
  hookType:   MatcherHookType;
  toolName:   string;
  agentRole:  string;
  payload?:   Record<string, unknown>;
  sessionId?: string;
}

export interface MatcherEvalResult {
  matched:      HookMatcherConfig[];
  blocked:      boolean;
  warnings:     string[];
  actions:      MatcherAction[];
  requireCosign: boolean;
  routeCheapModel: boolean;
  auditRequired: boolean;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const _configs = new Map<string, HookMatcherConfig>();

export function registerMatcherConfig(config: HookMatcherConfig): void {
  if (_configs.has(config.id)) {
    throw new Error(`HookMatcherConfig already registered: ${config.id}`);
  }
  _configs.set(config.id, { ...config });
}

export function unregisterMatcherConfig(id: string): boolean {
  return _configs.delete(id);
}

export function toggleMatcherConfig(id: string, enabled: boolean): boolean {
  const c = _configs.get(id);
  if (!c) return false;
  c.enabled = enabled;
  return true;
}

export function listMatcherConfigs(): HookMatcherConfig[] {
  return [..._configs.values()];
}

export function getMatcherConfig(id: string): HookMatcherConfig | undefined {
  return _configs.get(id);
}

// ── Pattern matching ──────────────────────────────────────────────────────────

function matchesPattern(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  try {
    return new RegExp(pattern, "i").test(value);
  } catch {
    return false;
  }
}

// ── Core evaluator ────────────────────────────────────────────────────────────

export function evaluateMatchers(input: MatcherEvalInput): MatcherEvalResult {
  const matched: HookMatcherConfig[] = [];
  const warnings: string[]           = [];
  const actions:  MatcherAction[]    = [];
  let   blocked                       = false;
  let   requireCosign                 = false;
  let   routeCheapModel               = false;
  let   auditRequired                 = false;

  for (const config of _configs.values()) {
    if (!config.enabled) continue;
    if (config.hookType !== input.hookType) continue;
    if (!matchesPattern(config.toolMatcher,  input.toolName))  continue;
    if (!matchesPattern(config.agentMatcher, input.agentRole)) continue;

    matched.push(config);
    actions.push(config.action);

    switch (config.action) {
      case "block":
        blocked = true;
        warnings.push(`[${config.severity.toUpperCase()}] BLOCKED by matcher "${config.id}": ${config.message}`);
        break;
      case "warn":
        warnings.push(`[${config.severity.toUpperCase()}] WARN from matcher "${config.id}": ${config.message}`);
        break;
      case "require-cosign":
        requireCosign = true;
        warnings.push(`Cosign required by matcher "${config.id}": ${config.message}`);
        break;
      case "route-cheap-model":
        routeCheapModel = true;
        break;
      case "audit":
        auditRequired = true;
        break;
      case "notify":
        // notification handled externally
        break;
      case "allow":
      default:
        break;
    }
  }

  return { matched, blocked, warnings, actions, requireCosign, routeCheapModel, auditRequired };
}

// ── Built-in clinical matcher configurations ──────────────────────────────────

registerMatcherConfig({
  id:           "phi-write-audit",
  hookType:     "PostToolUse",
  toolMatcher:  "write:(ehr|phi|patient|record)",
  agentMatcher: "*",
  action:       "audit",
  message:      "PHI write detected — write to audit trail",
  severity:     "high",
  enabled:      true,
  tags:         ["phi", "hipaa", "audit"],
});

registerMatcherConfig({
  id:           "opioid-preblock",
  hookType:     "PreToolUse",
  toolMatcher:  "execute:prescription",
  agentMatcher: "triage_agent|billing_agent",
  action:       "block",
  message:      "Triage and billing agents cannot execute prescriptions directly",
  severity:     "critical",
  enabled:      true,
  tags:         ["medications", "opioid", "safety"],
});

registerMatcherConfig({
  id:           "ehr-cosign-required",
  hookType:     "PreToolUse",
  toolMatcher:  "write:ehr",
  agentMatcher: "ehr_agent|treatment_agent",
  action:       "require-cosign",
  message:      "EHR writes require physician co-signature",
  severity:     "high",
  enabled:      true,
  tags:         ["ehr", "cosign", "compliance"],
});

registerMatcherConfig({
  id:           "delete-patient-block",
  hookType:     "PreToolUse",
  toolMatcher:  "delete:(patient|ehr|phi|record)",
  agentMatcher: "*",
  action:       "block",
  message:      "Agents cannot delete patient records — requires human administrator",
  severity:     "critical",
  enabled:      true,
  tags:         ["data-protection", "hipaa"],
});

registerMatcherConfig({
  id:           "billing-audit",
  hookType:     "PostToolUse",
  toolMatcher:  "suggest:billing|submit:claim",
  agentMatcher: "billing_agent",
  action:       "audit",
  message:      "All billing submissions audited for compliance",
  severity:     "medium",
  enabled:      true,
  tags:         ["billing", "cms", "audit"],
});

registerMatcherConfig({
  id:           "screening-cheap-model",
  hookType:     "PreToolUse",
  toolMatcher:  "read:(vitals|screening|triage_score)",
  agentMatcher: "triage_agent",
  action:       "route-cheap-model",
  message:      "Screening reads can use haiku-class model — route for cost savings",
  severity:     "low",
  enabled:      true,
  tags:         ["cost", "model-routing", "screening"],
});

registerMatcherConfig({
  id:           "critical-order-notify",
  hookType:     "PostToolUse",
  toolMatcher:  "submit:orders|execute:escalation",
  agentMatcher: "*",
  action:       "notify",
  message:      "Critical clinical order submitted — notify charge nurse",
  severity:     "high",
  enabled:      true,
  tags:         ["orders", "notification", "escalation"],
});

registerMatcherConfig({
  id:           "learning-weight-warn",
  hookType:     "PreToolUse",
  toolMatcher:  "modify:weights|modify:model",
  agentMatcher: "learning_agent",
  action:       "warn",
  message:      "Model weight modification — FDA software change control required",
  severity:     "critical",
  enabled:      true,
  tags:         ["fda", "aiml", "model-change"],
});

registerMatcherConfig({
  id:           "session-start-log",
  hookType:     "SessionStart",
  toolMatcher:  "*",
  agentMatcher: "*",
  action:       "audit",
  message:      "Clinical agent session started — log for HIPAA access audit trail",
  severity:     "low",
  enabled:      true,
  tags:         ["hipaa", "session", "audit"],
});

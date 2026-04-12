/**
 * Clinical Hook Registry — Event-driven automation with conditions and priorities
 *
 * Article: "Hooks — Automation triggered on events (like enforcing code standards)"
 *
 * Clinical translation:
 *   A registry of hooks, each with:
 *     - triggerEvent: when does this hook fire?
 *     - condition: optional gate (run only if NEWS2 ≥ 5, etc.)
 *     - action: what the hook does
 *     - priority: lower number = runs first (safety hooks at 0, audit at 100)
 *     - blocking: if true, pipeline pauses for hook result before continuing
 *
 *   The existing preDisposition.ts is ONE hardcoded hook.
 *   This registry makes hooks dynamic, composable, and independently testable.
 *
 * Clinical hook library (pre-registered):
 *   NEWS2AlertHook         — NEWS2 ≥ 5 → auto-escalate to physician
 *   SepsisAutoEscalate     — sepsis risk high → bump to ER_IMMEDIATE
 *   AntibioticStewardship  — broad-spectrum ordered → stewardship review
 *   DischargeHIPAAAudit    — any discharge → log to HIPAA audit trail
 *   HypotensionFloor       — SBP < 80 → force ER_IMMEDIATE
 *   RedFlagOverride        — any red flag → escalate regardless of agent decision
 */

import { logEvent } from "../ops/auditEvents";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClinicalEvent =
  | "pre_disposition"
  | "post_scoring"
  | "pre_antibiotic"
  | "pre_discharge"
  | "sepsis_flag"
  | "news2_computed"
  | "lab_result"
  | "vitals_ingested"
  | "agent_decision";

export interface HookContext {
  patientId:    string;
  event:        ClinicalEvent;
  data:         Record<string, any>;
  timestamp:    string;
  [key: string]: any;
}

export type HookOutcome =
  | { action: "continue"; context: HookContext }
  | { action: "override"; context: HookContext; reason: string }
  | { action: "block";    context: HookContext; reason: string }
  | { action: "alert";    context: HookContext; alertMessage: string };

export interface RegisteredHook {
  id:          string;
  name:        string;
  description: string;
  event:       ClinicalEvent;
  priority:    number;           // 0 = highest priority (safety), 100 = lowest (audit)
  blocking:    boolean;          // if false, hook fires async without blocking pipeline
  condition?:  (ctx: HookContext) => boolean;   // gate: undefined = always run
  action:      (ctx: HookContext) => HookOutcome | Promise<HookOutcome>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _hooks = new Map<string, RegisteredHook>();

export function registerHook(hook: RegisteredHook): void {
  _hooks.set(hook.id, hook);
}

export function unregisterHook(hookId: string): boolean {
  return _hooks.delete(hookId);
}

export function getHook(hookId: string): RegisteredHook | null {
  return _hooks.get(hookId) ?? null;
}

export function listHooks(event?: ClinicalEvent): RegisteredHook[] {
  const all = [..._hooks.values()];
  const filtered = event ? all.filter((h) => h.event === event) : all;
  return filtered.sort((a, b) => a.priority - b.priority);
}

// ── Execution ──────────────────────────────────────────────────────────────────

export interface HookRunResult {
  hookId:    string;
  hookName:  string;
  ran:       boolean;    // false if condition gated it out
  outcome:   HookOutcome | null;
  durationMs: number;
}

export interface HookRunSummary {
  event:     ClinicalEvent;
  patientId: string;
  results:   HookRunResult[];
  blocked:   boolean;
  overridden:boolean;
  finalContext: HookContext;
  appliedHooks: string[];
}

/**
 * Fire all registered hooks for an event, in priority order.
 * Blocking hooks run sequentially; non-blocking hooks fire async.
 * If any hook returns "block", execution stops and remaining hooks are skipped.
 */
export async function fireHooks(
  event: ClinicalEvent,
  context: HookContext
): Promise<HookRunSummary> {
  const hooks    = listHooks(event);
  const results: HookRunResult[] = [];
  let   ctx      = { ...context };
  let   blocked  = false;
  let   overridden = false;
  const applied: string[] = [];

  for (const hook of hooks) {
    // Condition gate
    if (hook.condition && !hook.condition(ctx)) {
      results.push({ hookId: hook.id, hookName: hook.name, ran: false, outcome: null, durationMs: 0 });
      continue;
    }

    const tStart = Date.now();
    let outcome: HookOutcome;

    try {
      outcome = await Promise.resolve(hook.action(ctx));
    } catch (err: any) {
      // Non-fatal: log and continue
      logEvent("hook_error", { hookId: hook.id, error: err?.message });
      results.push({ hookId: hook.id, hookName: hook.name, ran: true, outcome: null, durationMs: Date.now() - tStart });
      continue;
    }

    const durationMs = Date.now() - tStart;
    results.push({ hookId: hook.id, hookName: hook.name, ran: true, outcome, durationMs });
    applied.push(hook.name);

    // Mutate context from hook
    ctx = { ...outcome.context };

    if (outcome.action === "block") {
      blocked = true;
      break;   // stop executing further hooks
    }
    if (outcome.action === "override") {
      overridden = true;
      // continue — subsequent hooks still run (they may further modify)
    }
  }

  return {
    event,
    patientId: context.patientId,
    results,
    blocked,
    overridden,
    finalContext: ctx,
    appliedHooks: applied,
  };
}

// ── Built-in Clinical Hook Library ────────────────────────────────────────────

/** Register the complete library of built-in clinical hooks */
export function registerBuiltInHooks(): void {

  // Priority 0: Life-threatening safety overrides
  registerHook({
    id:          "red_flag_override",
    name:        "Red Flag Override",
    description: "Any documented red flag immediately escalates to ER_IMMEDIATE",
    event:       "pre_disposition",
    priority:    0,
    blocking:    false,
    condition:   (ctx) => Array.isArray(ctx.data.redFlags) && ctx.data.redFlags.length > 0,
    action:      (ctx) => {
      const flags = ctx.data.redFlags as string[];
      return {
        action: "override",
        context: {
          ...ctx,
          data: { ...ctx.data, disposition: "ER_IMMEDIATE",
                  reason: `Red flags: ${flags.join(", ")}` },
        },
        reason: `Clinical red flag(s) detected: ${flags.join(", ")}`,
      };
    },
  });

  registerHook({
    id:          "hypotension_floor",
    name:        "Severe Hypotension Floor",
    description: "SBP < 80 mmHg forces ER_IMMEDIATE regardless of agent decision",
    event:       "pre_disposition",
    priority:    1,
    blocking:    false,
    condition:   (ctx) => {
      const sbp = ctx.data.vitals?.systolicBP ?? ctx.data.vitals?.sbp;
      return typeof sbp === "number" && sbp < 80;
    },
    action:      (ctx) => {
      const sbp = ctx.data.vitals?.systolicBP ?? ctx.data.vitals?.sbp;
      return {
        action: "override",
        context: { ...ctx, data: { ...ctx.data, disposition: "ER_IMMEDIATE",
                                   reason: `Severe hypotension SBP ${sbp}` } },
        reason: `SBP ${sbp} mmHg is below 80 — life-threatening hypotension`,
      };
    },
  });

  // Priority 5: NEWS2 escalation
  registerHook({
    id:          "news2_alert",
    name:        "NEWS2 High-Risk Alert",
    description: "NEWS2 ≥ 5 triggers physician notification and escalation",
    event:       "news2_computed",
    priority:    5,
    blocking:    false,
    condition:   (ctx) => typeof ctx.data.news2Score === "number" && ctx.data.news2Score >= 5,
    action:      (ctx) => {
      const score = ctx.data.news2Score as number;
      return {
        action:       "alert",
        context:      { ...ctx, data: { ...ctx.data, physicianAlerted: true } },
        alertMessage: `NEWS2 score ${score} ≥ 5 — immediate physician review required`,
      };
    },
  });

  // Priority 10: Sepsis auto-escalation
  registerHook({
    id:          "sepsis_auto_escalate",
    name:        "Sepsis Auto-Escalation",
    description: "High sepsis risk → escalate to ER_IMMEDIATE with sepsis bundle activation",
    event:       "sepsis_flag",
    priority:    10,
    blocking:    false,
    condition:   (ctx) => ctx.data.sepsisRisk === "high" || ctx.data.sepsisScore >= 2,
    action:      (ctx) => ({
      action: "override",
      context: { ...ctx, data: { ...ctx.data, disposition: "ER_IMMEDIATE",
                                 sepsisBundle: true, reason: "Sepsis protocol activated" } },
      reason: "Sepsis risk HIGH — activating sepsis bundle, escalating to ER_IMMEDIATE",
    }),
  });

  // Priority 20: Antibiotic stewardship
  registerHook({
    id:          "antibiotic_stewardship",
    name:        "Antibiotic Stewardship Review",
    description: "Broad-spectrum antibiotic orders trigger stewardship flag for pharmacist review",
    event:       "pre_antibiotic",
    priority:    20,
    blocking:    false,
    condition:   (ctx) => {
      const abx = (ctx.data.antibiotic ?? "").toLowerCase();
      const broadSpectrum = ["vancomycin", "meropenem", "piperacillin", "linezolid", "ceftriaxone"];
      return broadSpectrum.some((b) => abx.includes(b));
    },
    action:      (ctx) => ({
      action:       "alert",
      context:      { ...ctx, data: { ...ctx.data, stewardshipReview: true } },
      alertMessage: `Broad-spectrum antibiotic ${ctx.data.antibiotic} — stewardship pharmacist notified`,
    }),
  });

  // Priority 50: Hypoxia floor
  registerHook({
    id:          "hypoxia_floor",
    name:        "Severe Hypoxia Floor",
    description: "SpO2 < 88% forces ICU_ADMIT unless already ER_IMMEDIATE",
    event:       "vitals_ingested",
    priority:    50,
    blocking:    false,
    condition:   (ctx) => {
      const spo2 = ctx.data.vitals?.spo2;
      const disp = ctx.data.disposition;
      return typeof spo2 === "number" && spo2 < 88 && disp !== "ER_IMMEDIATE";
    },
    action:      (ctx) => {
      const spo2 = ctx.data.vitals?.spo2;
      return {
        action: "override",
        context: { ...ctx, data: { ...ctx.data, disposition: "ICU_ADMIT",
                                   reason: `SpO2 ${spo2}% — respiratory failure risk` } },
        reason: `SpO2 ${spo2}% critically low — escalating to ICU_ADMIT`,
      };
    },
  });

  // Priority 100: HIPAA audit (lowest priority, always runs after all decisions)
  registerHook({
    id:          "hipaa_discharge_audit",
    name:        "HIPAA Discharge Audit",
    description: "Every discharge event is logged to the HIPAA-compliant audit trail",
    event:       "pre_discharge",
    priority:    100,
    blocking:    false,
    action:      (ctx) => {
      logEvent("discharge_audit", {
        patientId:   ctx.patientId,
        disposition: ctx.data.disposition,
        timestamp:   ctx.timestamp,
      });
      return { action: "continue", context: ctx };
    },
  });
}

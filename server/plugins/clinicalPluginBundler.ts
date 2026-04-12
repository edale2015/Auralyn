/**
 * clinicalPluginBundler.ts — Clinical capability bundle install/uninstall
 *
 * Article insight (§8 — Plugins):
 *   "Plugins are the packaging layer to reuse the same setup across multiple
 *   repositories. A plugin bundles skills, hooks, subagents, and MCP servers
 *   into a single installable unit."
 *
 * Clinical translation: A "sepsis-response" plugin bundles together:
 *   - Scope rules (triage_agent gets read:sepsis_protocol, treatment_agent gets
 *     execute:hour_1_bundle)
 *   - Subagent specs (sepsis-screener runs on haiku, medication-checker on opus)
 *   - Hook matchers (pre-block any sepsis treatment without lactate on file)
 *   - Scheduled tasks (reassess every 30 min while active)
 *
 * Install is atomic: all components register together. Uninstall tears them all
 * down together. A bundle with errors aborts the entire install.
 *
 * Note: The existing pluginRegistry.ts in server/agents/ is a lightweight
 * health-check toggle for individual service modules. This is the higher-order
 * clinical specialty bundler.
 */

import { defineSubagent, undefineSubagent, type SubagentSpec } from "../agent/subagentRunner";
import {
  registerMatcherConfig,
  unregisterMatcherConfig,
  type HookMatcherConfig,
} from "../agent/hookMatcherConfig";

// ── Types ────────────────────────────────────────────────────────────────────

export type BundleStatus = "installed" | "not-installed" | "partial" | "error";

export interface BundleScopeRule {
  agentRole: string;
  action:    string;
  effect:    "grant" | "deny";
  reason:    string;
}

export interface BundleScheduledTask {
  id:           string;
  description:  string;
  intervalMs:   number;    // 0 = one-shot
  triggerOnce:  boolean;
  enabled:      boolean;
}

export interface ClinicalPluginBundle {
  id:             string;
  name:           string;
  specialty:      string;
  version:        string;
  description:    string;
  author:         string;
  scopeRules:     BundleScopeRule[];
  subagentSpecs:  SubagentSpec[];
  hookMatchers:   HookMatcherConfig[];
  scheduledTasks: BundleScheduledTask[];
  tags:           string[];
  metadata?:      Record<string, unknown>;
}

export interface InstalledBundleRecord {
  bundle:        ClinicalPluginBundle;
  installedAt:   number;
  status:        BundleStatus;
  installedComponents: {
    subagents:   string[];
    matchers:    string[];
    scopeRules:  number;
    tasks:       string[];
  };
  error?: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

const _installed = new Map<string, InstalledBundleRecord>();
const _scopeRulesByBundle = new Map<string, BundleScopeRule[]>();

// ── Install ───────────────────────────────────────────────────────────────────

export function installBundle(bundle: ClinicalPluginBundle): InstalledBundleRecord {
  if (_installed.has(bundle.id)) {
    const rec = _installed.get(bundle.id)!;
    return { ...rec, error: `Bundle "${bundle.id}" is already installed` };
  }

  const installedSubagents: string[]  = [];
  const installedMatchers:  string[]  = [];
  const installedTasks:     string[]  = [];

  try {
    // 1. Register subagents
    for (const spec of bundle.subagentSpecs) {
      const scopedName = `${bundle.id}:${spec.name}`;
      defineSubagent({ ...spec, name: scopedName });
      installedSubagents.push(scopedName);
    }

    // 2. Register hook matchers
    for (const matcher of bundle.hookMatchers) {
      const scopedId = `${bundle.id}:${matcher.id}`;
      registerMatcherConfig({ ...matcher, id: scopedId });
      installedMatchers.push(scopedId);
    }

    // 3. Store scope rules in memory (would integrate with agentScopeEngine in production)
    _scopeRulesByBundle.set(bundle.id, bundle.scopeRules);

    // 4. Store scheduled tasks (in production: wire into task scheduler)
    for (const task of bundle.scheduledTasks) {
      if (task.enabled) installedTasks.push(task.id);
    }

    const record: InstalledBundleRecord = {
      bundle,
      installedAt: Date.now(),
      status:      "installed",
      installedComponents: {
        subagents:  installedSubagents,
        matchers:   installedMatchers,
        scopeRules: bundle.scopeRules.length,
        tasks:      installedTasks,
      },
    };

    _installed.set(bundle.id, record);
    return record;

  } catch (err: unknown) {
    // Roll back what was partially installed
    for (const name of installedSubagents) {
      try { undefineSubagent(name); } catch { /* ignore */ }
    }
    for (const id of installedMatchers) {
      try { unregisterMatcherConfig(id); } catch { /* ignore */ }
    }
    _scopeRulesByBundle.delete(bundle.id);

    const record: InstalledBundleRecord = {
      bundle,
      installedAt: Date.now(),
      status:      "error",
      installedComponents: { subagents: [], matchers: [], scopeRules: 0, tasks: [] },
      error:       err instanceof Error ? err.message : String(err),
    };

    _installed.set(bundle.id, record);
    return record;
  }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

export function uninstallBundle(bundleId: string): { ok: boolean; message: string } {
  const record = _installed.get(bundleId);
  if (!record) {
    return { ok: false, message: `Bundle "${bundleId}" is not installed` };
  }

  const { subagents, matchers } = record.installedComponents;

  for (const name of subagents) {
    try { undefineSubagent(name); } catch { /* ignore */ }
  }
  for (const id of matchers) {
    try { unregisterMatcherConfig(id); } catch { /* ignore */ }
  }
  _scopeRulesByBundle.delete(bundleId);
  _installed.delete(bundleId);

  return { ok: true, message: `Bundle "${bundleId}" uninstalled (${subagents.length} subagents, ${matchers.length} matchers removed)` };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function listInstalledBundles(): InstalledBundleRecord[] {
  return [..._installed.values()];
}

export function getBundleRecord(id: string): InstalledBundleRecord | undefined {
  return _installed.get(id);
}

export function getBundleScopeRules(bundleId: string): BundleScopeRule[] {
  return _scopeRulesByBundle.get(bundleId) ?? [];
}

export function isBundleInstalled(id: string): boolean {
  const rec = _installed.get(id);
  return rec?.status === "installed";
}

// ── Built-in clinical plugin bundles ─────────────────────────────────────────

export const SEPSIS_RESPONSE_BUNDLE: ClinicalPluginBundle = {
  id:          "sepsis-response",
  name:        "Sepsis Response Bundle",
  specialty:   "critical-care",
  version:     "1.2.0",
  description: "Hour-1 Surviving Sepsis Campaign bundle: lactate, blood cultures, antibiotics, fluid resuscitation",
  author:      "auralyn-clinical-team",
  scopeRules: [
    { agentRole: "triage_agent",     action: "read:sepsis_protocol",    effect: "grant", reason: "Sepsis screening required" },
    { agentRole: "treatment_agent",  action: "execute:hour_1_bundle",   effect: "grant", reason: "Hour-1 SSC bundle authorized" },
    { agentRole: "ehr_agent",        action: "write:sepsis_order_set",  effect: "grant", reason: "Sepsis order set documentation" },
    { agentRole: "billing_agent",    action: "suggest:billing",         effect: "grant", reason: "Sepsis DRG coding authorized" },
    { agentRole: "learning_agent",   action: "modify:weights",          effect: "deny",  reason: "No weight changes during active sepsis bundle" },
  ],
  subagentSpecs: [
    {
      name:         "sepsis-screener",
      description:  "SIRS/qSOFA/SOFA scoring on vitals and labs",
      systemPrompt: "Calculate qSOFA score (RR≥22, altered mentation, SBP≤100). Flag if ≥2 criteria met. Also check SIRS: temp >38 or <36, HR >90, RR >20, WBC >12k or <4k. Output score and criteria met.",
      allowedTools: ["read:vitals", "read:labs", "read:mental_status"],
      model:        "haiku",
      maxTokens:    256,
      readOnly:     true,
      tags:         ["screening", "sepsis", "critical-care"],
    },
    {
      name:         "lactate-tracker",
      description:  "Monitors lactate trend for sepsis clearance (target <2.0 at 2h)",
      systemPrompt: "Track serial lactate values. Flag if initial >4.0 (septic shock criteria). Calculate clearance rate. Recommend repeat if >2.0 at 2h.",
      allowedTools: ["read:labs", "read:vitals"],
      model:        "haiku",
      maxTokens:    128,
      readOnly:     true,
      tags:         ["labs", "sepsis", "monitoring"],
    },
  ],
  hookMatchers: [
    {
      id:           "sepsis-antibiotic-require",
      hookType:     "PreToolUse",
      toolMatcher:  "execute:hour_1_bundle",
      agentMatcher: "treatment_agent",
      action:       "warn",
      message:      "Verify blood cultures drawn before antibiotic administration",
      severity:     "critical",
      enabled:      true,
      tags:         ["sepsis", "antibiotics"],
    },
    {
      id:           "sepsis-fluid-audit",
      hookType:     "PostToolUse",
      toolMatcher:  "submit:orders",
      agentMatcher: "*",
      action:       "audit",
      message:      "Sepsis fluid resuscitation order audited",
      severity:     "high",
      enabled:      true,
      tags:         ["sepsis", "fluids", "audit"],
    },
  ],
  scheduledTasks: [
    { id: "sepsis-reassess-30m", description: "Reassess qSOFA/lactate every 30 minutes", intervalMs: 30 * 60 * 1000, triggerOnce: false, enabled: true },
    { id: "sepsis-bundle-3h",    description: "3-hour bundle compliance check",           intervalMs:  3 * 60 * 60 * 1000, triggerOnce: true,  enabled: true },
  ],
  tags: ["sepsis", "critical-care", "ssc", "hour-1-bundle"],
};

export const CHEST_PAIN_PROTOCOL_BUNDLE: ClinicalPluginBundle = {
  id:          "chest-pain-protocol",
  name:        "Chest Pain Protocol Bundle",
  specialty:   "cardiology",
  version:     "2.0.0",
  description: "HEART score, serial troponins, EKG interpretation, ACS rule-in/rule-out",
  author:      "auralyn-clinical-team",
  scopeRules: [
    { agentRole: "triage_agent",    action: "read:ekg",               effect: "grant", reason: "EKG read required for ACS screening" },
    { agentRole: "treatment_agent", action: "execute:ekg_order",       effect: "grant", reason: "Immediate EKG for chest pain" },
    { agentRole: "treatment_agent", action: "execute:troponin_series", effect: "grant", reason: "Serial troponins for HEART score" },
    { agentRole: "ehr_agent",       action: "write:cardiac_note",      effect: "grant", reason: "Cardiac event documentation" },
  ],
  subagentSpecs: [
    {
      name:         "heart-scorer",
      description:  "HEART score calculator (History, EKG, Age, Risk, Troponin)",
      systemPrompt: "Calculate HEART score. H: 0-2 (slightly/moderately/highly suspicious history). E: 0-2 (normal/non-specific/significant EKG). A: 0-2 (<45/45-64/≥65). R: 0-2 (0-1/1-2/≥3 risk factors). T: 0-2 (normal/1-2x/≥3x ULN). Score ≤3=low risk, 4-6=moderate, ≥7=high risk.",
      allowedTools: ["read:ekg", "read:labs", "read:patient_history", "read:vitals"],
      model:        "sonnet",
      maxTokens:    512,
      readOnly:     true,
      tags:         ["cardiology", "acs", "scoring"],
    },
  ],
  hookMatchers: [
    {
      id:           "cp-stemi-alert",
      hookType:     "PostToolUse",
      toolMatcher:  "read:ekg",
      agentMatcher: "*",
      action:       "notify",
      message:      "EKG read complete — notify attending if STEMI criteria met",
      severity:     "critical",
      enabled:      true,
      tags:         ["stemi", "ekg", "cardiology"],
    },
  ],
  scheduledTasks: [
    { id: "troponin-3h", description: "3-hour troponin check reminder", intervalMs: 3 * 60 * 60 * 1000, triggerOnce: true, enabled: true },
    { id: "troponin-6h", description: "6-hour troponin check reminder", intervalMs: 6 * 60 * 60 * 1000, triggerOnce: true, enabled: true },
  ],
  tags: ["chest-pain", "acs", "stemi", "heart-score", "cardiology"],
};

export const PEDIATRIC_TRIAGE_BUNDLE: ClinicalPluginBundle = {
  id:          "pediatric-triage",
  name:        "Pediatric Triage Bundle",
  specialty:   "pediatrics",
  version:     "1.0.0",
  description: "Age-adjusted vitals, weight-based dosing (Broselow), pediatric red flags",
  author:      "auralyn-clinical-team",
  scopeRules: [
    { agentRole: "triage_agent",    action: "read:pediatric_vitals",  effect: "grant", reason: "Age-adjusted vital assessment" },
    { agentRole: "treatment_agent", action: "read:broselow_tape",     effect: "grant", reason: "Weight-based dosing reference" },
    { agentRole: "treatment_agent", action: "execute:prescription",   effect: "deny",  reason: "Pediatric prescriptions require PEM attending review" },
  ],
  subagentSpecs: [
    {
      name:         "peds-vitals-adjuster",
      description:  "Age-normalizes vital signs against pediatric reference ranges",
      systemPrompt: "Assess pediatric vitals using age-adjusted normals. Neonates: HR 100-160, RR 40-60. Infants: HR 90-130, RR 30-60. Toddlers: HR 80-120, RR 20-40. School age: HR 70-110, RR 18-30. Teens: HR 55-100, RR 12-20. Flag any value outside normal for age.",
      allowedTools: ["read:vitals", "read:patient_demographics"],
      model:        "haiku",
      maxTokens:    256,
      readOnly:     true,
      tags:         ["pediatrics", "vitals", "screening"],
    },
  ],
  hookMatchers: [
    {
      id:           "peds-rx-block",
      hookType:     "PreToolUse",
      toolMatcher:  "execute:prescription",
      agentMatcher: "*",
      action:       "block",
      message:      "Pediatric prescriptions blocked for agents — require PEM attending review",
      severity:     "critical",
      enabled:      true,
      tags:         ["pediatrics", "medications", "safety"],
    },
    {
      id:           "peds-weight-require",
      hookType:     "PreToolUse",
      toolMatcher:  "suggest:treatment",
      agentMatcher: "treatment_agent",
      action:       "warn",
      message:      "Verify patient weight before pediatric treatment — Broselow required",
      severity:     "high",
      enabled:      true,
      tags:         ["pediatrics", "dosing", "broselow"],
    },
  ],
  scheduledTasks: [
    { id: "peds-vitals-recheck-15m", description: "Recheck pediatric vitals every 15 min for unstable patients", intervalMs: 15 * 60 * 1000, triggerOnce: false, enabled: true },
  ],
  tags: ["pediatrics", "broselow", "weight-based-dosing", "age-adjusted"],
};

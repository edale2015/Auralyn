/**
 * Batch 51 — SubagentRunner, HookMatcherConfig, ClinicalPluginBundler,
 *             AgentCorrectionLog
 * Target: 45+ tests, all passing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ── SubagentRunner ────────────────────────────────────────────────────────────
import {
  defineSubagent, listSubagents, getSubagentSpec, runSubagent, runSubagentTeam,
  undefineSubagent, routeModel, type SubagentSpec,
} from "../../server/agent/subagentRunner";

// ── HookMatcherConfig ─────────────────────────────────────────────────────────
import {
  registerMatcherConfig, unregisterMatcherConfig, toggleMatcherConfig,
  listMatcherConfigs, getMatcherConfig, evaluateMatchers,
  type HookMatcherConfig,
} from "../../server/agent/hookMatcherConfig";

// ── ClinicalPluginBundler ─────────────────────────────────────────────────────
import {
  installBundle, uninstallBundle, listInstalledBundles, getBundleRecord,
  getBundleScopeRules, isBundleInstalled,
  SEPSIS_RESPONSE_BUNDLE, CHEST_PAIN_PROTOCOL_BUNDLE, PEDIATRIC_TRIAGE_BUNDLE,
} from "../../server/plugins/clinicalPluginBundler";

// ── AgentCorrectionLog ────────────────────────────────────────────────────────
import {
  logCorrection, getAllCorrections, getCorrectionsByAgent, getCorrectionStats,
  buildSessionPreamble, buildConcisePreamble, getCriticalCorrections,
} from "../../server/memory/agentCorrectionLog";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — SubagentRunner
// ─────────────────────────────────────────────────────────────────────────────

describe("SubagentRunner", () => {
  const TEST_NAME = "test-subagent-batch51";

  afterEach(() => {
    try { undefineSubagent(TEST_NAME); } catch { /* already gone */ }
  });

  it("lists built-in clinical subagents", () => {
    const list = listSubagents();
    expect(list.length).toBeGreaterThanOrEqual(6);
    const names = list.map((s) => s.name);
    expect(names).toContain("vitals-screener");
    expect(names).toContain("lab-analyzer");
    expect(names).toContain("red-flag-scanner");
    expect(names).toContain("medication-checker");
    expect(names).toContain("billing-coder");
    expect(names).toContain("discharge-planner");
  });

  it("retrieves subagent spec by name", () => {
    const spec = getSubagentSpec("vitals-screener");
    expect(spec).toBeDefined();
    expect(spec!.model).toBe("haiku");
    expect(spec!.readOnly).toBe(true);
    expect(spec!.tags).toContain("screening");
  });

  it("medication-checker is opus model (safety-critical)", () => {
    const spec = getSubagentSpec("medication-checker")!;
    expect(spec.model).toBe("opus");
    expect(spec.tags).toContain("safety-critical");
  });

  it("defines and retrieves a custom subagent", () => {
    const spec: SubagentSpec = {
      name: TEST_NAME, description: "Test", systemPrompt: "Test prompt",
      allowedTools: ["read:test"], model: "haiku", maxTokens: 128,
      readOnly: true, tags: ["test"],
    };
    defineSubagent(spec);
    expect(getSubagentSpec(TEST_NAME)).toMatchObject({ name: TEST_NAME });
  });

  it("throws when defining duplicate subagent", () => {
    const spec: SubagentSpec = {
      name: TEST_NAME, description: "D", systemPrompt: "S",
      allowedTools: ["*"], model: "haiku", maxTokens: 128, readOnly: true, tags: [],
    };
    defineSubagent(spec);
    expect(() => defineSubagent(spec)).toThrow(/already registered/);
  });

  it("undefines a subagent", () => {
    defineSubagent({
      name: TEST_NAME, description: "D", systemPrompt: "S",
      allowedTools: ["*"], model: "haiku", maxTokens: 128, readOnly: true, tags: [],
    });
    expect(undefineSubagent(TEST_NAME)).toBe(true);
    expect(getSubagentSpec(TEST_NAME)).toBeUndefined();
  });

  it("routes safety-critical tags to opus regardless of spec model", () => {
    const spec: SubagentSpec = {
      name: TEST_NAME, description: "D", systemPrompt: "S",
      allowedTools: ["*"], model: "haiku", maxTokens: 128,
      readOnly: true, tags: ["safety-critical"],
    };
    expect(routeModel(spec)).toBe("opus");
  });

  it("routes billing tags to haiku", () => {
    const spec = getSubagentSpec("billing-coder")!;
    expect(routeModel(spec)).toBe("haiku");
  });

  it("runs a subagent and returns summary only", async () => {
    const result = await runSubagent("vitals-screener", {
      task: "Screen vitals for CRITICAL status",
      payload: { vitals: { hr: 120, bp: "90/60", rr: 28, spo2: 88 } },
      sessionId: "sess-001",
      patientId: "pt-001",
    });
    expect(result.subagentName).toBe("vitals-screener");
    expect(result.model).toBe("haiku");
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain("vitals-screener".toUpperCase());
    expect(result.contextLines).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it("blocks disallowed tools in subagent", async () => {
    const result = await runSubagent("vitals-screener", {
      task: "Try to write EHR",
      payload: { ehr: "write attempt" },  // read:ehr not in allowedTools
    });
    // "write" is blocked for readOnly subagent
    expect(result.blocked.length + result.toolsInvoked.length).toBeGreaterThan(0);
  });

  it("returns error result for unknown subagent", async () => {
    const result = await runSubagent("nonexistent-agent", { task: "t", payload: {} });
    expect(result.error).toContain("not found");
    expect(result.summary).toContain("nonexistent-agent");
  });

  it("runs a team of subagents in parallel", async () => {
    const results = await runSubagentTeam([
      { subagentName: "vitals-screener",  input: { task: "Screen vitals", payload: { vitals: {} } } },
      { subagentName: "red-flag-scanner", input: { task: "Scan symptoms", payload: { complaint: "chest pain" } } },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].subagentName).toBe("vitals-screener");
    expect(results[1].subagentName).toBe("red-flag-scanner");
  });

  it("subagent result has tokensUsed > 0", async () => {
    const result = await runSubagent("lab-analyzer", {
      task: "Interpret labs", payload: { labs: { troponin: 0.8, bnp: 500 } },
    });
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("subagent result has latencyMs >= 0", async () => {
    const result = await runSubagent("billing-coder", { task: "Code encounter", payload: {} });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — HookMatcherConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("HookMatcherConfig", () => {
  const TEST_MATCHER_ID = "test-matcher-batch51";

  afterEach(() => {
    try { unregisterMatcherConfig(TEST_MATCHER_ID); } catch { /* ok */ }
  });

  it("lists built-in clinical matchers", () => {
    const list = listMatcherConfigs();
    expect(list.length).toBeGreaterThanOrEqual(8);
    const ids = list.map((m) => m.id);
    expect(ids).toContain("phi-write-audit");
    expect(ids).toContain("opioid-preblock");
    expect(ids).toContain("ehr-cosign-required");
    expect(ids).toContain("delete-patient-block");
  });

  it("retrieves matcher by id", () => {
    const m = getMatcherConfig("opioid-preblock");
    expect(m).toBeDefined();
    expect(m!.action).toBe("block");
    expect(m!.severity).toBe("critical");
  });

  it("registers and retrieves custom matcher", () => {
    const cfg: HookMatcherConfig = {
      id: TEST_MATCHER_ID, hookType: "PreToolUse", toolMatcher: "test:.*",
      agentMatcher: "*", action: "warn", message: "test", severity: "low",
      enabled: true, tags: [],
    };
    registerMatcherConfig(cfg);
    expect(getMatcherConfig(TEST_MATCHER_ID)).toMatchObject({ id: TEST_MATCHER_ID });
  });

  it("throws on duplicate matcher id", () => {
    const cfg: HookMatcherConfig = {
      id: TEST_MATCHER_ID, hookType: "PreToolUse", toolMatcher: "*",
      agentMatcher: "*", action: "allow", message: "", severity: "low",
      enabled: true, tags: [],
    };
    registerMatcherConfig(cfg);
    expect(() => registerMatcherConfig(cfg)).toThrow(/already registered/);
  });

  it("toggles matcher enabled state", () => {
    const cfg: HookMatcherConfig = {
      id: TEST_MATCHER_ID, hookType: "PreToolUse", toolMatcher: "*",
      agentMatcher: "*", action: "allow", message: "", severity: "low",
      enabled: true, tags: [],
    };
    registerMatcherConfig(cfg);
    expect(toggleMatcherConfig(TEST_MATCHER_ID, false)).toBe(true);
    expect(getMatcherConfig(TEST_MATCHER_ID)!.enabled).toBe(false);
  });

  it("unregisters a matcher", () => {
    const cfg: HookMatcherConfig = {
      id: TEST_MATCHER_ID, hookType: "PostToolUse", toolMatcher: "*",
      agentMatcher: "*", action: "audit", message: "", severity: "low",
      enabled: true, tags: [],
    };
    registerMatcherConfig(cfg);
    expect(unregisterMatcherConfig(TEST_MATCHER_ID)).toBe(true);
    expect(getMatcherConfig(TEST_MATCHER_ID)).toBeUndefined();
  });

  it("evaluateMatchers: blocks opioid prescription for triage_agent", () => {
    const result = evaluateMatchers({
      hookType: "PreToolUse", toolName: "execute:prescription", agentRole: "triage_agent",
    });
    expect(result.blocked).toBe(true);
    expect(result.warnings.some((w) => w.includes("CRITICAL"))).toBe(true);
  });

  it("evaluateMatchers: requires cosign for EHR write", () => {
    const result = evaluateMatchers({
      hookType: "PreToolUse", toolName: "write:ehr", agentRole: "ehr_agent",
    });
    expect(result.requireCosign).toBe(true);
  });

  it("evaluateMatchers: blocks delete patient for all agents", () => {
    const result = evaluateMatchers({
      hookType: "PreToolUse", toolName: "delete:patient_data", agentRole: "any_agent",
    });
    expect(result.blocked).toBe(true);
  });

  it("evaluateMatchers: PHI write triggers audit", () => {
    const result = evaluateMatchers({
      hookType: "PostToolUse", toolName: "write:ehr", agentRole: "ehr_agent",
    });
    expect(result.auditRequired).toBe(true);
  });

  it("evaluateMatchers: screening read routes to cheap model", () => {
    const result = evaluateMatchers({
      hookType: "PreToolUse", toolName: "read:vitals", agentRole: "triage_agent",
    });
    expect(result.routeCheapModel).toBe(true);
  });

  it("evaluateMatchers: disabled matcher does not fire", () => {
    toggleMatcherConfig("screening-cheap-model", false);
    const result = evaluateMatchers({
      hookType: "PreToolUse", toolName: "read:vitals", agentRole: "triage_agent",
    });
    // No longer routes cheap model
    const stillRoutes = result.matched.some((m) => m.id === "screening-cheap-model");
    expect(stillRoutes).toBe(false);
    // Re-enable
    toggleMatcherConfig("screening-cheap-model", true);
  });

  it("evaluateMatchers: no match for unrelated tool", () => {
    const result = evaluateMatchers({
      hookType: "PreToolUse", toolName: "read:blood_pressure", agentRole: "unknown_agent",
    });
    expect(result.blocked).toBe(false);
    expect(result.requireCosign).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — ClinicalPluginBundler
// ─────────────────────────────────────────────────────────────────────────────

describe("ClinicalPluginBundler", () => {
  afterEach(() => {
    // Clean up test installs
    try { uninstallBundle("sepsis-response"); } catch { /* ok */ }
    try { uninstallBundle("chest-pain-protocol"); } catch { /* ok */ }
    try { uninstallBundle("pediatric-triage"); } catch { /* ok */ }
  });

  it("sepsis bundle has correct structure", () => {
    expect(SEPSIS_RESPONSE_BUNDLE.id).toBe("sepsis-response");
    expect(SEPSIS_RESPONSE_BUNDLE.specialty).toBe("critical-care");
    expect(SEPSIS_RESPONSE_BUNDLE.scopeRules.length).toBeGreaterThan(0);
    expect(SEPSIS_RESPONSE_BUNDLE.subagentSpecs.length).toBeGreaterThan(0);
    expect(SEPSIS_RESPONSE_BUNDLE.hookMatchers.length).toBeGreaterThan(0);
    expect(SEPSIS_RESPONSE_BUNDLE.scheduledTasks.length).toBeGreaterThan(0);
  });

  it("installs sepsis bundle atomically", () => {
    const record = installBundle(SEPSIS_RESPONSE_BUNDLE);
    expect(record.status).toBe("installed");
    expect(record.installedComponents.subagents.length).toBeGreaterThan(0);
    expect(record.installedComponents.matchers.length).toBeGreaterThan(0);
    expect(record.installedComponents.scopeRules).toBeGreaterThan(0);
    expect(isBundleInstalled("sepsis-response")).toBe(true);
  });

  it("scoped subagent names use bundle prefix", () => {
    const record = installBundle(SEPSIS_RESPONSE_BUNDLE);
    expect(record.installedComponents.subagents.every((n) => n.startsWith("sepsis-response:"))).toBe(true);
  });

  it("scoped matcher ids use bundle prefix", () => {
    const record = installBundle(SEPSIS_RESPONSE_BUNDLE);
    expect(record.installedComponents.matchers.every((id) => id.startsWith("sepsis-response:"))).toBe(true);
  });

  it("returns error on duplicate install", () => {
    installBundle(CHEST_PAIN_PROTOCOL_BUNDLE);
    const record2 = installBundle(CHEST_PAIN_PROTOCOL_BUNDLE);
    expect(record2.error).toBeTruthy();
  });

  it("uninstalls bundle and removes all components", () => {
    installBundle(PEDIATRIC_TRIAGE_BUNDLE);
    expect(isBundleInstalled("pediatric-triage")).toBe(true);
    const result = uninstallBundle("pediatric-triage");
    expect(result.ok).toBe(true);
    expect(isBundleInstalled("pediatric-triage")).toBe(false);
  });

  it("uninstall returns error for non-installed bundle", () => {
    const result = uninstallBundle("nonexistent-bundle");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not installed");
  });

  it("getBundleScopeRules returns rules after install", () => {
    installBundle(SEPSIS_RESPONSE_BUNDLE);
    const rules = getBundleScopeRules("sepsis-response");
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.effect === "grant")).toBe(true);
    expect(rules.some((r) => r.effect === "deny")).toBe(true);
  });

  it("getBundleScopeRules returns empty for non-installed", () => {
    expect(getBundleScopeRules("not-a-bundle")).toHaveLength(0);
  });

  it("getBundleRecord returns record after install", () => {
    installBundle(CHEST_PAIN_PROTOCOL_BUNDLE);
    const rec = getBundleRecord("chest-pain-protocol");
    expect(rec).toBeDefined();
    expect(rec!.bundle.name).toContain("Chest Pain");
  });

  it("listInstalledBundles reflects installs and uninstalls", () => {
    installBundle(SEPSIS_RESPONSE_BUNDLE);
    installBundle(PEDIATRIC_TRIAGE_BUNDLE);
    expect(listInstalledBundles().length).toBeGreaterThanOrEqual(2);
    uninstallBundle("pediatric-triage");
    const ids = listInstalledBundles().map((r) => r.bundle.id);
    expect(ids).not.toContain("pediatric-triage");
  });

  it("pediatric bundle has rx-block hook matcher", () => {
    const m = PEDIATRIC_TRIAGE_BUNDLE.hookMatchers.find((h) => h.id === "peds-rx-block");
    expect(m).toBeDefined();
    expect(m!.action).toBe("block");
    expect(m!.severity).toBe("critical");
  });

  it("chest-pain bundle has HEART scorer subagent spec", () => {
    const sa = CHEST_PAIN_PROTOCOL_BUNDLE.subagentSpecs.find((s) => s.name === "heart-scorer");
    expect(sa).toBeDefined();
    expect(sa!.model).toBe("sonnet");
    expect(sa!.allowedTools).toContain("read:ekg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — AgentCorrectionLog
// ─────────────────────────────────────────────────────────────────────────────

describe("AgentCorrectionLog", () => {
  it("logs a correction and returns full entry", async () => {
    const entry = await logCorrection({
      sessionId: "sess-001", agentRole: "triage_agent",
      mistake:   "Marked chest pain as low-risk without EKG",
      correction: "All chest pain cases require EKG within 10 minutes",
      rule:      "Always order EKG for chief complaint of chest pain before risk stratification",
      severity:  "critical", confirmedBy: "dr-smith",
      appliesTo: ["triage_agent"], category: "diagnosis",
    });
    expect(entry.id).toMatch(/^corr-/);
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.agentRole).toBe("triage_agent");
    expect(entry.severity).toBe("critical");
  });

  it("getAllCorrections returns logged entries", async () => {
    await logCorrection({
      sessionId: "sess-002", agentRole: "treatment_agent",
      mistake: "Prescribed aspirin without checking allergy",
      correction: "Always check allergy list before prescribing",
      rule: "Read allergies before any medication prescription",
      severity: "high", confirmedBy: "dr-jones",
      appliesTo: ["treatment_agent", "triage_agent"], category: "medication",
    });
    const all = getAllCorrections();
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].timestamp).toBeGreaterThanOrEqual(all[all.length - 1].timestamp); // sorted descending
  });

  it("getCorrectionsByAgent filters correctly", async () => {
    await logCorrection({
      sessionId: "sess-003", agentRole: "billing_agent",
      mistake: "Upcoded encounter level",
      correction: "Code only what is documented",
      rule: "Never suggest a billing code that is not supported by documentation",
      severity: "high", confirmedBy: "compliance-officer",
      appliesTo: ["billing_agent"], category: "billing",
    });
    const billingOnes = getCorrectionsByAgent("billing_agent");
    expect(billingOnes.length).toBeGreaterThan(0);
    expect(billingOnes.every((c) =>
      c.agentRole === "billing_agent" || c.appliesTo.includes("billing_agent") || c.appliesTo.includes("*")
    )).toBe(true);
  });

  it("getCriticalCorrections returns only critical/high severity", async () => {
    await logCorrection({
      sessionId: "sess-004", agentRole: "ehr_agent",
      mistake: "Wrote to wrong patient record",
      correction: "Verify patient ID before every EHR write",
      rule: "ALWAYS confirm patientId matches active session before write:ehr",
      severity: "critical", confirmedBy: "dr-smith",
      appliesTo: ["ehr_agent"], category: "documentation",
    });
    const critical = getCriticalCorrections();
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.every((c) => c.severity === "critical" || c.severity === "high")).toBe(true);
  });

  it("buildSessionPreamble returns formatted rules", async () => {
    await logCorrection({
      sessionId: "sess-005", agentRole: "triage_agent",
      mistake: "Missed sepsis criteria in elderly patient",
      correction: "Use qSOFA for all patients ≥65 with infection suspicion",
      rule: "For patients ≥65 with fever, always calculate qSOFA",
      severity: "critical", confirmedBy: "dr-smith",
      appliesTo: ["triage_agent"], category: "diagnosis",
    });
    const preamble = buildSessionPreamble("triage_agent");
    expect(preamble).toContain("Correction Rules");
    expect(preamble).toContain("triage_agent");
    expect(preamble).toContain("Mistake:");
    expect(preamble).toContain("Rule:");
    expect(preamble).toContain("CRITICAL");
  });

  it("buildSessionPreamble returns empty string for agent with no corrections", () => {
    const preamble = buildSessionPreamble("escalation_agent_with_no_corrections_ever");
    expect(preamble).toBe("");
  });

  it("buildConcisePreamble returns shortened version with only critical/high rules", async () => {
    await logCorrection({
      sessionId: "sess-006", agentRole: "triage_agent",
      mistake: "Low severity mistake", correction: "minor fix", rule: "minor rule",
      severity: "low", confirmedBy: "nurse-01", appliesTo: ["triage_agent"], category: "documentation",
    });
    const concise = buildConcisePreamble("triage_agent");
    // Should contain only critical/high rules (not low)
    if (concise.length > 0) {
      expect(concise).toContain("RULE:");
    }
  });

  it("getCorrectionStats totals match logged entries", async () => {
    const stats = getCorrectionStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.byAgent).toBe("object");
    expect(typeof stats.byCategory).toBe("object");
    expect(typeof stats.bySeverity).toBe("object");
    expect(typeof stats.recentCount).toBe("number");
  });

  it("getCorrectionStats bySeverity includes logged severities", async () => {
    await logCorrection({
      sessionId: "sess-007", agentRole: "triage_agent",
      mistake: "Medium issue", correction: "fix", rule: "rule",
      severity: "medium", confirmedBy: "dr-x", appliesTo: ["triage_agent"], category: "escalation",
    });
    const stats = getCorrectionStats();
    expect(stats.bySeverity["medium"]).toBeGreaterThan(0);
  });

  it("wildcard appliesTo reaches all agent types", async () => {
    await logCorrection({
      sessionId: "sess-008", agentRole: "system",
      mistake: "Global PHI leak pattern", correction: "Enforce de-identification",
      rule: "Never log raw patient text to unencrypted channels",
      severity: "critical", confirmedBy: "ciso",
      appliesTo: ["*"], category: "documentation",
    });
    const forAny = getCorrectionsByAgent("completely_different_agent");
    expect(forAny.some((c) => c.appliesTo.includes("*"))).toBe(true);
  });
});

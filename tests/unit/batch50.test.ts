import { describe, it, expect, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Agent Scope Claims (fine-grained value-bounded limits)
// ─────────────────────────────────────────────────────────────────────────────
import {
  scopeClaimsEngine, CLAIM_CATALOG, MEDICAL_DEFAULT_GRANTS,
  type ClaimCheckInput,
} from "../../server/scope/agentScopeClaims";

describe("Batch50 — agentScopeClaims: fine-grained claim enforcement", () => {
  it("CLAIM_CATALOG contains expected clinical claim types", () => {
    const names = CLAIM_CATALOG.map((c) => c.name);
    expect(names).toContain("max_patient_count");
    expect(names).toContain("max_dose_mg");
    expect(names).toContain("controlled_substance_allowed");
    expect(names).toContain("require_physician_cosign");
    expect(names).toContain("phi_scope");
    expect(names).toContain("weight_delta_cap_pct");
    expect(names).toContain("max_escalation_tier");
  });

  it("MEDICAL_DEFAULT_GRANTS covers all key agent roles", () => {
    const roles = new Set(MEDICAL_DEFAULT_GRANTS.map((g) => g.agentRole));
    expect(roles.has("triage_agent")).toBe(true);
    expect(roles.has("treatment_agent")).toBe(true);
    expect(roles.has("ehr_agent")).toBe(true);
    expect(roles.has("learning_agent")).toBe(true);
    expect(roles.has("escalation_agent")).toBe(true);
    expect(roles.has("billing_agent")).toBe(true);
  });

  it("blocks integer claim violation: patient count exceeds limit", () => {
    const input: ClaimCheckInput = {
      agentRole: "triage_agent",
      action:    "read:patient_data",
      requestedValues: { max_patient_count: 200 },   // limit is 50
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].claim).toBe("max_patient_count");
    expect(result.violations[0].severity).toBe("BLOCK");
    expect(result.violations[0].message).toContain("200");
  });

  it("passes when patient count is within limit", () => {
    const input: ClaimCheckInput = {
      agentRole: "triage_agent",
      action:    "read:patient_data",
      requestedValues: { max_patient_count: 10 },    // limit is 50
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("blocks boolean claim: controlled substance when not allowed", () => {
    const input: ClaimCheckInput = {
      agentRole: "treatment_agent",
      action:    "suggest:treatment",
      requestedValues: { controlled_substance_allowed: true },  // limit=false
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(false);
    expect(result.violations[0].claim).toBe("controlled_substance_allowed");
  });

  it("passes when controlled substance is not requested", () => {
    const input: ClaimCheckInput = {
      agentRole: "treatment_agent",
      action:    "suggest:treatment",
      requestedValues: { max_dose_mg: 250 },   // under 1000mg limit
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(true);
  });

  it("blocks float claim: dose exceeds max_dose_mg limit", () => {
    const input: ClaimCheckInput = {
      agentRole: "treatment_agent",
      action:    "suggest:treatment",
      requestedValues: { max_dose_mg: 2000 },  // limit is 1000mg
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(false);
    expect(result.violations[0].claim).toBe("max_dose_mg");
  });

  it("blocks list claim: billing code not in allowlist", () => {
    const input: ClaimCheckInput = {
      agentRole: "billing_agent",
      action:    "suggest:billing",
      requestedValues: { allowed_billing_codes: ["99214", "99999"] },  // 99999 not allowed
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(false);
    expect(result.violations[0].claim).toBe("allowed_billing_codes");
    expect(result.violations[0].message).toContain("99999");
  });

  it("passes when billing codes are all in allowlist", () => {
    const input: ClaimCheckInput = {
      agentRole: "billing_agent",
      action:    "suggest:billing",
      requestedValues: { allowed_billing_codes: ["99213", "99214"] },
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(true);
  });

  it("blocks enum claim: escalation tier exceeds TIER_2 limit", () => {
    const input: ClaimCheckInput = {
      agentRole: "escalation_agent",
      action:    "execute:escalation",
      requestedValues: { max_escalation_tier: "TIER_CRITICAL" },  // limit TIER_2
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(false);
    expect(result.violations[0].claim).toBe("max_escalation_tier");
  });

  it("passes enum claim when tier is within limit", () => {
    const input: ClaimCheckInput = {
      agentRole: "escalation_agent",
      action:    "execute:escalation",
      requestedValues: { max_escalation_tier: "TIER_1" },
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(true);
  });

  it("returns no constraints when no grants exist for action", () => {
    const input: ClaimCheckInput = {
      agentRole: "triage_agent",
      action:    "some:unclaimed:action",
      requestedValues: { whatever: 999 },
    };
    const result = scopeClaimsEngine.check(input);
    expect(result.passed).toBe(true);   // no grants = no constraints
    expect(result.violations).toHaveLength(0);
    expect(result.grants).toHaveLength(0);
  });

  it("issueGrant adds a new grant that becomes enforceable", () => {
    const grant = scopeClaimsEngine.issueGrant({
      agentRole: "triage_agent",
      action:    "read:vitals",
      issuedBy:  "physician-test",
      purpose:   "Test grant",
      claims:    [{ claim: "max_patient_count", value: 5 }],
    });
    expect(grant.grantId).toBeTruthy();

    const result = scopeClaimsEngine.check({
      agentRole: "triage_agent",
      action:    "read:vitals",
      requestedValues: { max_patient_count: 100 },   // over new limit of 5
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0].limit).toBe(5);

    // Cleanup
    scopeClaimsEngine.revokeGrant(grant.grantId);
  });

  it("revokeGrant removes the grant and claim is no longer enforced", () => {
    const grant = scopeClaimsEngine.issueGrant({
      agentRole: "triage_agent",
      action:    "read:vitals",
      issuedBy:  "physician-test",
      claims:    [{ claim: "max_patient_count", value: 1 }],
    });
    scopeClaimsEngine.revokeGrant(grant.grantId);

    const result = scopeClaimsEngine.check({
      agentRole: "triage_agent",
      action:    "read:vitals",
      requestedValues: { max_patient_count: 100 },
    });
    // After revocation the new grant is gone — only default grants apply
    // Default triage:read:patient_data grant exists for read:patient_data, not read:vitals
    expect(result.grants.some((g) => g.grantId === grant.grantId)).toBe(false);
  });

  it("getGrants returns active grants for an agent role", () => {
    const grants = scopeClaimsEngine.getGrants("ehr_agent");
    expect(grants.length).toBeGreaterThanOrEqual(2);
    expect(grants.every((g) => g.agentRole === "ehr_agent")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scope Creep Auditor
// ─────────────────────────────────────────────────────────────────────────────
import {
  recordUsage, generateCreepReport, generateAllCreepReports,
  getExpansionEvents, getCriticalExpansions, getUsageRecords, resetObservations,
} from "../../server/scope/scopeCreepAuditor";

describe("Batch50 — scopeCreepAuditor: over-provisioning detection", () => {
  beforeEach(() => resetObservations());

  it("records usage and retrieves records for an agent", () => {
    recordUsage("session-1", "triage_agent", "read:patient_data", "allowed");
    recordUsage("session-1", "triage_agent", "execute:triage_decision", "allowed");
    recordUsage("session-1", "triage_agent", "write:ehr", "blocked");

    const records = getUsageRecords({ agentRole: "triage_agent" });
    expect(records.length).toBe(3);
  });

  it("generates creep report showing unused permissions", () => {
    // Triage agent only uses read:patient_data — not other express permissions
    recordUsage("session-2", "triage_agent", "read:patient_data", "allowed");
    // triage_agent has: read:patient_data, read:vitals, execute:triage_decision, read:risk_score
    // Only read:patient_data was used → read:vitals, execute:triage_decision, read:risk_score are "unused"

    const report = generateCreepReport("triage_agent")!;
    expect(report).not.toBeNull();
    expect(report.agentRole).toBe("triage_agent");
    expect(report.usedActions).toContain("read:patient_data");
    expect(report.unusedGranted.length).toBeGreaterThan(0);
    expect(report.creepScore).toBeGreaterThan(0);
  });

  it("clean agent (all permissions used) has low creep score", () => {
    // Use ALL triage_agent express permissions
    recordUsage("session-3", "triage_agent", "read:patient_data",       "allowed");
    recordUsage("session-3", "triage_agent", "read:vitals",             "allowed");
    recordUsage("session-3", "triage_agent", "execute:triage_decision", "allowed");
    recordUsage("session-3", "triage_agent", "read:risk_score",         "allowed");

    const report = generateCreepReport("triage_agent")!;
    expect(report.unusedGranted).toHaveLength(0);
    expect(report.creepScore).toBeLessThan(0.3);
  });

  it("detects new undeclared action as expansion event", () => {
    // "access:shadow_system" is not in triage_agent's scope at all
    recordUsage("session-4", "triage_agent", "access:shadow_system", "allowed");

    const events = getExpansionEvents();
    const expansion = events.find((e) => e.agentRole === "triage_agent" && e.action === "access:shadow_system");
    expect(expansion).toBeDefined();
    expect(expansion!.type).toBe("new_action");
    expect(expansion!.severity).toBe("HIGH");
  });

  it("detects denial bypass as CRITICAL expansion event", () => {
    // "write:ehr" is in triage_agent's denied list — but it was allowed somehow
    recordUsage("session-5", "triage_agent", "write:ehr", "allowed");

    const critical = getCriticalExpansions();
    const bypass = critical.find((e) => e.agentRole === "triage_agent" && e.action === "write:ehr");
    expect(bypass).toBeDefined();
    expect(bypass!.type).toBe("denial_bypass");
    expect(bypass!.severity).toBe("CRITICAL");
  });

  it("generateAllCreepReports covers all medical agent roles", () => {
    const reports = generateAllCreepReports();
    const roles = reports.map((r) => r.agentRole);
    expect(roles).toContain("triage_agent");
    expect(roles).toContain("treatment_agent");
    expect(roles).toContain("ehr_agent");
    expect(roles).toContain("learning_agent");
    expect(roles).toContain("escalation_agent");
    expect(roles).toContain("billing_agent");
  });

  it("creep report includes actionable recommendation text", () => {
    recordUsage("session-6", "triage_agent", "read:patient_data", "allowed");

    const report = generateCreepReport("triage_agent")!;
    expect(report.recommendation).toBeTruthy();
    expect(report.recommendation.length).toBeGreaterThan(10);
  });

  it("getUsageRecords filters by sessionId", () => {
    recordUsage("sess-A", "triage_agent",    "read:patient_data", "allowed");
    recordUsage("sess-B", "treatment_agent", "suggest:treatment",  "allowed");
    recordUsage("sess-A", "ehr_agent",       "write:ehr",          "allowed");

    const sessARecords = getUsageRecords({ sessionId: "sess-A" });
    expect(sessARecords.every((r) => r.sessionId === "sess-A")).toBe(true);
    expect(sessARecords.length).toBe(2);
  });

  it("multi-session observation aggregates correctly", () => {
    recordUsage("s1", "ehr_agent", "write:ehr",     "allowed");
    recordUsage("s2", "ehr_agent", "submit:orders", "allowed");
    recordUsage("s3", "ehr_agent", "write:ehr",     "allowed");

    const report = generateCreepReport("ehr_agent")!;
    expect(report.sessions).toBe(3);
    expect(report.usedActions).toContain("write:ehr");
    expect(report.usedActions).toContain("submit:orders");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Agent Hook Engine (blocking PreToolUse, PermissionRequest, lifecycle)
// ─────────────────────────────────────────────────────────────────────────────
import {
  onPreToolUse, onPostToolUse, onSessionStart, onStop, onPermissionRequest,
  firePreToolUse, firePostToolUse, fireSessionStart, fireStop, firePermissionRequest,
  listHooks, removeHook,
  createPermissionRequest, approvePermissionRequest, denyPermissionRequest,
  getPermissionStatus, getPendingRequests,
  registerClinicalSafetyHooks,
} from "../../server/agent/agentHookEngine";

describe("Batch50 — agentHookEngine: blocking lifecycle hooks", () => {
  it("registers and lists hooks", () => {
    const id = onPreToolUse("test-hook", 99, async () => ({ allow: true }));
    const hooks = listHooks();
    expect(hooks.some((h) => h.hookId === id)).toBe(true);
    removeHook(id);
  });

  it("removeHook removes the hook", () => {
    const id = onPreToolUse("to-remove", 99, async () => ({ allow: true }));
    removeHook(id);
    const hooks = listHooks();
    expect(hooks.some((h) => h.hookId === id)).toBe(false);
  });

  it("PreToolUse: allows tool when all handlers return allow=true", async () => {
    const id = onPreToolUse("allow-all", 99, async () => ({ allow: true }));
    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "triage_agent", toolName: "read:patient_data",
      input: { patientId: "P-001" }, context: {},
    });
    expect(result.allow).toBe(true);
    removeHook(id);
  });

  it("PreToolUse: blocks tool when any handler returns allow=false", async () => {
    const id = onPreToolUse("block-ehr", 99, async (p) => {
      if (p.toolName === "write:ehr" && p.agentRole === "triage_agent") {
        return { allow: false, reason: "triage_agent cannot write EHR" };
      }
      return { allow: true };
    });

    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "triage_agent", toolName: "write:ehr",
      input: {}, context: {},
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain("triage_agent");
    removeHook(id);
  });

  it("PreToolUse: stops at first denial (does not run subsequent hooks)", async () => {
    let secondRan = false;
    const id1 = onPreToolUse("deny-first",  10, async () => ({ allow: false, reason: "first denies" }));
    const id2 = onPreToolUse("check-ran",   20, async () => { secondRan = true; return { allow: true }; });

    await firePreToolUse({
      sessionId: "s1", agentRole: "triage_agent", toolName: "test:tool",
      input: {}, context: {},
    });
    expect(secondRan).toBe(false);
    removeHook(id1); removeHook(id2);
  });

  it("PreToolUse: hook can transform input for downstream", async () => {
    const id = onPreToolUse("add-field", 99, async () => ({
      allow: true,
      modified: { addedByHook: true },
    }));

    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "ehr_agent", toolName: "write:ehr",
      input: { note: "test" }, context: {},
    });
    expect(result.allow).toBe(true);
    expect(result.modified?.addedByHook).toBe(true);
    removeHook(id);
  });

  it("PreToolUse: hook error → fail-safe deny", async () => {
    const id = onPreToolUse("throwing-hook", 5, async () => {
      throw new Error("Hook crashed");
    });

    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "triage_agent", toolName: "any:tool",
      input: {}, context: {},
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain("threw");
    removeHook(id);
  });

  it("PostToolUse: fires non-blocking post-execution handlers", async () => {
    let postCalled = false;
    const id = onPostToolUse("post-logger", 99, async () => { postCalled = true; });

    await firePostToolUse({
      sessionId: "s1", agentRole: "ehr_agent", toolName: "write:ehr",
      input: {}, output: { ok: true }, latencyMs: 50, blocked: false,
    });
    expect(postCalled).toBe(true);
    removeHook(id);
  });

  it("SessionStart: fires session lifecycle handlers", async () => {
    let started = false;
    const id = onSessionStart("session-tracker", 99, async () => { started = true; });
    await fireSessionStart({ sessionId: "s1", agentRole: "triage_agent", context: {} });
    expect(started).toBe(true);
    removeHook(id);
  });

  it("Stop: fires stop handlers", async () => {
    let stopped = false;
    const id = onStop("session-cleanup", 99, async () => { stopped = true; });
    await fireStop({ sessionId: "s1", agentRole: "triage_agent", reason: "completed" });
    expect(stopped).toBe(true);
    removeHook(id);
  });

  it("PermissionRequest: auto-denies when no handler registered", async () => {
    const result = await firePermissionRequest({
      requestId: "pr-test", sessionId: "s1", agentRole: "ehr_agent",
      toolName: "execute:prescription", input: {},
      reason: "Physician cosign required",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(result.approved).toBe(false);
    expect(result.notes).toContain("auto-denied");
  });

  it("PermissionRequest: custom handler can approve", async () => {
    const id = onPermissionRequest("auto-approve-test", 99, async () => ({
      approved:   true,
      approvedBy: "physician-001",
    }));

    const result = await firePermissionRequest({
      requestId: "pr-test", sessionId: "s1", agentRole: "ehr_agent",
      toolName: "execute:prescription", input: {},
      reason: "Test approval",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(result.approved).toBe(true);
    expect(result.approvedBy).toBe("physician-001");
    removeHook(id);
  });

  it("createPermissionRequest + approvePermissionRequest flow", () => {
    const requestId = createPermissionRequest(
      "session-7", "ehr_agent", "execute:prescription",
      { medication: "morphine", dose: "5mg" },
      "Controlled substance requires physician approval",
      300
    );

    expect(requestId).toBeTruthy();
    const pending = getPendingRequests();
    expect(pending.some((r) => r.requestId === requestId)).toBe(true);

    const approved = approvePermissionRequest(requestId, "physician-001", "Approved after review");
    expect(approved).toBe(true);

    const status = getPermissionStatus(requestId)!;
    expect(status.status).toBe("approved");
    expect(status.result?.approvedBy).toBe("physician-001");
  });

  it("denyPermissionRequest flow", () => {
    const requestId = createPermissionRequest(
      "session-8", "ehr_agent", "execute:prescription",
      { medication: "oxycodone" },
      "Opioid requires physician sign",
      300
    );

    denyPermissionRequest(requestId, "Risk too high without full workup");
    const status = getPermissionStatus(requestId)!;
    expect(status.status).toBe("denied");
    expect(status.result?.approved).toBe(false);
  });

  it("registerClinicalSafetyHooks installs hard-blocked tool guard", async () => {
    registerClinicalSafetyHooks();

    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "any_agent",
      toolName: "delete:patient_data",    // hard-blocked
      input: {}, context: {},
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain("hard-blocked");
  });

  it("clinical safety hook blocks pediatric patient for adult-scoped triage_agent", async () => {
    // Safety hooks already registered from previous test
    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "triage_agent",
      toolName: "execute:triage_decision",
      input: { patientAge: 12 },   // pediatric
      context: {},
    });
    expect(result.allow).toBe(false);
    expect(result.reason).toContain("pediatric");
  });

  it("clinical safety hook passes adult patient for triage_agent", async () => {
    const result = await firePreToolUse({
      sessionId: "s1", agentRole: "triage_agent",
      toolName: "execute:triage_decision",
      input: { patientAge: 45 },   // adult
      context: {},
    });
    expect(result.allow).toBe(true);
  });
});

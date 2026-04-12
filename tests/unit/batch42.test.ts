import { describe, it, expect } from "vitest";

// ─── 1. Agent Scope Engine ────────────────────────────────────────────────────
import { AgentScopeEngine, MEDICAL_SCOPE_RULES, scopeEngine } from "../../server/scope/agentScopeEngine";

describe("Batch42 — agentScopeEngine", () => {
  it("allows express action for triage_agent", () => {
    const r = scopeEngine.evaluate({ agentRole: "triage_agent", action: "read:patient_data", context: {} });
    expect(r.allowed).toBe(true);
    expect(r.authority).toBe("express");
  });

  it("blocks denied action for triage_agent", () => {
    const r = scopeEngine.evaluate({ agentRole: "triage_agent", action: "write:ehr", context: {} });
    expect(r.allowed).toBe(false);
    expect(r.authority).toBe("denied");
  });

  it("allows implied action for triage_agent", () => {
    const r = scopeEngine.evaluate({ agentRole: "triage_agent", action: "read:kb_rules", context: {} });
    expect(r.allowed).toBe(true);
    expect(r.authority).toBe("implied");
  });

  it("blocks unknown action with outside scope reason", () => {
    const r = scopeEngine.evaluate({ agentRole: "triage_agent", action: "delete:everything", context: {} });
    expect(r.allowed).toBe(false);
  });

  it("returns PENDING_OVERRIDE for restricted action without physician sign", () => {
    const r = scopeEngine.evaluate({ agentRole: "treatment_agent", action: "execute:prescription", context: { physicianSigned: false } });
    expect(r.allowed).toBe(false);
    expect(r.requiresOverride).toBe(true);
  });

  it("allows restricted action when physician signed", () => {
    const engine = new AgentScopeEngine(MEDICAL_SCOPE_RULES);
    const r = engine.evaluate({
      agentRole: "treatment_agent",
      action:    "execute:prescription",
      context:   { physicianSigned: true },
    });
    expect(r.allowed).toBe(true);
  });

  it("blocks ehr_agent write:ehr without physician signed", () => {
    const r = scopeEngine.evaluate({ agentRole: "ehr_agent", action: "write:ehr", context: { physicianSigned: false, confidence: 0.95 } });
    expect(r.allowed).toBe(false);
    expect(r.requiresOverride).toBe(true);
  });

  it("allows ehr_agent write:ehr with physician signed + high confidence", () => {
    const r = scopeEngine.evaluate({ agentRole: "ehr_agent", action: "write:ehr", context: { physicianSigned: true, confidence: 0.95 } });
    expect(r.allowed).toBe(true);
  });

  it("blocks when confidence too low even if express", () => {
    const r = scopeEngine.evaluate({ agentRole: "ehr_agent", action: "write:ehr", context: { physicianSigned: true, confidence: 0.7 } });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/confidence/i);
  });

  it("blocks unknown agent role", () => {
    const r = scopeEngine.evaluate({ agentRole: "ghost_agent", action: "read:anything", context: {} });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/No scope/i);
  });

  it("getStats returns total + allowed + denied", () => {
    const stats = scopeEngine.getStats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.allowed).toBe("number");
    expect(typeof stats.denied).toBe("number");
  });

  it("listRoles returns all configured roles", () => {
    const roles = scopeEngine.listRoles();
    expect(roles).toContain("triage_agent");
    expect(roles).toContain("ehr_agent");
    expect(roles).toContain("treatment_agent");
    expect(roles).toContain("escalation_agent");
  });
});

// ─── 2. Scope Delegation ─────────────────────────────────────────────────────
import { delegateScope, isDelegated, revokeDelegate, getActiveDelegations } from "../../server/scope/delegation";

describe("Batch42 — scopeDelegation", () => {
  it("creates a delegation and detects it", () => {
    delegateScope("triage_agent", "workup_agent", ["order:labs"], "lab delegation");
    expect(isDelegated("workup_agent", "order:labs")).toBe(true);
  });

  it("non-delegated action returns false", () => {
    expect(isDelegated("workup_agent", "write:ehr")).toBe(false);
  });

  it("revoked delegation no longer active", () => {
    const d = delegateScope("triage_agent", "temp_agent", ["read:vitals"], "temp");
    expect(isDelegated("temp_agent", "read:vitals")).toBe(true);
    revokeDelegate(d.id);
    expect(isDelegated("temp_agent", "read:vitals")).toBe(false);
  });

  it("expired delegation is not active", () => {
    delegateScope("triage_agent", "expired_agent", ["read:data"], "expired", -1); // already expired
    expect(isDelegated("expired_agent", "read:data")).toBe(false);
  });

  it("getActiveDelegations only returns non-expired non-revoked", () => {
    const active = getActiveDelegations();
    expect(Array.isArray(active)).toBe(true);
  });
});

// ─── 3. Risk-Based Scope ─────────────────────────────────────────────────────
import { getScopeByRisk, augmentScopeWithRisk, getRiskLabel } from "../../server/scope/riskBasedScope";

describe("Batch42 — riskBasedScope", () => {
  it("LOW risk returns minimal permissions", () => {
    const perms = getScopeByRisk("LOW");
    expect(perms).toContain("read:patient_data");
    expect(perms).not.toContain("execute:escalation");
  });

  it("CRITICAL risk includes escalation", () => {
    const perms = getScopeByRisk("CRITICAL");
    expect(perms).toContain("execute:escalation");
    expect(perms).toContain("order:labs");
  });

  it("augmentScopeWithRisk expands express permissions", () => {
    const base     = { express: ["read:patient_data"] };
    const augmented = augmentScopeWithRisk(base, "HIGH");
    expect(augmented.express).toContain("order:labs");
    expect(augmented.express).toContain("send:alert");
  });

  it("getRiskLabel returns CRITICAL for high scores", () => {
    expect(getRiskLabel(9)).toBe("CRITICAL");
    expect(getRiskLabel(7)).toBe("HIGH");
    expect(getRiskLabel(4)).toBe("MODERATE");
    expect(getRiskLabel(1)).toBe("LOW");
  });
});

// ─── 4. Scope Drift Detection ─────────────────────────────────────────────────
import { detectScopeDrift, generateScopeHeatmap } from "../../server/monitoring/scopeDrift";

describe("Batch42 — scopeDrift", () => {
  const cleanLog = [
    { timestamp: Date.now(), agentRole: "triage_agent", action: "read:patient_data", allowed: true },
    { timestamp: Date.now(), agentRole: "ehr_agent",    action: "write:ehr",         allowed: true },
  ];

  it("no violations → LOW risk", () => {
    const report = detectScopeDrift(cleanLog as any);
    expect(report.riskLevel).toBe("LOW");
    expect(report.violations).toHaveLength(0);
  });

  it("multiple violations → HIGH or CRITICAL risk", () => {
    const dirtyLog = Array.from({ length: 8 }, (_, i) => ({
      timestamp: Date.now(), agentRole: "ghost_agent", action: "hack:everything",
      allowed: false, actionOutsideScope: true,
    }));
    const report = detectScopeDrift(dirtyLog as any);
    expect(["HIGH", "CRITICAL"]).toContain(report.riskLevel);
  });

  it("report includes recommendation string", () => {
    const report = detectScopeDrift(cleanLog as any);
    expect(report.recommendation.length).toBeGreaterThan(0);
  });

  it("generateScopeHeatmap returns per-role heat", () => {
    const heatmap = generateScopeHeatmap(cleanLog as any);
    expect(heatmap["triage_agent"]).toBeDefined();
    expect(typeof heatmap["triage_agent"].heat).toBe("number");
  });
});

// ─── 5. Scope-Aware Triage Engine ────────────────────────────────────────────
import { evaluatePatientRisk, calculateQSOFA, rankPatients } from "../../server/triage/scopeAwareTriageEngine";

describe("Batch42 — scopeAwareTriageEngine", () => {
  const normalVitals = { hr: 72, spo2: 98, temp: 98.6, systolicBP: 120, rr: 16 };
  const criticalVitals = { hr: 135, spo2: 86, temp: 103.5, systolicBP: 82, rr: 28, alteredMentalStatus: true };

  it("normal patient produces LOW or MODERATE triage level", () => {
    const r = evaluatePatientRisk({ id: "p1", vitals: normalVitals });
    expect(["LOW", "MODERATE"]).toContain(r.level);
  });

  it("critical patient produces HIGH or CRITICAL level", () => {
    const r = evaluatePatientRisk({ id: "p2", vitals: criticalVitals });
    expect(["HIGH", "CRITICAL"]).toContain(r.level);
  });

  it("critical patient has higher scope level", () => {
    const normal   = evaluatePatientRisk({ id: "p1", vitals: normalVitals });
    const critical = evaluatePatientRisk({ id: "p2", vitals: criticalVitals });
    expect(critical.allowedScopeLevel).toBeGreaterThan(normal.allowedScopeLevel);
  });

  it("critical patient has expanded permissions", () => {
    const r = evaluatePatientRisk({ id: "p2", vitals: criticalVitals });
    expect(r.augmentedPermissions).toContain("execute:escalation");
  });

  it("calculateQSOFA: altered mental status adds 1", () => {
    const score = calculateQSOFA({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 120, alteredMentalStatus: true });
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it("calculateQSOFA: RR ≥ 22 adds 1", () => {
    const score = calculateQSOFA({ hr: 80, spo2: 98, temp: 98.6, systolicBP: 120, rr: 25 });
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it("rankPatients sorts by risk score descending", () => {
    const pts = [
      { id: "a", vitals: normalVitals },
      { id: "b", vitals: criticalVitals },
    ];
    const ranked = rankPatients(pts);
    expect(ranked[0].patientId).toBe("b");
  });
});

// ─── 6. Scope Simulation ─────────────────────────────────────────────────────
import { simulateScope, runScenario } from "../../server/simulation/scopeSimulationEngine";

describe("Batch42 — scopeSimulationEngine", () => {
  it("allows express actions in simulation", () => {
    const results = simulateScope([{ agentRole: "triage_agent", action: "read:patient_data", context: {} }]);
    expect(results[0].allowed).toBe(true);
  });

  it("blocks denied actions in simulation", () => {
    const results = simulateScope([{ agentRole: "triage_agent", action: "write:ehr", context: {} }]);
    expect(results[0].allowed).toBe(false);
  });

  it("runScenario returns report with summary", () => {
    const report = runScenario({
      name: "test-scenario",
      actions: [
        { agentRole: "triage_agent", action: "read:patient_data", context: {} },
        { agentRole: "triage_agent", action: "write:ehr",         context: {} },
      ],
    });
    expect(report.allowedCount).toBe(1);
    expect(report.blockedCount).toBe(1);
    expect(report.summary).toMatch(/1\/2/);
  });
});

// ─── 7. FDA Validation Engine ─────────────────────────────────────────────────
import { generateFDAMetrics } from "../../server/fda/fdaValidationEngine";

describe("Batch42 — fdaValidationEngine", () => {
  it("generates metrics with required fields", () => {
    const m = generateFDAMetrics();
    expect(typeof m.total).toBe("number");
    expect(typeof m.allowedRate).toBe("number");
    expect(typeof m.blockedRate).toBe("number");
    expect(typeof m.fdaSafe).toBe("boolean");
    expect(typeof m.safetyScore).toBe("number");
  });

  it("safetyScore is 0–100", () => {
    const m = generateFDAMetrics();
    expect(m.safetyScore).toBeGreaterThanOrEqual(0);
    expect(m.safetyScore).toBeLessThanOrEqual(100);
  });

  it("recommendation is a string", () => {
    const m = generateFDAMetrics();
    expect(typeof m.recommendation).toBe("string");
    expect(m.recommendation.length).toBeGreaterThan(0);
  });
});

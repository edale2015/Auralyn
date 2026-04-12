import { describe, it, expect, vi } from "vitest";

// ─── 1. System Context Engine ─────────────────────────────────────────────────
import { scanProject } from "../../server/agents/systemContextEngine";

describe("Batch34 — systemContextEngine", () => {
  it("scanProject returns a ContextResult with file list", () => {
    const r = scanProject();
    expect(r.totalFiles).toBeGreaterThan(0);
    expect(Array.isArray(r.files)).toBe(true);
    expect(r.scannedAt).toBeTruthy();
  });

  it("stats contains agentFiles > 0", () => {
    const r = scanProject();
    expect(r.stats.agentFiles).toBeGreaterThan(0);
  });

  it("dependencies is a Record with at least one entry", () => {
    const r = scanProject();
    expect(typeof r.dependencies).toBe("object");
    expect(Object.keys(r.dependencies).length).toBeGreaterThan(0);
  });

  it("unusedFiles is an array (may be empty)", () => {
    const r = scanProject();
    expect(Array.isArray(r.unusedFiles)).toBe(true);
  });

  it("stats has all expected keys", () => {
    const r = scanProject();
    expect(typeof r.stats.routeFiles).toBe("number");
    expect(typeof r.stats.serviceFiles).toBe("number");
    expect(typeof r.stats.testFiles).toBe("number");
  });
});

// ─── 2. Sequential Clinical Reasoner ─────────────────────────────────────────
import { SequentialClinicalReasoner } from "../../server/agents/sequentialClinicalReasoner";

const reasoner = new SequentialClinicalReasoner();

describe("Batch34 — sequentialClinicalReasoner", () => {
  it("returns a ReasoningResult with steps array", async () => {
    const r = await reasoner.run({ symptoms: ["cough", "fever"], vitals: { hr: 85, spo2: 97 } });
    expect(Array.isArray(r.reasoning)).toBe(true);
    expect(r.reasoning.length).toBeGreaterThanOrEqual(3);
  });

  it("redFlags=true → ED short-circuit, fewer steps", async () => {
    const r = await reasoner.run({ symptoms: ["chest pain"], redFlags: true });
    expect(r.disposition).toBe("ED");
    const override = r.reasoning.find((s) => s.step.includes("RED FLAG"));
    expect(override).toBeTruthy();
  });

  it("redFlags=[] → no short circuit, full reasoning", async () => {
    const r = await reasoner.run({ symptoms: ["sore throat"], redFlags: [] });
    expect(r.disposition).not.toBe(undefined);
    expect(r.reasoning.length).toBeGreaterThanOrEqual(4);
  });

  it("totalMs is a non-negative number", async () => {
    const r = await reasoner.run({ symptoms: ["headache"] });
    expect(r.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("each step has step, status, durationMs", async () => {
    const r = await reasoner.run({ symptoms: ["fever"] });
    for (const step of r.reasoning) {
      expect(typeof step.step).toBe("string");
      expect(["ok","override","skipped"]).toContain(step.status);
      expect(typeof step.durationMs).toBe("number");
    }
  });

  it("elevated-risk modifier applied for age > 65", async () => {
    const r = await reasoner.run({ symptoms: ["dyspnea"], age: 70 });
    const modStep = r.reasoning.find((s) => s.step === "Apply Modifiers");
    expect((modStep?.data as any)?.riskProfile).toBe("elevated");
  });

  it("standard risk for age <= 65", async () => {
    const r = await reasoner.run({ symptoms: ["cough"], age: 40 });
    const modStep = r.reasoning.find((s) => s.step === "Apply Modifiers");
    expect((modStep?.data as any)?.riskProfile).toBe("standard");
  });
});

// ─── 3. Evidence Engine ───────────────────────────────────────────────────────
import { EvidenceEngine } from "../../server/agents/evidenceEngine";

const evidence = new EvidenceEngine();

describe("Batch34 — evidenceEngine", () => {
  it("searchGuidelines returns 2 results (PubMed + ClinicalTrials)", async () => {
    const results = await evidence.searchGuidelines("chest pain");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.source)).toContain("PubMed");
    expect(results.map((r) => r.source)).toContain("ClinicalTrials");
  }, 15000);

  it("each result has source, query, fetchedAt, items", async () => {
    const results = await evidence.searchGuidelines("sepsis");
    for (const r of results) {
      expect(r.source).toBeTruthy();
      expect(r.query).toBe("sepsis");
      expect(r.fetchedAt).toBeTruthy();
      expect(Array.isArray(r.items)).toBe(true);
    }
  }, 15000);

  it("searchPubMed returns PubMed source", async () => {
    const r = await evidence.searchPubMed("myocardial infarction", 2);
    expect(r.source).toBe("PubMed");
    expect(Array.isArray(r.items)).toBe(true);
  }, 15000);

  it("searchClinicalTrials returns ClinicalTrials source", async () => {
    const r = await evidence.searchClinicalTrials("COVID-19", 2);
    expect(r.source).toBe("ClinicalTrials");
    expect(Array.isArray(r.items)).toBe(true);
  }, 15000);

  it("handles network failure gracefully (error field set)", async () => {
    // Force a failure by passing a very short timeout via a separate instance
    const e = new EvidenceEngine();
    // Mock fetch to fail
    vi.stubGlobal("fetch", () => { throw new Error("Network unavailable"); });
    const r = await e.searchPubMed("test");
    expect(r.error).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

// ─── 4. EHR Automation Agent ──────────────────────────────────────────────────
import { EHRAutomationAgent } from "../../server/agents/ehrAutomationAgent";

const ehr = new EHRAutomationAgent();

describe("Batch34 — ehrAutomationAgent", () => {
  it("loginAthena returns a session object", async () => {
    const s = await ehr.loginAthena("demo", "demo");
    expect(s.sessionId).toBeTruthy();
    expect(s.system).toBe("athena");
    expect(["connected","error","stub"]).toContain(s.status);
  });

  it("loginEpic returns an epic session", async () => {
    const s = await ehr.loginEpic("demo", "demo");
    expect(s.system).toBe("epic");
  });

  it("enterClinicalNote returns NoteResult with noteId", async () => {
    const r = await ehr.enterClinicalNote("Patient presents with fever and cough.", "athena");
    expect(r.noteId).toBeTruthy();
    expect(r.success).toBe(true);
  });

  it("getConfiguredSystems returns an array", () => {
    const s = ehr.getConfiguredSystems();
    expect(Array.isArray(s)).toBe(true);
    expect(s.length).toBeGreaterThan(0);
  });

  it("pushDiagnosis returns success", async () => {
    const r = await ehr.pushDiagnosis("patient-123", "Viral URI", "athena");
    expect(r.success).toBe(true);
  });
});

// ─── 5. Deployment Debugger ───────────────────────────────────────────────────
import { DeploymentDebugger } from "../../server/agents/deploymentDebugger";

const dbg = new DeploymentDebugger();

describe("Batch34 — deploymentDebugger", () => {
  it("analyzeFailure finds ECONNREFUSED pattern", () => {
    const r = dbg.analyzeFailure("Error: ECONNREFUSED 127.0.0.1:5432");
    expect(r.some((d) => d.issue.includes("connection refused"))).toBe(true);
  });

  it("analyzeFailure finds timeout pattern", () => {
    const r = dbg.analyzeFailure("Request timeout after 30s");
    expect(r.some((d) => d.severity === "warning" && d.issue.toLowerCase().includes("timeout"))).toBe(true);
  });

  it("analyzeFailure returns info for unknown log", () => {
    const r = dbg.analyzeFailure("Some totally unknown log line");
    expect(r[0].severity).toBe("info");
  });

  it("summarizeLogs counts error/warn/info lines", () => {
    const logs = "ERROR something\nWARN another\nINFO ok\nERROR bad";
    const s    = dbg.summarizeLogs(logs);
    expect(s.errorCount).toBe(2);
    expect(s.warnCount).toBe(1);
  });

  it("getServiceHealth returns an object with status keys", async () => {
    const h = await dbg.getServiceHealth();
    expect(typeof h).toBe("object");
    expect(h.openai?.status).toBeTruthy();
    expect(h.fhir?.status).toBeTruthy();
  });
});

// ─── 6. Plugin Registry ───────────────────────────────────────────────────────
import { listPlugins, getPlugin, togglePlugin, recordPluginCall } from "../../server/agents/pluginRegistry";

describe("Batch34 — pluginRegistry", () => {
  it("listPlugins returns array with >= 8 plugins", () => {
    const p = listPlugins();
    expect(p.length).toBeGreaterThanOrEqual(8);
  });

  it("each plugin has name, status, latencyMs, callCount", () => {
    for (const p of listPlugins()) {
      expect(p.name).toBeTruthy();
      expect(["healthy","degraded","disabled"]).toContain(p.status);
      expect(typeof p.latencyMs).toBe("number");
      expect(typeof p.callCount).toBe("number");
    }
  });

  it("getPlugin returns plugin by name", () => {
    const p = getPlugin("diagnosis");
    expect(p?.name).toBe("diagnosis");
  });

  it("getPlugin returns undefined for unknown", () => {
    expect(getPlugin("nonexistent")).toBeUndefined();
  });

  it("togglePlugin changes status", () => {
    const ok = togglePlugin("orders", "disabled");
    expect(ok).toBe(true);
    expect(getPlugin("orders")?.status).toBe("disabled");
    togglePlugin("orders", "healthy"); // restore
  });

  it("togglePlugin returns false for unknown plugin", () => {
    expect(togglePlugin("ghost", "healthy")).toBe(false);
  });

  it("recordPluginCall increments callCount", () => {
    const before = getPlugin("diagnosis")!.callCount;
    recordPluginCall("diagnosis");
    expect(getPlugin("diagnosis")!.callCount).toBe(before + 1);
  });

  it("recordPluginCall updates lastCalled", () => {
    recordPluginCall("billing");
    expect(getPlugin("billing")!.lastCalled).toBeTruthy();
  });
});

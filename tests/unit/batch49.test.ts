import { describe, it, expect, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sub-Workflow Engine (n8n sub-workflow + error routing)
// ─────────────────────────────────────────────────────────────────────────────
import { registerStep, clearSteps } from "../../server/workflows/registry";
import {
  runComposedWorkflow, registerSubWorkflowAsStep, summarizeRun,
  type ComposedWorkflowDef, type WorkflowStep,
} from "../../server/workflows/subWorkflowEngine";

describe("Batch49 — subWorkflowEngine: composition", () => {
  beforeEach(() => clearSteps());

  it("runs a simple composed workflow with regular steps", async () => {
    registerStep("vitals.check",   async (ctx) => ({ ...ctx, vitalsOk: true, hr: ctx.hr ?? 80 }));
    registerStep("risk.score",     async (ctx) => ({ ...ctx, heartScore: 2, riskTier: "low" }));
    registerStep("disposition.set",async (ctx) => ({ ...ctx, disposition: ctx.heartScore <= 3 ? "discharge" : "observe" }));

    const def: ComposedWorkflowDef = {
      id: "triage", name: "Triage Master",
      steps: [
        { id: "s1", type: "step", name: "vitals.check" },
        { id: "s2", type: "step", name: "risk.score" },
        { id: "s3", type: "step", name: "disposition.set" },
      ],
    };
    const result = await runComposedWorkflow(def, { patientId: "P-test", hr: 90 });
    expect(result.success).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.finalOutput.vitalsOk).toBe(true);
    expect(result.finalOutput.disposition).toBe("discharge");
    expect(result.stepResults).toHaveLength(3);
  });

  it("runs a sub-workflow embedded inside a parent workflow", async () => {
    registerStep("labs.draw", async (ctx) => ({ ...ctx, labsDrawn: true }));

    const def: ComposedWorkflowDef = {
      id: "full", name: "Full Encounter",
      steps: [
        {
          id: "s1", type: "sub", name: "vitals-sub",
          subWorkflow: {
            name: "vitals-triage",
            steps: [
              { id: "ss1", type: "step", name: "labs.draw" },
            ],
          },
        },
      ],
    };
    const result = await runComposedWorkflow(def, { patientId: "P-test" });
    expect(result.success).toBe(true);
    expect(result.finalOutput.labsDrawn).toBe(true);
    expect(result.stepResults[0].type).toBe("sub");
    expect(result.stepResults[0].subResults).toHaveLength(1);
  });

  it("skips a step when condition is not met", async () => {
    registerStep("sepsis.screen", async (ctx) => ({ ...ctx, sepsisScreened: true }));

    const def: ComposedWorkflowDef = {
      id: "cond", name: "Conditional Workflow",
      steps: [
        {
          id: "s1", type: "step", name: "sepsis.screen",
          condition: { field: "fever", operator: "truthy" },
        },
      ],
    };
    const result = await runComposedWorkflow(def, { patientId: "P-test", fever: false });
    expect(result.success).toBe(true);
    expect(result.skippedCount).toBe(1);
    expect(result.finalOutput.sepsisScreened).toBeUndefined();
    expect(result.stepResults[0].skipped).toBe(true);
    expect(result.stepResults[0].skipReason).toContain("fever");
  });

  it("runs a step when condition IS met", async () => {
    registerStep("sepsis.screen", async (ctx) => ({ ...ctx, sepsisScreened: true }));

    const def: ComposedWorkflowDef = {
      id: "cond2", name: "Conditional Met",
      steps: [
        {
          id: "s1", type: "step", name: "sepsis.screen",
          condition: { field: "fever", operator: "truthy" },
        },
      ],
    };
    const result = await runComposedWorkflow(def, { patientId: "P-test", fever: true });
    expect(result.skippedCount).toBe(0);
    expect(result.finalOutput.sepsisScreened).toBe(true);
  });

  it("routes to error handler step instead of crashing", async () => {
    let handlerCalled = false;
    registerStep("failing.step",   async () => { throw new Error("Tool offline"); });
    registerStep("fallback.notify",async (ctx) => { handlerCalled = true; return { ...ctx, notified: true }; });

    const def: ComposedWorkflowDef = {
      id: "err", name: "Error Routing",
      steps: [
        { id: "s1", type: "step", name: "failing.step", errorHandler: "fallback.notify" },
      ],
    };
    const result = await runComposedWorkflow(def, { patientId: "P-test" });
    expect(result.success).toBe(true);      // error was handled, not a crash
    expect(result.errorCount).toBe(0);      // handler recovered it
    expect(handlerCalled).toBe(true);
    expect(result.finalOutput.notified).toBe(true);
  });

  it("marks step failed and continues when no error handler", async () => {
    registerStep("step.a", async (ctx) => ({ ...ctx, stepA: true }));
    registerStep("step.b", async () => { throw new Error("B failed"); });
    registerStep("step.c", async (ctx) => ({ ...ctx, stepC: true }));

    const def: ComposedWorkflowDef = {
      id: "mixed", name: "Mixed",
      steps: [
        { id: "s1", type: "step", name: "step.a" },
        { id: "s2", type: "step", name: "step.b" },  // no errorHandler
        { id: "s3", type: "step", name: "step.c" },
      ],
    };
    const result = await runComposedWorkflow(def, {});
    expect(result.success).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.stepResults.find((s) => s.stepName === "step.b")?.success).toBe(false);
    expect(result.stepResults.find((s) => s.stepName === "step.c")?.success).toBe(true);
  });

  it("retries a step on transient failure", async () => {
    let attempts = 0;
    registerStep("flaky.step", async (ctx) => {
      attempts++;
      if (attempts < 2) throw new Error("Transient");
      return { ...ctx, succeeded: true };
    });

    const def: ComposedWorkflowDef = {
      id: "retry", name: "Retry",
      steps: [{ id: "s1", type: "step", name: "flaky.step", retries: 2 }],
    };
    const result = await runComposedWorkflow(def, {});
    expect(result.success).toBe(true);
    expect(attempts).toBeGreaterThan(1);
    expect(result.stepResults[0].retryCount).toBeGreaterThan(0);
    expect(result.finalOutput.succeeded).toBe(true);
  });

  it("summarizeRun produces readable output", async () => {
    registerStep("vitals.check", async (ctx) => ({ ...ctx, ok: true }));
    const def: ComposedWorkflowDef = {
      id: "summ", name: "Summary Test",
      steps: [{ id: "s1", type: "step", name: "vitals.check" }],
    };
    const result = await runComposedWorkflow(def, {});
    const summary = summarizeRun(result);
    expect(summary).toContain("Summary Test");
    expect(summary).toContain("✓");
    expect(summary).toContain("vitals.check");
  });

  it("registerSubWorkflowAsStep makes sub callable as named step", async () => {
    registerStep("inner.a", async (ctx) => ({ ...ctx, innerA: true }));
    registerStep("inner.b", async (ctx) => ({ ...ctx, innerB: true }));

    registerSubWorkflowAsStep({
      name: "my-sub-workflow",
      steps: [
        { id: "ss1", type: "step", name: "inner.a" },
        { id: "ss2", type: "step", name: "inner.b" },
      ],
    });

    const def: ComposedWorkflowDef = {
      id: "uses-sub", name: "Uses Sub",
      steps: [{ id: "s1", type: "step", name: "my-sub-workflow" }],
    };
    const result = await runComposedWorkflow(def, {});
    expect(result.success).toBe(true);
    expect(result.finalOutput.innerA).toBe(true);
    expect(result.finalOutput.innerB).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Execution Inspector (LangSmith equivalent)
// ─────────────────────────────────────────────────────────────────────────────
import {
  startRun, startNode, completeNode, failNode, skipNode, completeRun, failRun,
  getRun, getNode, listRuns, compareRuns, getReplayDescriptor, formatRunSummary,
} from "../../server/observability/executionInspector";

describe("Batch49 — executionInspector: run lifecycle", () => {
  it("starts and completes a run", () => {
    const runId = startRun("triage_workflow", ["chest_pain"], "P-001");
    const run   = getRun(runId);
    expect(run).not.toBeNull();
    expect(run!.chainName).toBe("triage_workflow");
    expect(run!.patientId).toBe("P-001");
    expect(run!.status).toBe("running");

    completeRun(runId, { disposition: "discharge" });
    const completed = getRun(runId)!;
    expect(completed.status).toBe("success");
    expect(completed.totalMs).toBeGreaterThanOrEqual(0);
    expect(completed.finalOutput).toMatchObject({ disposition: "discharge" });
  });

  it("records node input/output/latency", () => {
    const runId  = startRun("chain", [], "P-002");
    const nodeId = startNode(runId, "vitals_check", "tool", { hr: 90, spo2: 98 }, "gpt-4");
    completeNode(runId, nodeId, { abnormal: false }, 120, 0.95);

    const node = getNode(runId, nodeId)!;
    expect(node.status).toBe("success");
    expect(node.input).toMatchObject({ hr: 90 });
    expect(node.output).toMatchObject({ abnormal: false });
    expect(node.model).toBe("gpt-4");
    expect(node.tokenEstimate).toBe(120);
    expect(node.evaluationScore).toBe(0.95);
    expect(node.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("records node failure with error", () => {
    const runId  = startRun("chain", [], "P-003");
    const nodeId = startNode(runId, "diagnosis", "llm", { complaint: "chest pain" });
    failNode(runId, nodeId, "LLM timeout after 30s");

    const node = getNode(runId, nodeId)!;
    expect(node.status).toBe("error");
    expect(node.error).toContain("timeout");
  });

  it("records skipped node", () => {
    const runId  = startRun("chain", [], "P-004");
    const nodeId = startNode(runId, "sepsis_screen", "condition", {});
    skipNode(runId, nodeId, "Condition: fever not present");

    const node = getNode(runId, nodeId)!;
    expect(node.status).toBe("skipped");
    expect(node.metadata?.skipReason).toContain("fever");
  });

  it("lists runs with filter by chainName", () => {
    const id1 = startRun("triage_workflow", [], "P-100");
    const id2 = startRun("sepsis_crew",    [], "P-101");
    completeRun(id1); completeRun(id2);

    const triageRuns = listRuns({ chainName: "triage_workflow", limit: 10 });
    expect(triageRuns.some((r) => r.runId === id1)).toBe(true);
    expect(triageRuns.every((r) => r.chainName === "triage_workflow")).toBe(true);
  });

  it("lists runs with filter by status", () => {
    const id = startRun("chain", []);
    failRun(id, "test failure");

    const failed = listRuns({ status: "failed", limit: 5 });
    expect(failed.some((r) => r.runId === id)).toBe(true);
  });

  it("compares two runs and shows deltas", () => {
    const idA = startRun("chain", []);
    const nA1 = startNode(idA, "step1", "tool", { x: 1 });
    completeNode(idA, nA1, { y: 2 });
    completeRun(idA, { result: "A" });

    const idB = startRun("chain", []);
    const nB1 = startNode(idB, "step1", "tool", { x: 1 });
    completeNode(idB, nB1, { y: 3 });    // different output
    completeRun(idB, { result: "B" });

    const comparison = compareRuns(idA, idB)!;
    expect(comparison).not.toBeNull();
    expect(comparison.outputMatch).toBe(false);
    expect(comparison.nodeDeltas).toHaveLength(1);
    expect(comparison.nodeDeltas[0].nodeName).toBe("step1");
    expect(comparison.nodeDeltas[0].outputMatch).toBe(false);
  });

  it("getReplayDescriptor returns first input and all node inputs", () => {
    const runId  = startRun("chain", []);
    const nodeId = startNode(runId, "intake", "step", { patientId: "P-005", complaint: "chest pain" });
    completeNode(runId, nodeId, { normalized: true });
    completeRun(runId);

    const descriptor = getReplayDescriptor(runId)!;
    expect(descriptor.chainName).toBe("chain");
    expect(descriptor.firstInput).toMatchObject({ patientId: "P-005" });
    expect(descriptor.nodeInputs).toHaveLength(1);
    expect(descriptor.nodeInputs[0].nodeName).toBe("intake");
  });

  it("formatRunSummary produces readable structured output", () => {
    const runId  = startRun("triage_workflow", ["test"]);
    const nodeId = startNode(runId, "vitals_check", "tool", { hr: 90 }, "gpt-4o-mini");
    completeNode(runId, nodeId, { abnormal: false }, 80, 0.92);
    completeRun(runId, { disposition: "discharge" });

    const summary = formatRunSummary(getRun(runId)!);
    expect(summary).toContain("triage_workflow");
    expect(summary).toContain("vitals_check");
    expect(summary).toContain("92%");   // evaluation score
    expect(summary).toContain("✓");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Agent Conversation Loop (AutoGen equivalent)
// ─────────────────────────────────────────────────────────────────────────────
import {
  runAgentConversation, makeClinicalProposer, makeClinicalSkeptic,
} from "../../server/workflows/agentConversation";

describe("Batch49 — agentConversation: convergence", () => {
  it("converges when proposer and skeptic agree (no concerns)", async () => {
    const proposer = makeClinicalProposer({
      name: "DiagnosticAgent",
      hypotheses: [{ condition: "chest pain", hypothesis: "Low-risk ACS — HEART score 2", confidence: 0.85 }],
    });
    const skeptic = makeClinicalSkeptic({
      name: "SkepticAgent",
      flags: [],   // no concerns → immediate agreement
    });

    const result = await runAgentConversation({
      agents:  [proposer, skeptic],
      context: { chiefComplaint: "chest pain", heartScore: 2 },
      maxRounds: 3,
    });

    expect(result.outcome).toBe("converged");
    expect(result.consensus).toBeTruthy();
    expect(result.rounds).toBeGreaterThanOrEqual(1);
  });

  it("skeptic challenges proposer, proposer revises, convergence achieved", async () => {
    const proposer = makeClinicalProposer({
      name: "DiagnosticAgent",
      hypotheses: [{ condition: "chest pain", hypothesis: "Discharge — low risk", confidence: 0.8 }],
    });
    const skeptic = makeClinicalSkeptic({
      name: "SkepticAgent",
      flags: [{ field: "troponin", operator: "missing", concern: "Troponin not yet resulted" }],
    });

    const result = await runAgentConversation({
      agents:  [proposer, skeptic],
      context: { chiefComplaint: "chest pain" },  // troponin missing
      maxRounds: 4,
    });

    expect(["converged", "max_rounds"]).toContain(result.outcome);
    expect(result.turns.length).toBeGreaterThan(2);
    // After challenge, proposer must have switched to "agree" with revision
    const proposerRevision = result.turns.find(
      (t) => t.response.agentName === "DiagnosticAgent" && t.response.revision
    );
    expect(proposerRevision).toBeDefined();
  });

  it("escalates when too many critical concerns", async () => {
    const proposer = makeClinicalProposer({
      name: "DiagnosticAgent",
      hypotheses: [{ condition: "chest pain", hypothesis: "Low risk", confidence: 0.7 }],
    });
    const skeptic = makeClinicalSkeptic({
      name: "SkepticAgent",
      flags: [
        { field: "troponin",    operator: "missing", concern: "Troponin not resulted" },
        { field: "ecg",         operator: "missing", concern: "ECG not performed" },
        { field: "stElevation", operator: "present", concern: "ST elevation present" },
      ],
    });

    const result = await runAgentConversation({
      agents:  [proposer, skeptic],
      context: { chiefComplaint: "chest pain", stElevation: true },
      maxRounds: 3,
    });

    expect(result.outcome).toBe("escalated");
    expect(result.escalationReason).toBeTruthy();
  });

  it("reaches max rounds without convergence", async () => {
    const proposer = makeClinicalProposer({
      name: "DiagnosticAgent",
      hypotheses: [{ condition: "mystery", hypothesis: "Discharge", confidence: 0.9 }],
    });

    // Custom skeptic that always challenges
    const stubbornSkeptic = {
      id: "stubborn", name: "StubbornAgent", role: "skeptic" as const,
      async respond() {
        return {
          agentId: "stubborn", agentName: "StubbornAgent", role: "skeptic" as const,
          position: "Still not convinced", stance: "challenge" as const, confidence: 0.5,
          reasoning: "Always challenge",
        };
      },
    };

    const result = await runAgentConversation({
      agents:    [proposer, stubbornSkeptic],
      context:   { chiefComplaint: "mystery" },
      maxRounds: 2,
      minAgreeFor: 2,
    });

    expect(result.outcome).toBe("max_rounds");
    expect(result.rounds).toBe(2);
    expect(result.consensus).toBeNull();
    expect(result.dissent.length).toBeGreaterThan(0);
  });

  it("conversation summary describes outcome clearly", async () => {
    const proposer = makeClinicalProposer({
      name: "DiagnosticAgent",
      hypotheses: [{ condition: "sepsis", hypothesis: "Sepsis — Hour-1 bundle", confidence: 0.9 }],
    });
    const skeptic = makeClinicalSkeptic({ name: "SkepticAgent", flags: [] });

    const result = await runAgentConversation({
      agents: [proposer, skeptic], context: { chiefComplaint: "sepsis" }, maxRounds: 3,
    });

    expect(result.summary).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Clinical Crew (CrewAI equivalent)
// ─────────────────────────────────────────────────────────────────────────────
import {
  runClinicalCrew, buildChestPainCrew,
  type CrewAgent, type CrewDefinition,
} from "../../server/workflows/clinicalCrew";

describe("Batch49 — clinicalCrew: hierarchical delegation", () => {
  it("chest pain crew runs all tasks and produces final disposition", async () => {
    const crew    = buildChestPainCrew();
    const context = { chiefComplaint: "chest pain", age: 55, hr: 105, sbp: 130, spo2: 97, troponin: 0.01 };
    const result  = await runClinicalCrew(crew, context);

    expect(["success", "partial"]).toContain(result.status);
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.finalOutput.managerDecision).toBeTruthy();
    expect(result.agentOutputs["internist"]?.heartScore).toBeDefined();
  });

  it("internist produces HEART score", async () => {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, { chiefComplaint: "chest pain", age: 70, hr: 90, sbp: 130 });
    const internistOutput = result.agentOutputs["internist"];
    expect(internistOutput?.heartScore).toBeGreaterThanOrEqual(0);
    expect(["low", "intermediate", "high"]).toContain(internistOutput?.riskTier);
  });

  it("cardiologist output includes recommendation", async () => {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, { chiefComplaint: "chest pain", age: 60, troponin: 0.01 });
    const cardioOutput = result.agentOutputs["cardiologist"];
    expect(cardioOutput?.recommendation).toBeTruthy();
  });

  it("NP executor produces orders list", async () => {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, { chiefComplaint: "chest pain", age: 55, hr: 90 });
    const npOutput = result.agentOutputs["np-executor"];
    expect(Array.isArray(npOutput?.ordersPlaced)).toBe(true);
    expect((npOutput?.ordersPlaced as string[]).length).toBeGreaterThan(0);
  });

  it("pharmacist flags anticoagulation warning", async () => {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, { chiefComplaint: "chest pain", anticoagulated: true, age: 65 });
    const rxOutput = result.agentOutputs["pharmacist"];
    expect(rxOutput?.contraindicationFound).toBe(true);
    expect((rxOutput?.warnings as string[]).some((w: string) => w.toLowerCase().includes("anticoag"))).toBe(true);
  });

  it("STEMI pathway escalates appropriately", async () => {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, { chiefComplaint: "chest pain", stElevation: true, age: 60, troponin: 0.2 });
    const cardioOutput = result.agentOutputs["cardiologist"];
    expect(cardioOutput?.cardiacRisk).toBe("HIGH");
    expect(String(cardioOutput?.recommendation ?? "").toLowerCase()).toContain("pci");
  });

  it("manager summary is structured and readable", async () => {
    const crew   = buildChestPainCrew();
    const result = await runClinicalCrew(crew, { chiefComplaint: "chest pain", age: 50, hr: 80 });
    expect(result.managerSummary).toContain("Chest Pain Evaluation Crew");
    expect(result.managerSummary).toContain("✓");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("custom one-agent crew executes correctly", async () => {
    const soloAgent: CrewAgent = {
      id: "solo", name: "Solo Agent", role: "specialist", specialty: "general",
      goalPrompt: "Complete solo task",
      async execute(_task, ctx): Promise<Record<string, unknown>> {
        return { done: true, input: ctx.chiefComplaint };
      },
    };

    const manager: CrewAgent = {
      id: "mgr", name: "Manager", role: "manager", specialty: "management",
      goalPrompt: "Orchestrate",
      async planTasks(goal, context) {
        return [{ name: "Solo Task", description: goal, assignedTo: "solo", dependsOn: [], input: context }];
      },
      async execute(_task, ctx): Promise<Record<string, unknown>> {
        return { synthesized: true, goal: "done" };
      },
    };

    const crew: CrewDefinition = {
      crewId: "solo-crew", name: "Solo Crew", goal: "Do one thing",
      manager, agents: [soloAgent],
    };

    const result = await runClinicalCrew(crew, { chiefComplaint: "headache" });
    expect(result.status).toBe("success");
    expect(result.agentOutputs["solo"]?.done).toBe(true);
    expect(result.finalOutput.synthesized).toBe(true);
  });
});

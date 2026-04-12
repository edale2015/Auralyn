import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tool Schema Registry
// ─────────────────────────────────────────────────────────────────────────────
import {
  registerSchemaTool, getSchemaTool, listSchemaTools,
  validateToolInput, toOpenAIFunction, exportReadOnlyFunctions,
  registerBuiltInSchemaTools,
} from "../../server/tools/toolSchemaRegistry";

describe("Batch47 — toolSchemaRegistry: registration", () => {
  beforeAll(() => { registerBuiltInSchemaTools(); });

  it("registerSchemaTool stores and retrieves a tool", () => {
    registerSchemaTool({
      id:               "test_tool_b47",
      name:             "Test Tool",
      description:      "A test tool",
      category:         "data",
      accessLevel:      "read",
      requiresApproval: false,
      inputSchema:      z.object({ patientId: z.string(), limit: z.number().optional() }),
      handler:          async ({ patientId }) => ({ patientId }),
    });
    expect(getSchemaTool("test_tool_b47")).not.toBeNull();
  });

  it("listSchemaTools filters by accessLevel", () => {
    const reads  = listSchemaTools({ accessLevel: "read" });
    const writes = listSchemaTools({ accessLevel: "write" });
    expect(reads.every((t) => t.accessLevel === "read")).toBe(true);
    expect(writes.every((t) => t.accessLevel === "write")).toBe(true);
  });

  it("listSchemaTools filters by requiresApproval", () => {
    const approval = listSchemaTools({ requiresApproval: true });
    expect(approval.every((t) => t.requiresApproval)).toBe(true);
  });

  it("built-in tools include vitals_check (read) and prescribe_medication (write)", () => {
    expect(getSchemaTool("vitals_check")).not.toBeNull();
    expect(getSchemaTool("vitals_check")!.accessLevel).toBe("read");
    expect(getSchemaTool("prescribe_medication")).not.toBeNull();
    expect(getSchemaTool("prescribe_medication")!.accessLevel).toBe("write");
    expect(getSchemaTool("prescribe_medication")!.requiresApproval).toBe(true);
  });

  it("override_safety_decision is admin level", () => {
    const t = getSchemaTool("override_safety_decision");
    expect(t!.accessLevel).toBe("admin");
  });
});

describe("Batch47 — toolSchemaRegistry: validateToolInput", () => {
  it("passes valid input", () => {
    const r = validateToolInput("vitals_check", { patientId: "P001", hr: 72 });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects missing required patientId", () => {
    const r = validateToolInput("vitals_check", { hr: 72 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("patientId"))).toBe(true);
  });

  it("rejects hr out of range (>300)", () => {
    const r = validateToolInput("vitals_check", { patientId: "P001", hr: 999 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("hr"))).toBe(true);
  });

  it("rejects unknown toolId", () => {
    const r = validateToolInput("nonexistent_tool", {});
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain("Tool not found");
  });

  it("applies defaults — spo2 defaults to 98", () => {
    const r = validateToolInput("vitals_check", { patientId: "P001" });
    expect(r.valid).toBe(true);
    expect((r.data as any).spo2).toBe(98);
  });
});

describe("Batch47 — toolSchemaRegistry: JSON Schema export", () => {
  it("toOpenAIFunction produces correct shape", () => {
    const fn = toOpenAIFunction(getSchemaTool("vitals_check")!);
    expect(fn.type).toBe("function");
    expect(fn.name).toBe("vitals_check");
    expect(fn.description).toContain("READ");
    expect(fn.parameters.type).toBe("object");
    expect((fn.parameters as any).additionalProperties).toBe(false);
  });

  it("exportReadOnlyFunctions excludes write/admin tools", () => {
    const fns = exportReadOnlyFunctions();
    expect(fns.every((f) => f.description.includes("READ"))).toBe(true);
    expect(fns.some((f) => f.name === "prescribe_medication")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tool Envelope
// ─────────────────────────────────────────────────────────────────────────────
import {
  successEnvelope, errorEnvelope, pendingApprovalEnvelope,
  envelopeToModelContext, batchToModelContent, auditableEnvelope,
} from "../../server/tools/toolEnvelope";

describe("Batch47 — toolEnvelope: factories", () => {
  it("successEnvelope has ok=true and correct fields", () => {
    const env = successEnvelope("vitals_check", { flags: [] }, 45, "read", false);
    expect(env.ok).toBe(true);
    expect(env.tool).toBe("vitals_check");
    expect(env.data).toEqual({ flags: [] });
    expect(env.error).toBeNull();
    expect(env.latencyMs).toBe(45);
    expect(env.accessLevel).toBe("read");
    expect(env.approvalRequired).toBe(false);
    expect(env.traceId).toBeTruthy();
  });

  it("errorEnvelope has ok=false and error message", () => {
    const env = errorEnvelope("prescribe_medication", "Validation failed: missing dose", 10, "write", true);
    expect(env.ok).toBe(false);
    expect(env.data).toBeNull();
    expect(env.error).toContain("missing dose");
    expect(env.approvalRequired).toBe(true);
  });

  it("pendingApprovalEnvelope has ok=true and pending status", () => {
    const env = pendingApprovalEnvelope("prescribe_medication", 5, "write");
    expect(env.ok).toBe(true);
    expect(env.data?.status).toBe("pending_approval");
    expect(env.approvalRequired).toBe(true);
  });

  it("traceId is unique per envelope", () => {
    const a = successEnvelope("t1", {}, 1, "read", false);
    const b = successEnvelope("t1", {}, 1, "read", false);
    expect(a.traceId).not.toBe(b.traceId);
  });
});

describe("Batch47 — toolEnvelope: formatting", () => {
  it("envelopeToModelContext formats success", () => {
    const env = successEnvelope("vitals_check", { abnormal: false }, 30, "read", false);
    const ctx = envelopeToModelContext(env);
    expect(ctx).toContain("[TOOL OK]");
    expect(ctx).toContain("vitals_check");
    expect(ctx).toContain("read");
  });

  it("envelopeToModelContext formats error", () => {
    const env = errorEnvelope("vitals_check", "SpO2 out of range", 5, "read", false);
    const ctx = envelopeToModelContext(env);
    expect(ctx).toContain("[TOOL ERROR]");
    expect(ctx).toContain("SpO2 out of range");
  });

  it("envelopeToModelContext formats pending", () => {
    const env = pendingApprovalEnvelope("prescribe_medication", 5, "write");
    const ctx = envelopeToModelContext(env);
    expect(ctx).toContain("[TOOL PENDING]");
  });

  it("batchToModelContent joins multiple envelopes", () => {
    const envs = [
      successEnvelope("vitals_check", {}, 10, "read", false),
      errorEnvelope("prescribe_medication", "blocked", 5, "write", true),
    ];
    const ctx = batchToModelContent(envs);
    expect(ctx).toContain("[TOOL OK]");
    expect(ctx).toContain("[TOOL ERROR]");
  });

  it("auditableEnvelope strips data payload", () => {
    const env = successEnvelope("vitals_check", { phi: "secret" }, 10, "read", false);
    const auditable = auditableEnvelope(env);
    expect("data" in auditable).toBe(false);
    expect(auditable.hasData).toBe(true);
    expect(auditable.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tool Call Loop
// ─────────────────────────────────────────────────────────────────────────────
import {
  executeToolCall, executeToolBatch, grantApproval, formatLoopSummary,
  type CallerContext,
} from "../../server/tools/toolCallLoop";

const readCaller: CallerContext  = { callerId: "dr-smith", role: "physician", maxLevel: "read" };
const writeCaller: CallerContext = { callerId: "dr-smith", role: "physician", maxLevel: "write", approvalGranted: new Set(["prescribe_medication"]) };
const adminCaller: CallerContext = { callerId: "dr-smith", role: "physician", maxLevel: "admin", approvalGranted: new Set(["override_safety_decision", "admit_patient"]) };
const agentCaller: CallerContext = { callerId: "triage-agent", role: "agent", maxLevel: "read" };

describe("Batch47 — toolCallLoop: single tool execution", () => {
  it("executes read tool successfully", async () => {
    const r = await executeToolCall("vitals_check", { patientId: "P001", hr: 72 }, readCaller);
    expect(r.step).toBe("complete");
    expect(r.envelope.ok).toBe(true);
    expect(r.envelope.accessLevel).toBe("read");
    expect(r.blockedReason).toBeNull();
  });

  it("Step 1 — rejects unknown tool", async () => {
    const r = await executeToolCall("nonexistent", {}, readCaller);
    expect(r.step).toBe("validate");
    expect(r.envelope.ok).toBe(false);
    expect(r.blockedReason).toContain("not found");
  });

  it("Step 1 — rejects invalid input (hallucinated args)", async () => {
    const r = await executeToolCall("vitals_check", { patientId: "P001", hr: 9999 }, readCaller);
    expect(r.step).toBe("validate");
    expect(r.envelope.ok).toBe(false);
    expect(r.envelope.error).toContain("hr");
  });

  it("Step 2 — blocks write tool for read-only caller", async () => {
    const r = await executeToolCall("prescribe_medication", {
      patientId: "P001", medication: "amox", dose: "500mg", route: "oral",
      frequency: "TID", indication: "infection", prescriberId: "dr-smith",
    }, readCaller);
    expect(r.step).toBe("auth");
    expect(r.envelope.ok).toBe(false);
    expect(r.blockedReason).toContain("requires write");
  });

  it("Step 2 — blocks admin tool for agent (non-physician)", async () => {
    const r = await executeToolCall("override_safety_decision", {
      patientId: "P001", decisionId: "D1",
      overrideReason: "Clinically justified based on presentation",
      physicianId: "dr-smith", acknowledgedRisk: true,
    }, { ...agentCaller, maxLevel: "admin" });
    expect(r.step).toBe("auth");
    expect(r.envelope.ok).toBe(false);
    expect(r.blockedReason).toContain("physician");
  });

  it("Step 3 — returns pending_approval when approval not granted", async () => {
    const caller: CallerContext = { callerId: "dr-smith", role: "physician", maxLevel: "write" };
    const r = await executeToolCall("prescribe_medication", {
      patientId: "P001", medication: "amox", dose: "500mg", route: "oral",
      frequency: "TID", indication: "infection", prescriberId: "dr-smith",
    }, caller);
    expect(r.step).toBe("approval");
    expect(r.envelope.ok).toBe(true);
    expect((r.envelope.data as any)?.status).toBe("pending_approval");
  });

  it("Step 4 — executes write tool after approval granted", async () => {
    const r = await executeToolCall("prescribe_medication", {
      patientId: "P001", medication: "amoxicillin", dose: "500mg", route: "oral",
      frequency: "TID x 7 days", indication: "Strep pharyngitis confirmed", prescriberId: "dr-smith",
    }, writeCaller);
    expect(r.step).toBe("complete");
    expect(r.envelope.ok).toBe(true);
    expect((r.envelope.data as any).orderId).toMatch(/^RX-/);
  });

  it("grantApproval adds toolId to approvalGranted set", async () => {
    const caller: CallerContext = { callerId: "dr-jones", role: "physician", maxLevel: "write" };
    grantApproval(caller, "prescribe_medication");
    expect(caller.approvalGranted?.has("prescribe_medication")).toBe(true);
    const r = await executeToolCall("prescribe_medication", {
      patientId: "P002", medication: "nitrofurantoin", dose: "100mg", route: "oral",
      frequency: "BID x 5d", indication: "UTI — positive UA with bacteriuria", prescriberId: "dr-jones",
    }, caller);
    expect(r.step).toBe("complete");
  });
});

describe("Batch47 — toolCallLoop: batch execution", () => {
  it("runs multiple read tools in parallel", async () => {
    const batch = await executeToolBatch([
      { toolId: "vitals_check",  input: { patientId: "P001", hr: 100 } },
      { toolId: "lookup_patient", input: { patientId: "P001" } },
    ], readCaller);
    expect(batch.allSucceeded).toBe(true);
    expect(batch.results).toHaveLength(2);
    expect(batch.modelContext).toContain("[TOOL OK]");
  });

  it("partial failure: one success, one blocked", async () => {
    const batch = await executeToolBatch([
      { toolId: "vitals_check",         input: { patientId: "P001" } },
      { toolId: "prescribe_medication",  input: { patientId: "P001", medication: "amox", dose: "500mg", route: "oral", frequency: "TID", indication: "infection", prescriberId: "dr-x" } },
    ], readCaller);   // read-only caller — prescribe is blocked
    expect(batch.allSucceeded).toBe(false);
    expect(batch.anyBlocked).toBe(true);
    expect(batch.results[0].step).toBe("complete");
    expect(batch.results[1].step).toBe("auth");
  });

  it("modelContext contains all tool results", async () => {
    const batch = await executeToolBatch([
      { toolId: "vitals_check",  input: { patientId: "P001", hr: 130, spo2: 88 } },
      { toolId: "lookup_patient", input: { patientId: "P001" } },
    ], readCaller);
    expect(batch.modelContext).toContain("vitals_check");
    expect(batch.modelContext).toContain("lookup_patient");
  });

  it("anyPending true when write tool without approval in batch", async () => {
    const caller: CallerContext = { callerId: "dr-x", role: "physician", maxLevel: "write" };
    const batch = await executeToolBatch([
      { toolId: "prescribe_medication", input: {
        patientId: "P001", medication: "amox", dose: "500mg", route: "oral",
        frequency: "TID", indication: "infection", prescriberId: "dr-x",
      }},
    ], caller);
    expect(batch.anyPending).toBe(true);
  });

  it("formatLoopSummary produces readable output", async () => {
    const batch = await executeToolBatch([
      { toolId: "vitals_check", input: { patientId: "P001" } },
    ], readCaller);
    const summary = formatLoopSummary(batch);
    expect(summary).toContain("Tool Batch");
    expect(summary).toContain("vitals_check");
    expect(summary).toContain("✓");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── 1. Clinical Decision Engine ──────────────────────────────────────────────
import { runClinicalDecision } from "../../server/services/clinical/clinicalDecisionEngine";

describe("Batch28 — clinicalDecisionEngine", () => {
  it("Centor 4 → ANTIBIOTIC + HIGH or MEDIUM confidence", () => {
    const result = runClinicalDecision({
      fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: true,
      absenceOfCough: true, age: 25,
    });
    expect(result.centorScore).toBe(4);
    expect(result.finalDecision).toBe("ANTIBIOTIC");
    expect(["HIGH", "MEDIUM"]).toContain(result.confidence);
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.centorRecommendation).toBe("EMPIRIC_ANTIBIOTIC");
  });

  it("Centor 0 + low probability → NO_ANTIBIOTIC", () => {
    const result = runClinicalDecision({
      fever: false, tonsillarExudate: false, tenderAnteriorCervicalNodes: false,
      absenceOfCough: false, age: 30,
    });
    expect(result.finalDecision).toBe("NO_ANTIBIOTIC");
    expect(result.centorScore).toBe(0);
    expect(result.centorRecommendation).toBe("NO_ANTIBIOTIC");
  });

  it("Centor 3 → centorRecommendation is TEST_OR_DELAYED_RX (Bayesian may push final to ANTIBIOTIC)", () => {
    const result = runClinicalDecision({
      fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: true,
      absenceOfCough: false, age: 30,
    });
    expect(result.centorScore).toBe(3);
    expect(result.centorRecommendation).toBe("TEST_OR_DELAYED_RX");
    // Bayesian probability with fever+exudate+nodes can exceed 0.65 → override to ANTIBIOTIC
    expect(["TEST_OR_DELAYED", "ANTIBIOTIC"]).toContain(result.finalDecision);
  });

  it("Centor 1 (age penalty), fever+exudate present → at minimum TEST_OR_DELAYED from Bayesian", () => {
    const result = runClinicalDecision({
      fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: false,
      absenceOfCough: false, age: 50, // age >44 penalizes by 1
    });
    expect(result.centorScore).toBe(1);
    // fever + exudate drives Bayesian probability > 0.4 → TEST_OR_DELAYED or ANTIBIOTIC
    expect(["TEST_OR_DELAYED", "ANTIBIOTIC"]).toContain(result.finalDecision);
  });

  it("returns probability between 0 and 1", () => {
    const result = runClinicalDecision({
      fever: true, tonsillarExudate: false, tenderAnteriorCervicalNodes: false,
      absenceOfCough: false, age: 30,
    });
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });

  it("reasoning array includes Centor score and probability lines", () => {
    const result = runClinicalDecision({
      fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: false,
      absenceOfCough: false, age: 30,
    });
    expect(result.reasoning.some((r) => r.includes("Centor score"))).toBe(true);
    expect(result.reasoning.some((r) => r.includes("probability"))).toBe(true);
  });

  it("age modifier: child (<15) raises score by 1", () => {
    const adult = runClinicalDecision({
      fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: false,
      absenceOfCough: false, age: 30,
    });
    const child = runClinicalDecision({
      fever: true, tonsillarExudate: true, tenderAnteriorCervicalNodes: false,
      absenceOfCough: false, age: 10,
    });
    expect(child.centorScore).toBe(adult.centorScore + 1);
  });
});

// ─── 2. Debate Engine V2 ──────────────────────────────────────────────────────
import { runAntibioticDebateV2, runAntibioticDebate } from "../../server/services/communication/debateEngine";

describe("Batch28 — debateEngine V2", () => {
  it("high Centor + high probability → ANTIBIOTIC, HIGH confidence", () => {
    const result = runAntibioticDebateV2({ centorScore: 4, probability: 0.8 });
    expect(result.decision).toBe("ANTIBIOTIC");
    expect(result.confidence).toBe("HIGH");
    expect(result.proArguments.length).toBeGreaterThan(0);
    expect(result.summary).toContain("Pro:");
  });

  it("low Centor + low probability → NO_ANTIBIOTIC", () => {
    const result = runAntibioticDebateV2({ centorScore: 1, probability: 0.1 });
    expect(result.decision).toBe("NO_ANTIBIOTIC");
    expect(result.conArguments.length).toBeGreaterThan(0);
  });

  it("borderline → TEST_OR_DELAYED or ANTIBIOTIC based on weighted balance", () => {
    const result = runAntibioticDebateV2({ centorScore: 3, probability: 0.5 });
    expect(["ANTIBIOTIC", "TEST_OR_DELAYED", "NO_ANTIBIOTIC"]).toContain(result.decision);
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(result.confidence);
  });

  it("returns string summary", () => {
    const result = runAntibioticDebateV2({ centorScore: 2, probability: 0.45 });
    expect(typeof result.summary).toBe("string");
    expect(result.summary.includes("|")).toBe(true);
  });

  it("existing V1 runAntibioticDebate still works", () => {
    const result = runAntibioticDebate({ centorScore: 4, strepProbability: 0.75 });
    expect(["ANTIBIOTIC_GIVEN", "NO_ANTIBIOTIC_OR_DELAYED"]).toContain(result.decision);
  });
});

// ─── 3. Voice Service — generateVoiceMessage ──────────────────────────────────
import { generateVoiceMessage } from "../../server/services/communication/voiceService";

describe("Batch28 — voiceService.generateVoiceMessage", () => {
  it("ANTIBIOTIC → bacterial infection message", () => {
    expect(generateVoiceMessage("ANTIBIOTIC")).toContain("bacterial");
  });

  it("ANTIBIOTIC_GIVEN → also returns bacterial message", () => {
    expect(generateVoiceMessage("ANTIBIOTIC_GIVEN")).toContain("bacterial");
  });

  it("TEST_OR_DELAYED → middle range message", () => {
    const msg = generateVoiceMessage("TEST_OR_DELAYED");
    expect(msg.toLowerCase()).toContain("middle");
  });

  it("NO_ANTIBIOTIC → viral process message", () => {
    expect(generateVoiceMessage("NO_ANTIBIOTIC")).toContain("viral");
  });

  it("unknown decision → generic message (no throw)", () => {
    expect(() => generateVoiceMessage("UNKNOWN_DECISION")).not.toThrow();
  });
});

// ─── 4. Tool Registry ────────────────────────────────────────────────────────
import { TOOL_REGISTRY, getToolDefinition, getToolNames } from "../../server/tools/registry";

describe("Batch28 — tools/registry", () => {
  it("TOOL_REGISTRY contains at least 6 tools", () => {
    expect(TOOL_REGISTRY.length).toBeGreaterThanOrEqual(6);
  });

  it("all tools have name, description, input_schema", () => {
    for (const t of TOOL_REGISTRY) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.input_schema.type).toBe("object");
    }
  });

  it("getToolDefinition finds ask_question", () => {
    const tool = getToolDefinition("ask_question");
    expect(tool).toBeDefined();
    expect(tool!.input_schema.required).toContain("question_id");
  });

  it("getToolDefinition returns undefined for unknown", () => {
    expect(getToolDefinition("nonexistent_tool")).toBeUndefined();
  });

  it("getToolNames returns all tool names as strings", () => {
    const names = getToolNames();
    expect(names).toContain("ask_question");
    expect(names).toContain("generate_disposition");
    expect(names).toContain("prescribe_antibiotic");
  });
});

// ─── 5. Permission Engine ────────────────────────────────────────────────────
import { checkClinicalPermission, checkPermission } from "../../server/governance/permissionEngine";

describe("Batch28 — governance/permissionEngine", () => {
  it("prescribe_antibiotic allowed when Centor ≥3", () => {
    const result = checkClinicalPermission("prescribe_antibiotic", { centorScore: 3 });
    expect(result.allowed).toBe(true);
  });

  it("prescribe_antibiotic blocked when no bacterial criteria", () => {
    const result = checkClinicalPermission("prescribe_antibiotic", {
      centorScore: 0, probability: 0.1,
      confirmed_bacterial_features: false, bacterial_criteria_met: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("generate_disposition blocked when red flags present", () => {
    const result = checkClinicalPermission("generate_disposition", { red_flags_present: true });
    expect(result.allowed).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("discharge_patient blocked when red flags present", () => {
    const result = checkClinicalPermission("discharge_patient", { red_flags_present: true });
    expect(result.allowed).toBe(false);
  });

  it("unknown action is permitted by default", () => {
    const result = checkClinicalPermission("ask_question", {});
    expect(result.allowed).toBe(true);
  });

  it("checkPermission adapts toolCall object correctly", () => {
    const r = checkPermission({ name: "prescribe_antibiotic", input: { centorScore: 4, bacterial_criteria_met: true } });
    expect(r.allowed).toBe(true);
  });

  it("physician-only actions blocked for non-providers", () => {
    const r = checkClinicalPermission("prescribe_controlled_med", { actorRole: "patient" });
    expect(r.allowed).toBe(false);
  });
});

// ─── 6. Context Compression ──────────────────────────────────────────────────
import { compressClinicalContext, buildClinicalSummary } from "../../server/context/compression";

describe("Batch28 — context/compression", () => {
  it("returns original messages when under threshold", () => {
    const msgs = [{ role: "user" as const, content: "I have a sore throat" }];
    const out  = compressClinicalContext(msgs);
    expect(out).toHaveLength(1);
  });

  it("compresses to 7 messages when threshold exceeded (1 summary + 6 recent)", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => ({
      role:    "user" as const,
      content: `Message ${i} about fever and sore throat`,
    }));
    const out = compressClinicalContext(msgs);
    expect(out.length).toBeLessThanOrEqual(7);
    expect(out[0].role).toBe("system");
    expect(typeof out[0].content).toBe("string");
    expect((out[0].content as string)).toContain("CLINICAL SUMMARY");
  });

  it("buildClinicalSummary extracts symptom keywords", () => {
    const msgs = [
      { role: "user" as const, content: "Patient has fever and exudate" },
      { role: "assistant" as const, content: "Any cough present?" },
    ];
    const summary = buildClinicalSummary(msgs);
    expect(summary.key_symptoms).toContain("fever");
    expect(summary.key_symptoms).toContain("exudate");
  });
});

// ─── 7. Event Bus ────────────────────────────────────────────────────────────
import { bus } from "../../server/events/eventBus";

describe("Batch28 — events/eventBus", () => {
  beforeEach(() => {
    bus.clear();
  });

  it("on/emit: handler receives payload", () => {
    const received: any[] = [];
    bus.on("test_event", (p) => received.push(p));
    bus.emit("test_event", { value: 42 });
    expect(received).toHaveLength(1);
    expect(received[0].value).toBe(42);
  });

  it("off removes handler", () => {
    const received: number[] = [];
    const handler = (p: any) => received.push(p.value as number);
    bus.on("test_off", handler);
    bus.emit("test_off", { value: 1 });
    bus.off("test_off", handler);
    bus.emit("test_off", { value: 2 });
    expect(received).toHaveLength(1);
  });

  it("emitAsync resolves after all handlers complete", async () => {
    const log: number[] = [];
    bus.on("async_test", async () => { await Promise.resolve(); log.push(1); });
    bus.on("async_test", async () => { await Promise.resolve(); log.push(2); });
    await bus.emitAsync("async_test", {});
    expect(log).toHaveLength(2);
  });

  it("listenerCount returns correct count", () => {
    bus.on("count_test", () => {});
    bus.on("count_test", () => {});
    expect(bus.listenerCount("count_test")).toBe(2);
  });

  it("emit on event with no handlers doesn't throw", () => {
    expect(() => bus.emit("unregistered_event", {})).not.toThrow();
  });
});

// ─── 8. Background Tasks ─────────────────────────────────────────────────────
import { runBackground, getBackgroundTask, listBackgroundTasks } from "../../server/async/background";

describe("Batch28 — async/background", () => {
  it("runBackground returns a taskId string", () => {
    const id = runBackground("test_task", async () => "ok");
    expect(typeof id).toBe("string");
    expect(id.startsWith("bg-")).toBe(true);
  });

  it("getBackgroundTask returns the registered task", () => {
    const id = runBackground("lookup_test", async () => 42);
    const task = getBackgroundTask(id);
    expect(task).toBeDefined();
    expect(task!.name).toBe("lookup_test");
    expect(task!.status).toBe("running");
  });

  it("listBackgroundTasks includes tasks from this test run", () => {
    const before = listBackgroundTasks().length;
    runBackground("list_test", async () => "done");
    expect(listBackgroundTasks().length).toBeGreaterThan(before);
  });
});

// ─── 9. Session Manager ──────────────────────────────────────────────────────
import {
  createSession, getSession, updateSession, closeSession,
  listActiveSessions, listPendingReviews,
} from "../../server/session/sessionManager";

describe("Batch28 — session/sessionManager", () => {
  it("createSession returns session with id and active status", async () => {
    const s = await createSession({ patientId: "p-001", complaint: "sore throat" });
    expect(s.id).toBeTruthy();
    expect(s.status).toBe("active");
    expect(s.patientId).toBe("p-001");
    expect(s.complaint).toBe("sore throat");
  });

  it("getSession retrieves created session by id", async () => {
    const s  = await createSession({ patientId: "p-002", complaint: "cough" });
    const s2 = getSession(s.id);
    expect(s2).toBeDefined();
    expect(s2!.id).toBe(s.id);
  });

  it("updateSession updates fields", async () => {
    const s     = await createSession({ patientId: "p-003", complaint: "fever" });
    const updated = updateSession(s.id, { status: "physician_review" });
    expect(updated!.status).toBe("physician_review");
  });

  it("closeSession marks session complete", async () => {
    const s = await createSession({ patientId: "p-004", complaint: "rash" });
    const ok = closeSession(s.id, "complete");
    expect(ok).toBe(true);
    expect(getSession(s.id)!.status).toBe("complete");
  });

  it("listActiveSessions includes active sessions", async () => {
    const s = await createSession({ patientId: "p-999", complaint: "headache" });
    const active = listActiveSessions();
    expect(active.some((sess) => sess.id === s.id)).toBe(true);
  });

  it("listPendingReviews includes physician_review sessions", async () => {
    const s = await createSession({ patientId: "p-007", complaint: "dysphagia" });
    closeSession(s.id, "physician_review");
    const pending = listPendingReviews();
    expect(pending.some((sess) => sess.id === s.id)).toBe(true);
  });

  it("createSession includes initial system message", async () => {
    const s = await createSession({ patientId: "p-100", complaint: "earache" });
    expect(s.messages.length).toBe(1);
    expect(s.messages[0].role).toBe("system");
  });
});

// ─── 10. Tool Dispatch ───────────────────────────────────────────────────────
import { dispatchTools, dispatchParallel } from "../../server/tools/dispatch";

describe("Batch28 — tools/dispatch", () => {
  it("ask_question returns question stub", async () => {
    const result = await dispatchTools({ name: "ask_question", input: { question_id: "q_fever" } });
    expect(typeof result).toBe("object");
    expect((result as any).question_id).toBe("q_fever");
  });

  it("record_answer returns recorded:true", async () => {
    const result = await dispatchTools({
      name: "record_answer", input: { question_id: "q_fever", answer: "yes" },
    });
    expect((result as any).recorded).toBe(true);
  });

  it("check_red_flags returns red_flags_present:false for no features", async () => {
    const result = await dispatchTools({ name: "check_red_flags", input: { features: {} } });
    expect((result as any).red_flags_present).toBe(false);
  });

  it("check_red_flags detects stridor", async () => {
    const result = await dispatchTools({
      name: "check_red_flags", input: { features: { stridor: true } },
    });
    expect((result as any).red_flags_present).toBe(true);
    expect((result as any).triggered).toContain("stridor");
  });

  it("calculate_score centor returns score", async () => {
    const result = await dispatchTools({
      name: "calculate_score",
      input: { score_type: "centor", features: { fever: true, exudate: true, age: 25 } },
    });
    expect(typeof (result as any).score).toBe("number");
  });

  it("calculate_score bayesian returns probability", async () => {
    const result = await dispatchTools({
      name: "calculate_score",
      input: { score_type: "bayesian_strep", features: { fever: true, exudate: true } },
    });
    expect(typeof (result as any).probability).toBe("number");
  });

  it("generate_disposition returns finalDisposition string", async () => {
    const result = await dispatchTools({
      name: "generate_disposition",
      input: { diagnosis: "strep_pharyngitis", risk_score: 0.3, triggered_red_flags: [] },
    });
    expect(typeof (result as any).finalDisposition).toBe("string");
  });

  it("unknown tool returns error object", async () => {
    const result = await dispatchTools({ name: "nonexistent_tool", input: {} });
    expect((result as any).error).toBeTruthy();
  });

  it("dispatchParallel resolves all calls", async () => {
    const results = await dispatchParallel([
      { name: "ask_question", input: { question_id: "q1" } },
      { name: "check_red_flags", input: { features: {} } },
    ]);
    expect(results).toHaveLength(2);
  });
});

// ─── 11. Clinical Agent Loop ─────────────────────────────────────────────────
import { clinicalAgentLoop } from "../../server/engine/clinicalAgentLoop";

describe("Batch28 — engine/clinicalAgentLoop", () => {
  it("runs without throwing and returns LoopResult", async () => {
    const session = await createSession({ patientId: "p-loop-001", complaint: "sore throat" });
    session.state = { features: { fever: true, exudate: true } };
    const result = await clinicalAgentLoop(session);
    expect(result.iterations).toBeGreaterThan(0);
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.session).toBeDefined();
  });

  it("produces a trace with at least one step", async () => {
    const session = await createSession({ patientId: "p-loop-002", complaint: "fever" });
    session.state = { features: { fever: true } };
    const result = await clinicalAgentLoop(session);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.trace[0].tool).toBeTruthy();
  });

  it("finalState contains dispositionResult after loop", async () => {
    const session = await createSession({ patientId: "p-loop-003", complaint: "pharyngitis" });
    session.state = { features: { fever: true, exudate: true, nodes: true }, riskScore: 0.3 };
    const result = await clinicalAgentLoop(session);
    expect(result.finalState.dispositionResult).toBeDefined();
  });
});

// ─── 12. Physician Override Check ────────────────────────────────────────────
import { physicianOverrideCheck } from "../../server/governance/override";

describe("Batch28 — governance/override", () => {
  it("requiresReview:true when red flags present", () => {
    const r = physicianOverrideCheck({ red_flags_present: true });
    expect(r.requireReview).toBe(true);
    expect(r.urgency).toBe("immediate");
  });

  it("requiresReview:true when confidence LOW", () => {
    const r = physicianOverrideCheck({ confidence: "LOW" });
    expect(r.requireReview).toBe(true);
  });

  it("requiresReview:false for high confidence clean case", () => {
    const r = physicianOverrideCheck({ confidence: "HIGH", red_flags_present: false, riskScore: 0.2 });
    expect(r.requireReview).toBe(false);
  });

  it("high risk score triggers review", () => {
    const r = physicianOverrideCheck({ riskScore: 0.8, confidence: 0.9, red_flags_present: false });
    expect(r.requireReview).toBe(true);
    expect(r.urgency).toBe("urgent");
  });

  it("antibiotic without criteria triggers routine review", () => {
    const r = physicianOverrideCheck({
      finalDecision: "ANTIBIOTIC", probability: 0.2, centorScore: 1,
      red_flags_present: false, confidence: 0.9,
    });
    expect(r.requireReview).toBe(true);
    expect(r.urgency).toBe("routine");
  });
});

// ─── 13. Telemed Finalize ────────────────────────────────────────────────────
import { finalizeVisit } from "../../server/telemed/finalize";

describe("Batch28 — telemed/finalize", () => {
  it("returns all required fields", () => {
    const r = finalizeVisit({ diagnosis: "strep", disposition: "home_with_rx", trace: [] });
    expect(r.diagnosis).toBe("strep");
    expect(r.disposition).toBe("home_with_rx");
    expect(Array.isArray(r.medications)).toBe(true);
    expect(Array.isArray(r.instructions)).toBe(true);
    expect(typeof r.follow_up).toBe("string");
    expect(typeof r.generatedAt).toBe("string");
  });

  it("er_now disposition produces ER follow-up text", () => {
    const r = finalizeVisit({ disposition: "er_now", trace: [] });
    expect(r.follow_up.toLowerCase()).toContain("er");
  });

  it("uses finalState clinicalScore for decision when no explicit inputs", () => {
    const r = finalizeVisit({
      finalState: {
        clinicalScore:      { finalDecision: "ANTIBIOTIC" },
        dispositionResult:  { finalDisposition: "home_with_rx" },
      },
      trace: [],
    });
    expect(r.medications.some((m) => m.includes("amoxicillin"))).toBe(true);
  });
});

// ─── 14. Telemed Orchestrator ────────────────────────────────────────────────
import { runTelemedVisit, getPendingPhysicianReviews, approvePhysicianDecision } from "../../server/telemed/orchestrator";

describe("Batch28 — telemed/orchestrator", () => {
  it("runTelemedVisit returns a status and sessionId", async () => {
    const r = await runTelemedVisit({
      patientId: "p-telemed-001", complaint: "sore throat",
      features: { fever: true, exudate: true }, riskScore: 0.3,
    });
    expect(typeof r.sessionId).toBe("string");
    expect(["complete", "physician_review", "error"]).toContain(r.status);
  });

  it("getPendingPhysicianReviews returns an array", async () => {
    const reviews = await getPendingPhysicianReviews();
    expect(Array.isArray(reviews)).toBe(true);
  });

  it("approvePhysicianDecision returns a FinalVisitOutput", async () => {
    const s = await createSession({ patientId: "p-telemed-approve", complaint: "cough" });
    closeSession(s.id, "physician_review");
    const result = await approvePhysicianDecision(s.id, "home_with_rx");
    expect(result.disposition).toBe("home_with_rx");
    expect(typeof result.generatedAt).toBe("string");
  });
});

// ─── 15. Uncertainty Engine ──────────────────────────────────────────────────
import { calculateUncertainty } from "../../server/engine/uncertainty";

describe("Batch28 — engine/uncertainty", () => {
  it("single diagnosis → uncertainty near 1, no escalation if delta=1", () => {
    const r = calculateUncertainty([{ diagnosis: "strep", probability: 0.9 }]);
    expect(r.topDiagnosis).toBe("strep");
    expect(typeof r.uncertainty).toBe("number");
  });

  it("very close diagnoses → requiresEscalation:true", () => {
    const r = calculateUncertainty([
      { diagnosis: "strep", probability: 0.51 },
      { diagnosis: "viral", probability: 0.49 },
    ]);
    expect(r.requiresEscalation).toBe(true);
  });

  it("clear leader → requiresEscalation:false", () => {
    const r = calculateUncertainty([
      { diagnosis: "strep", probability: 0.85 },
      { diagnosis: "viral", probability: 0.15 },
    ]);
    expect(r.requiresEscalation).toBe(false);
  });

  it("empty input → maximum uncertainty", () => {
    const r = calculateUncertainty([]);
    expect(r.uncertainty).toBe(1.0);
    expect(r.requiresEscalation).toBe(true);
  });
});

// ─── 16. Safety Floor ────────────────────────────────────────────────────────
import { enforceSafetyFloor } from "../../server/engine/safetyFloor";

describe("Batch28 — engine/safetyFloor", () => {
  it("risk > 0.7 → er_now regardless of disposition", () => {
    const r = enforceSafetyFloor({ riskScore: 0.8, disposition: "follow_up_primary_care" });
    expect(r.finalDisposition).toBe("er_now");
    expect(r.floorApplied).toBe(true);
  });

  it("red flags present → always er_now", () => {
    const r = enforceSafetyFloor({ riskScore: 0.3, redFlags: ["stridor"], disposition: "home" });
    expect(r.finalDisposition).toBe("er_now");
  });

  it("risk 0.5–0.7 → urgent_care if not already elevated", () => {
    const r = enforceSafetyFloor({ riskScore: 0.6, disposition: "follow_up_primary_care" });
    expect(r.finalDisposition).toBe("urgent_care");
    expect(r.floorApplied).toBe(true);
  });

  it("low risk, no flags → passes through unchanged", () => {
    const r = enforceSafetyFloor({ riskScore: 0.2, disposition: "home_supportive_care" });
    expect(r.finalDisposition).toBe("home_supportive_care");
    expect(r.floorApplied).toBe(false);
  });
});

// ─── 17. Multi-Complaint Fusion ──────────────────────────────────────────────
import { fuseComplaints } from "../../server/engine/multiComplaint";

describe("Batch28 — engine/multiComplaint", () => {
  it("fuses two complaints, picks dominant by risk", () => {
    const r = fuseComplaints([
      { complaint: "sore throat", riskScore: 0.4, redFlags: [], diagnosis: "strep" },
      { complaint: "chest pain",  riskScore: 0.7, redFlags: [],  diagnosis: "musculoskeletal" },
    ]);
    expect(r.dominantComplaint).toBe("chest pain");
    expect(r.totalRisk).toBeGreaterThan(0.5);
  });

  it("any red flag → er_now disposition", () => {
    const r = fuseComplaints([
      { complaint: "cough", riskScore: 0.2, redFlags: ["stridor"] },
      { complaint: "fever", riskScore: 0.3, redFlags: [] },
    ]);
    expect(r.anyRedFlags).toBe(true);
    expect(r.fusedDisposition).toBe("er_now");
  });

  it("empty input → returns safe defaults", () => {
    const r = fuseComplaints([]);
    expect(r.dominantComplaint).toBe("unknown");
    expect(r.totalRisk).toBe(0);
  });

  it("all red flags are accumulated", () => {
    const r = fuseComplaints([
      { complaint: "a", riskScore: 0.1, redFlags: ["stridor"] },
      { complaint: "b", riskScore: 0.1, redFlags: ["drooling"] },
    ]);
    expect(r.allRedFlags).toContain("stridor");
    expect(r.allRedFlags).toContain("drooling");
  });
});

// ─── 18. Clinical Consistency Enforcer ──────────────────────────────────────
import { enforceConsistency } from "../../server/governance/consistency";

describe("Batch28 — governance/consistency", () => {
  it("removes antibiotic from viral_uri diagnosis", () => {
    const r = enforceConsistency({
      diagnosis: "viral_uri", medications: ["amoxicillin", "ibuprofen"],
      disposition: "follow_up_primary_care",
    });
    expect(r.consistent).toBe(false);
    expect(r.corrected).toBe(true);
    expect(r.medications).not.toContain("amoxicillin");
    expect(r.medications).toContain("ibuprofen");
  });

  it("no corrections needed for bacterial strep + antibiotic", () => {
    const r = enforceConsistency({
      diagnosis: "strep_pharyngitis", medications: ["amoxicillin"],
      disposition: "home_with_rx",
    });
    expect(r.consistent).toBe(true);
    expect(r.corrected).toBe(false);
  });

  it("empty medications with viral diagnosis → no correction needed", () => {
    const r = enforceConsistency({
      diagnosis: "viral_pharyngitis", medications: [], disposition: "home_supportive_care",
    });
    expect(r.consistent).toBe(true);
  });

  it("records violations when antibiotic prescribed for viral illness", () => {
    const r = enforceConsistency({
      diagnosis: "common_cold", medications: ["azithromycin"],
      disposition: "home_with_rx",
    });
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.corrections.length).toBeGreaterThan(0);
  });
});

// ─── 19. Event Hooks — Control Tower Log ────────────────────────────────────
import { getControlTowerLog } from "../../server/events/hooks";

describe("Batch28 — events/hooks", () => {
  it("getControlTowerLog returns an array", () => {
    const log = getControlTowerLog();
    expect(Array.isArray(log)).toBe(true);
  });

  it("control tower log entries have required shape", () => {
    const log = getControlTowerLog();
    for (const entry of log.slice(0, 5)) {
      expect(typeof entry.tool).toBe("string");
      expect(typeof entry.timestamp).toBe("string");
    }
  });
});

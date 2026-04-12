import { describe, it, expect } from "vitest";

// ─── 1. Autonomous Co-Pilot ───────────────────────────────────────────────────
import { generateInterventions } from "../../server/intervention/autonomousCopilot";

describe("Batch44 — autonomousCopilot", () => {
  const sepsisPatient = {
    id:         "p1",
    vitals:     { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 },
    symptoms:   ["fever", "chills"],
    sepsisRisk: { highRisk: true,  probability: 0.85, factors: ["Elevated lactate"] },
    level:      "CRITICAL" as const,
  };
  const normalPatient = {
    id:         "p2",
    vitals:     { hr: 72,  spo2: 98, temp: 98.6, systolicBP: 122, rr: 16 },
    symptoms:   [],
    sepsisRisk: { highRisk: false, probability: 0.1,  factors: [] },
    level:      "LOW" as const,
  };

  it("generates SEPSIS_BUNDLE for high-risk patient", async () => {
    const bundles = await generateInterventions(sepsisPatient);
    const types   = bundles.map((b) => b.type);
    expect(types).toContain("SEPSIS_BUNDLE");
  });

  it("generates HYPOTENSION_PROTOCOL when SBP < 90", async () => {
    const bundles = await generateInterventions(sepsisPatient);
    const types   = bundles.map((b) => b.type);
    expect(types).toContain("HYPOTENSION_PROTOCOL");
  });

  it("generates ICU_ESCALATION for CRITICAL patient", async () => {
    const bundles = await generateInterventions(sepsisPatient);
    const types   = bundles.map((b) => b.type);
    expect(types).toContain("ICU_ESCALATION");
  });

  it("generates HYPOXIA_PROTOCOL for low SpO2", async () => {
    const bundles = await generateInterventions(sepsisPatient);
    const types   = bundles.map((b) => b.type);
    expect(types).toContain("HYPOXIA_PROTOCOL");
  });

  it("generates no bundles for normal patient", async () => {
    const bundles = await generateInterventions(normalPatient);
    expect(bundles.length).toBe(0);
  });

  it("each bundle has required fields", async () => {
    const bundles = await generateInterventions(sepsisPatient);
    bundles.forEach((b) => {
      expect(typeof b.type).toBe("string");
      expect(typeof b.confidence).toBe("number");
      expect(Array.isArray(b.actions)).toBe(true);
      expect(Array.isArray(b.evidence)).toBe(true);
    });
  });
});

// ─── 2. Co-Pilot Decision (card builder) ──────────────────────────────────────
import { buildCopilotCard, approveCard, rejectCard, getAllCards } from "../../server/intervention/copilotDecision";

describe("Batch44 — copilotDecision", () => {
  const bundle = {
    type:       "SEPSIS_BUNDLE",
    confidence: 0.93,
    requiresApproval: false,
    evidence:   ["Sepsis probability > 60%"],
    actions:    [{ action: "order:lactate", description: "Draw lactate", urgency: "immediate" as const }],
  };

  it("builds a copilot card", () => {
    const card = buildCopilotCard("p1", bundle);
    expect(card.patientId).toBe("p1");
    expect(card.recommendation).toBe("SEPSIS_BUNDLE");
    expect(card.id).toMatch(/^CP-/);
  });

  it("card requires approval when confidence < 0.95", () => {
    const card = buildCopilotCard("p1", bundle);
    expect(card.requiresApproval).toBe(true);
  });

  it("card is auto-executed when confidence ≥ 0.95 and no approval required", () => {
    const highConfBundle = { ...bundle, confidence: 0.96, requiresApproval: false };
    const card = buildCopilotCard("p1", highConfBundle);
    expect(card.status).toBe("auto-executed");
  });

  it("approveCard changes status to approved", () => {
    const card     = buildCopilotCard("p-approve", bundle);
    const approved = approveCard(card.id, "dr-smith");
    expect(approved?.status).toBe("approved");
  });

  it("rejectCard changes status to rejected", () => {
    const card     = buildCopilotCard("p-reject", bundle);
    const rejected = rejectCard(card.id, "dr-jones", "Not indicated");
    expect(rejected?.status).toBe("rejected");
  });

  it("getAllCards returns stored cards", () => {
    const cards = getAllCards();
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThan(0);
  });
});

// ─── 3. Deterministic Replay ──────────────────────────────────────────────────
import { rerunDecision, replayCaseEvents } from "../../server/audit/deterministicReplay";

describe("Batch44 — deterministicReplay", () => {
  it("matches when original allowed = replayed allowed (express action)", () => {
    const r = rerunDecision({ agent: "triage_agent", action: "read:patient_data", context: {}, result: { allowed: true } });
    expect(r.match).toBe(true);
    expect(r.replayed.allowed).toBe(true);
  });

  it("detects divergence when original says allowed but scope says blocked", () => {
    const r = rerunDecision({ agent: "triage_agent", action: "write:ehr", context: {}, result: { allowed: true } });
    expect(r.match).toBe(false);
    expect(r.divergenceReason).toBeDefined();
  });

  it("replayCaseEvents returns timeline + counts", () => {
    const events = [
      { agent: "triage_agent", action: "read:patient_data", context: {}, result: { allowed: true } },
      { agent: "triage_agent", action: "write:ehr",         context: {}, result: { allowed: true } },
    ];
    const { timeline, matched, diverged } = replayCaseEvents(events);
    expect(timeline).toHaveLength(2);
    expect(matched + diverged).toBe(2);
  });
});

// ─── 4. Clinical Trial Simulator ──────────────────────────────────────────────
import { runTrial } from "../../server/simulation/clinicalTrialSimulator";

describe("Batch44 — clinicalTrialSimulator", () => {
  const patients = [
    { id: "T1", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 }, symptoms: ["fever", "chills"], level: "CRITICAL" as const },
    { id: "T2", vitals: { hr: 78,  spo2: 98, temp: 98.6,  systolicBP: 122, rr: 16 }, symptoms: [], level: "LOW" as const },
  ];

  it("returns required summary fields", async () => {
    const r = await runTrial(patients);
    expect(r.patients).toBe(2);
    expect(typeof r.avgICUReduction).toBe("number");
    expect(typeof r.icuAvoidanceRate).toBe("number");
    expect(typeof r.fdaEvidence).toBe("boolean");
    expect(typeof r.generatedAt).toBe("string");
  });

  it("outcomes array matches patient count", async () => {
    const r = await runTrial(patients);
    expect(r.outcomes).toHaveLength(2);
  });

  it("each outcome has baseline and AI ICU prob", async () => {
    const r = await runTrial(patients);
    r.outcomes.forEach((o) => {
      expect(typeof o.baselineICUProb).toBe("number");
      expect(typeof o.aiICUProb).toBe("number");
      expect(o.icuProbReduction).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─── 5. Sepsis Skill ─────────────────────────────────────────────────────────
import { detectSepsis } from "../../server/skills/sepsisDetection";

describe("Batch44 — sepsisSkill", () => {
  it("normal vitals = LOW risk", () => {
    const r = detectSepsis({ vitals: { sbp: 120, rr: 16, hr: 72, temp: 98.6 } });
    expect(r.risk).toBe("LOW");
    expect(r.action).toBe("MONITOR");
  });

  it("qSOFA ≥ 2 → HIGH risk + ESCALATE_IMMEDIATELY", () => {
    const r = detectSepsis({ vitals: { sbp: 88, rr: 25, mentalStatus: "altered", hr: 130 } });
    expect(r.qsofa).toBeGreaterThanOrEqual(2);
    expect(r.risk).toBe("HIGH");
    expect(r.action).toBe("ESCALATE_IMMEDIATELY");
  });

  it("infection symptoms + SIRS → MODERATE or HIGH", () => {
    const r = detectSepsis({ vitals: { hr: 100, rr: 22, temp: 101.5, sbp: 110 }, symptoms: ["fever"] });
    expect(["MODERATE", "HIGH"]).toContain(r.risk);
  });

  it("skill name is sepsis-detection", () => {
    const r = detectSepsis({ vitals: { sbp: 120, rr: 16 } });
    expect(r.skillName).toBe("sepsis-detection");
  });
});

// ─── 6. Agent Council ─────────────────────────────────────────────────────────
import { runAgentCouncil } from "../../server/agents/agentCouncil";

describe("Batch44 — agentCouncil", () => {
  it("returns CouncilResult with required fields", () => {
    const r = runAgentCouncil({ vitals: { hr: 138, spo2: 87, systolicBP: 82, rr: 28 } });
    expect(typeof r.agentsRan).toBe("number");
    expect(Array.isArray(r.allDecisions)).toBe(true);
    expect(["strong", "split", "no_consensus"]).toContain(r.consensusLevel);
  });

  it("critical patient gets ICU_ADMISSION as top decision", () => {
    const r = runAgentCouncil({ vitals: { hr: 140, spo2: 85, systolicBP: 78 }, level: "CRITICAL" });
    expect(r.topDecision?.recommendation).toBe("ICU_ADMISSION");
  });

  it("healthy patient has no_consensus (all agents return null)", () => {
    const r = runAgentCouncil({ vitals: { hr: 70, spo2: 99, systolicBP: 120, rr: 16 } });
    expect(r.topDecision).toBeNull();
    expect(r.consensusLevel).toBe("no_consensus");
  });
});

// ─── 7. Pre-Disposition Hook ──────────────────────────────────────────────────
import { preDispositionHook } from "../../server/hooks/preDisposition";

describe("Batch44 — preDispositionHook", () => {
  it("red flag overrides disposition to ER_IMMEDIATE", () => {
    const r = preDispositionHook(
      { patientId: "p1", redFlags: ["chest pain"], vitals: {} },
      { disposition: "DISCHARGE", confidence: 0.8 }
    );
    expect(r.disposition).toBe("ER_IMMEDIATE");
    expect(r.overridden).toBe(true);
  });

  it("no red flags + normal vitals = passes through", () => {
    const r = preDispositionHook(
      { patientId: "p2", redFlags: [], vitals: { systolicBP: 120, spo2: 98 } },
      { disposition: "URGENT_CARE", confidence: 0.88 }
    );
    expect(r.overridden).toBe(false);
    expect(r.disposition).toBe("URGENT_CARE");
  });

  it("severe hypotension triggers ER_IMMEDIATE even without red flags", () => {
    const r = preDispositionHook(
      { patientId: "p3", redFlags: [], vitals: { systolicBP: 75, spo2: 98 } },
      { disposition: "OBSERVE", confidence: 0.85 }
    );
    expect(r.disposition).toBe("ER_IMMEDIATE");
    expect(r.overridden).toBe(true);
  });

  it("CRITICAL triage level forces ICU_ADMIT at minimum", () => {
    const r = preDispositionHook(
      { patientId: "p4", redFlags: [], vitals: { systolicBP: 120, spo2: 98 }, level: "CRITICAL" },
      { disposition: "OBSERVE", confidence: 0.85 }
    );
    expect(["ICU_ADMIT", "ER_IMMEDIATE"]).toContain(r.disposition);
    expect(r.overridden).toBe(true);
  });

  it("appliedHooks is an array", () => {
    const r = preDispositionHook({ patientId: "p5", redFlags: [], vitals: {} }, { disposition: "OBSERVE" });
    expect(Array.isArray(r.appliedHooks)).toBe(true);
  });
});

// ─── 8. Agent Loop ────────────────────────────────────────────────────────────
import { runAgentLoop } from "../../server/engine/agentLoop";

describe("Batch44 — agentLoop", () => {
  it("returns complete result with all phases", async () => {
    const r = await runAgentLoop({ id: "p1", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 }, symptoms: ["fever", "chills"] });
    expect(r.patientId).toBe("p1");
    expect(r.phase).toBe("complete");
    expect(r.skillResults).toBeDefined();
    expect(r.sepsisRisk).toBeDefined();
    expect(r.agentCouncil).toBeDefined();
    expect(r.finalDecision).toBeDefined();
  });

  it("trace has multiple phases", async () => {
    const r = await runAgentLoop({ id: "p2", vitals: { hr: 72, spo2: 98, temp: 98.6, systolicBP: 120, rr: 16 }, symptoms: [] });
    expect(r.trace.length).toBeGreaterThan(2);
  });

  it("red flags trigger hook override in finalDecision", async () => {
    const r = await runAgentLoop({ id: "p3", vitals: { hr: 80, spo2: 96, temp: 99, systolicBP: 118, rr: 16 }, redFlags: ["chest pain"] });
    expect(r.finalDecision.overridden).toBe(true);
    expect(r.finalDecision.disposition).toBe("ER_IMMEDIATE");
  });

  it("durationMs is non-negative", async () => {
    const r = await runAgentLoop({ id: "p4", vitals: { hr: 80, spo2: 96, temp: 99, systolicBP: 118, rr: 16 } });
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});

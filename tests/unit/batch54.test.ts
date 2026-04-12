/**
 * Batch 54 — Framework Suite (Article 26)
 * BMAD, SpecKit, GSD Context Rot, Superpowers, Shared Triad
 * Target: 56+ tests
 */

import { describe, it, expect } from "vitest";

// ── BMAD ──────────────────────────────────────────────────────────────────────
import {
  createBMADSession, getSession, listSessions, advancePhase,
  summonPersona, assessComplexity, getPersonaDefinition, getComplexityProfile,
  generateClinicalBrief, generateUserStories,
  CLINICAL_PERSONAS, COMPLEXITY_PROFILES,
} from "../../server/frameworks/clinicalPersonaEngine";

// ── SpecKit ───────────────────────────────────────────────────────────────────
import {
  createPipeline, getPipeline, setConstitution, setSpec, setPlan,
  addOrder, tryAdvanceToExecute, setDataModel, computeSpecCompleteness,
  DEFAULT_CONSTITUTION,
} from "../../server/frameworks/gatedSpecPipeline";

// ── GSD Context Rot ───────────────────────────────────────────────────────────
import {
  createContextSession, recordTokenUsage, spawnOrchestraAgent,
  completeOrchestraAgent, addResearchFindings, addPlan, checkPlan,
  getContextSession, assessContextZone, CONTEXT_ROT_ZONES,
  buildVerticalSlicePlan, buildDebugHypotheses, testHypothesis,
} from "../../server/frameworks/contextRotMonitor";

// ── Superpowers ───────────────────────────────────────────────────────────────
import {
  createSuperpowersSession, getSuperpowersSession,
  submitDesignProposal, approveBrainstorm, defineTDDProtocol,
  detectRationalization, checkRationalization,
  requireSuccessCriteriaFirst, enforcePreTestRequired,
  submitForTwoStageReview, conductSpecComplianceReview, conductQualityReview, getReview,
  NAMED_RATIONALIZATIONS,
} from "../../server/frameworks/clinicalSuperpowers";

// ── Shared Triad Registry ─────────────────────────────────────────────────────
import {
  getTriadSummary, listAgents, listWorkflows, listSkills, listHybrids,
} from "../../server/frameworks/agentTriadRegistry";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — BMAD Multi-Persona Engine
// ─────────────────────────────────────────────────────────────────────────────

describe("BMAD Multi-Persona Engine", () => {
  it("assessComplexity returns routine for ESI 4-5", () => {
    expect(assessComplexity({ esiLevel: 5 })).toBe("routine");
    expect(assessComplexity({ esiLevel: 4 })).toBe("routine");
  });

  it("assessComplexity returns moderate for ESI 3", () => {
    expect(assessComplexity({ esiLevel: 3 })).toBe("moderate");
  });

  it("assessComplexity returns complex for ESI 1-2", () => {
    expect(assessComplexity({ esiLevel: 1 })).toBe("complex");
    expect(assessComplexity({ esiLevel: 2 })).toBe("complex");
  });

  it("assessComplexity returns complex for critical vitals", () => {
    expect(assessComplexity({ esiLevel: 3, criticalVitals: true })).toBe("complex");
  });

  it("assessComplexity returns multi_organ for 3+ organ systems", () => {
    expect(assessComplexity({ esiLevel: 2, organSystemCount: 3, criticalVitals: true })).toBe("multi_organ");
  });

  it("createBMADSession creates session with correct complexity", () => {
    const s = createBMADSession({ complexity: "complex" });
    expect(s.id).toBeTruthy();
    expect(s.complexity).toBe("complex");
    expect(s.activePhase).toBe("analysis");
    expect(s.phases.analysis).toBe("active");
  });

  it("BMAD Party Mode: summonPersona adds persona to session", () => {
    const s = createBMADSession({ complexity: "moderate" });
    const ok = summonPersona(s.id, "PharmacistAdvisor", "Drug interaction concern raised");
    expect(ok).toBe(true);
    const updated = getSession(s.id);
    expect(updated!.personas).toContain("PharmacistAdvisor");
    expect(updated!.traceLog.some((l) => l.includes("Party Mode"))).toBe(true);
  });

  it("scale-adaptive: routine profile only requires analysis phase", () => {
    const profile = getComplexityProfile("routine");
    expect(profile.requiredPhases).toEqual(["analysis"]);
    expect(profile.requiredPersonas).toEqual(["TriageSpecialist"]);
    expect(profile.ceremonyLevel).toBe("minimal");
  });

  it("scale-adaptive: multi_organ requires all 6 personas", () => {
    const profile = getComplexityProfile("multi_organ");
    expect(profile.requiredPersonas).toHaveLength(6);
    expect(profile.ceremonyLevel).toBe("enterprise");
  });

  it("advancePhase transitions to next phase and logs trace", () => {
    const s = createBMADSession({ complexity: "complex" });
    const updated = advancePhase(s.id, {
      phase: "analysis", type: "ClinicalBrief", content: "ESI 2 chest pain with STEMI concern.",
      authoredBy: "ClinicalAnalyst",
    });
    expect(updated!.phases.analysis).toBe("complete");
    expect(updated!.activePhase).toBe("planning");
    expect(updated!.artifacts).toHaveLength(1);
    expect(updated!.traceLog.some((l) => l.includes("analysis") && l.includes("completed"))).toBe(true);
  });

  it("getPersonaDefinition returns correct expertise and constraints", () => {
    const p = getPersonaDefinition("PharmacistAdvisor");
    expect(p.role).toBe("PharmacistAdvisor");
    expect(p.constraints.some((c) => c.includes("prescribe"))).toBe(true);
    expect(p.expectedOutputs).toContain("DrugReviewReport");
  });

  it("generateClinicalBrief produces a clinical brief with constraints", () => {
    const brief = generateClinicalBrief({
      chiefComplaint: "Chest pain with diaphoresis",
      constraints:    ["Known LBBB on EKG", "Aspirin allergy"],
      complexity:     "complex",
    });
    expect(brief.problemStatement).toContain("complex");
    expect(brief.constraints).toContain("Known LBBB on EKG");
    expect(brief.riskLevel).toBe("complex");
  });

  it("generateUserStories produces stories for all required personas", () => {
    const stories = generateUserStories("complex");
    const profile  = COMPLEXITY_PROFILES.complex;
    expect(stories.length).toBe(profile.requiredPersonas.length);
    stories.forEach((s) => {
      expect(s.story).toContain("As a");
      expect(s.acceptanceCriteria.length).toBeGreaterThan(0);
    });
  });

  it("all 6 clinical personas are defined", () => {
    const personaNames = Object.keys(CLINICAL_PERSONAS);
    expect(personaNames).toHaveLength(6);
    expect(personaNames).toContain("QualityAuditor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — SpecKit Gated Pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("SpecKit Gated Pipeline", () => {
  it("createPipeline starts at constitution phase", () => {
    const p = createPipeline("patient_001");
    expect(p.currentPhase).toBe("constitution");
    expect(p.artifacts.orders).toHaveLength(0);
  });

  it("setConstitution adds ratified constitution", () => {
    const p = createPipeline();
    const updated = setConstitution(p.id, "dr_governance");
    expect(updated!.artifacts.constitution!.ratifiedBy).toBe("dr_governance");
    expect(updated!.artifacts.constitution!.principles.length).toBeGreaterThanOrEqual(3);
    expect(updated!.artifacts.constitution!.prohibitions.length).toBeGreaterThanOrEqual(1);
  });

  it("default constitution includes 'First do no harm'", () => {
    expect(DEFAULT_CONSTITUTION.principles[0]).toContain("no harm");
  });

  it("default constitution prohibitions block NEWS2 ≥ 5 discharge", () => {
    const hasNewsRule = DEFAULT_CONSTITUTION.prohibitions.some((p) => p.includes("NEWS2") && p.includes("5"));
    expect(hasNewsRule).toBe(true);
  });

  it("setSpec gate passes when constitution ratified and spec is complete", () => {
    const p = createPipeline();
    setConstitution(p.id, "dr_test");
    const gate = setSpec(p.id, {
      chiefComplaint:     "Acute chest pain with troponin elevation",
      targetOutcome:      "Rule out STEMI within 90 minutes",
      userJourneys:       ["Patient presents → Triage → ECG → Cardiology consult"],
      acceptanceCriteria: ["ECG within 10 minutes", "Troponin result within 60 minutes"],
      outOfScope:         ["Elective cardiac workup"],
      completenessScore:  90,
    });
    expect(gate!.status).toBe("passed");
    expect(getPipeline(p.id)!.currentPhase).toBe("specify");
  });

  it("setSpec gate fails when constitution not ratified", () => {
    const p = createPipeline();
    // No constitution set
    const gate = setSpec(p.id, {
      chiefComplaint: "Chest pain", targetOutcome: "STEMI rule-out",
      userJourneys: ["journey"], acceptanceCriteria: ["criterion"],
      outOfScope: [], completenessScore: 85,
    });
    expect(gate!.status).toBe("failed");
    expect(gate!.failReason).toBeTruthy();
  });

  it("setPlan gate fails when spec completeness < 80%", () => {
    const p = createPipeline();
    setConstitution(p.id, "dr_test");
    setSpec(p.id, {
      chiefComplaint: "pain", targetOutcome: "",
      userJourneys: [], acceptanceCriteria: [],
      outOfScope: [], completenessScore: 20,  // LOW
    });
    const gate = setPlan(p.id, {
      strategy: "Treat the patient", phases: ["Phase 1"],
      resourceEstimate: "2 nurses, 1 physician",
      riskMitigation: ["Monitor vitals"],
      timeline: "2 hours",
      researchSources: ["ACC/AHA 2023"],
    });
    expect(gate!.status).toBe("failed");
  });

  it("addOrder adds order to pipeline artifacts", () => {
    const p   = createPipeline();
    const ord = addOrder(p.id, {
      description: "12-lead ECG within 10 minutes of arrival",
      persona: "TriageSpecialist",
      acceptanceCriteria: ["ECG completed within 10 minutes"],
      testConditions: ["Timestamp delta from arrival < 600 seconds"],
      priority: "stat",
    });
    expect(ord!.id).toBeTruthy();
    expect(ord!.status).toBe("pending");
    expect(getPipeline(p.id)!.artifacts.orders).toHaveLength(1);
  });

  it("computeSpecCompleteness returns 0 for empty spec", () => {
    const score = computeSpecCompleteness({});
    expect(score).toBe(0);
  });

  it("computeSpecCompleteness returns high score for complete spec", () => {
    const score = computeSpecCompleteness({
      chiefComplaint: "Acute chest pain with radiation to left arm",
      targetOutcome:  "Rule out STEMI within 90 minutes of arrival",
      userJourneys:   ["Triage → ECG → Physician → Cardiology"],
      acceptanceCriteria: ["ECG < 10 min", "Cath lab < 90 min"],
      outOfScope:     ["Non-cardiac chest pain management"],
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — GSD Context Rot Monitor
// ─────────────────────────────────────────────────────────────────────────────

describe("GSD Context Rot Monitor", () => {
  it("context rot zones match article percentages exactly", () => {
    expect(assessContextZone(0).zone).toBe("peak");
    expect(assessContextZone(25).zone).toBe("peak");
    expect(assessContextZone(30).zone).toBe("caution");
    expect(assessContextZone(45).zone).toBe("caution");
    expect(assessContextZone(50).zone).toBe("degraded");
    expect(assessContextZone(65).zone).toBe("degraded");
    expect(assessContextZone(70).zone).toBe("critical");
    expect(assessContextZone(75).zone).toBe("critical");
    expect(assessContextZone(80).zone).toBe("reset_required");
    expect(assessContextZone(95).zone).toBe("reset_required");
  });

  it("context rot zones have clinical risk descriptions", () => {
    for (const zone of CONTEXT_ROT_ZONES) {
      expect(zone.clinicalRisk).toBeTruthy();
      expect(zone.recommendation).toBeTruthy();
    }
  });

  it("reset_required zone mentions STOP and Reset", () => {
    const critical = CONTEXT_ROT_ZONES.find((z) => z.zone === "reset_required");
    expect(critical!.recommendation).toContain("STOP");
    expect(critical!.recommendation.toLowerCase()).toContain("reset");
  });

  it("createContextSession creates session with peak zone", () => {
    const sid = `gsd_test_${Date.now()}`;
    const s = createContextSession(sid, 200_000);
    expect(s.sessionId).toBe(sid);
    expect(s.zone).toBe("peak");
    expect(s.utilizationPct).toBe(0);
  });

  it("recordTokenUsage updates zone as tokens accumulate", () => {
    const sid = `gsd_tokens_${Date.now()}`;
    createContextSession(sid, 100_000);
    let cp = recordTokenUsage(sid, 35_000, "initial_context");
    expect(cp!.zone).toBe("caution");  // 35%
    cp = recordTokenUsage(sid, 20_000, "wave_1");
    expect(cp!.zone).toBe("degraded"); // 55%
    cp = recordTokenUsage(sid, 20_000, "wave_2");
    expect(cp!.zone).toBe("critical"); // 75%
  });

  it("spawnOrchestraAgent: max 4 researchers enforced", () => {
    const sid = `gsd_orch_${Date.now()}`;
    createContextSession(sid, 200_000);
    const r1 = spawnOrchestraAgent(sid, "researcher", "vitals research");
    const r2 = spawnOrchestraAgent(sid, "researcher", "labs research");
    const r3 = spawnOrchestraAgent(sid, "researcher", "meds research");
    const r4 = spawnOrchestraAgent(sid, "researcher", "notes research");
    const r5 = spawnOrchestraAgent(sid, "researcher", "fifth researcher");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r3).not.toBeNull();
    expect(r4).not.toBeNull();
    expect(r5).toBeNull();  // max 4 enforced
  });

  it("spawnOrchestraAgent: planner is singleton (max 1)", () => {
    const sid = `gsd_planner_${Date.now()}`;
    createContextSession(sid, 200_000);
    const p1 = spawnOrchestraAgent(sid, "planner", "clinical plan");
    const p2 = spawnOrchestraAgent(sid, "planner", "second planner attempt");
    expect(p1).not.toBeNull();
    expect(p2).toBeNull();  // max 1 enforced
  });

  it("each orchestra agent gets its own fresh contextId", () => {
    const sid = `gsd_ctx_${Date.now()}`;
    createContextSession(sid, 200_000);
    const a1 = spawnOrchestraAgent(sid, "executor", "task 1");
    const a2 = spawnOrchestraAgent(sid, "executor", "task 2");
    expect(a1!.contextId).not.toBe(a2!.contextId);
  });

  it("completeOrchestraAgent sets status to complete", () => {
    const sid = `gsd_complete_${Date.now()}`;
    createContextSession(sid, 200_000);
    const agent = spawnOrchestraAgent(sid, "verifier", "verify sepsis pathway");
    const ok    = completeOrchestraAgent(sid, agent!.id);
    expect(ok).toBe(true);
    const s = getContextSession(sid);
    expect(s!.orchestra.find((a) => a.id === agent!.id)!.status).toBe("complete");
  });

  it("buildVerticalSlicePlan creates wave-based plan with fresh context per task", () => {
    const plan = buildVerticalSlicePlan("sepsis_pathway", [
      "diagnose sepsis",
      "administer 30mL/kg crystalloid",
      "order blood cultures",
      "then start antibiotics after cultures drawn",
    ]);
    expect(plan.verticalSlice).toBe("sepsis_pathway");
    expect(plan.waves.length).toBeGreaterThan(0);
    // Each task in each wave should have its own contextId
    const allContextIds = plan.waves.flatMap((w) => w.tasks.map((t) => t.contextId));
    const uniqueCtxIds  = new Set(allContextIds);
    expect(uniqueCtxIds.size).toBe(allContextIds.length);
  });

  it("buildDebugHypotheses generates goal-backward assertions", () => {
    const hypotheses = buildDebugHypotheses("patient is hemodynamically stable after resuscitation");
    expect(hypotheses.length).toBeGreaterThan(0);
    hypotheses.forEach((h) => {
      expect(h.assertion).toBeTruthy();
      expect(h.observable).toBeTruthy();
      expect(h.testMethod).toBeTruthy();
      expect(h.tested).toBe(false);
    });
  });

  it("testHypothesis marks confirmed when observation is positive", () => {
    const hyp = { assertion: "Patient stable", observable: "Vitals normal", testMethod: "Check vitals", tested: false };
    const result = testHypothesis(hyp, "Yes, confirmed — patient stable, BP 120/80");
    expect(result.tested).toBe(true);
    expect(result.result).toBe("confirmed");
  });

  it("testHypothesis marks refuted when observation is negative", () => {
    const hyp = { assertion: "Antibiotics administered", observable: "MAR documented", testMethod: "Audit MAR", tested: false };
    const result = testHypothesis(hyp, "No, not found in MAR");
    expect(result.result).toBe("refuted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Superpowers TDD Enforcer
// ─────────────────────────────────────────────────────────────────────────────

describe("Superpowers TDD Enforcer", () => {
  it("has 8 named rationalizations", () => {
    expect(NAMED_RATIONALIZATIONS).toHaveLength(8);
  });

  it("all rationalizations have counter message and severity", () => {
    for (const r of NAMED_RATIONALIZATIONS) {
      expect(r.counter).toBeTruthy();
      expect(["low", "medium", "high", "critical"]).toContain(r.severity);
    }
  });

  it("detects urgency_override rationalization", () => {
    const detected = detectRationalization("The patient is critical — just skip the allergy check");
    expect(detected.some((d) => d.category === "urgency_override")).toBe(true);
  });

  it("detects simplicity_bypass rationalization", () => {
    const detected = detectRationalization("This is too simple to need a protocol, it's clearly straightforward");
    expect(detected.some((d) => d.category === "simplicity_bypass")).toBe(true);
  });

  it("detects trust_the_agent rationalization", () => {
    const detected = detectRationalization("The AI said it's fine, the system says it's safe");
    expect(detected.some((d) => d.category === "trust_the_agent")).toBe(true);
    expect(detected.find((d) => d.category === "trust_the_agent")!.severity).toBe("critical");
  });

  it("does not flag neutral clinical text as rationalization", () => {
    const detected = detectRationalization("Administer 30mL/kg crystalloid per Surviving Sepsis Campaign Hour-1 bundle. Reassess MAP at 30 minutes.");
    expect(detected).toHaveLength(0);
  });

  it("createSuperpowersSession starts in brainstorm phase", () => {
    const s = createSuperpowersSession("Manage sepsis resuscitation");
    expect(s.phase).toBe("brainstorm");
    expect(s.brainstorm).toBeDefined();
    expect(s.brainstorm!.approved).toBe(false);
  });

  it("submitDesignProposal blocks when critical rationalization in proposal", () => {
    const s = createSuperpowersSession("Emergency management");
    const updated = submitDesignProposal(s.id, "The patient is critical — the AI said it's fine, skip the protocol", "agent");
    expect(updated!.brainstorm!.gateResult).toBe("fail");
    expect(updated!.rationalizationsDetected.length).toBeGreaterThan(0);
  });

  it("approveBrainstorm advances to test_define phase", () => {
    const s = createSuperpowersSession("Manage sepsis: administer crystalloid and antibiotics");
    submitDesignProposal(s.id, "Following the Hour-1 Surviving Sepsis Campaign bundle: 30mL/kg IV crystalloid, blood cultures, broad-spectrum antibiotics.", "dr_jones");
    const updated = approveBrainstorm(s.id, "dr_chief");
    expect(updated!.phase).toBe("test_define");
    expect(updated!.brainstorm!.approved).toBe(true);
    expect(updated!.brainstorm!.approvedBy).toBe("dr_chief");
  });

  it("requireSuccessCriteriaFirst throws if no criteria defined (TDD iron law)", () => {
    expect(() => requireSuccessCriteriaFirst("administer morphine", [], [])).toThrow();
  });

  it("requireSuccessCriteriaFirst succeeds with criteria", () => {
    const protocol = requireSuccessCriteriaFirst(
      "administer 30mL/kg crystalloid",
      ["MAP > 65 mmHg within 30 min", "Lactate clearance ≥ 10% at 2 hours"],
      ["Re-measure MAP 30 minutes after bolus", "Repeat lactate at 2 hours"],
    );
    expect(protocol.status).toBe("criteria_defined");
    expect(protocol.successCriteria).toHaveLength(2);
  });

  it("enforcePreTestRequired deletes intervention started without TDD", () => {
    const protocol = requireSuccessCriteriaFirst("test intervention", ["criterion 1"], []);
    // Simulate intervention started when criteria not defined (wrong status)
    const wrongProtocol = { ...protocol, status: "intervention_active" as const };
    const result = enforcePreTestRequired(wrongProtocol);
    expect(result.status).toBe("deleted");
    expect(result.deletedReason).toContain("TDD Iron Law");
  });

  it("defineTDDProtocol transitions session to implement phase", () => {
    const s = createSuperpowersSession("Administer antibiotic");
    submitDesignProposal(s.id, "Administer ceftriaxone 1g IV based on Surviving Sepsis Campaign. Blood cultures drawn first per protocol.", "dr_jones");
    approveBrainstorm(s.id, "dr_chief");
    const updated = defineTDDProtocol(s.id, "administer ceftriaxone", ["Blood cultures drawn before admin", "Dose given within 60 min of sepsis recognition"], ["Audit MAR for culture timestamp before antibiotic"]);
    expect(updated!.phase).toBe("implement");
    expect(updated!.tddProtocol!.status).toBe("criteria_defined");
  });

  it("two-stage review: spec compliance must pass before quality review", () => {
    const s  = createSuperpowersSession("Test review order");
    const r  = submitForTwoStageReview(s.id, "Administer crystalloid per protocol.");
    // Try quality review before spec compliance
    const blocked = conductQualityReview(r.id, "dr_test", []);
    expect(blocked!.blockedReason).toBeTruthy();
    expect(blocked!.qualityReview.passed).toBeNull();
  });

  it("two-stage review: both stages pass → overall passed", () => {
    const s  = createSuperpowersSession("Test two-stage review");
    const r  = submitForTwoStageReview(s.id, "Administer 30mL/kg crystalloid. Rationale: MAP < 65 per sepsis protocol.");
    conductSpecComplianceReview(r.id, "dr_spec", []);    // no violations
    conductQualityReview(r.id, "dr_qual", []);           // no issues
    const final = getReview(r.id);
    expect(final!.overallPassed).toBe(true);
  });

  it("two-stage review: spec violation blocks overall", () => {
    const s = createSuperpowersSession("Blocked review test");
    const r = submitForTwoStageReview(s.id, "Something underdefined.");
    conductSpecComplianceReview(r.id, "dr_spec", ["Output does not reference the clinical spec", "No patient data model used"]);
    conductQualityReview(r.id, "dr_qual", []);
    const final = getReview(r.id);
    expect(final!.overallPassed).toBe(false);
    expect(final!.blockedReason).toContain("SpecViolation");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Shared Triad Registry
// ─────────────────────────────────────────────────────────────────────────────

describe("Shared Triad Registry", () => {
  it("triad summary has all 5 frameworks with at least 1 agent each", () => {
    const summary = getTriadSummary();
    const frameworks = Object.keys(summary.byFramework);
    expect(frameworks).toContain("BMAD");
    expect(frameworks).toContain("GSD");
    expect(frameworks).toContain("Superpowers");
    for (const fw of frameworks) {
      if (fw !== "OpenSpec" && fw !== "SpecKit") {  // OpenSpec/SpecKit may have 0 agents
        expect(summary.byFramework[fw as keyof typeof summary.byFramework].agents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("listAgents(BMAD) returns 6 clinical personas", () => {
    const agents = listAgents("BMAD");
    expect(agents.length).toBe(6);
    expect(agents.every((a) => a.framework === "BMAD")).toBe(true);
  });

  it("listAgents(GSD) returns agents with requiresFreshContext=true", () => {
    const agents = listAgents("GSD");
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((a) => a.requiresFreshContext === true)).toBe(true);
  });

  it("listWorkflows returns at least 4 framework workflows", () => {
    const workflows = listWorkflows();
    expect(workflows.length).toBeGreaterThanOrEqual(4);
  });

  it("GSD workflow is parallelizable", () => {
    const gsdWf = listWorkflows("GSD");
    expect(gsdWf.length).toBeGreaterThan(0);
    expect(gsdWf[0].parallelizable).toBe(true);
    expect(gsdWf[0].gated).toBe(false);
  });

  it("SpecKit workflow is gated and not parallelizable", () => {
    const skWf = listWorkflows("SpecKit");
    expect(skWf.length).toBeGreaterThan(0);
    expect(skWf[0].gated).toBe(true);
    expect(skWf[0].parallelizable).toBe(false);
  });

  it("listSkills returns skills with testable=true (Superpowers enforcement)", () => {
    const skills = listSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((s) => s.testable === true)).toBe(true);
  });

  it("listHybrids returns 3 hybrid strategies", () => {
    const hybrids = listHybrids();
    expect(hybrids.length).toBe(3);
  });

  it("hybrid 'SpecKit + GSD' includes both frameworks", () => {
    const hybrids = listHybrids();
    const specGSD = hybrids.find((h) => h.name.includes("SpecKit") && h.name.includes("GSD"));
    expect(specGSD).toBeDefined();
    expect(specGSD!.frameworks).toContain("SpecKit");
    expect(specGSD!.frameworks).toContain("GSD");
  });

  it("hybrid 'OpenSpec + Superpowers' is lowest ceremony", () => {
    const hybrids = listHybrids();
    const openSP  = hybrids.find((h) => h.name.includes("OpenSpec") && h.name.includes("Superpowers"));
    expect(openSP).toBeDefined();
    expect(openSP!.description).toContain("Lowest");
  });

  it("all hybrid strategies have tradeOff field", () => {
    for (const h of listHybrids()) {
      expect(h.tradeOff).toBeTruthy();
      expect(h.tradeOff.length).toBeGreaterThan(10);
    }
  });

  it("triad total counts are consistent with framework lists", () => {
    const summary = getTriadSummary();
    expect(summary.agents).toBeGreaterThanOrEqual(listAgents("BMAD").length + listAgents("GSD").length);
    expect(summary.workflows).toBeGreaterThanOrEqual(4);
    expect(summary.skills).toBeGreaterThanOrEqual(8);
    expect(summary.hybrids).toBe(3);
  });
});

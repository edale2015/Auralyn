/**
 * T021 — Integration: artifact isolation
 *
 * Verifies that role-specific artifact filtering enforces the consume contracts:
 *   - billing prompt contains 0 artifacts of type kb_retrieval or failed_attempt
 *   - triage prompt contains 0 artifacts of type decision or calculation
 *   - every artifact in the differential prompt is of a type in differential's consume contract
 *   - billing sees strictly fewer artifacts than differential
 */

import { describe, it, expect } from "vitest";
import { ClinicalContextManager } from "../../server/context/ClinicalContextManager";
import { AgentArtifactBus, ContractViolation } from "../../server/context/AgentArtifactBus";
import type { EncounterContext, Artifact } from "../../server/context/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseCtx(): EncounterContext {
  return {
    immutables: {
      encounterId: "iso-test-001", tenantId: "t1", physicianId: "dr-iso",
      patient:     { ageYears: 45, sex: "M", allergies: [], currentMedications: [], relevantHistory: [] },
      chiefComplaint: "chest pain",
      redFlagsIdentified: [], hardConstraints: [],
      encounterStartedAt: new Date().toISOString(),
    },
    working: {
      currentDifferential: [], pendingQuestions: [], answeredQuestions: [],
      candidateDispositions: [], currentAgent: "triage", step: 1, estimatedTokens: 0,
    },
    artifacts: [],
    traceRefId: "s3://test/iso.jsonl",
  };
}

function makeArtifact(
  id: string,
  type: Artifact["type"],
  producedBy: Artifact["producedBy"],
): Artifact {
  const payloads: Record<string, any> = {
    validated_finding: { finding: `Finding ${id}`, positiveOrNegative: "present", source: "history" },
    kb_retrieval:      { query: "test", chunkId: id, chunkText: "kb text", relevanceScore: 0.8 },
    ruled_out:         { diagnosis: `Dx ${id}`, reason: "low score", evidence: [], reconsiderIf: [] },
    calculation:       { scoreName: "HEART", score: 3, interpretation: "moderate", inputs: {} },
    decision:          { decision: "home", rationale: "test", alternatives_considered: [] },
    uncertainty:       { question: "Q?", whyItMatters: "matters", blockedAgents: [] },
    failed_attempt:    { attempted: "kb_query", outcome: "empty", doNotRetryReason: "no data" },
    compaction_summary:{ summarizedSteps: [0, 5] as [number, number], highlights: [], preservedArtifactIds: [] },
  };

  return {
    id,
    type,
    producedBy,
    producedAt:      new Date().toISOString(),
    consumedBy:      [],
    payload:         payloads[type],
    provenance:      { source: "rule_engine", citation: `test:${id}` },
    estimatedTokens: 30,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("artifact_isolation (T021)", () => {
  it("billing prompt contains 0 kb_retrieval or failed_attempt artifacts", () => {
    const ctx = baseCtx();
    ctx.artifacts = [
      makeArtifact("a1", "validated_finding", "triage"),
      makeArtifact("a2", "kb_retrieval",      "differential"),   // billing must NOT see this
      makeArtifact("a3", "failed_attempt",     "differential"),   // billing must NOT see this
      makeArtifact("a4", "decision",           "disposition"),
      makeArtifact("a5", "calculation",        "differential"),
    ];

    const mgr    = new ClinicalContextManager(ctx);
    const prompt = mgr.assemblePromptFor("billing", "Propose CPT codes");

    // Billing only consumes validated_finding and decision per contract
    const includedArtifacts = ctx.artifacts.filter(a =>
      prompt.includedArtifactIds.includes(a.id),
    );

    for (const a of includedArtifacts) {
      expect(["validated_finding", "decision"]).toContain(a.type);
      expect(a.type).not.toBe("kb_retrieval");
      expect(a.type).not.toBe("failed_attempt");
    }
  });

  it("triage prompt contains 0 decision or calculation artifacts", () => {
    const ctx = baseCtx();
    ctx.artifacts = [
      makeArtifact("b1", "validated_finding", "triage"),
      makeArtifact("b2", "decision",          "disposition"),   // triage must NOT see this
      makeArtifact("b3", "calculation",       "differential"),  // triage must NOT see this
      makeArtifact("b4", "ruled_out",         "differential"),
    ];

    const mgr    = new ClinicalContextManager(ctx);
    const prompt = mgr.assemblePromptFor("triage", "Surface red flags");

    const included = ctx.artifacts.filter(a => prompt.includedArtifactIds.includes(a.id));

    for (const a of included) {
      expect(a.type).toBe("validated_finding");
      expect(a.type).not.toBe("decision");
      expect(a.type).not.toBe("calculation");
    }
  });

  it("every artifact in the differential prompt is within its consume contract", () => {
    const diffConsumes = [
      "validated_finding", "kb_retrieval", "ruled_out",
      "calculation", "uncertainty", "failed_attempt",
    ];

    const ctx = baseCtx();
    ctx.artifacts = [
      makeArtifact("c1", "validated_finding", "triage"),
      makeArtifact("c2", "kb_retrieval",      "differential"),
      makeArtifact("c3", "ruled_out",         "differential"),
      makeArtifact("c4", "calculation",       "differential"),
      makeArtifact("c5", "uncertainty",       "differential"),
      makeArtifact("c6", "failed_attempt",    "differential"),
      makeArtifact("c7", "decision",          "disposition"),   // differential must NOT see this
    ];

    const mgr    = new ClinicalContextManager(ctx);
    const prompt = mgr.assemblePromptFor("differential", "Rank the differential");

    const included = ctx.artifacts.filter(a => prompt.includedArtifactIds.includes(a.id));

    for (const a of included) {
      expect(diffConsumes).toContain(a.type);
    }

    // decision artifact must not appear
    const decisionInPrompt = included.find(a => a.type === "decision");
    expect(decisionInPrompt).toBeUndefined();
  });

  it("billing prompt sees strictly fewer artifacts than differential prompt", () => {
    const ctx = baseCtx();
    ctx.artifacts = [
      makeArtifact("d1", "validated_finding", "triage"),
      makeArtifact("d2", "validated_finding", "triage"),
      makeArtifact("d3", "kb_retrieval",      "differential"),
      makeArtifact("d4", "ruled_out",         "differential"),
      makeArtifact("d5", "calculation",       "differential"),
      makeArtifact("d6", "uncertainty",       "differential"),
      makeArtifact("d7", "failed_attempt",    "differential"),
      makeArtifact("d8", "decision",          "disposition"),
    ];

    const mgr         = new ClinicalContextManager(ctx);
    const diffPrompt  = mgr.assemblePromptFor("differential", "Rank the differential");
    const billPrompt  = mgr.assemblePromptFor("billing",      "Propose CPT codes");

    expect(billPrompt.includedArtifactIds.length).toBeLessThan(
      diffPrompt.includedArtifactIds.length,
    );
  });

  it("bus throws ContractViolation when triage tries to produce a decision", () => {
    const bus = new AgentArtifactBus("iso-test");
    const art = makeArtifact("violation-001", "decision", "triage");

    expect(() => bus.publish("triage", art)).toThrow(ContractViolation);
  });

  it("bus throws ContractViolation when billing tries to produce kb_retrieval", () => {
    const bus = new AgentArtifactBus("iso-test");
    const art = makeArtifact("violation-002", "kb_retrieval", "billing");

    // billing.producedBy must also match — set it correctly for this test
    const wrongArt = { ...art, producedBy: "billing" as const };
    expect(() => bus.publish("billing", wrongArt)).toThrow(ContractViolation);
  });
});

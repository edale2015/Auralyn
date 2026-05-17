/**
 * Example: end-to-end wiring of the context engineering module for a single
 * encounter.
 *
 * This is what you'd hand to your Replit AI assistant and say:
 * "wire my existing clinical pipeline so it uses THIS pattern at each step."
 */

import {
  AgentArtifactBus,
  buildDefaultRegistry,
  ClinicalContextManager,
  ContextCompactor,
  type Artifact,
  type EncounterContext,
} from "./index";

// 1. Build the encounter context with immutables captured at intake.
function startEncounter(): EncounterContext {
  return {
    immutables: {
      encounterId: "enc_2026_05_16_abc123",
      tenantId: "tenant_urgentcare_west",
      physicianId: "phys_dale",
      patient: {
        ageYears: 58,
        sex: "M",
        allergies: ["NKDA"],
        currentMedications: ["lisinopril 20mg qd", "atorvastatin 40mg qd"],
        relevantHistory: ["HTN", "Hyperlipidemia", "Former smoker (quit 2018)"],
      },
      chiefComplaint: "Chest pain × 2 hours, substernal pressure radiating to left arm",
      presentingVitals: {
        hr: 96,
        sbp: 158,
        dbp: 92,
        rr: 18,
        spo2: 97,
        tempC: 36.8,
        painScale: 6,
        capturedAt: new Date().toISOString(),
      },
      redFlagsIdentified: [], // populated by the triage agent / rule engine
      hardConstraints: [],
      encounterStartedAt: new Date().toISOString(),
    },
    working: {
      currentDifferential: [],
      pendingQuestions: [],
      answeredQuestions: [],
      candidateDispositions: [],
      currentAgent: "triage",
      step: 0,
      estimatedTokens: 0,
    },
    artifacts: [],
    traceRefId: "s3://auralyn-audit/2026/05/16/enc_2026_05_16_abc123/trace.jsonl",
  };
}

async function runEncounter() {
  // ─── Setup ────────────────────────────────────────────────────────────
  const ctx = startEncounter();
  const manager = new ClinicalContextManager(ctx);
  const bus = new AgentArtifactBus();
  const tools = buildDefaultRegistry();
  const compactor = new ContextCompactor();

  // ─── Step 1: Triage ───────────────────────────────────────────────────
  // The triage agent first runs the deterministic red-flag rule check.
  // If a red flag fires, we promote it to IMMUTABLES immediately. From
  // here on, EVERY agent's prompt will include this flag, top and bottom.
  manager.addRedFlag({
    id: "rf_acs_typical",
    description: "Typical ACS presentation: substernal pressure with arm radiation in 58yo M with cardiac risk factors",
    identifiedAt: new Date().toISOString(),
    identifiedBy: "rule_engine",
    source: "red_flag_rules:acs_typical_v3",
  });

  // Triage also publishes the symptom validation as an artifact so the
  // differential agent can use it without re-reading the intake transcript.
  const triageFinding: Artifact = {
    id: "art_finding_acs_presentation",
    type: "validated_finding",
    producedBy: "triage",
    producedAt: new Date().toISOString(),
    consumedBy: [],
    payload: {
      finding: "Substernal chest pressure radiating to left arm, 6/10, x2hr",
      positiveOrNegative: "present",
      source: "history",
    },
    provenance: { source: "patient", citation: "intake:chief_complaint" },
    estimatedTokens: 40,
  };
  bus.publish("triage", triageFinding);
  manager.recordArtifact(triageFinding);

  // ─── Step 2: Differential ─────────────────────────────────────────────
  // The differential agent receives:
  //   - Immutables (with the red flag now baked in, bookended)
  //   - Working context
  //   - ONLY the artifact types it's contracted to consume
  //   - ONLY the tools it's permitted to call
  const diffArtifacts = bus.readFor("differential");
  const diffTools = tools.toolNamesFor("differential");
  const diffPrompt = manager.assemblePromptFor(
    "differential",
    `Build a ranked differential. Consider ACS, aortic dissection, PE, GERD, ` +
      `musculoskeletal. Compute HEART score if you have enough inputs. Output ` +
      `JSON matching the DifferentialItem[] schema.`,
  );

  // Pseudocode for the model call — your existing client goes here:
  //   const response = await model.complete({
  //     system: diffPrompt.systemPrompt,
  //     user: diffPrompt.userPrompt,
  //     tools: diffTools.map(name => tools.toolsFor("differential").find(t => t.name === name)),
  //   });
  //
  //   // Parse response, then update state and emit artifacts:
  //   manager.upsertDifferentialItem({ ... });
  //   bus.publish("differential", { ...heartScoreArtifact });
  //   manager.recordArtifact(heartScoreArtifact);

  console.log(
    `[differential] prompt tokens=${diffPrompt.estimatedTokens}, ` +
      `artifacts in=${diffArtifacts.length}, tools=${diffTools.length}`,
  );

  // ─── Step N: Compaction check before disposition ──────────────────────
  // After several Q&A rounds, the working context may have grown.
  if (compactor.shouldCompact(manager.getContext())) {
    const result = compactor.compact(manager.getContext());
    manager.updateWorking(result.newWorking);
    for (const a of result.newArtifacts) {
      manager.recordArtifact(a);
      // Compaction artifacts bypass the bus's producer contract since they
      // come from the system itself, not an agent. If you want the bus to
      // see them, hydrate the bus after compaction:
      bus.hydrate(manager.getContext().artifacts);
    }
    console.log(
      `[compactor] ${result.beforeTokens} → ${result.afterTokens} tokens, ` +
        `+${result.newArtifacts.length} artifacts emitted`,
    );
  }

  // ─── Step: Disposition ────────────────────────────────────────────────
  const dispPrompt = manager.assemblePromptFor(
    "disposition",
    "Recommend disposition. The red flag in immutables means home is NOT a candidate " +
      "without explicit ACS rule-out workup. State preconditions for each candidate.",
  );

  // ─── Step: Billing (receives a much smaller, focused context) ────────
  const billingArtifacts = bus.readFor("billing");
  console.log(
    `[billing] artifacts visible=${billingArtifacts.length} (compare with total in encounter: ${
      manager.getContext().artifacts.length
    })`,
  );
  // ↑ This is the key: the billing agent sees a SUBSET of artifacts —
  // validated_finding + decision only. Not the full encounter history.
  // That's the inter-agent KV-cache-friendly, pollution-minimizing pattern.

  // ─── Audit ────────────────────────────────────────────────────────────
  // Action-space sizes per role — useful to log in CI
  console.log("Action space sizes:", tools.actionSpaceSizes());
}

// Run if invoked directly:
if (require.main === module) {
  runEncounter().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

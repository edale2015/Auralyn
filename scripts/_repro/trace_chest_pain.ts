// Repro: in-process per-stage trace of the chest_pain complaint graph.
// Usage: npx tsx scripts/_repro/trace_chest_pain.ts [path/to/case.json]
process.env.HARNESS_MODE = "1";

import { runComplaintGraph } from "../../server/services/complaintNodeRunner";
import type { CaseState } from "../../shared/agentTypes";
import * as fs from "fs";

function buildCaseState(tc: any): CaseState {
  const answers: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(tc.answers ?? {})) {
    answers[k] = typeof v === "boolean" ? (v ? "yes" : "no") : (v as any);
  }
  return {
    encounterId: `trace_${tc.id}`,
    patientId: `trace_patient_${tc.id}`,
    chiefComplaint: tc.cc_id,
    answers,
    demographics: {},
    routingState: "INTAKE_PENDING",
    redFlags: [],
    scores: {},
    events: [],
    activeClusters: [],
    diagnosisClusterIds: [],
    dispositionReasonCodes: [],
    candidateMeds: [],
    spotInterventions: [],
    careGaps: [],
    recommendedActions: [],
    questionQueue: [],
    routing: { state: "INTAKE_PENDING" },
    audit: { steps: [], events: [] },
    // synthetic universal modifiers so MODIFIERS_INTAKE has something to show
    modifiers: {
      allergies: ["penicillin"],
      meds: ["atorvastatin"],
      pmh: ["hypertension"],
      familyHistory: ["father MI age 55"],
      smoker: "former",
    },
  } as unknown as CaseState;
}

(async () => {
  const file = process.argv[2] || "tests/cases/card_chest_pain/G01_acs.json";
  const tc = JSON.parse(fs.readFileSync(file, "utf8"));
  const state = buildCaseState(tc);

  const result = await runComplaintGraph(state, tc.cc_id);

  console.log("\n================ PER-STAGE TRACE ================");
  console.log(`case=${tc.id} (${tc.label})`);
  console.log(`cc_id=${tc.cc_id}  done=${result.done}  finalNode=${result.currentNode}`);
  console.log("=================================================\n");

  console.log("---- EVENTS (engine stage log, in order) ----");
  result.events.forEach((e: any) => console.log(`  [${e.severity}] ${e.type}: ${e.message ?? ""}`));
  console.log("");

  result.nodeTraces.forEach((t, i) => {
    console.log(`--- STAGE ${i + 1}: ${t.nodeId} ---`);
    console.log(`  inputsUsed: ${JSON.stringify(t.inputsUsed)}`);
    console.log(`  ruleRefs  : ${JSON.stringify(t.ruleRefs)}`);
    if (t.confidence) console.log(`  confidence: ${t.confidence}`);
    console.log(`  outputs   : ${JSON.stringify(t.outputs)}`);
    console.log("");
  });

  const s: any = result.state;
  console.log("================ FINAL STATE ================");
  console.log(`disposition       : ${s.disposition}`);
  console.log(`redFlags          : ${JSON.stringify(s.redFlags)}`);
  console.log(`redFlagGate       : ${s.redFlagGate?.gateResult}`);
  console.log(`activeClusters    : ${JSON.stringify(s.activeClusters)}`);
  console.log(`recommendedActions: ${JSON.stringify((s.recommendedActions || []).map((a: any) => a.type))}`);
  console.log(`scores            : ${JSON.stringify(s.scores)}`);
  console.log(`caseConfidence    : ${s.caseConfidence}`);
  console.log(`routing.state     : ${s.routing?.state}`);
  console.log("=============================================\n");
})();

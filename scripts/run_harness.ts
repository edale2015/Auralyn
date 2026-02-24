import { runComplaintGraph } from "../server/services/complaintNodeRunner";
import type { CaseState } from "../shared/agentTypes";
import * as fs from "fs";
import * as path from "path";

interface TestCase {
  id: string;
  label: string;
  cc_id: string;
  answers: Record<string, string | number | boolean>;
  expect: {
    disposition: string;
    cluster: string;
    rf_must_fire: string[];
    rf_gate: string;
  };
}

interface TestResult {
  id: string;
  label: string;
  pass: boolean;
  failures: string[];
  actual: {
    disposition?: string;
    cluster?: string;
    rf_fired: string[];
    rf_gate?: string;
  };
}

function buildCaseState(tc: TestCase): CaseState {
  const answers: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(tc.answers)) {
    if (typeof v === "boolean") {
      answers[k] = v ? "yes" : "no";
    } else {
      answers[k] = v;
    }
  }

  return {
    encounterId: `harness_${tc.id}`,
    patientId: `harness_patient_${tc.id}`,
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
  } as unknown as CaseState;
}

async function runSingleTest(tc: TestCase): Promise<TestResult> {
  const state = buildCaseState(tc);
  const result = await runComplaintGraph(state, tc.cc_id);

  const failures: string[] = [];
  const s = result.state as any;

  const actualDisp = s.disposition ?? "none";
  const expectedDisp = tc.expect.disposition;
  if (actualDisp !== expectedDisp) {
    failures.push(`disposition: expected '${expectedDisp}' got '${actualDisp}'`);
  }

  const clusters: string[] = s.activeClusters ?? [];
  const topCluster = clusters.length > 0 ? clusters[0] : "UNCLASSIFIED";
  if (tc.expect.cluster !== "*" && topCluster !== tc.expect.cluster) {
    failures.push(`cluster: expected '${tc.expect.cluster}' got '${topCluster}'`);
  }

  const rfFlags = s.redFlagGate?.flagsFound ?? [];
  const firedRFs: string[] = rfFlags.map((rf: any) => rf.flagId);
  for (const expected of tc.expect.rf_must_fire) {
    if (!firedRFs.includes(expected)) {
      failures.push(`rf_must_fire: expected '${expected}' not fired. Fired: [${firedRFs.join(",")}]`);
    }
  }

  const rfGate = s.redFlagGate?.gateResult ?? "PASS";
  if (rfGate !== tc.expect.rf_gate) {
    failures.push(`rf_gate: expected '${tc.expect.rf_gate}' got '${rfGate}'`);
  }

  return {
    id: tc.id,
    label: tc.label,
    pass: failures.length === 0,
    failures,
    actual: {
      disposition: actualDisp,
      cluster: topCluster,
      rf_fired: firedRFs,
      rf_gate: rfGate,
    },
  };
}

async function main() {
  const dir = process.argv[2] || "tests/cases/pulm_cough";
  const fullDir = path.resolve(dir);

  if (!fs.existsSync(fullDir)) {
    console.error(`Directory not found: ${fullDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json")).sort();
  if (files.length === 0) {
    console.error("No test case JSON files found in", fullDir);
    process.exit(1);
  }

  console.log(`\n=== Golden Test Harness ===`);
  console.log(`Directory: ${dir}`);
  console.log(`Found ${files.length} test case(s)\n`);

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(fullDir, file), "utf-8");
    const tc: TestCase = JSON.parse(raw);

    try {
      const res = await runSingleTest(tc);
      results.push(res);

      if (res.pass) {
        passed++;
        console.log(`  PASS ${res.id} - ${res.label}`);
      } else {
        failed++;
        console.log(`  FAIL ${res.id} - ${res.label}`);
        for (const f of res.failures) {
          console.log(`      -> ${f}`);
        }
        console.log(`      actual: disp=${res.actual.disposition}, cluster=${res.actual.cluster}, rf_gate=${res.actual.rf_gate}, rf_fired=[${res.actual.rf_fired.join(",")}]`);
      }
    } catch (err: any) {
      failed++;
      console.log(`  ERROR ${tc.id} - ${tc.label}`);
      console.log(`      -> ${err.message}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total: ${files.length}  |  PASS: ${passed}  |  FAIL: ${failed}`);
  console.log(failed === 0 ? "All tests passed!" : "Some tests failed.");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Harness error:", err);
  process.exit(1);
});

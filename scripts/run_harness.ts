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
  invariantFailures: string[];
  actual: {
    disposition?: string;
    cluster?: string;
    rf_fired: string[];
    rf_gate?: string;
    answers?: Record<string, any>;
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

const SEVERITY_ORDER: Record<string, number> = { PASS: 0, ESCALATE: 1, ER_SEND: 2 };

function checkCoughInvariants(
  tc: TestCase,
  actualDisp: string,
  actualGate: string,
  actualCluster: string,
  answers: Record<string, any>,
): string[] {
  const violations: string[] = [];
  const a = answers;

  if (a["Q_COUGH_CP"] === "yes") {
    if (actualGate !== "ER_SEND" && actualGate !== "ESCALATE") {
      violations.push(`INV-1: Q_COUGH_CP=yes → gate must be ER_SEND|ESCALATE, got '${actualGate}'`);
    }
  }

  if (a["Q_COUGH_O2LOW"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`INV-2: Q_COUGH_O2LOW=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (actualGate === "ER_SEND") {
    if (actualDisp !== "er_send") {
      violations.push(`INV-3: gateResult=ER_SEND → disposition must be er_send, got '${actualDisp}'`);
    }
  }

  if (actualGate === "ESCALATE") {
    if (actualDisp !== "urgent_care") {
      violations.push(`INV-4: gateResult=ESCALATE → disposition must be urgent_care, got '${actualDisp}'`);
    }
  }

  const noDanger = a["Q_COUGH_CP"] !== "yes" && a["Q_COUGH_SOB"] !== "yes" &&
    a["Q_COUGH_HEMOP"] !== "yes" && a["Q_COUGH_O2LOW"] !== "yes";
  const dur = Number(a["Q_COUGH_DUR"]) || 0;

  if (dur > 0 && dur <= 7 && noDanger && a["Q_COUGH_FEVER"] !== "yes" &&
    a["Q_COUGH_ASTHMA"] !== "yes" && a["Q_COUGH_COPD"] !== "yes" &&
    a["Q_COUGH_WHEEZE"] !== "yes" && a["Q_COUGH_PND"] !== "yes" &&
    a["Q_COUGH_GERD"] !== "yes") {
    if (actualDisp !== "self_care") {
      violations.push(`INV-5: DUR<=7 + all danger false + no specific findings → disposition must be self_care, got '${actualDisp}'`);
    }
  }

  if (dur >= 8 && noDanger && a["Q_COUGH_FEVER"] !== "yes" && actualGate === "PASS") {
    if (actualDisp !== "pcp") {
      violations.push(`INV-6: DUR>=8 + no danger + no fever → disposition must be pcp, got '${actualDisp}'`);
    }
  }

  if (a["Q_COUGH_WHEEZE"] === "yes" && a["Q_COUGH_ASTHMA"] === "yes" && noDanger) {
    if (actualCluster !== "CL_PULM_ASTHMA_EXAC") {
      violations.push(`INV-7: wheeze+asthma + no danger → cluster must be CL_PULM_ASTHMA_EXAC, got '${actualCluster}'`);
    }
  }

  if (a["Q_COUGH_COPD"] === "yes" && noDanger && a["Q_COUGH_ASTHMA"] !== "yes") {
    if (actualCluster !== "CL_PULM_COPD_EXAC") {
      violations.push(`INV-8: COPD + no danger → cluster must be CL_PULM_COPD_EXAC, got '${actualCluster}'`);
    }
  }

  if (a["Q_COUGH_HEMOP"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`INV-10: hemoptysis=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  return violations;
}

async function runMonotonicityCheck(tc: TestCase): Promise<string[]> {
  const violations: string[] = [];
  const answers = { ...tc.answers };

  if (answers["Q_COUGH_O2LOW"] === "yes" || answers["Q_COUGH_O2LOW"] === true) {
    return [];
  }

  const baseState = buildCaseState(tc);
  const baseResult = await runComplaintGraph(baseState, tc.cc_id);
  const baseGate = (baseResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const escalatedTc: TestCase = {
    ...tc,
    id: `${tc.id}_mono`,
    answers: { ...answers, Q_COUGH_O2LOW: "yes" },
    expect: tc.expect,
  };
  const escalatedState = buildCaseState(escalatedTc);
  const escalatedResult = await runComplaintGraph(escalatedState, tc.cc_id);
  const escalatedGate = (escalatedResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const baseSev = SEVERITY_ORDER[baseGate] ?? 0;
  const escalatedSev = SEVERITY_ORDER[escalatedGate] ?? 0;

  if (escalatedSev < baseSev) {
    violations.push(`INV-9 MONOTONICITY: adding O2LOW should not reduce severity. base=${baseGate}(${baseSev}), escalated=${escalatedGate}(${escalatedSev})`);
  }

  return violations;
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

  let invariantFailures: string[] = [];
  if (tc.cc_id === "persistent_cough") {
    invariantFailures = checkCoughInvariants(tc, actualDisp, rfGate, topCluster, state.answers);

    const monoViolations = await runMonotonicityCheck(tc);
    invariantFailures.push(...monoViolations);
  }

  return {
    id: tc.id,
    label: tc.label,
    pass: failures.length === 0 && invariantFailures.length === 0,
    failures,
    invariantFailures,
    actual: {
      disposition: actualDisp,
      cluster: topCluster,
      rf_fired: firedRFs,
      rf_gate: rfGate,
      answers: state.answers,
    },
  };
}

async function runDirectory(dir: string): Promise<{ passed: number; failed: number; invariantViolations: number; total: number }> {
  const fullDir = path.resolve(dir);

  if (!fs.existsSync(fullDir)) {
    console.error(`Directory not found: ${fullDir}`);
    return { passed: 0, failed: 0, invariantViolations: 0, total: 0 };
  }

  const files = fs.readdirSync(fullDir).filter(f => f.endsWith(".json")).sort();
  if (files.length === 0) {
    console.log(`  (no test cases in ${dir})`);
    return { passed: 0, failed: 0, invariantViolations: 0, total: 0 };
  }

  console.log(`\n--- ${dir} (${files.length} cases) ---`);

  let passed = 0;
  let failed = 0;
  let invariantViolations = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(fullDir, file), "utf-8");
    const tc: TestCase = JSON.parse(raw);

    try {
      const res = await runSingleTest(tc);

      if (res.pass) {
        passed++;
        console.log(`  PASS ${res.id} - ${res.label}`);
      } else {
        failed++;
        console.log(`  FAIL ${res.id} - ${res.label}`);
        for (const f of res.failures) {
          console.log(`      -> ${f}`);
        }
        for (const inv of res.invariantFailures) {
          console.log(`      -> ${inv}`);
          invariantViolations++;
        }
        console.log(`      actual: disp=${res.actual.disposition}, cluster=${res.actual.cluster}, rf_gate=${res.actual.rf_gate}, rf_fired=[${res.actual.rf_fired.join(",")}]`);
      }
    } catch (err: any) {
      failed++;
      console.log(`  ERROR ${tc.id} - ${tc.label}`);
      console.log(`      -> ${err.message}`);
    }
  }

  return { passed, failed, invariantViolations, total: files.length };
}

function discoverTestDirs(root: string): string[] {
  const rootDir = path.resolve(root);
  if (!fs.existsSync(rootDir)) return [];

  const dirs: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subDir = path.join(root, entry.name);
      const hasJson = fs.readdirSync(path.resolve(subDir)).some(f => f.endsWith(".json"));
      if (hasJson) dirs.push(subDir);
    }
  }

  return dirs.sort();
}

async function main() {
  const arg = process.argv[2] || "tests/cases/pulm_cough";

  let dirs: string[];

  if (arg === "--all" || arg === "all") {
    dirs = discoverTestDirs("tests/cases");
    if (dirs.length === 0) {
      console.error("No test case directories found in tests/cases/");
      process.exit(1);
    }
  } else {
    dirs = [arg];
  }

  console.log(`\n=== Golden Test Harness ===`);
  console.log(`Directories: ${dirs.join(", ")}`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalInvariants = 0;
  let totalCases = 0;

  for (const dir of dirs) {
    const result = await runDirectory(dir);
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalInvariants += result.invariantViolations;
    totalCases += result.total;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Directories: ${dirs.length}  |  Total: ${totalCases}  |  PASS: ${totalPassed}  |  FAIL: ${totalFailed}`);
  if (totalInvariants > 0) {
    console.log(`Invariant violations: ${totalInvariants}`);
  }
  console.log(totalFailed === 0 ? "All tests passed!" : "Some tests failed.");

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Harness error:", err);
  process.exit(1);
});

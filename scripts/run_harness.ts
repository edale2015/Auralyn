process.env.HARNESS_MODE = "1";

import { runComplaintGraph } from "../server/services/complaintNodeRunner";
import type { CaseState } from "../shared/agentTypes";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

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

const CSV_FILES = [
  "server/data/csv/CORE_QUESTIONS.csv",
  "server/data/csv/RED_FLAG_RULES.csv",
  "server/data/csv/DISPOSITION_RULES.csv",
  "server/data/csv/OUTPUT_TEMPLATES.csv",
  "server/data/csv/SCORING_DEFS.csv",
  "server/data/csv/COMPLAINT_REGISTRY.csv",
];

function computeSheetHash(): { hash: string; tabs: string[] } {
  const hasher = crypto.createHash("sha256");
  const tabs: string[] = [];
  for (const f of CSV_FILES) {
    const full = path.resolve(f);
    if (fs.existsSync(full)) {
      hasher.update(fs.readFileSync(full));
      tabs.push(path.basename(f, ".csv"));
    }
  }
  return { hash: hasher.digest("hex").slice(0, 16), tabs };
}

let GLOBAL_SHEET_HASH = "";

function writeDeltaLog(
  caseId: string,
  ccId: string,
  gateResult: string,
  disposition: string,
  topCluster: string,
  top3: string[],
  rfIds: string[],
) {
  const logDir = path.resolve("tests/logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const line = JSON.stringify({
    case_id: caseId,
    cc_id: ccId,
    sheet_hash: GLOBAL_SHEET_HASH,
    gateResult,
    disposition,
    top_cluster: topCluster,
    top3_clusters: top3,
    triggered_rf_ids: rfIds,
    timestamp: new Date().toISOString(),
  });
  fs.appendFileSync(path.join(logDir, "harness_delta.jsonl"), line + "\n");
}

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

function checkChestPainInvariants(
  tc: TestCase,
  actualDisp: string,
  actualGate: string,
  _actualCluster: string,
  answers: Record<string, any>,
): string[] {
  const violations: string[] = [];
  const a = answers;

  if (a["Q_CP_EXERTIONAL"] === "yes" && (a["Q_CP_RADIATES"] === "yes" || a["Q_CP_DIAPHORESIS"] === "yes")) {
    if (actualGate !== "ER_SEND") {
      violations.push(`CP-INV-1: exertional+(radiates|diaphoresis) → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_CP_SYNCOPE"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`CP-INV-2: syncope=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_CP_TEARING"] === "yes" && (a["Q_CP_NEURO"] === "yes" || a["Q_CP_RADIATES"] === "yes")) {
    if (actualGate !== "ER_SEND") {
      violations.push(`CP-INV-3: tearing+(neuro|radiates) → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_CP_HTN_SYMPTOMS"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`CP-INV-4: htnSymptoms=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (actualGate === "ER_SEND" && actualDisp !== "er_send") {
    violations.push(`CP-INV-5: gate=ER_SEND → disposition must be er_send, got '${actualDisp}'`);
  }

  if (actualGate === "ESCALATE" && actualDisp !== "urgent_care") {
    violations.push(`CP-INV-6: gate=ESCALATE → disposition must be urgent_care, got '${actualDisp}'`);
  }

  return violations;
}

async function runChestPainMonotonicity(tc: TestCase): Promise<string[]> {
  if (tc.answers["Q_CP_SYNCOPE"] === "yes" || tc.answers["Q_CP_SYNCOPE"] === true) return [];

  const baseState = buildCaseState(tc);
  const baseResult = await runComplaintGraph(baseState, tc.cc_id);
  const baseGate = (baseResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const escalatedTc: TestCase = {
    ...tc, id: `${tc.id}_mono`,
    answers: { ...tc.answers, Q_CP_SYNCOPE: "yes" },
    expect: tc.expect,
  };
  const escalatedState = buildCaseState(escalatedTc);
  const escalatedResult = await runComplaintGraph(escalatedState, tc.cc_id);
  const escalatedGate = (escalatedResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const baseSev = SEVERITY_ORDER[baseGate] ?? 0;
  const escalatedSev = SEVERITY_ORDER[escalatedGate] ?? 0;

  if (escalatedSev < baseSev) {
    return [`CP-MONO: adding syncope should not reduce severity. base=${baseGate}(${baseSev}), escalated=${escalatedGate}(${escalatedSev})`];
  }
  return [];
}

function checkDizzinessInvariants(
  tc: TestCase,
  actualDisp: string,
  actualGate: string,
  _actualCluster: string,
  answers: Record<string, any>,
): string[] {
  const violations: string[] = [];
  const a = answers;

  if (a["Q_DZ_FOCAL_NEURO"] === "yes" || a["Q_DZ_FACIAL_DROOP"] === "yes" || a["Q_DZ_SPEECH"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`DZ-INV-1: focalNeuro|facialDroop|speech=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_DZ_DIPLOPIA"] === "yes" && a["Q_DZ_GAIT"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`DZ-INV-2: diplopia+gait → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_DZ_SYNCOPE"] === "yes" && a["Q_DZ_PALPITATIONS"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`DZ-INV-3: syncope+palpitations → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_DZ_HEADACHE"] === "yes" && a["Q_DZ_NECK_STIFF"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`DZ-INV-4: headache+neckStiff → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_DZ_MELENA"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`DZ-INV-5: melena=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (actualGate === "ER_SEND" && actualDisp !== "er_send") {
    violations.push(`DZ-INV-6: gate=ER_SEND → disposition must be er_send, got '${actualDisp}'`);
  }

  if (actualGate === "ESCALATE" && actualDisp !== "urgent_care") {
    violations.push(`DZ-INV-7: gate=ESCALATE → disposition must be urgent_care, got '${actualDisp}'`);
  }

  return violations;
}

async function runDizzinessMonotonicity(tc: TestCase): Promise<string[]> {
  if (tc.answers["Q_DZ_FOCAL_NEURO"] === "yes" || tc.answers["Q_DZ_FOCAL_NEURO"] === true) return [];

  const baseState = buildCaseState(tc);
  const baseResult = await runComplaintGraph(baseState, tc.cc_id);
  const baseGate = (baseResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const escalatedTc: TestCase = {
    ...tc, id: `${tc.id}_mono`,
    answers: { ...tc.answers, Q_DZ_FOCAL_NEURO: "yes" },
    expect: tc.expect,
  };
  const escalatedState = buildCaseState(escalatedTc);
  const escalatedResult = await runComplaintGraph(escalatedState, tc.cc_id);
  const escalatedGate = (escalatedResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const baseSev = SEVERITY_ORDER[baseGate] ?? 0;
  const escalatedSev = SEVERITY_ORDER[escalatedGate] ?? 0;

  if (escalatedSev < baseSev) {
    return [`DZ-MONO: adding focalNeuro should not reduce severity. base=${baseGate}(${baseSev}), escalated=${escalatedGate}(${escalatedSev})`];
  }
  return [];
}

function checkAbdPainInvariants(
  tc: TestCase,
  actualDisp: string,
  actualGate: string,
  _actualCluster: string,
  answers: Record<string, any>,
): string[] {
  const violations: string[] = [];
  const a = answers;

  if (a["Q_AP_RLQ"] === "yes" && a["Q_AP_FEVER"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`AP-INV-1: RLQ+fever → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_AP_BLOODY_STOOL"] === "yes" || a["Q_AP_HEMATEMESIS"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`AP-INV-2: bloodyStool|hematemesis → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_AP_HYPOTENSION"] === "yes" && a["Q_AP_BACK_RADIATION"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`AP-INV-3: hypotension+backRadiation → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_AP_EPIGASTRIC"] === "yes" && a["Q_AP_BACK_RADIATION"] === "yes" && a["Q_AP_VOMITING"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`AP-INV-4: epigastric+backRadiation+vomiting → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_AP_MISSED_PERIOD"] === "yes" && a["Q_AP_HYPOTENSION"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`AP-INV-5: missedPeriod+hypotension → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_AP_AFIB"] === "yes" && a["Q_AP_POSTPRANDIAL"] === "yes" && a["Q_AP_HYPOTENSION"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`AP-INV-6: afib+postprandial+hypotension → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (actualGate === "ER_SEND" && actualDisp !== "er_send") {
    violations.push(`AP-INV-7: gate=ER_SEND → disposition must be er_send, got '${actualDisp}'`);
  }

  if (actualGate === "ESCALATE" && actualDisp !== "urgent_care") {
    violations.push(`AP-INV-8: gate=ESCALATE → disposition must be urgent_care, got '${actualDisp}'`);
  }

  return violations;
}

async function runAbdPainMonotonicity(tc: TestCase): Promise<string[]> {
  if (tc.answers["Q_AP_HYPOTENSION"] === "yes" || tc.answers["Q_AP_HYPOTENSION"] === true) return [];

  const baseState = buildCaseState(tc);
  const baseResult = await runComplaintGraph(baseState, tc.cc_id);
  const baseGate = (baseResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const escalatedTc: TestCase = {
    ...tc, id: `${tc.id}_mono`,
    answers: { ...tc.answers, Q_AP_HYPOTENSION: "yes" },
    expect: tc.expect,
  };
  const escalatedState = buildCaseState(escalatedTc);
  const escalatedResult = await runComplaintGraph(escalatedState, tc.cc_id);
  const escalatedGate = (escalatedResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const baseSev = SEVERITY_ORDER[baseGate] ?? 0;
  const escalatedSev = SEVERITY_ORDER[escalatedGate] ?? 0;

  if (escalatedSev < baseSev) {
    return [`AP-MONO: adding hypotension should not reduce severity. base=${baseGate}(${baseSev}), escalated=${escalatedGate}(${escalatedSev})`];
  }
  return [];
}

function checkSinusInvariants(
  tc: TestCase,
  actualDisp: string,
  actualGate: string,
  actualCluster: string,
  answers: Record<string, any>,
): string[] {
  const violations: string[] = [];
  const a = answers;

  if (a["Q_EYE_SWELL"] === "yes" || a["Q_VISION_CHANGES"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`SIN-INV-1: Q_EYE_SWELL=yes OR Q_VISION_CHANGES=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_SINUS_HEADACHE_SEVERE"] === "yes" || a["Q_NECK_STIFF"] === "yes" || a["Q_CONFUSION"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`SIN-INV-2: Q_SINUS_HEADACHE_SEVERE|Q_NECK_STIFF|Q_CONFUSION=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (a["Q_IMMUNO"] === "yes" && a["Q_SINUS_FEVER"] === "yes") {
    if (actualGate !== "ER_SEND") {
      violations.push(`SIN-INV-3: Q_IMMUNO=yes && Q_SINUS_FEVER=yes → gate must be ER_SEND, got '${actualGate}'`);
    }
  }

  if (actualGate === "ER_SEND") {
    if (actualDisp !== "er_send") {
      violations.push(`SIN-INV-4: gate=ER_SEND → disposition must be er_send, got '${actualDisp}'`);
    }
  }

  const dangerKeys = ["Q_EYE_SWELL", "Q_VISION_CHANGES", "Q_SINUS_HEADACHE_SEVERE", "Q_NECK_STIFF", "Q_CONFUSION"];
  const anyDanger = dangerKeys.some(k => a[k] === "yes");
  const immunoFever = a["Q_IMMUNO"] === "yes" && a["Q_SINUS_FEVER"] === "yes";
  if (anyDanger || immunoFever) {
    if (actualCluster === "CL_SINUS_VIRAL") {
      violations.push(`SIN-INV-7: danger/immuno active → CL_SINUS_VIRAL must not be top-1, got '${actualCluster}'`);
    }
  }

  const dur = Number(a["Q_SINUS_DUR"]) || 0;
  const doubleWorsening = a["Q_SINUS_WORSE_AFTER_IMPROVE"] === "yes";
  const feverAndSevere = a["Q_SINUS_FEVER"] === "yes" && a["Q_SINUS_SEVERE_FACIAL"] === "yes";
  if (actualGate === "PASS" && (dur >= 10 || doubleWorsening || feverAndSevere)) {
    if (actualDisp !== "urgent_care") {
      violations.push(`SIN-INV-5: DUR>=10 or double-worsening or (fever+severe facial) without ER gate → disposition must be urgent_care, got '${actualDisp}'`);
    }
  }

  return violations;
}

async function runSinusMonotonicity(tc: TestCase): Promise<string[]> {
  const answers = { ...tc.answers };

  if (answers["Q_EYE_SWELL"] === "yes" || answers["Q_EYE_SWELL"] === true) {
    return [];
  }

  const baseState = buildCaseState(tc);
  const baseResult = await runComplaintGraph(baseState, tc.cc_id);
  const baseGate = (baseResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const escalatedTc: TestCase = {
    ...tc,
    id: `${tc.id}_mono`,
    answers: { ...answers, Q_EYE_SWELL: "yes" },
    expect: tc.expect,
  };
  const escalatedState = buildCaseState(escalatedTc);
  const escalatedResult = await runComplaintGraph(escalatedState, tc.cc_id);
  const escalatedGate = (escalatedResult.state as any).redFlagGate?.gateResult ?? "PASS";

  const baseSev = SEVERITY_ORDER[baseGate] ?? 0;
  const escalatedSev = SEVERITY_ORDER[escalatedGate] ?? 0;

  if (escalatedSev < baseSev) {
    return [`SIN-MONO: adding Q_EYE_SWELL should not reduce severity. base=${baseGate}(${baseSev}), escalated=${escalatedGate}(${escalatedSev})`];
  }
  return [];
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
  } else if (tc.cc_id === "chest_pain") {
    invariantFailures = checkChestPainInvariants(tc, actualDisp, rfGate, topCluster, state.answers);
    const monoViolations = await runChestPainMonotonicity(tc);
    invariantFailures.push(...monoViolations);
  } else if (tc.cc_id === "dizziness") {
    invariantFailures = checkDizzinessInvariants(tc, actualDisp, rfGate, topCluster, state.answers);
    const monoViolations = await runDizzinessMonotonicity(tc);
    invariantFailures.push(...monoViolations);
  } else if (tc.cc_id === "abdominal_pain") {
    invariantFailures = checkAbdPainInvariants(tc, actualDisp, rfGate, topCluster, state.answers);
    const monoViolations = await runAbdPainMonotonicity(tc);
    invariantFailures.push(...monoViolations);
  } else if (tc.cc_id === "ent_sinus_pressure") {
    invariantFailures = checkSinusInvariants(tc, actualDisp, rfGate, topCluster, state.answers);
    const monoViolations = await runSinusMonotonicity(tc);
    invariantFailures.push(...monoViolations);
  }

  const allClusters: string[] = s.activeClusters ?? [];
  const top3 = allClusters.slice(0, 3);
  writeDeltaLog(tc.id, tc.cc_id, rfGate, actualDisp, topCluster, top3, firedRFs);

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

  const { hash, tabs } = computeSheetHash();
  GLOBAL_SHEET_HASH = hash;

  console.log(`\n=== Golden Test Harness ===`);
  console.log(`sheet_hash: ${hash}`);
  console.log(`ruleset_versions: [${tabs.join(", ")}]`);
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

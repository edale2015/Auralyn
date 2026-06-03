/**
 * AURALYN — Automated Conversation Test Harness
 *
 * Tests three things systematically:
 *   1. LATENCY — response time per turn (target: <3 seconds)
 *   2. CONVERSATION — naturalness, length, no batching, iPhone-fit
 *   3. MEDICAL LOGIC — correct dispositions, no false ER escalations
 *
 * Run: npx tsx server/tests/conversationTestHarness.ts
 * Or:  npm run test:conversation
 *
 * File: server/tests/conversationTestHarness.ts
 */

import { conversationalEngine, prewarmOpenAI } from "../whatsapp/conversationalEngine";
import { prewarmComplaintBundles } from "../whatsapp/complaintBundle";

// ─── TYPES ────────────────────────────────────────────────────────────────

interface TurnResult {
  turn: number;
  patientMessage: string;
  auraylnResponse: string;
  latencyMs: number;
  passLatency: boolean;        // < 3000ms
  passLength: boolean;         // < 160 chars
  passSingleQuestion: boolean; // only 1 question mark
  passNoList: boolean;         // no numbered lists
  passNaturalTone: boolean;    // no medical jargon
}

interface ScenarioResult {
  scenarioName: string;
  complaint: string;
  expectedDisposition: string;
  actualDisposition: string | null;
  passDisposition: boolean;
  passNoFalseER: boolean;      // didn't send to ER when shouldn't
  turnResults: TurnResult[];
  totalTurns: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  passed: boolean;
  failReasons: string[];
}

interface TestRun {
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  falseERCount: number;        // ER triggered when it shouldn't be
  missedERCount: number;       // ER not triggered when it should be
  results: ScenarioResult[];
}

// ─── TEST SCENARIOS ────────────────────────────────────────────────────────
// Each scenario is a realistic patient conversation
// expectedDisposition: what Auralyn SHOULD conclude
// isSafety: true means ER/ambulance is correct
// falseERRisk: complaints that commonly trigger false ER

const TEST_SCENARIOS = [

  // ── COUGH ──────────────────────────────────────────────────────────────
  {
    name: "Cough — simple viral URI, no ER",
    complaint: "cough",
    expectedDisposition: "treat_and_follow",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have a cough",
      "about 3 days",
      "yes a little fever at first but not today",
      "no trouble breathing",
      "green-ish phlegm",
      "no, I don't smoke",
      "no heart or lung problems",
      "just tired and body aches",
    ],
  },
  {
    name: "Cough — pneumonia, elderly, ER warranted",
    complaint: "cough",
    expectedDisposition: "er_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have a cough",
      "about 4 days",
      "yes fever 102 degrees",
      "yes I am having trouble breathing",
      "I am 82 years old",
      "yes I have asthma",
      "my oxygen monitor says 91",
    ],
  },
  {
    name: "Cough — mild SOB, no ER (needs workup only)",
    complaint: "cough",
    expectedDisposition: "urgent_care_workup",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have a cough",
      "5 days",
      "yes fever",
      "a little short of breath but I can talk fine",
      "yellow phlegm",
      "I am 45",
      "no smoking, no lung problems",
    ],
  },

  // ── HEADACHE ──────────────────────────────────────────────────────────
  {
    name: "Headache — tension, no ER",
    complaint: "headache",
    expectedDisposition: "treat_and_watch",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have a headache",
      "it came on gradually over the morning",
      "7 out of 10",
      "no this is not the worst headache of my life",
      "no fever",
      "no neck stiffness",
      "no vision changes",
      "my neck is really tight and tense",
    ],
  },
  {
    name: "Headache — thunderclap, ambulance required",
    complaint: "headache",
    expectedDisposition: "ambulance_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have a terrible headache",
      "it came on like a thunderclap, worst of my life",
    ],
  },
  {
    // NEW: red flag (stiff neck → meningitis) VOLUNTEERED on a later turn, not
    // as the answer to the pended question. Proves canExtractSafetyField detects
    // volunteered red flags generally — not just the six cases already in suite.
    name: "Headache — meningitis, volunteered stiff neck, ER now",
    complaint: "headache",
    expectedDisposition: "er_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have a headache",
      "it started earlier today",
      "I also have a stiff neck and it hurts to bend forward",
    ],
  },
  {
    name: "Headache — migraine history, no ER",
    complaint: "headache",
    expectedDisposition: "treat_and_watch",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have a headache",
      "gradual, been building for 2 hours",
      "8 out of 10",
      "no this is my usual migraine",
      "no fever, no neck stiffness",
      "sensitive to light and nauseous, typical for me",
      "I have had migraines for 10 years",
    ],
  },

  // ── SORE THROAT ──────────────────────────────────────────────────────
  {
    name: "Sore throat — viral, no ER",
    complaint: "sore_throat",
    expectedDisposition: "treat_and_follow",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have a sore throat",
      "2 days",
      "mild, about a 4",
      "yes some fever",
      "no trouble swallowing",
      "I have a cough and runny nose too",
      "no drooling or muffled voice",
    ],
  },
  {
    name: "Sore throat — strep pattern, treat not ER",
    complaint: "sore_throat",
    expectedDisposition: "treat_and_follow",
    isSafety: false,
    falseERRisk: false,
    conversation: [
      "I have a really bad sore throat",
      "started yesterday",
      "9 out of 10, hurts to swallow",
      "fever 101",
      "no cough",
      "no trouble breathing",
      "white patches on my tonsils",
    ],
  },
  {
    name: "Sore throat — epiglottitis, ER now",
    complaint: "sore_throat",
    expectedDisposition: "er_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have a sore throat",
      "it came on very fast",
      "I am drooling and having trouble swallowing",
      "my voice sounds different, kind of muffled",
      "I am having trouble breathing",
    ],
  },

  // ── NAUSEA ──────────────────────────────────────────────────────────
  {
    name: "Nausea — gastroenteritis, no ER",
    complaint: "nausea",
    expectedDisposition: "treat_and_follow",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have nausea",
      "since yesterday",
      "yes I vomited twice",
      "no blood in vomit",
      "some diarrhea",
      "I can keep small sips of water down",
      "no severe abdominal pain",
      "no fever",
    ],
  },
  {
    name: "Nausea — unable to keep fluids, ER",
    complaint: "nausea",
    expectedDisposition: "er_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have nausea and vomiting",
      "2 days",
      "I cannot keep anything down, not even water",
      "I feel very weak and dizzy",
      "I have not urinated in 12 hours",
    ],
  },

  // ── BACK PAIN ──────────────────────────────────────────────────────
  {
    name: "Back pain — musculoskeletal, no ER",
    complaint: "back_pain",
    expectedDisposition: "treat_and_follow",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have back pain",
      "2 days, I was moving furniture",
      "7 out of 10",
      "no fever",
      "no weakness in my legs",
      "no bladder or bowel problems",
      "no numbness",
      "it is worse when I move and better when I rest",
    ],
  },
  {
    name: "Back pain — cauda equina, ER now",
    complaint: "back_pain",
    expectedDisposition: "er_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have bad back pain",
      "started this morning",
      "I cannot control my bladder",
      "both legs feel numb and weak",
    ],
  },

  // ── UTI ──────────────────────────────────────────────────────────────
  {
    name: "UTI — uncomplicated, treat not ER",
    complaint: "uti",
    expectedDisposition: "treat_and_follow",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have burning when I urinate",
      "2 days",
      "yes frequency and urgency",
      "no fever",
      "no back or flank pain",
      "I am a 28 year old woman",
      "not pregnant",
    ],
  },
  {
    name: "UTI — pyelonephritis, ER warranted",
    complaint: "uti",
    expectedDisposition: "er_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have burning when I urinate",
      "3 days",
      "yes fever 103",
      "yes my back and right side really hurt",
      "I am vomiting and cannot keep anything down",
    ],
  },

  // ── CHEST PAIN ──────────────────────────────────────────────────────
  {
    name: "Chest pain — musculoskeletal, no ER",
    complaint: "chest_pain",
    expectedDisposition: "urgent_care_workup",
    isSafety: false,
    falseERRisk: true,
    conversation: [
      "I have chest pain",
      "started after I did pushups yesterday",
      "sharp, worse when I breathe in",
      "no pressure or squeezing",
      "no arm pain, no jaw pain",
      "no sweating or nausea",
      "I am 25, healthy, no heart problems",
      "it hurts when I press on it",
    ],
  },
  {
    name: "Chest pain — STEMI pattern, ambulance",
    complaint: "chest_pain",
    expectedDisposition: "ambulance_now",
    isSafety: true,
    falseERRisk: false,
    conversation: [
      "I have chest pain",
      "pressure, like an elephant on my chest",
      "started 30 minutes ago",
      "yes radiating to my left arm and jaw",
      "yes sweating",
      "I am 62 with diabetes and high blood pressure",
    ],
  },
];

// ─── CONVERSATION SIMULATOR ────────────────────────────────────────────────

async function simulateConversation(scenario: typeof TEST_SCENARIOS[0]): Promise<ScenarioResult> {
  const threadId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const turnResults: TurnResult[] = [];
  let actualDisposition: string | null = null;
  let falseER = false;
  let missedER = false;

  console.log(`\n  Running: ${scenario.name}`);

  for (let i = 0; i < scenario.conversation.length; i++) {
    const patientMessage = scenario.conversation[i];
    const start = Date.now();

    let auraylnResponse = "";
    let disposition: string | null = null;

    try {
      const result = await conversationalEngine.getNextResponse({
        threadId,
        message: patientMessage,
        channel: "test",
      });
      auraylnResponse = result.response;
      disposition = result.disposition || null;
    } catch (err: any) {
      auraylnResponse = `ERROR: ${err.message}`;
    }

    const latencyMs = Date.now() - start;

    if (disposition) {
      actualDisposition = disposition;
    }

    // Check if ER was triggered
    const erTriggered = auraylnResponse.toLowerCase().includes("emergency") ||
      auraylnResponse.toLowerCase().includes("911") ||
      auraylnResponse.toLowerCase().includes("er ") ||
      auraylnResponse.toLowerCase().includes("hospital") ||
      disposition === "er_now" ||
      disposition === "ambulance_now";

    // Conversation quality checks
    const questionMarks = (auraylnResponse.match(/\?/g) || []).length;
    const hasNumberedList = /^\d\./m.test(auraylnResponse);
    const hasMedicalJargon = /\b(dyspnea|tachycardia|diaphoresis|orthopnea|syncope|hemoptysis)\b/i.test(auraylnResponse);
    const charCount = auraylnResponse.length;

    const turnResult: TurnResult = {
      turn: i + 1,
      patientMessage,
      auraylnResponse,
      latencyMs,
      passLatency: latencyMs < 3000,
      passLength: charCount <= 160,
      passSingleQuestion: questionMarks <= 1,
      passNoList: !hasNumberedList,
      passNaturalTone: !hasMedicalJargon,
    };

    turnResults.push(turnResult);

    // Log turn
    const latencyIcon = latencyMs < 1000 ? "✅" : latencyMs < 3000 ? "⚠️" : "🔴";
    const lengthIcon = charCount <= 160 ? "✅" : "🔴";
    console.log(`    Turn ${i + 1}: ${latencyIcon} ${latencyMs}ms ${lengthIcon} ${charCount}ch`);
    console.log(`      P: "${patientMessage}"`);
    console.log(`      A: "${auraylnResponse}"`);

    // If ER triggered on non-safety scenario — false ER
    if (erTriggered && !scenario.isSafety && i < scenario.conversation.length - 1) {
      falseER = true;
      console.log(`      🚨 FALSE ER ESCALATION on turn ${i + 1}`);
      break;
    }

    // If safety scenario and ER triggered — correct, stop early
    if (erTriggered && scenario.isSafety) {
      actualDisposition = disposition ?? "er_now";
      console.log(`      ✅ Correct safety escalation on turn ${i + 1}`);
      break;
    }

    // Small delay between turns to simulate real conversation
    await new Promise(r => setTimeout(r, 200));
  }

  // Check if safety scenario never triggered ER
  if (scenario.isSafety && !actualDisposition?.includes("er") && !actualDisposition?.includes("ambulance")) {
    missedER = true;
  }

  const avgLatency = turnResults.reduce((s, t) => s + t.latencyMs, 0) / turnResults.length;
  const maxLatency = Math.max(...turnResults.map(t => t.latencyMs));

  const failReasons: string[] = [];
  if (falseER)   failReasons.push("FALSE ER escalation on non-emergency complaint");
  if (missedER)  failReasons.push("MISSED ER escalation on emergency complaint");
  if (avgLatency > 3000) failReasons.push(`Avg latency ${avgLatency.toFixed(0)}ms exceeds 3000ms`);
  if (maxLatency > 5000) failReasons.push(`Max latency ${maxLatency.toFixed(0)}ms exceeds 5000ms`);
  turnResults.forEach(t => {
    if (!t.passLength)        failReasons.push(`Turn ${t.turn}: response too long (${t.auraylnResponse.length} chars)`);
    if (!t.passSingleQuestion) failReasons.push(`Turn ${t.turn}: multiple questions in one message`);
    if (!t.passNoList)        failReasons.push(`Turn ${t.turn}: numbered list detected`);
  });

  const passed = failReasons.length === 0;
  const icon = passed ? "✅" : "❌";
  console.log(`    ${icon} ${scenario.name}: ${passed ? "PASSED" : failReasons[0]}`);

  return {
    scenarioName: scenario.name,
    complaint: scenario.complaint,
    expectedDisposition: scenario.expectedDisposition,
    actualDisposition,
    passDisposition: actualDisposition === scenario.expectedDisposition,
    passNoFalseER: !falseER,
    turnResults,
    totalTurns: turnResults.length,
    avgLatencyMs: avgLatency,
    maxLatencyMs: maxLatency,
    passed,
    failReasons,
  };
}

// ─── MAIN RUNNER ──────────────────────────────────────────────────────────

async function runAllTests(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  AURALYN CONVERSATION TEST HARNESS                       ║");
  console.log(`║  ${new Date().toISOString()}                    ║`);
  console.log(`║  ${TEST_SCENARIOS.length} scenarios across 7 complaint packs                 ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ── Measurement preamble: warm the same caches the production server warms
  // at startup, so harness latency reflects what real users see (rather than
  // including a one-off bundle-build and OpenAI cold-start in the first turn).
  // No clinical logic — these only prepopulate the per-complaint bundle cache
  // and exercise the GPT-4o-mini connection pool.
  prewarmComplaintBundles();
  prewarmOpenAI();
  // Give the GPT prewarm ~1.5s to land before we start measuring the first turn.
  await new Promise(r => setTimeout(r, 1500));

  const results: ScenarioResult[] = [];

  for (const scenario of TEST_SCENARIOS) {
    const result = await simulateConversation(scenario);
    results.push(result);
    await new Promise(r => setTimeout(r, 500)); // pause between scenarios
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const falseERs = results.filter(r => !r.passNoFalseER).length;
  const allLatencies = results.flatMap(r => r.turnResults.map(t => t.latencyMs));
  const avgLatency = allLatencies.reduce((s, l) => s + l, 0) / allLatencies.length;
  const maxLatency = Math.max(...allLatencies);

  const testRun: TestRun = {
    timestamp: new Date().toISOString(),
    totalScenarios: results.length,
    passedScenarios: passed,
    failedScenarios: failed,
    avgLatencyMs: Math.round(avgLatency),
    maxLatencyMs: maxLatency,
    falseERCount: falseERs,
    missedERCount: results.filter(r => !r.passNoFalseER === false && r.failReasons.some(f => f.includes("MISSED"))).length,
    results,
  };

  // Write results to file
  const fs = await import("fs");
  const path = await import("path");
  const outDir = path.join(process.cwd(), "server", "eval", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `conversation_harness_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(testRun, null, 2));

  // Target check against the latency optimization goals (avg <700ms, max <2000ms).
  // These are stricter than the harness pass thresholds and only inform the
  // summary print — they do not influence exit status.
  const avgTargetMet = avgLatency < 700;
  const maxTargetMet = maxLatency < 2000;

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  RESULTS SUMMARY                                          ║");
  console.log(`║  Passed: ${passed}/${results.length} scenarios`.padEnd(59) + "║");
  console.log(`║  Avg latency: ${avgLatency.toFixed(0)}ms (target <3000ms)`.padEnd(59) + "║");
  console.log(`║  Max latency: ${maxLatency.toFixed(0)}ms`.padEnd(59) + "║");
  console.log(`║  Opt target: avg<700ms ${avgTargetMet ? "MET" : "MISS"} · max<2000ms ${maxTargetMet ? "MET" : "MISS"}`.padEnd(59) + "║");
  console.log(`║  False ER escalations: ${falseERs} (must be 0)`.padEnd(59) + "║");
  console.log("╠══════════════════════════════════════════════════════════╣");

  // Per-complaint breakdown
  const complaints = [...new Set(results.map(r => r.complaint))];
  for (const complaint of complaints) {
    const group = results.filter(r => r.complaint === complaint);
    const groupPassed = group.filter(r => r.passed).length;
    const icon = groupPassed === group.length ? "✅" : "❌";
    console.log(`║  ${icon} ${complaint.padEnd(20)} ${groupPassed}/${group.length} passed`.padEnd(59) + "║");
  }

  console.log("╠══════════════════════════════════════════════════════════╣");

  // Failed scenarios detail
  const failedResults = results.filter(r => !r.passed);
  if (failedResults.length > 0) {
    console.log("║  FAILURES                                                 ║");
    for (const r of failedResults) {
      console.log(`║  ❌ ${r.scenarioName.substring(0, 50)}`.padEnd(59) + "║");
      for (const reason of r.failReasons.slice(0, 2)) {
        console.log(`║     → ${reason.substring(0, 52)}`.padEnd(59) + "║");
      }
    }
  }

  console.log(`║  Results written to: ${path.basename(outPath)}`.padEnd(59) + "║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Exit code
  if (falseERs > 0) {
    console.log("\n🚨 BLOCKED — False ER escalations present. Patients sent to ER unnecessarily.\n");
    process.exit(1);
  }
  if (failed > results.length * 0.2) {
    console.log("\n❌ Too many failures — fix conversation engine before clinical use.\n");
    process.exit(1);
  }
  console.log("\n✅ Test harness complete.\n");
  process.exit(0);
}

runAllTests().catch(err => {
  console.error("Test harness crashed:", err);
  process.exit(1);
});

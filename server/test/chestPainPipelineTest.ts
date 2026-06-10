/**
 * chestPainPipelineTest.ts
 *
 * Automated end-to-end test of the full chest pain pipeline:
 *   Level 1 (HPI) → Level 2 (Secondary symptoms) → Level 3 (Modifying/PMH)
 *   → Rule engine → Differential → Workup → Disposition
 *
 * Run: npx tsx server/test/chestPainPipelineTest.ts
 *
 * Tests three patient personas:
 *   CASE A — Classic ACS presentation (high risk → ER_NOW expected)
 *   CASE B — Pleuritic/PE-risk presentation (moderate risk → urgent workup)
 *   CASE C — Musculoskeletal / low-risk presentation (PCP or self-care)
 */

import { startIntake, advanceIntake, CHEST_PAIN_INTAKE, type IntakeState } from "../whatsapp/chestPainIntake";
import { executePipeline, type PipelineResult } from "../clinical/ruleExecutionEngine";

// ── Colour helpers ─────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  blue:   "\x1b[34m",
  magenta: "\x1b[35m",
  white:  "\x1b[37m",
};
const b  = (s: string) => C.bold + s + C.reset;
const r  = (s: string) => C.red  + s + C.reset;
const g  = (s: string) => C.green + s + C.reset;
const y  = (s: string) => C.yellow + s + C.reset;
const c  = (s: string) => C.cyan  + s + C.reset;
const d  = (s: string) => C.dim   + s + C.reset;

// ── Patient persona type ──────────────────────────────────────────────────────
interface PatientPersona {
  label:   string;
  emoji:   string;
  opening: string;               // chief complaint text
  answers: Record<string, string>; // field → patient reply (in conversation order)
}

// ── Three test personas ───────────────────────────────────────────────────────

const CASE_A: PatientPersona = {
  label:   "CASE A — Classic ACS / STEMI pattern",
  emoji:   "🔴",
  opening: "I have chest pain",
  answers: {
    // Level 1: HPI
    onset:       "Started about 45 minutes ago while I was shoveling snow",
    character:   "Pressure, squeezing — like an elephant sitting on my chest",
    location:    "Center of my chest, mostly left side",
    severity:    "9",
    // Level 2: Secondary symptoms
    radiation:   "Yes, going down my left arm and up into my jaw",
    dyspnea:     "Yes, quite short of breath",
    diaphoresis: "Yes, I'm sweating a lot and feel clammy",
    nausea:      "Yes, feel like I might vomit",
    palpitations: "No",
    syncope:     "No",
    // Level 3a: Modifying factors
    exertional:  "Yes, it started during exertion",
    pleuritic:   "No, breathing doesn't change it",
    worse:       "Exertion, any movement",
    better:      "No, nothing helps",
    leg_swelling: "No",
    // Level 3b: Demographics
    age:  "62",
    sex:  "male",
    // Level 3c: PMH
    pmh_cardiac: "Yes, had a stent placed 4 years ago",
    pmh_risk:    "High blood pressure and diabetes",
    family_hx:   "Yes, my father had a heart attack at 55",
    smoking:     "Yes, I smoke a pack a day",
    // Allergies + Meds
    allergies:   "No known allergies",
    medications: "Aspirin, metformin, lisinopril",
  },
};

const CASE_B: PatientPersona = {
  label:   "CASE B — Pleuritic / PE-risk pattern",
  emoji:   "🟠",
  opening: "chest pain and trouble breathing",
  answers: {
    // Level 1: HPI
    onset:       "Started this morning suddenly while I was sitting at my desk",
    character:   "Sharp stabbing pain",
    location:    "Right side of chest",
    severity:    "6",
    // Level 2: Secondary symptoms
    radiation:   "No",
    dyspnea:     "Yes, especially when I take a deep breath",
    diaphoresis: "No",
    nausea:      "No",
    palpitations: "Yes, heart has been racing",
    syncope:     "No, but felt lightheaded",
    // Level 3a: Modifying factors
    exertional:  "No",
    pleuritic:   "Yes, much worse with deep breaths and coughing",
    worse:       "Deep breathing, coughing, and lying flat",
    better:      "Sitting forward helps a little",
    leg_swelling: "Yes, my right calf has been swollen and sore for 3 days",
    // Level 3b: Demographics
    age:  "38",
    sex:  "female",
    // Level 3c: PMH
    pmh_cardiac: "No",
    pmh_risk:    "none",
    family_hx:   "No",
    smoking:     "No",
    // Allergies + Meds
    allergies:   "Penicillin",
    medications: "Birth control pill, started 2 months ago. Had knee surgery 3 weeks ago",
  },
};

const CASE_C: PatientPersona = {
  label:   "CASE C — Musculoskeletal / low-risk pattern",
  emoji:   "🟢",
  opening: "I have chest pain",
  answers: {
    // Level 1: HPI
    onset:       "Started yesterday after I moved furniture",
    character:   "Sharp, localized",
    location:    "Left side, I can point to exactly where it hurts",
    severity:    "4",
    // Level 2: Secondary symptoms
    radiation:   "No",
    dyspnea:     "No",
    diaphoresis: "No",
    nausea:      "No",
    palpitations: "No",
    syncope:     "No",
    // Level 3a: Modifying factors
    exertional:  "No, happens at rest too",
    pleuritic:   "No",
    worse:       "When I press on my chest or twist my upper body",
    better:      "Ibuprofen helped somewhat",
    leg_swelling: "No",
    // Level 3b: Demographics
    age:  "29",
    sex:  "female",
    // Level 3c: PMH
    pmh_cardiac: "No",
    pmh_risk:    "none",
    family_hx:   "No",
    smoking:     "No",
    // Allergies + Meds
    allergies:   "No allergies",
    medications: "Ibuprofen as needed",
  },
};

// ── Pipeline input mapper (same logic as kbIntake.ts) ─────────────────────────
function mapAnswers(answers: Record<string, string>): Record<string, string | number | boolean> {
  const yn  = (v?: string) => v === "yes";
  const sev = (v?: string) => { const n = parseInt(v ?? "5", 10); return isNaN(n) ? 5 : Math.min(Math.max(n, 1), 10); };
  const has = (h: string | undefined, ...kw: string[]) => {
    if (!h) return false;
    const l = h.toLowerCase();
    return kw.some(k => l.includes(k));
  };
  const ageYears  = Math.max(0, parseInt(answers.age ?? "50", 10) || 50);
  const isFemale  = has(answers.sex, "female", "woman");
  const pmhText   = (answers.pmh_risk ?? "").toLowerCase();
  const hasHtn    = has(pmhText, "htn", "hypertension", "blood pressure", "high bp", "high blood");
  const hasDm     = has(pmhText, "diabetes", "diabetic", "dm ", "type 1", "type 2");
  const hasChol   = has(pmhText, "cholesterol", "lipid", "hyperlipid", "statin");
  const riskCount = [hasHtn, hasDm, hasChol].filter(Boolean).length;

  return {
    onset: answers.onset ?? "", character: answers.character ?? "",
    location: answers.location ?? "", severity: sev(answers.severity),
    radiation: yn(answers.radiation), radiation_arm: yn(answers.radiation),
    radiation_jaw: yn(answers.radiation), Q_CP_RADIATES: yn(answers.radiation),
    Q_CCP_RADIATE: yn(answers.radiation), CAR_Q_CP_ARM_RAD: yn(answers.radiation),
    dyspnea: yn(answers.dyspnea), Q_CP_SOB: yn(answers.dyspnea),
    Q_CCP_SOB: yn(answers.dyspnea), Q_PCT_SOB: yn(answers.dyspnea),
    diaphoresis: yn(answers.diaphoresis), Q_CP_DIAPHORESIS: yn(answers.diaphoresis),
    Q_CCP_SWEAT: yn(answers.diaphoresis), CAR_Q_CP_SWEATING: yn(answers.diaphoresis),
    nausea: yn(answers.nausea), CAR_Q_CP_NAUSEA: yn(answers.nausea),
    palpitations: yn(answers.palpitations), Q_CP_PALPITATIONS: yn(answers.palpitations),
    syncope: yn(answers.syncope), Q_CP_SYNCOPE: yn(answers.syncope),
    exertional: yn(answers.exertional), Q_CP_EXERTIONAL: yn(answers.exertional),
    Q_CCP_EXERT: yn(answers.exertional), Q_PCT_EXERT: yn(answers.exertional),
    pleuritic: yn(answers.pleuritic), pleuritic_pain: yn(answers.pleuritic),
    Q_CP_PLEURITIC: yn(answers.pleuritic), Q_CCP_PLEURITIC: yn(answers.pleuritic),
    worse: answers.worse ?? "", better: answers.better ?? "",
    leg_swelling: yn(answers.leg_swelling),
    unilateral_leg_swelling: yn(answers.leg_swelling),
    Q_CP_CALF_SWELL: yn(answers.leg_swelling), Q_CCP_LEG_SWELL: yn(answers.leg_swelling),
    ageYears, age: ageYears,
    heart_age_45_64: ageYears >= 45 && ageYears < 65,
    heart_age_ge_65: ageYears >= 65,
    CAR_Q_CP_AGE_GROUP: ageYears >= 65 ? "elderly" : ageYears >= 45 ? "middle" : "young",
    Q_CCP_ESTROGEN: isFemale,
    pmh_cardiac: yn(answers.pmh_cardiac), prior_cad: yn(answers.pmh_cardiac),
    CAR_Q_CP_PM_HX: yn(answers.pmh_cardiac), heart_history_high: yn(answers.pmh_cardiac),
    heart_history_moderate: yn(answers.pmh_cardiac), classic_acs_history: yn(answers.pmh_cardiac),
    hypertension: hasHtn, diabetes: hasDm, hyperlipidemia: hasChol,
    heart_risk_factors_1_2: riskCount >= 1 && riskCount < 3,
    heart_risk_factors_ge3: riskCount >= 3,
    Q_CCP_RISK: riskCount >= 2, Q_PCT_RISK: riskCount >= 2,
    family_hx: yn(answers.family_hx), family_hx_cad: yn(answers.family_hx),
    CAR_Q_CP_RISK_FHX: yn(answers.family_hx),
    smoking: yn(answers.smoking), CAR_Q_CP_RISK_SMOKE: yn(answers.smoking),
    smokingStatus: answers.smoking === "yes" ? "current" : "never",
    allergies: answers.allergies ?? "none",
    medications: answers.medications ?? "none",
  };
}

// ── Simulate one conversation ──────────────────────────────────────────────────
function simulateConversation(persona: PatientPersona): {
  finalAnswers: Record<string, string>;
  transcript: Array<{ section: string; q: string; a: string; field: string }>;
} {
  const { state, question: q0 } = startIntake(persona.opening);
  const transcript: Array<{ section: string; q: string; a: string; field: string }> = [];

  // Opening message
  transcript.push({
    section: "chief_complaint",
    q: "(opening complaint)",
    a: persona.opening,
    field: "chief_complaint",
  });

  // First question already sent
  let pending = q0;
  while (pending) {
    const reply  = persona.answers[pending.field] ?? "(no answer)";
    const { question: next } = advanceIntake(state, reply);
    transcript.push({
      section: pending.section,
      q: pending.text,
      a: reply,
      field: pending.field,
    });
    pending = next ?? null as any;
    if (!pending) break;
  }

  return { finalAnswers: state.answers, transcript };
}

// ── Print a conversation transcript by section ────────────────────────────────
function printTranscript(
  transcript: Array<{ section: string; q: string; a: string; field: string }>
) {
  const SECTION_LABELS: Record<string, string> = {
    chief_complaint: "Chief Complaint",
    hpi:            "Level 1 — HPI",
    secondary:      "Level 2 — Secondary Symptoms",
    modifying:      "Level 3a — Modifying Factors",
    demographics:   "Level 3b — Demographics",
    pmh:            "Level 3c — Past Medical History",
    allergies:      "Allergies",
    medications:    "Medications",
  };

  let lastSection = "";
  for (const t of transcript) {
    if (t.section !== lastSection) {
      lastSection = t.section;
      console.log(`\n  ${b(c("─── " + (SECTION_LABELS[t.section] ?? t.section) + " ───"))}`);
    }
    const shortQ = t.q.length > 60 ? t.q.slice(0, 60) + "…" : t.q;
    console.log(`  ${d("Q:")} ${shortQ}`);
    console.log(`  ${d("A:")} ${y(t.a)}  ${d("[" + t.field + "]")}`);
  }
}

// ── Print pipeline result ─────────────────────────────────────────────────────
function printPipelineResult(result: PipelineResult) {
  const dispEmoji: Record<string, string> = {
    ER_NOW: "🔴", ED_NOW: "🔴", AMBULANCE_NOW: "🔴", CALL_911: "🔴",
    URGENT_CARE: "🟠", URGENT_CARE_WORKUP: "🟠",
    PCP: "🟡", ROUTINE: "🟡", FOLLOW_UP: "🟡",
    HOME_CARE: "🟢", SELF_CARE: "🟢", OTC: "🟢",
  };
  const disp  = (result.finalDisposition ?? "unknown").toUpperCase();
  const emoji = dispEmoji[disp] ?? "🔵";

  console.log(`\n  ${b("─── Pipeline Output ───")}`);
  console.log(`  ${b("Disposition:")}    ${emoji} ${b(disp)}`);
  console.log(`  ${b("Hard stop:")}      ${result.hardStop ? r("YES — CRITICAL FLAGS HIT") : g("No")}`);
  console.log(`  ${b("Rules fired:")}    ${result.totalRulesFired}`);

  if (result.hardStop && result.hardStopReason) {
    console.log(`  ${b("Hard-stop reason:")} ${r(result.hardStopReason)}`);
  }

  if (result.criticalFlagsHit?.length) {
    console.log(`\n  ${b(r("⚠ Critical flags hit:"))} ${result.criticalFlagsHit.slice(0, 6).join(", ")}${result.criticalFlagsHit.length > 6 ? " +" + (result.criticalFlagsHit.length - 6) + " more" : ""}`);
  }

  // Differential — step 2 (initial Dx) and step 9 (refined Dx)
  const dxSteps = result.steps.filter(s => s.ruleType === "diagnosis" && (s.rulesFired?.length ?? 0) > 0);
  const allDx   = dxSteps.flatMap(s => s.rulesFired ?? []);
  const seen    = new Set<string>();
  const uniqDx  = allDx.filter(r => { if (seen.has(r.rule_name)) return false; seen.add(r.rule_name); return true; });

  if (uniqDx.length) {
    console.log(`\n  ${b("─── Differential Diagnosis ───")}`);
    uniqDx.slice(0, 6).forEach((dx, i) => {
      const marker = i === 0 ? b("► ") : "  ";
      const conf   = i === 0 ? b(dx.rule_name) : dx.rule_name;
      console.log(`  ${marker}${conf}  ${d("[" + (dx.safety_level ?? "–") + "]")}`);
    });
    if (uniqDx.length > 6) console.log(d(`  … +${uniqDx.length - 6} more diagnoses`));
  }

  // Workup — step 5
  const wkStep = result.steps.find(s => s.ruleType === "workup" && (s.rulesFired?.length ?? 0) > 0);
  if (wkStep?.rulesFired?.length) {
    console.log(`\n  ${b("─── Recommended Workup ───")}`);
    wkStep.rulesFired.slice(0, 6).forEach(w => console.log(`  • ${w.rule_name}`));
  }

  // Medications — step 6
  const rxStep = result.steps.find(s => s.ruleType === "medication" && (s.rulesFired?.length ?? 0) > 0);
  if (rxStep?.rulesFired?.length) {
    console.log(`\n  ${b("─── Medication Considerations ───")}`);
    rxStep.rulesFired.slice(0, 4).forEach(m => console.log(`  • ${m.rule_name}`));
  }

  // Red flags step 7
  const rfStep = result.steps.find(s => s.ruleType === "red_flag" && (s.rulesFired?.length ?? 0) > 0);
  if (rfStep?.rulesFired?.length) {
    console.log(`\n  ${b(r("─── Red Flags Fired ───"))}`);
    rfStep.rulesFired.slice(0, 5).forEach(rf => console.log(`  ${r("⚑")} ${rf.rule_name}`));
  }

  // Patient-facing message
  const patientMsg = buildPatientMessage(result);
  console.log(`\n  ${b("─── WhatsApp message patient receives ───")}`);
  console.log(patientMsg.split("\n").map(l => "  " + l).join("\n"));
}

function buildPatientMessage(r: PipelineResult): string {
  const dispLabel: Record<string, [string, string]> = {
    ER_NOW:        ["🔴", "Emergency — Go to the ER immediately"],
    ED_NOW:        ["🔴", "Emergency — Go to the ER immediately"],
    AMBULANCE_NOW: ["🔴", "Call 911 / Go to the ER immediately"],
    URGENT_CARE:   ["🟠", "Go to Urgent Care today"],
    URGENT_CARE_WORKUP: ["🟠", "Go to Urgent Care for workup today"],
    PCP:           ["🟡", "See your doctor this week"],
    ROUTINE:       ["🟡", "See your doctor this week"],
    HOME_CARE:     ["🟢", "Self-care at home — monitor symptoms"],
    SELF_CARE:     ["🟢", "Self-care at home — monitor symptoms"],
  };
  const disp = (r.finalDisposition ?? "URGENT_CARE").toUpperCase();
  const [emoji, label] = dispLabel[disp] ?? ["🔵", disp];
  const lines = [
    "✅ *Assessment complete*",
    "",
    `${emoji} *${label}*`,
  ];
  const dxStep = r.steps.find(s => s.ruleType === "diagnosis" && (s.rulesFired?.length ?? 0) > 0);
  const topDx  = dxStep?.rulesFired?.[0]?.rule_name;
  if (topDx) lines.push(`📋 Top finding: ${topDx}`);
  const conf = r.hardStop ? "HIGH" : r.totalRulesFired >= 8 ? "MODERATE" : "LOW";
  lines.push(`📊 Confidence: ${conf}`);
  if (r.hardStop && r.hardStopReason) {
    lines.push("", `🚨 *Critical alert: ${r.hardStopReason.split(":")[0].trim()}*`);
    lines.push("_Seek emergency care immediately._");
  }
  lines.push("", `🧠 *${r.totalRulesFired} clinical rules evaluated*`);
  lines.push("", "_AI-assisted only — not a substitute for physician evaluation._");
  return lines.join("\n");
}

// ── Run all test cases ─────────────────────────────────────────────────────────
async function runAll() {
  const cases = [CASE_A, CASE_B, CASE_C];
  const totalQuestions = CHEST_PAIN_INTAKE.length + 1; // +1 for opening complaint

  const sectionCounts: Record<string, number> = {};
  for (const q of CHEST_PAIN_INTAKE) {
    sectionCounts[q.section] = (sectionCounts[q.section] ?? 0) + 1;
  }

  console.log("\n" + b("═".repeat(72)));
  console.log(b("  CHEST PAIN PIPELINE — AUTOMATED END-TO-END TEST"));
  console.log(b("═".repeat(72)));
  console.log(`\n  Total questions per conversation: ${b(String(totalQuestions))}`);
  console.log(`  By section:`);
  for (const [sec, cnt] of Object.entries(sectionCounts)) {
    console.log(`    ${sec.padEnd(20)} ${cnt} question${cnt > 1 ? "s" : ""}`);
  }

  const results: { label: string; disp: string; hardStop: boolean; rules: number }[] = [];

  for (const persona of cases) {
    console.log("\n\n" + b("─".repeat(72)));
    console.log(b(`  ${persona.emoji}  ${persona.label}`));
    console.log(b("─".repeat(72)));

    // Step 1: Simulate conversation
    console.log(`\n${b(c("STEP 1 — CONVERSATION (all 3 question levels)"))}`);
    const { finalAnswers, transcript } = simulateConversation(persona);
    printTranscript(transcript);
    console.log(`\n  ${d("Total turns: " + transcript.length)}`);

    // Step 2: Show collected answers
    console.log(`\n${b(c("STEP 2 — COLLECTED ANSWERS"))}`);
    for (const [k, v] of Object.entries(finalAnswers)) {
      console.log(`  ${k.padEnd(20)} ${y(v)}`);
    }

    // Step 3: Map to pipeline inputs
    console.log(`\n${b(c("STEP 3 — MAP TO RULE-ENGINE INPUTS"))}`);
    const inputs = mapAnswers(finalAnswers);
    const truthy = Object.entries(inputs).filter(([, v]) => v === true);
    const numeric = Object.entries(inputs).filter(([, v]) => typeof v === "number");
    console.log(`  Boolean flags set (true): ${truthy.map(([k]) => k).join(", ")}`);
    for (const [k, v] of numeric) {
      console.log(`  ${k} = ${v}`);
    }

    // Step 4: Run pipeline
    console.log(`\n${b(c("STEP 4 — RULE ENGINE (13-step pipeline)"))}`);
    console.log(d("  Running executePipeline(\"chest_pain\", inputs) …"));
    const t0 = Date.now();
    const result = await executePipeline("chest_pain", inputs);
    const ms = Date.now() - t0;
    console.log(d(`  Completed in ${ms}ms`));

    // Step 5: Print result
    console.log(`\n${b(c("STEP 5 — CLINICAL OUTPUT"))}`);
    printPipelineResult(result);

    results.push({
      label: persona.label,
      disp:  result.finalDisposition ?? "?",
      hardStop: result.hardStop,
      rules: result.totalRulesFired,
    });
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log("\n\n" + b("═".repeat(72)));
  console.log(b("  SUMMARY"));
  console.log(b("═".repeat(72)));
  console.log(`\n  ${"Case".padEnd(50)} ${"Disposition".padEnd(20)} ${"HardStop".padEnd(10)} Rules`);
  console.log("  " + "─".repeat(70));
  for (const row of results) {
    const dispColor = row.hardStop
      ? (s: string) => C.bold + C.red + s + C.reset
      : row.disp.includes("URGENT") ? (s: string) => C.yellow + s + C.reset
      : row.disp.includes("PCP") || row.disp.includes("HOME") || row.disp.includes("SELF")
        ? (s: string) => C.green + s + C.reset
      : (s: string) => s;
    const stopTxt = row.hardStop ? r("YES") : g("no");
    console.log(`  ${row.label.padEnd(50)} ${dispColor(row.disp.padEnd(20))} ${stopTxt.padEnd(19)} ${row.rules}`);
  }
  console.log("");

  const allPassed = results[0]?.hardStop === true && (results[1]?.rules ?? 0) > 50 && !results[2]?.hardStop;
  if (allPassed) {
    console.log(g(b("  ✅ All pipeline segments completed successfully.")));
  } else {
    console.log(y(b("  ⚠  Review results — some cases may need rule tuning.")));
  }
  console.log("");
}

runAll()
  .then(() => process.exit(0))
  .catch(e => { console.error(r("\nFATAL: " + e.message)); console.error(e.stack); process.exit(1); });

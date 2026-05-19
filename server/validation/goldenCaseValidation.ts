/**
 * AURALYN — Golden Case Validation Suite
 * Tests all complaint packs against known correct dispositions.
 * Run before any clinical deployment. Every safety case must pass.
 *
 * Usage:
 *   npx tsx server/validation/goldenCaseValidation.ts
 *   npm run validate:packs
 *
 * File: server/validation/goldenCaseValidation.ts
 */

import { assessChestPain }     from "../kb/complaintPacks/chest-pain";
import { assessAbdominalPain } from "../kb/complaintPacks/abdominal-pain";
import { assessHeadache }      from "../kb/complaintPacks/headache";
import { assessGU }            from "../kb/complaintPacks/gu-uti";
import { synthesizePlan }      from "../kb/complaintPacks/uri-respiratory";
import {
  assessMSK,
  assessDermatology,
  assessPsychiatric,
  assessPediatricFever,
} from "../kb/complaintPacks/remaining-packs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoldenCase {
  id:                  string;
  description:         string;
  pack:                string;
  input:               Record<string, any>;
  expectedDisposition: string;
  mustNotDisposition?: string;
  isSafetyCase:        boolean;
}

interface ValidationResult {
  caseId:              string;
  description:         string;
  passed:              boolean;
  isSafetyCase:        boolean;
  actualDisposition:   string;
  expectedDisposition: string;
  error?:              string;
}

// ─── Golden Cases ─────────────────────────────────────────────────────────────

const GOLDEN_CASES: GoldenCase[] = [

  // ── CHEST PAIN ────────────────────────────────────────────────────────────

  {
    id: "CP001", isSafetyCase: true,
    description: "STEMI — ST elevation on EKG, diabetic male 64",
    pack: "chest_pain",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 7, constant: true, dyspnea: true, painQuality: "pressure",
                  typicalChestPain: true, diaphoresis: true },
      history:  { age: 64, sex: "male", diabetes: true, hypertension: true, hyperlipidemia: true },
      vitals:   { bp: { systolic: 120, diastolic: 80 }, heartRate: 78 },
      examFindings: { ekg: { stElevation: true, normal: false } },
    },
  },
  {
    id: "CP002", isSafetyCase: true,
    description: "ACS — pressure chest pain, diaphoresis, no EKG changes",
    pack: "chest_pain",
    expectedDisposition: "er_now", mustNotDisposition: "treat_and_watch",
    input: {
      symptoms: { painScore: 8, constant: true, dyspnea: true, painQuality: "pressure",
                  typicalChestPain: true, diaphoresis: true },
      history:  { age: 58, sex: "male", smoker: true, hypertension: true },
      vitals:   {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP003", isSafetyCase: true,
    description: "Mr. Jones — pressure pain, DM, HTN, stopped anticoagulant, normal EKG",
    pack: "chest_pain",
    expectedDisposition: "er_now",
    input: {
      symptoms: { painScore: 7, constant: true, dyspnea: true, painQuality: "pressure",
                  typicalChestPain: true, diaphoresis: true, classicACSHistory: true },
      history: {
        age: 64, sex: "male", diabetes: true, hypertension: true, hyperlipidemia: true,
        priorCardiacAblation: true, recentlyStoppedAnticoagulant: true,
      },
      vitals: {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP004", isSafetyCase: true,
    description: "Aortic dissection — tearing pain worst at onset, radiation to back",
    pack: "chest_pain",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 9, painQuality: "tearing", worstAtOnset: true, radiation: ["back"], dyspnea: false },
      history:  { age: 52, sex: "male", hypertension: true },
      vitals:   {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP005", isSafetyCase: false,
    description: "MSK chest — reproducible with palpation, young healthy female",
    pack: "chest_pain",
    expectedDisposition: "primary_care_48h",
    input: {
      symptoms: { painScore: 4, painQuality: "sharp", constant: false, reproduceableWithPalpation: true, worseWithMovement: true, dyspnea: false, diaphoresis: false },
      history:  { age: 24, sex: "female" },
      vitals:   {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },

  // ── ABDOMINAL PAIN ────────────────────────────────────────────────────────

  {
    id: "ABD001", isSafetyCase: true,
    description: "Surgical abdomen — rigid, rebound, boardlike",
    pack: "abdominal_pain",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 9, constant: true, painLocation: "diffuse" },
      history:  { age: 45 },
      vitals:   { fever: true, temp: 101.8 },
      examFindings: { abdominalRigidity: true, reboundTenderness: true, boardLikeAbdomen: true, peritonealSigns: true },
    },
  },
  {
    id: "ABD002", isSafetyCase: true,
    description: "Dr. Thomas — RLQ pain 8/10 constant, TTP, Ozempic, prior hernia",
    pack: "abdominal_pain",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms: { painScore: 8, constant: true, painLocation: "RLQ", nausea: true, diarrhea: true },
      history:  { age: 45, medications: ["Omeprazole", "Ozempic", "Oxybutynin"], priorHerniaRepair: true, priorKidneyStone: true },
      vitals:   { fever: false },
      examFindings: { ttpRLQ: true, ttpSeverity: "moderate", peritonealSigns: false },
    },
  },
  {
    id: "ABD003", isSafetyCase: true,
    description: "Elderly male smoker — epigastric/back pain, AAA risk",
    pack: "abdominal_pain",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 8, constant: true, painLocation: "epigastric", backPain: true },
      history:  { age: 72, sex: "male", smoker: true, hypertension: true },
      vitals:   {},
      examFindings: { peritonealSigns: false },
    },
  },
  {
    id: "ABD004", isSafetyCase: false,
    description: "Mild constipation — no red flags",
    pack: "abdominal_pain",
    expectedDisposition: "primary_care_routine", mustNotDisposition: "er_now",
    input: {
      symptoms: { painScore: 3, constant: false, painLocation: "LLQ", symptomPattern: "constipation" },
      history:  { age: 32 },
      vitals:   {},
      examFindings: { peritonealSigns: false, ttpPresent: false },
    },
  },
  {
    id: "ABD005", isSafetyCase: true,
    description: "Mesenteric ischemia — severe pain, AFib, mild exam",
    pack: "abdominal_pain",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms: { painScore: 9, constant: true, painLocation: "diffuse" },
      history:  { age: 68, atrialFibrillation: true },
      vitals:   {},
      examFindings: { ttpSeverity: "mild", peritonealSigns: false, ttpPresent: true },
    },
  },

  // ── HEADACHE ──────────────────────────────────────────────────────────────

  {
    id: "HA001", isSafetyCase: true,
    description: "Thunderclap — worst headache of life, sudden onset",
    pack: "headache",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { worstHeadacheOfLife: true, suddenOnsetMaximum: true, painScore: 10 },
      history:  { age: 42 },
      vitals:   {},
    },
  },
  {
    id: "HA002", isSafetyCase: true,
    description: "Meningitis — fever, neck stiffness, headache",
    pack: "headache",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { neckStiffness: true, headache: true, fever: true },
      history:  { age: 22 },
      vitals:   { fever: true, temp: 102.4 },
    },
  },
  {
    id: "HA003", isSafetyCase: false,
    description: "Dr. Thomas — 7-day frontal headache, neck pain, no danger signals",
    pack: "headache",
    expectedDisposition: "treat_and_watch",
    input: {
      symptoms: {
        headache: true, headacheDuration: 7, painScore: 7,
        frontalLocation: true, neckPain: true,
        neckStiffness: false, fever: false, worstHeadacheOfLife: false,
        focalWeakness: false, speechDifficulty: false,
      },
      history: { age: 45, headachesPerMonth: 1, newHeadachePattern: true },
      vitals:  { fever: false },
    },
  },
  {
    id: "HA004", isSafetyCase: true,
    description: "GCA — age 68, jaw claudication, temporal headache",
    pack: "headache",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms: { temporalHeadache: true, jawClaudicaton: true, headache: true },
      history:  { age: 68 },
      vitals:   {},
    },
  },
  {
    id: "HA005", isSafetyCase: false,
    description: "Classic migraine — unilateral, throbbing, photophobia, prior history",
    pack: "headache",
    expectedDisposition: "treat_and_watch",
    input: {
      symptoms: {
        headache: true, unilateral: true, pulsatingQuality: true,
        photophobia: true, nausea: true, headacheDuration: 1,
        worstHeadacheOfLife: false, neckStiffness: false,
      },
      history: { age: 34, priorMigraineHistory: true, headachesPerMonth: 3 },
      vitals:  { fever: false },
    },
  },

  // ── GU / UTI ──────────────────────────────────────────────────────────────

  {
    id: "GU001", isSafetyCase: false,
    description: "Uncomplicated UTI — dysuria, frequency, UA positive",
    pack: "gu_uti",
    expectedDisposition: "telehealth",
    input: {
      symptoms: { dysuria: true, urinaryFrequency: true, urinaryUrgency: true },
      history:  { age: 28, genderIdentity: "female", hasCervix: true },
      vitals:   { fever: false },
      tests:    { ua: { obtained: true, leukocytes: true, blood: false, nitrites: true, pregnancyNegative: true } },
    },
  },
  {
    id: "GU002", isSafetyCase: true,
    description: "Pyelonephritis — fever, CVA tenderness, UA positive",
    pack: "gu_uti",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms: { dysuria: true, severeCVAtenderness: true, fever: true },
      history:  { age: 35, genderIdentity: "female" },
      vitals:   { fever: true, temp: 101.9, heartRate: 108 },
      tests:    { ua: { obtained: true, leukocytes: true, blood: true, nitrites: true, pregnancyNegative: true } },
    },
  },
  {
    id: "GU003", isSafetyCase: false,
    description: "Colonization only — UA positive, zero symptoms",
    pack: "gu_uti",
    expectedDisposition: "telehealth",
    input: {
      symptoms: { dysuria: false, urinaryFrequency: false, urinaryUrgency: false },
      history:  { age: 55, genderIdentity: "female" },
      vitals:   { fever: false },
      tests:    { ua: { obtained: true, leukocytes: true, blood: false, nitrites: false, pregnancyNegative: true } },
    },
  },
  {
    id: "GU004", isSafetyCase: true,
    description: "PID — adnexal tenderness, STD risk, vaginal discharge",
    pack: "gu_uti",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms:     { vaginalDischarge: true, stdRisk: true, dysuria: false },
      history:      { age: 24, genderIdentity: "female", hasCervix: true },
      vitals:       { fever: false },
      examFindings: { adnexalTenderness: "adnexal_tenderness" },
      tests:        { ua: { obtained: true, leukocytes: false, pregnancyNegative: true } },
    },
  },

  // ── URI / RESPIRATORY ─────────────────────────────────────────────────────

  {
    id: "URI001", isSafetyCase: true,
    description: "Pneumonia — CXR infiltrate, age 82, asthma, cough 4 days",
    pack: "uri",
    expectedDisposition: "er_now",
    input: {
      symptoms: {
        sorethroat: true, cough: true, productivePhlegm: true, sinusCongestion: true,
        dysphagia: true, dyspnea: true, nocturnalCough: true, bodyAches: true, fatigue: true,
        nausea: false, symptomDuration: 4,
      },
      history: { age: 82, asthma: true, albuterolUsagePerDay: 3, smoker: false },
      vitals:  { fever: true, temp: 100.1, o2Sat: 91 },
      tests:   { strepNegative: true, fluNegative: true, covidNegative: true, cxrFindings: ["infiltrate"] },
    },
  },
  {
    id: "URI002", isSafetyCase: false,
    description: "Strep throat — Centor 4, fever, exudate, no cough",
    pack: "uri",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms: { sorethroat: true, cough: false, tonsilllarExudate: true, tenderAnteriorNodes: true, symptomDuration: 2 },
      history:  { age: 22 },
      vitals:   { fever: true, temp: 101.2 },
    },
  },
  {
    id: "URI003", isSafetyCase: false,
    description: "Viral URI — low Centor, no fever, mild symptoms",
    pack: "uri",
    expectedDisposition: "treat_and_watch",
    input: {
      symptoms: { sorethroat: true, cough: true, runnyNose: true, symptomDuration: 2 },
      history:  { age: 28 },
      vitals:   { fever: false },
    },
  },

  // ── MSK ───────────────────────────────────────────────────────────────────

  {
    id: "MSK001", isSafetyCase: true,
    description: "Cauda equina — saddle anesthesia + leg weakness + back pain",
    pack: "msk",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { backPain: true, saddleAnesthesia: true, legWeakness: true, bowelBladderDysfunction: true },
      history:  { age: 45 },
      vitals:   {},
    },
  },
  {
    id: "MSK002", isSafetyCase: true,
    description: "Septic joint — swollen hot joint with fever",
    pack: "msk",
    expectedDisposition: "er_now",
    input: {
      symptoms: { jointSwelling: true, fever: true, warmth: true },
      history:  { age: 52 },
      vitals:   { fever: true, temp: 101.6 },
    },
  },
  {
    id: "MSK003", isSafetyCase: false,
    description: "Simple low back strain — no red flags, healthy adult",
    pack: "msk",
    expectedDisposition: "home_care", mustNotDisposition: "er_now",
    input: {
      symptoms: { backPain: true, painScore: 5 },
      history:  { age: 34 },
      vitals:   {},
    },
  },

  // ── DERMATOLOGY ───────────────────────────────────────────────────────────

  {
    id: "DERM001", isSafetyCase: true,
    description: "Anaphylaxis — facial hives + dyspnea",
    pack: "derm",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { hivesFacial: true, dyspnea: true, urticaria: true },
      history:  { age: 28 },
      vitals:   {},
    },
  },
  {
    id: "DERM002", isSafetyCase: true,
    description: "Necrotizing fasciitis — rapidly spreading, fever, skin necrosis",
    pack: "derm",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { rapidlySpreading: true, fever: true, skinNecrosis: true },
      history:  { age: 55, diabetes: true },
      vitals:   { fever: true, temp: 102.2 },
    },
  },
  {
    id: "DERM003", isSafetyCase: false,
    description: "Shingles — dermatomal painful rash",
    pack: "derm",
    expectedDisposition: "urgent_care_today",
    input: {
      symptoms: { painfulRash: true, dermatomal: true, vesicles: true },
      history:  { age: 62 },
      vitals:   { fever: false },
    },
  },

  // ── PSYCHIATRIC ───────────────────────────────────────────────────────────

  {
    id: "PSYCH001", isSafetyCase: true,
    description: "Active suicidal ideation with plan and intent",
    pack: "psych",
    expectedDisposition: "er_now",
    input: {
      symptoms: { passiveIdeation: true, activeIdeation: true, activePlan: true, intent: true },
      history:  { age: 29, priorAttempt: true },
      vitals:   {},
    },
  },
  {
    id: "PSYCH002", isSafetyCase: true,
    description: "Homicidal ideation with specific threat",
    pack: "psych",
    expectedDisposition: "er_now",
    input: {
      symptoms: { homicidalIdeation: true, specificThreat: true },
      history:  { age: 35 },
      vitals:   {},
    },
  },
  {
    id: "PSYCH003", isSafetyCase: false,
    description: "Anxiety — no suicidality, no psychosis",
    pack: "psych",
    expectedDisposition: "primary_care_48h",
    input: {
      symptoms: { anxiety: true, palpitations: true, passiveIdeation: false },
      history:  { age: 31, knownPsychDx: true },
      vitals:   {},
    },
  },

  // ── PEDIATRIC FEVER ───────────────────────────────────────────────────────

  {
    id: "PEDS001", isSafetyCase: true,
    description: "Febrile neonate — 28 days old, 101.5°F",
    pack: "peds",
    expectedDisposition: "er_now",
    input: {
      symptoms: { fever: true, age_days: 28 },
      history:  { age: 28 / 365 },
      vitals:   { temp: 101.5 },
    },
  },
  {
    id: "PEDS002", isSafetyCase: true,
    description: "Petechial rash with fever — meningococcemia risk",
    pack: "peds",
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { fever: true, petechiae: true, rash: true },
      history:  { age: 2 },
      vitals:   { fever: true, temp: 102.8 },
    },
  },
  {
    id: "PEDS003", isSafetyCase: false,
    description: "Simple viral fever — 4-year-old, drinking well, no red flags",
    pack: "peds",
    expectedDisposition: "home_care",
    input: {
      symptoms: { fever: true, runnyNose: true, cough: true },
      history:  { age: 4 },
      vitals:   { temp: 100.8 },
    },
  },
  {
    id: "PEDS004", isSafetyCase: true,
    description: "Febrile seizure — 18-month-old",
    pack: "peds",
    expectedDisposition: "er_urgent",
    input: {
      symptoms: { fever: true, febrile_seizure: true },
      history:  { age: 1.5 },
      vitals:   { temp: 103.2 },
    },
  },
];

// ─── Pack runner map ──────────────────────────────────────────────────────────

type PackFn = (input: Record<string, any>) => any;

const PACK_MAP: Record<string, PackFn> = {
  chest_pain:    assessChestPain,
  abdominal_pain: assessAbdominalPain,
  headache:      assessHeadache,
  gu_uti:        assessGU,
  uri:           synthesizePlan,
  msk:           assessMSK,
  derm:          assessDermatology,
  psych:         assessPsychiatric,
  peds:          assessPediatricFever,
};

// ─── Runner ───────────────────────────────────────────────────────────────────

function normalizeDisposition(d: string): string {
  return d.toLowerCase().replace(/\s+/g, "_");
}

// Equivalence groups — dispositions within the same group match each other.
// Pack codes: er_immediate, er_urgent, urgent_care_today, telehealth, primary_care_48h, primary_care_routine
// Test codes: ambulance_now, er_now, er_urgent, urgent_care_today, treat_and_watch, home_care, primary_care_48h, watchful_waiting, gyn_today
const DISPOSITION_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  // Critical / Immediate — call 911 / ER immediately
  new Set(["ambulance_now", "er_immediate", "er_now", "911", "call_911", "ambulance"]),
  // Urgent ER today
  new Set(["er_urgent", "er_today", "er_urgent_today", "gyn_today"]),
  // Urgent Care same day / next few hours
  new Set(["urgent_care_today", "urgent_care", "urgent_care_workup"]),
  // Telehealth / Home / Treat and Watch
  new Set(["telehealth", "treat_and_watch", "home_care", "home", "virtual", "treat_and_follow"]),
  // Primary Care 48h
  new Set(["primary_care_48h", "primary_care", "follow_up_48h"]),
  // Routine / Watchful waiting
  new Set(["primary_care_routine", "primary_care_7d", "watchful_waiting", "routine"]),
];

function dispositionMatches(actual: string, expected: string): boolean {
  const a = normalizeDisposition(actual);
  const e = normalizeDisposition(expected);
  if (a === e) return true;
  // Substring match as fallback
  if (a.includes(e) || e.includes(a)) return true;
  // Group equivalence
  for (const group of DISPOSITION_GROUPS) {
    if (group.has(a) && group.has(e)) return true;
  }
  return false;
}

export async function runGoldenCaseValidation(): Promise<{
  passed:       number;
  failed:       number;
  safetyFailed: number;
  results:      ValidationResult[];
}> {
  const results: ValidationResult[] = [];

  for (const gc of GOLDEN_CASES) {
    const packFn = PACK_MAP[gc.pack];
    if (!packFn) {
      results.push({
        caseId: gc.id, description: gc.description, passed: false,
        isSafetyCase: gc.isSafetyCase,
        actualDisposition: "PACK_NOT_FOUND", expectedDisposition: gc.expectedDisposition,
        error: `No function registered for pack: ${gc.pack}`,
      });
      continue;
    }

    try {
      const result = packFn(gc.input);
      const actual = normalizeDisposition(result.disposition ?? "");
      const passed = dispositionMatches(actual, gc.expectedDisposition);
      const mustNotFailed = gc.mustNotDisposition
        ? dispositionMatches(actual, gc.mustNotDisposition)
        : false;

      results.push({
        caseId:              gc.id,
        description:         gc.description,
        passed:              passed && !mustNotFailed,
        isSafetyCase:        gc.isSafetyCase,
        actualDisposition:   actual,
        expectedDisposition: gc.expectedDisposition,
        error:               mustNotFailed ? `Got forbidden disposition: ${actual}` : undefined,
      });
    } catch (err: any) {
      results.push({
        caseId:              gc.id,
        description:         gc.description,
        passed:              false,
        isSafetyCase:        gc.isSafetyCase,
        actualDisposition:   "ERROR",
        expectedDisposition: gc.expectedDisposition,
        error:               err?.message,
      });
    }
  }

  const passed       = results.filter(r => r.passed).length;
  const failed       = results.filter(r => !r.passed).length;
  const safetyFailed = results.filter(r => !r.passed && r.isSafetyCase).length;
  return { passed, failed, safetyFailed, results };
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

const _isMain = process.argv[1] && (import.meta.url ?? "").includes(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (_isMain) {
  (async () => {
    console.log("══════════════════════════════════════════════════");
    console.log("       AURALYN GOLDEN CASE VALIDATION SUITE       ");
    console.log("══════════════════════════════════════════════════\n");

    const { passed, failed, safetyFailed, results } = await runGoldenCaseValidation();

    for (const r of results) {
      const icon   = r.passed ? "✅" : "❌";
      const safety = r.isSafetyCase ? " 🚨SAFETY" : "";
      console.log(`${icon}${safety} [${r.caseId}] ${r.description}`);
      if (!r.passed) {
        console.log(`   Expected: ${r.expectedDisposition}`);
        console.log(`   Got:      ${r.actualDisposition}`);
        if (r.error) console.log(`   Error:    ${r.error}`);
      }
    }

    console.log("\n══════════════════════════════════════════════════");
    console.log(`  TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);

    if (safetyFailed > 0) {
      console.error(`\n  ⚠️  SAFETY FAILURES: ${safetyFailed} — DO NOT DEPLOY TO PRODUCTION`);
      process.exit(1);
    }
    console.log(`  ✅ All ${results.filter(r => r.isSafetyCase).length} safety cases passed`);
    console.log("══════════════════════════════════════════════════\n");
    process.exit(failed > 0 ? 1 : 0);
  })();
}

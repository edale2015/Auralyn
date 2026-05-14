/**
 * AURALYN — Golden Case Validation Suite
 * Tests all 5 complaint packs against known correct dispositions.
 * Run before any clinical deployment. Every case must pass.
 *
 * Usage:
 *   npx tsx server/validation/goldenCaseValidation.ts
 *   npm run validate:packs
 *
 * File: server/validation/goldenCaseValidation.ts
 */

import { assessChestPain } from "../kb/complaintPacks/chest-pain";
import { assessAbdominalPain } from "../kb/complaintPacks/abdominal-pain";
import { assessHeadache } from "../kb/complaintPacks/headache";
import { assessGU } from "../kb/complaintPacks/gu-uti";
import { synthesizePlan } from "../kb/complaintPacks/uri-respiratory";

// ─── GOLDEN CASES ────────────────────────────────────────────────────────

interface GoldenCase {
  id: string;
  description: string;
  pack: string;
  input: any;
  expectedDisposition: string;
  mustNotDisposition?: string;   // disposition that would be dangerous
  isSafetyCase: boolean;         // failure here is never acceptable
}

const GOLDEN_CASES: GoldenCase[] = [

  // ── CHEST PAIN CASES ──────────────────────────────────────────────────

  {
    id: "CP001",
    description: "STEMI — ST elevation on EKG, diabetic male 64",
    pack: "chest_pain",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 7, constant: true, dyspnea: true, painQuality: "pressure", diaphoresis: false },
      history: { age: 64, sex: "male", diabetes: true, hypertension: true, hyperlipidemia: true },
      vitals: { bp: { systolic: 120, diastolic: 80 }, heartRate: 78 },
      examFindings: { ekg: { stElevation: true, normal: false } },
    },
  },
  {
    id: "CP002",
    description: "ACS concern — pressure chest pain, diaphoresis, no EKG changes",
    pack: "chest_pain",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    mustNotDisposition: "treat_and_watch",
    input: {
      symptoms: { painScore: 8, constant: true, dyspnea: true, painQuality: "pressure", diaphoresis: true },
      history: { age: 58, sex: "male", smoker: true, hypertension: true },
      vitals: {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP003",
    description: "Mr. Jones — pressure pain, DM, HTN, stopped anticoagulant, normal EKG",
    pack: "chest_pain",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    input: {
      symptoms: { painScore: 7, constant: true, dyspnea: true, painQuality: "pressure" },
      history: {
        age: 64, sex: "male", diabetes: true, hypertension: true, hyperlipidemia: true,
        priorCardiacAblation: true, recentlyStoppedAnticoagulant: true,
      },
      vitals: {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP004",
    description: "Aortic dissection — tearing pain worst at onset, radiation to back",
    pack: "chest_pain",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: {
        painScore: 9, painQuality: "tearing", worstAtOnset: true,
        radiation: ["back"], dyspnea: false,
      },
      history: { age: 52, sex: "male", hypertension: true },
      vitals: {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP005",
    description: "MSK — reproducible with palpation, young healthy, no risk factors",
    pack: "chest_pain",
    isSafetyCase: false,
    expectedDisposition: "urgent_care_workup",
    input: {
      symptoms: {
        painScore: 4, painQuality: "sharp", constant: false,
        reproduceableWithPalpation: true, worseWithMovement: true,
        dyspnea: false, diaphoresis: false,
      },
      history: { age: 24, sex: "female" },
      vitals: {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },

  // ── ABDOMINAL PAIN CASES ──────────────────────────────────────────────

  {
    id: "ABD001",
    description: "Surgical abdomen — rigid, rebound, boardlike",
    pack: "abdominal_pain",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 9, constant: true, painLocation: "diffuse" },
      history: { age: 45 },
      vitals: { fever: true, temp: 101.8 },
      examFindings: {
        abdominalRigidity: true, reboundTenderness: true,
        abdominalGuarding: true, boardLikeAbdomen: true,
        peritonealSigns: true,
      },
    },
  },
  {
    id: "ABD002",
    description: "Dr. Thomas patient — RLQ pain 8/10 constant, TTP, Ozempic, prior hernia",
    pack: "abdominal_pain",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    input: {
      symptoms: { painScore: 8, constant: true, painLocation: "RLQ", nausea: true, diarrhea: true },
      history: {
        age: 45, medications: ["Omeprazole", "Ozempic", "Oxybutynin"],
        priorHerniaRepair: true, priorKidneyStone: true,
      },
      vitals: { fever: false },
      examFindings: { ttpRLQ: true, ttpSeverity: "moderate", peritonealSigns: false },
    },
  },
  {
    id: "ABD003",
    description: "Elderly male smoker — epigastric/back pain, AAA risk",
    pack: "abdominal_pain",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { painScore: 8, constant: true, painLocation: "epigastric", backPain: true },
      history: { age: 72, sex: "male", smoker: true, hypertension: true },
      vitals: {},
      examFindings: { peritonealSigns: false },
    },
  },
  {
    id: "ABD004",
    description: "Mild constipation story — no red flags, mild pain",
    pack: "abdominal_pain",
    isSafetyCase: false,
    expectedDisposition: "treat_and_watch",
    mustNotDisposition: "er_now",
    input: {
      symptoms: { painScore: 3, constant: false, painLocation: "LLQ", symptomPattern: "constipation" },
      history: { age: 32 },
      vitals: {},
      examFindings: { peritonealSigns: false, ttpPresent: false },
    },
  },
  {
    id: "ABD005",
    description: "Mesenteric ischemia — severe pain, mild tenderness, AFib",
    pack: "abdominal_pain",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    input: {
      symptoms: { painScore: 9, constant: true, painLocation: "diffuse" },
      history: { age: 68, atrialFibrillation: true },
      vitals: {},
      examFindings: { ttpSeverity: "mild", peritonealSigns: false, ttpPresent: true },
    },
  },

  // ── HEADACHE CASES ────────────────────────────────────────────────────

  {
    id: "HA001",
    description: "Thunderclap — worst headache of life, sudden onset",
    pack: "headache",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { worstHeadacheOfLife: true, suddenOnsetMaximum: true, painScore: 10 },
      history: { age: 42 },
      vitals: {},
    },
  },
  {
    id: "HA002",
    description: "Meningitis signs — fever, neck stiffness, headache",
    pack: "headache",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: { neckStiffness: true, headache: true, fever: true },
      history: { age: 22 },
      vitals: { fever: true, temp: 102.4 },
    },
  },
  {
    id: "HA003",
    description: "Dr. Thomas patient — 7-day frontal headache, neck pain, no danger signals",
    pack: "headache",
    isSafetyCase: false,
    expectedDisposition: "treat_and_watch",
    input: {
      symptoms: {
        headache: true, headacheDuration: 7, painScore: 7,
        frontalLocation: true, neckPain: true,
        neckStiffness: false, fever: false, worstHeadacheOfLife: false,
        focalWeakness: false, speechDifficulty: false,
      },
      history: { age: 45, headachesPerMonth: 1, newHeadachePattern: true },
      vitals: { fever: false },
    },
  },
  {
    id: "HA004",
    description: "GCA — age 68, jaw claudication, temporal headache",
    pack: "headache",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    input: {
      symptoms: { temporalHeadache: true, jawClaudicaton: true, headache: true },
      history: { age: 68 },
      vitals: {},
    },
  },
  {
    id: "HA005",
    description: "Classic migraine — unilateral, throbbing, photophobia, prior history",
    pack: "headache",
    isSafetyCase: false,
    expectedDisposition: "treat_and_watch",
    input: {
      symptoms: {
        headache: true, unilateral: true, pulsatingQuality: true,
        photophobia: true, nausea: true, headacheDuration: 1,
        worstHeadacheOfLife: false, neckStiffness: false,
      },
      history: { age: 34, priorMigraineHistory: true, headachesPerMonth: 3 },
      vitals: { fever: false },
    },
  },

  // ── GU / UTI CASES ────────────────────────────────────────────────────

  {
    id: "GU001",
    description: "Uncomplicated UTI — dysuria, frequency, UA positive",
    pack: "gu_uti",
    isSafetyCase: false,
    expectedDisposition: "treat_and_follow",
    input: {
      symptoms: { dysuria: true, urinaryFrequency: true, urinaryUrgency: true },
      history: { age: 28, genderIdentity: "female", hasCervix: true },
      vitals: { fever: false },
      tests: { ua: { obtained: true, leukocytes: true, blood: false, nitrites: true, pregnancyNegative: true } },
    },
  },
  {
    id: "GU002",
    description: "Pyelonephritis — fever, CVA tenderness, UA positive",
    pack: "gu_uti",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    input: {
      symptoms: { dysuria: true, severeCVAtenderness: true, fever: true },
      history: { age: 35, genderIdentity: "female" },
      vitals: { fever: true, temp: 101.9, heartRate: 108 },
      tests: { ua: { obtained: true, leukocytes: true, blood: true, nitrites: true, pregnancyNegative: true } },
    },
  },
  {
    id: "GU003",
    description: "Colonization only — UA positive, zero symptoms",
    pack: "gu_uti",
    isSafetyCase: false,
    expectedDisposition: "watchful_waiting",
    input: {
      symptoms: { dysuria: false, urinaryFrequency: false, urinaryUrgency: false },
      history: { age: 55, genderIdentity: "female" },
      vitals: { fever: false },
      tests: { ua: { obtained: true, leukocytes: true, blood: false, nitrites: false, pregnancyNegative: true } },
    },
  },
  {
    id: "GU004",
    description: "PID — adnexal tenderness on exam, STD risk, vaginal discharge",
    pack: "gu_uti",
    isSafetyCase: true,
    expectedDisposition: "gyn_today",
    input: {
      symptoms: { vaginalDischarge: true, stdRisk: true, dysuria: false },
      history: { age: 24, genderIdentity: "female", hasCervix: true },
      vitals: { fever: false },
      examFindings: { adnexalTenderness: "adnexal_tenderness" },
      tests: { ua: { obtained: true, leukocytes: false, pregnancyNegative: true } },
    },
  },

  // ── URI / RESPIRATORY CASES ───────────────────────────────────────────

  {
    id: "URI001",
    description: "Pneumonia — CXR infiltrate, age 82, asthma, cough 4 days",
    pack: "uri",
    isSafetyCase: true,
    expectedDisposition: "er_now",
    input: {
      symptoms: {
        sorethroat: true, cough: true, productivePhlegm: true, sinusCongestion: true,
        dysphagia: true, dyspnea: true, nocturnalCough: true, bodyAches: true, fatigue: true,
        nausea: false, symptomDuration: 4,
      },
      history: {
        age: 82, asthma: true, albuterolUsagePerDay: 3,
        hasSpacs: false, hasSecondInhaler: false,
        allergies: true, allergyMedications: ["Claritin"],
        medicationAllergies: [], currentMedications: [], smoker: false,
      },
      vitals: { fever: true, temp: 100.1 },
      tests: { strepNegative: true, fluNegative: true, covidNegative: true, cxrFindings: ["infiltrate"] },
    },
  },
  {
    id: "URI002",
    description: "Strep throat — Centor 4, fever, exudate, no cough",
    pack: "uri",
    isSafetyCase: false,
    expectedDisposition: "treat_and_follow",
    input: {
      symptoms: {
        sorethroat: true, cough: false, tonsilllarExudate: true,
        tenderAnteriorNodes: true, symptomDuration: 2,
      },
      history: { age: 22 },
      vitals: { fever: true, temp: 101.2 },
      tests: { strepNegative: false },
    },
  },
  {
    id: "URI003",
    description: "Epiglottitis — drooling, stridor, sore throat",
    pack: "uri",
    isSafetyCase: true,
    expectedDisposition: "ambulance_now",
    input: {
      symptoms: {
        sorethroat: true, drooling: true, stridor: true,
        dysphagia: true, dyspnea: true,
      },
      history: { age: 38 },
      vitals: {},
      tests: {},
    },
  },
];

// ─── TEST RUNNER ──────────────────────────────────────────────────────────

interface ValidationResult {
  caseId: string;
  description: string;
  pack: string;
  passed: boolean;
  isSafetyCase: boolean;
  expected: string;
  actual: string;
  dangerousFailure: boolean;  // got "treat_and_watch" when should have been ER/ambulance
  error: string | null;
}

async function runGoldenCases(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   AURALYN GOLDEN CASE VALIDATION                    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const results: ValidationResult[] = [];

  for (const gc of GOLDEN_CASES) {
    try {
      const actual = runPack(gc);
      const passed = actual === gc.expectedDisposition;
      const dangerousFailure = gc.isSafetyCase && !passed &&
        (actual === "treat_and_watch" || actual === "watchful_waiting");

      results.push({
        caseId: gc.id,
        description: gc.description,
        pack: gc.pack,
        passed,
        isSafetyCase: gc.isSafetyCase,
        expected: gc.expectedDisposition,
        actual,
        dangerousFailure,
        error: null,
      });

      const icon = dangerousFailure ? "💀" : passed ? "✅" : gc.isSafetyCase ? "🚨" : "❌";
      console.log(`${icon} ${gc.id}: ${gc.description}`);
      if (!passed) {
        console.log(`   Expected: ${gc.expectedDisposition}`);
        console.log(`   Actual:   ${actual}`);
        if (dangerousFailure) {
          console.log(`   ⚠️  DANGEROUS FAILURE — patient would be under-triaged`);
        }
      }
    } catch (err: any) {
      results.push({
        caseId: gc.id,
        description: gc.description,
        pack: gc.pack,
        passed: false,
        isSafetyCase: gc.isSafetyCase,
        expected: gc.expectedDisposition,
        actual: "ERROR",
        dangerousFailure: gc.isSafetyCase,
        error: err.message,
      });
      console.log(`💥 ${gc.id}: ERROR — ${err.message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const safetyFails = results.filter(r => r.isSafetyCase && !r.passed).length;
  const dangerousFails = results.filter(r => r.dangerousFailure).length;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log(`║ RESULTS: ${passed}/${total} passed                              ║`);
  console.log(`║ Safety case failures: ${safetyFails}                            ║`);
  console.log(`║ Dangerous failures:   ${dangerousFails}                            ║`);
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (dangerousFails > 0) {
    console.log("🚨 DEPLOYMENT BLOCKED — dangerous failures present");
    console.log("   These cases would result in patient under-triage.");
    console.log("   Fix before any clinical deployment.\n");
    process.exit(1);
  }

  if (safetyFails > 0) {
    console.log("⚠️  WARNING — safety case failures present");
    console.log("   Review and fix before deployment.\n");
    process.exit(1);
  }

  if (passed === total) {
    console.log("✅ ALL CASES PASSED — safe to deploy\n");
    process.exit(0);
  }

  console.log("⚠️  Non-safety failures present — review before deployment\n");
  process.exit(1);
}

function runPack(gc: GoldenCase): string {
  // Build a minimal ClinicalState from the test input
  const state: any = {
    symptoms: gc.input.symptoms || {},
    history: gc.input.history || {},
    vitals: gc.input.vitals || {},
    examFindings: gc.input.examFindings || {},
    tests: gc.input.tests?.ua ? { ...gc.input.tests } : gc.input.tests || {},
    preferences: { pharmacy: null, needsWorkNote: false },
    diagnosis: null,
  };

  switch (gc.pack) {
    case "chest_pain": {
      const ekg = gc.input.examFindings?.ekg || { obtained: false, normal: true };
      const result = assessChestPain(state, ekg);
      return result.disposition;
    }
    case "abdominal_pain": {
      const result = assessAbdominalPain(state);
      return result.disposition;
    }
    case "headache": {
      const result = assessHeadache(state);
      return result.disposition;
    }
    case "gu_uti": {
      const ua = gc.input.tests?.ua || { obtained: false };
      const result = assessGU(state, ua);
      return result.disposition;
    }
    case "uri": {
      const result = synthesizePlan(state);
      return result.antibioticDecision?.decision || result.severity?.level || "treat_and_follow";
    }
    default:
      throw new Error(`Unknown pack: ${gc.pack}`);
  }
}

// Add to package.json scripts:
// "validate:packs": "npx tsx server/validation/goldenCaseValidation.ts"

runGoldenCases().catch(console.error);

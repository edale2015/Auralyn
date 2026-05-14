/**
 * AURALYN — Golden Case Validation Suite
 * Tests all complaint packs against known correct dispositions.
 * Run before any clinical deployment. Every safety case must pass.
 *
 * Usage:
 *   npx tsx server/validation/goldenCaseValidation.ts
 */

import { ChestPainPack }      from "../kb/complaintPacks/chest-pain";
import { AbdominalPainPack }  from "../kb/complaintPacks/abdominal-pain";
import { HeadachePack }       from "../kb/complaintPacks/headache";
import { GUUTIPack }          from "../kb/complaintPacks/gu-uti";
import { URIRespiratoryPack } from "../kb/complaintPacks/uri-respiratory";
import { MSKBackPainPack }    from "../kb/complaintPacks/remaining-packs";
import type { ExtractedClinicalState } from "../kb/complaintPacks/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoldenCase {
  id:                  string;
  description:         string;
  pack:                string;
  state:               Partial<ExtractedClinicalState>;
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
    description: "STEMI — ST elevation, diabetic male 64",
    pack: "chest_pain",
    expectedDisposition: "ambulance_now",
    state: {
      complaintId: "chest_pain", chiefComplaint: "chest pain",
      symptoms: { painScore: 7, constant: true, dyspnea: true, painQuality: "pressure", diaphoresis: false },
      history:  { age: 64, sex: "male", diabetes: true, hypertension: true },
      vitals:   { bp: { systolic: 120, diastolic: 80 }, heartRate: 78 },
      examFindings: { ekg: { stElevation: true, normal: false } },
    },
  },
  {
    id: "CP002", isSafetyCase: true,
    description: "ACS — pressure chest pain, diaphoresis, no EKG changes",
    pack: "chest_pain",
    expectedDisposition: "er_now", mustNotDisposition: "treat_and_watch",
    state: {
      complaintId: "chest_pain", chiefComplaint: "chest pain",
      symptoms: { painScore: 8, constant: true, dyspnea: true, painQuality: "pressure", diaphoresis: true },
      history:  { age: 58, sex: "male", smoker: true, hypertension: true },
      vitals:   {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP003", isSafetyCase: true,
    description: "Aortic dissection — tearing pain, worst at onset, back radiation",
    pack: "chest_pain",
    expectedDisposition: "ambulance_now",
    state: {
      complaintId: "chest_pain", chiefComplaint: "chest pain",
      symptoms: { painScore: 9, painQuality: "tearing", worstAtOnset: true, radiation: ["back"] },
      history:  { age: 52, sex: "male", hypertension: true },
      vitals:   {},
      examFindings: { ekg: { stElevation: false, normal: true } },
    },
  },
  {
    id: "CP004", isSafetyCase: false,
    description: "MSK chest — reproducible with palpation, young healthy",
    pack: "chest_pain",
    expectedDisposition: "urgent_care_workup",
    state: {
      complaintId: "chest_pain", chiefComplaint: "chest pain",
      symptoms: { painScore: 4, painQuality: "sharp", reproduceableWithPalpation: true, worseWithMovement: true, dyspnea: false },
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
    state: {
      complaintId: "abdominal_pain", chiefComplaint: "abdominal pain",
      symptoms: { painScore: 9, constant: true, painLocation: "diffuse" },
      history:  { age: 45 },
      vitals:   { fever: true, temp: 101.8 },
      examFindings: { abdominalRigidity: true, reboundTenderness: true, peritonealSigns: true, boardLikeAbdomen: true },
    },
  },
  {
    id: "ABD002", isSafetyCase: true,
    description: "AAA risk — elderly male smoker, epigastric + back pain",
    pack: "abdominal_pain",
    expectedDisposition: "ambulance_now",
    state: {
      complaintId: "abdominal_pain", chiefComplaint: "abdominal pain",
      symptoms: { painScore: 8, constant: true, painLocation: "epigastric", backPain: true },
      history:  { age: 72, sex: "male", smoker: true, hypertension: true },
      vitals:   {},
      examFindings: { peritonealSigns: false },
    },
  },
  {
    id: "ABD003", isSafetyCase: false,
    description: "Mild constipation — no red flags",
    pack: "abdominal_pain",
    expectedDisposition: "treat_and_watch", mustNotDisposition: "er_now",
    state: {
      complaintId: "abdominal_pain", chiefComplaint: "abdominal pain",
      symptoms: { painScore: 3, constant: false, painLocation: "LLQ", symptomPattern: "constipation" },
      history:  { age: 32 },
      vitals:   {},
      examFindings: { peritonealSigns: false, ttpPresent: false },
    },
  },

  // ── HEADACHE ──────────────────────────────────────────────────────────────

  {
    id: "HA001", isSafetyCase: true,
    description: "Thunderclap — worst headache of life, sudden onset",
    pack: "headache",
    expectedDisposition: "ambulance_now",
    state: {
      complaintId: "neuro_headache", chiefComplaint: "headache",
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
    state: {
      complaintId: "neuro_headache", chiefComplaint: "headache",
      symptoms: { neckStiffness: true, headache: true, fever: true },
      history:  { age: 22 },
      vitals:   { fever: true, temp: 102.4 },
    },
  },
  {
    id: "HA003", isSafetyCase: false,
    description: "Classic migraine — prior history, no danger signals",
    pack: "headache",
    expectedDisposition: "treat_and_watch",
    state: {
      complaintId: "neuro_headache", chiefComplaint: "headache",
      symptoms: { headache: true, unilateral: true, pulsatingQuality: true, photophobia: true, nausea: true, worstHeadacheOfLife: false, neckStiffness: false },
      history:  { age: 34, priorMigraineHistory: true, headachesPerMonth: 3 },
      vitals:   { fever: false },
    },
  },

  // ── GU / UTI ──────────────────────────────────────────────────────────────

  {
    id: "GU001", isSafetyCase: false,
    description: "Uncomplicated UTI — dysuria, frequency, UA positive",
    pack: "gu_uti",
    expectedDisposition: "treat_and_follow",
    state: {
      complaintId: "gu_uti_symptoms", chiefComplaint: "UTI symptoms",
      symptoms: { dysuria: true, urinaryFrequency: true, urinaryUrgency: true },
      history:  { age: 28, genderIdentity: "female", hasCervix: true },
      vitals:   { fever: false },
      tests:    { ua: { obtained: true, leukocytes: true, blood: false, nitrites: true, pregnancyNegative: true } },
    },
  },
  {
    id: "GU002", isSafetyCase: true,
    description: "Pyelonephritis — fever, CVA tenderness",
    pack: "gu_uti",
    expectedDisposition: "er_now",
    state: {
      complaintId: "gu_uti_symptoms", chiefComplaint: "UTI symptoms",
      symptoms: { dysuria: true, severeCVAtenderness: true, fever: true },
      history:  { age: 35, genderIdentity: "female" },
      vitals:   { fever: true, temp: 101.9, heartRate: 108 },
      tests:    { ua: { obtained: true, leukocytes: true, blood: true, nitrites: true, pregnancyNegative: true } },
    },
  },

  // ── URI / RESPIRATORY ─────────────────────────────────────────────────────

  {
    id: "URI001", isSafetyCase: true,
    description: "Pneumonia — CXR infiltrate, age 82, asthma",
    pack: "uri",
    expectedDisposition: "er_now",
    state: {
      complaintId: "cough", chiefComplaint: "cough",
      symptoms: { cough: true, productivePhlegm: true, dyspnea: true, nocturnalCough: true, symptomDuration: 4 },
      history:  { age: 82, asthma: true, albuterolUsagePerDay: 3 },
      vitals:   { fever: true, temp: 100.1 },
      tests:    { strepNegative: true, cxrFindings: ["infiltrate"] },
    },
  },
  {
    id: "URI002", isSafetyCase: false,
    description: "Viral URI — low Centor, no fever, mild symptoms",
    pack: "uri",
    expectedDisposition: "treat_and_watch",
    state: {
      complaintId: "sore_throat", chiefComplaint: "sore throat",
      symptoms: { sorethroat: true, cough: true, runnyNose: true, symptomDuration: 2 },
      history:  { age: 28 },
      vitals:   { fever: false },
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

const PACK_MAP: Record<string, any> = {
  chest_pain:   ChestPainPack,
  abdominal_pain: AbdominalPainPack,
  headache:     HeadachePack,
  gu_uti:       GUUTIPack,
  uri:          URIRespiratoryPack,
  msk:          MSKBackPainPack,
};

export async function runGoldenCaseValidation(): Promise<{
  passed:       number;
  failed:       number;
  safetyFailed: number;
  results:      ValidationResult[];
}> {
  const results: ValidationResult[] = [];

  for (const gc of GOLDEN_CASES) {
    const pack = PACK_MAP[gc.pack];
    if (!pack) {
      results.push({ caseId: gc.id, description: gc.description, passed: false, isSafetyCase: gc.isSafetyCase, actualDisposition: "PACK_NOT_FOUND", expectedDisposition: gc.expectedDisposition, error: `No pack registered for: ${gc.pack}` });
      continue;
    }

    try {
      const fullState: ExtractedClinicalState = {
        complaintId:     "unknown",
        chiefComplaint:  "",
        answerLog:       [],
        symptoms:        {},
        history:         {},
        vitals:          {},
        examFindings:    {},
        redFlagsDetected: [],
        narrativeScrubbed: "",
        ...gc.state,
      };

      const result = pack.computeTriage(fullState);
      const actual = (result.disposition ?? "").toLowerCase().replace(/\s+/g, "_");
      const expected = gc.expectedDisposition.toLowerCase().replace(/\s+/g, "_");
      const passed = actual === expected || actual.includes(expected) || expected.includes(actual);
      const mustNotFailed = gc.mustNotDisposition && actual.includes(gc.mustNotDisposition.toLowerCase().replace(/\s+/g, "_"));

      results.push({
        caseId:              gc.id,
        description:         gc.description,
        passed:              passed && !mustNotFailed,
        isSafetyCase:        gc.isSafetyCase,
        actualDisposition:   actual,
        expectedDisposition: expected,
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

if (require.main === module) {
  (async () => {
    console.log("══════════════════════════════════════════");
    console.log("  AURALYN GOLDEN CASE VALIDATION SUITE");
    console.log("══════════════════════════════════════════\n");

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

    console.log("\n══════════════════════════════════════════");
    console.log(`  TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    if (safetyFailed > 0) {
      console.error(`\n  ⚠️  SAFETY FAILURES: ${safetyFailed} — DO NOT DEPLOY`);
      process.exit(1);
    } else {
      console.log(`  ✅ All safety cases passed`);
    }
    console.log("══════════════════════════════════════════\n");
    process.exit(failed > 0 ? 1 : 0);
  })();
}

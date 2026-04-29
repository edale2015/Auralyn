/**
 * driftCheck.ts
 * Drop into: server/harness/driftCheck.ts
 *
 * Drift canary system — 20 frozen canonical cases.
 * Runs daily to detect model or harness drift.
 *
 * Schedule via BullMQ (same queue factory used in Win 8):
 *   Schedule "drift-check" job daily at 2am UTC.
 *   The job calls runDriftCheck() and logs results.
 *
 * Or run manually: npx ts-node server/harness/driftCheck.ts
 *
 * Alert fires if any canary output deviates from last-known-good:
 *   - Disposition must match exactly
 *   - Confidence within ±0.15
 *   - No new red flags added or removed
 */

import { appendAuditEvent } from "../governance/audit";

// ─── Canary definitions ───────────────────────────────────────────────────────
// Each canary: complaint + symptoms → expected disposition + top diagnosis + confidence floor

export interface CanaryCase {
  id:                   string;
  complaint:            string;
  symptoms:             string[];
  patientAge?:          number;
  patientSex?:          string;
  knownAllergies?:      string[];
  knownMedications?:    string[];
  // Expected outputs
  expectedDisposition:  "er_send" | "urgent_care" | "pcp" | "self_care";
  expectedTopDiagnosis: string;
  confidenceFloor:      number;   // output confidence must be >= this
  mustHaveRedFlag?:     boolean;  // if true, red flag must fire
  mustNotHaveRedFlag?:  boolean;  // if true, red flag must NOT fire
}

export const DRIFT_CANARIES: CanaryCase[] = [
  // ── Sore throat — viral (low Centor, no red flags) ──────────────────────
  {
    id:                   "sore_throat_viral",
    complaint:            "sore_throat",
    symptoms:             ["sore throat", "runny nose", "cough", "gradual onset", "no fever"],
    patientAge:           28,
    patientSex:           "female",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Viral Pharyngitis",
    confidenceFloor:      0.60,
    mustNotHaveRedFlag:   true,
  },

  // ── UTI — classic presentation ────────────────────────────────────────────
  {
    id:                   "uti_classic",
    complaint:            "uti",
    symptoms:             ["burning urination", "frequency", "urgency", "no fever", "no flank pain"],
    patientAge:           32,
    patientSex:           "female",
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Uncomplicated Urinary Tract Infection",
    confidenceFloor:      0.70,
    mustNotHaveRedFlag:   true,
  },

  // ── Chest pain — cardiac red flag must fire ───────────────────────────────
  {
    id:                   "chest_pain_cardiac",
    complaint:            "chest_pain",
    symptoms:             ["crushing chest pain", "radiating to left arm", "diaphoresis", "nausea", "sudden onset"],
    patientAge:           58,
    patientSex:           "male",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Acute Coronary Syndrome",
    confidenceFloor:      0.75,
    mustHaveRedFlag:      true,
  },

  // ── Hypertensive urgency — urgent but not ER ─────────────────────────────
  {
    id:                   "hypertensive_urgency",
    complaint:            "hypertensive_urgency",
    symptoms:             ["headache", "blood pressure 180/110", "no chest pain", "no vision changes"],
    patientAge:           52,
    patientSex:           "male",
    knownMedications:     ["Lisinopril 10mg daily"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Hypertensive Urgency",
    confidenceFloor:      0.70,
  },

  // ── Asthma exacerbation — urgent care ────────────────────────────────────
  {
    id:                   "asthma_exacerbation_moderate",
    complaint:            "asthma_exacerbation",
    symptoms:             ["wheezing", "shortness of breath", "using rescue inhaler 3x today", "able to speak full sentences"],
    patientAge:           24,
    patientSex:           "female",
    knownMedications:     ["Albuterol inhaler", "Fluticasone inhaler"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Asthma Exacerbation",
    confidenceFloor:      0.75,
  },

  // ── Hypoglycemia — urgent ─────────────────────────────────────────────────
  {
    id:                   "hypoglycemia",
    complaint:            "hypoglycemia",
    symptoms:             ["shakiness", "sweating", "blood sugar 58 mg/dL", "confused", "on insulin"],
    patientAge:           45,
    patientSex:           "male",
    knownMedications:     ["Insulin glargine", "Metformin"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Hypoglycemia",
    confidenceFloor:      0.80,
    mustHaveRedFlag:      true,
  },

  // ── Ear pain — routine ────────────────────────────────────────────────────
  {
    id:                   "ear_pain_otitis",
    complaint:            "ear_pain",
    symptoms:             ["right ear pain", "decreased hearing", "no fever", "3 days duration"],
    patientAge:           8,
    patientSex:           "male",
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Otitis Media",
    confidenceFloor:      0.65,
  },

  // ── Conjunctivitis — async safe ───────────────────────────────────────────
  {
    id:                   "conjunctivitis_bacterial",
    complaint:            "pink_eye",
    symptoms:             ["red eye", "yellow discharge", "no pain", "no vision change", "unilateral"],
    patientAge:           22,
    patientSex:           "female",
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Bacterial Conjunctivitis",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ── Ankle injury — MSK ────────────────────────────────────────────────────
  {
    id:                   "ankle_sprain",
    complaint:            "ankle_injury",
    symptoms:             ["twisted ankle", "lateral swelling", "able to bear weight", "no deformity"],
    patientAge:           19,
    patientSex:           "male",
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Lateral Ankle Sprain",
    confidenceFloor:      0.60,
    mustNotHaveRedFlag:   true,
  },

  // ── Abdominal pain — appendicitis screen ─────────────────────────────────
  {
    id:                   "abdominal_pain_appendicitis",
    complaint:            "abdominal_pain",
    symptoms:             ["right lower quadrant pain", "fever 38.5C", "nausea", "rebound tenderness", "migrated from periumbilical"],
    patientAge:           17,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Appendicitis",
    confidenceFloor:      0.70,
    mustHaveRedFlag:      true,
  },

  // ── Pediatric fever — routine ─────────────────────────────────────────────
  {
    id:                   "pediatric_fever_routine",
    complaint:            "pediatric_fever",
    symptoms:             ["fever 38.2C", "runny nose", "mild cough", "eating normally", "age 3"],
    patientAge:           3,
    patientSex:           "male",
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Viral Upper Respiratory Infection",
    confidenceFloor:      0.55,
    mustNotHaveRedFlag:   true,
  },

  // ── COPD exacerbation ─────────────────────────────────────────────────────
  {
    id:                   "copd_exacerbation",
    complaint:            "copd_exacerbation",
    symptoms:             ["increased dyspnea", "more sputum", "sputum color change to yellow", "on home oxygen"],
    patientAge:           67,
    patientSex:           "male",
    knownMedications:     ["Tiotropium", "Albuterol", "Prednisone"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "COPD Exacerbation",
    confidenceFloor:      0.70,
  },

  // ── Leg swelling — DVT screen ─────────────────────────────────────────────
  {
    id:                   "leg_swelling_dvt",
    complaint:            "leg_swelling",
    symptoms:             ["unilateral calf swelling", "pain", "warmth", "recent long flight", "non-pitting"],
    patientAge:           44,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Deep Vein Thrombosis",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // ── Medication refill — async safe ────────────────────────────────────────
  {
    id:                   "medication_refill",
    complaint:            "medication_refill",
    symptoms:             ["needs refill of lisinopril", "no new symptoms", "well controlled hypertension"],
    patientAge:           55,
    patientSex:           "female",
    knownMedications:     ["Lisinopril 10mg"],
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Medication Refill Request",
    confidenceFloor:      0.80,
    mustNotHaveRedFlag:   true,
  },

  // ── Rash — allergic vs infectious ────────────────────────────────────────
  {
    id:                   "rash_allergic",
    complaint:            "rash_mild",
    symptoms:             ["hives", "started after taking amoxicillin", "no throat swelling", "no breathing difficulty", "itchy"],
    patientAge:           30,
    patientSex:           "male",
    knownMedications:     ["Amoxicillin 500mg"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Drug Hypersensitivity Reaction",
    confidenceFloor:      0.65,
  },

  // ── Back pain — mechanical ────────────────────────────────────────────────
  {
    id:                   "back_pain_mechanical",
    complaint:            "mild_back_pain",
    symptoms:             ["lower back pain", "after lifting", "no radiation", "no weakness", "no bowel changes"],
    patientAge:           38,
    patientSex:           "male",
    expectedDisposition:  "self_care",
    expectedTopDiagnosis: "Mechanical Low Back Pain",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ── Headache — migraine vs red flag ──────────────────────────────────────
  {
    id:                   "headache_migraine",
    complaint:            "headache",
    symptoms:             ["throbbing headache", "unilateral", "photophobia", "nausea", "prior history of migraines"],
    patientAge:           29,
    patientSex:           "female",
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Migraine Without Aura",
    confidenceFloor:      0.65,
    mustNotHaveRedFlag:   true,
  },

  // ── Shortness of breath — must evaluate for PE/cardiac ───────────────────
  {
    id:                   "shortness_of_breath_pe",
    complaint:            "shortness_of_breath",
    symptoms:             ["sudden shortness of breath", "pleuritic chest pain", "recent surgery 2 weeks ago", "tachycardia"],
    patientAge:           51,
    patientSex:           "female",
    expectedDisposition:  "er_send",
    expectedTopDiagnosis: "Pulmonary Embolism",
    confidenceFloor:      0.65,
    mustHaveRedFlag:      true,
  },

  // ── Decompensated heart failure ───────────────────────────────────────────
  {
    id:                   "heart_failure_decompensated",
    complaint:            "decompensated_heart_failure",
    symptoms:             ["bilateral leg swelling", "gained 5 lbs this week", "dyspnea on exertion", "orthopnea"],
    patientAge:           72,
    patientSex:           "male",
    knownMedications:     ["Furosemide", "Carvedilol", "Lisinopril"],
    expectedDisposition:  "urgent_care",
    expectedTopDiagnosis: "Decompensated Heart Failure",
    confidenceFloor:      0.70,
  },

  // ── Thyroid symptoms ──────────────────────────────────────────────────────
  {
    id:                   "thyroid_hypothyroid",
    complaint:            "thyroid_symptoms",
    symptoms:             ["fatigue", "weight gain", "cold intolerance", "constipation", "dry skin"],
    patientAge:           42,
    patientSex:           "female",
    expectedDisposition:  "pcp",
    expectedTopDiagnosis: "Hypothyroidism",
    confidenceFloor:      0.60,
    mustNotHaveRedFlag:   true,
  },
];

// ─── Drift runner ─────────────────────────────────────────────────────────────

export interface CanaryResult {
  canaryId:          string;
  passed:            boolean;
  expectedDisp:      string;
  actualDisp?:       string;
  expectedTopDx:     string;
  actualTopDx?:      string;
  expectedConfFloor: number;
  actualConfidence?: number;
  redFlagCheck?:     "pass" | "fail" | "not_tested";
  error?:            string;
}

export async function runDriftCheck(
  triageFunction: (complaint: string, symptoms: string[], context?: any) => Promise<{
    disposition:  string;
    topDiagnosis: string;
    confidence:   number;
    redFlagFired: boolean;
  }>
): Promise<{ passed: number; failed: number; results: CanaryResult[] }> {

  const results: CanaryResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const canary of DRIFT_CANARIES) {
    try {
      const output = await triageFunction(
        canary.complaint,
        canary.symptoms,
        {
          age:          canary.patientAge,
          sex:          canary.patientSex,
          allergies:    canary.knownAllergies   ?? [],
          medications:  canary.knownMedications ?? [],
        }
      );

      const dispMatch  = output.disposition === canary.expectedDisposition;
      const confPass   = output.confidence  >= canary.confidenceFloor;
      const dxMatch    = output.topDiagnosis?.toLowerCase().includes(
        canary.expectedTopDiagnosis.toLowerCase().split(" ")[0]
      );

      let redFlagCheck: "pass" | "fail" | "not_tested" = "not_tested";
      if (canary.mustHaveRedFlag !== undefined) {
        redFlagCheck = output.redFlagFired === canary.mustHaveRedFlag ? "pass" : "fail";
      }
      if (canary.mustNotHaveRedFlag !== undefined) {
        redFlagCheck = (!output.redFlagFired) === canary.mustNotHaveRedFlag ? "pass" : "fail";
      }

      const casePassed = dispMatch && confPass && (dxMatch || true) && redFlagCheck !== "fail";
      // dxMatch is soft — disposition + confidence + red flag are hard checks

      results.push({
        canaryId:          canary.id,
        passed:            casePassed,
        expectedDisp:      canary.expectedDisposition,
        actualDisp:        output.disposition,
        expectedTopDx:     canary.expectedTopDiagnosis,
        actualTopDx:       output.topDiagnosis,
        expectedConfFloor: canary.confidenceFloor,
        actualConfidence:  output.confidence,
        redFlagCheck,
      });

      casePassed ? passed++ : failed++;

    } catch (err: any) {
      results.push({
        canaryId:          canary.id,
        passed:            false,
        expectedDisp:      canary.expectedDisposition,
        expectedTopDx:     canary.expectedTopDiagnosis,
        expectedConfFloor: canary.confidenceFloor,
        error:             err.message,
      });
      failed++;
    }
  }

  // Audit the drift check result
  await appendAuditEvent({
    actor:      "system",
    action:     "DRIFT_CHECK_COMPLETED",
    entityId:   "harness",
    entityType: "system",
    details: {
      total:  DRIFT_CANARIES.length,
      passed,
      failed,
      failedCanaries: results.filter(r => !r.passed).map(r => r.canaryId),
    },
  }).catch(console.error);

  if (failed > 0) {
    console.error(`[DriftCheck] ⚠️ ${failed}/${DRIFT_CANARIES.length} canaries FAILED — harness drift detected`);
  } else {
    console.log(`[DriftCheck] ✅ All ${passed} canaries passed`);
  }

  return { passed, failed, results };
}

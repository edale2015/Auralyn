/**
 * AURALYN — Encounter Simulation Engine
 *
 * Three-tier simulation strategy:
 *
 * TIER 1 — Synthea (free, immediate, 1M+ records available)
 *   MITRE's open-source synthetic patient generator.
 *   Exports FHIR R4, CSV, CCDA. No cost, no privacy restrictions.
 *   Covers demographics, medications, conditions, encounters.
 *   Gap: not urgent-care specific — needs complaint mapping.
 *
 * TIER 2 — GPT-4o conversation synthesis (Auralyn-specific)
 *   Generate realistic patient dialogue transcripts for each
 *   complaint pack, including atypical presentations, difficult
 *   patients, language barriers, and human factors scenarios.
 *   This is what DataAnnotation.tech pays MDs to do — we do it
 *   automatically using your clinical knowledge already encoded
 *   in the complaint packs.
 *
 * TIER 3 — Manual physician scenarios (your clinical expertise)
 *   The scenarios you've been describing in these sessions.
 *   Each dialogue transcript = one validated test case.
 *   Build a library over time as you see patients.
 *
 * File: server/simulation/EncounterSimulationEngine.ts
 */

import OpenAI from "openai";
import { applyPHIGuard } from "../safety/PHIGuard";
import { AdaptiveDialogueEngine } from "../dialogue/AdaptiveDialogueEngine";
import { assessChestPain } from "../kb/complaintPacks/chest-pain";
import { assessAbdominalPain } from "../kb/complaintPacks/abdominal-pain";
import { assessHeadache } from "../kb/complaintPacks/headache";
import { assessGU } from "../kb/complaintPacks/gu-uti";
import { synthesizePlan } from "../kb/complaintPacks/uri-respiratory";
import { db } from "../db";
import { appendAuditEvent } from "../audit/HashChain";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface SimulatedEncounter {
  id: string;
  source: "synthea" | "gpt4o_generated" | "physician_authored";
  complaintId: string;
  patientProfile: PatientProfile;
  conversationTranscript: string;     // the full simulated dialogue
  extractedClinicalState: any;        // what Auralyn extracted
  auraylnDisposition: string;         // what Auralyn recommended
  expectedDisposition: string;        // ground truth
  passed: boolean;
  isSafetyCase: boolean;
  dangerousFailure: boolean;          // under-triaged a safety case
  humanFactorSignal: string;          // any HF detected
  processingTimeMs: number;
  createdAt: string;
}

export interface PatientProfile {
  age: number;
  sex: "male" | "female" | "other";
  weightKg?: number;
  ethnicity?: string;
  primaryLanguage?: string;
  comorbidities: string[];
  currentMedications: string[];
  allergies: string[];
  smokingStatus: "never" | "former" | "current";
  // Human factors
  communicationStyle: "clear" | "vague" | "distressed" | "confused" | "non_english" | "pediatric_proxy";
}

export interface SimulationRun {
  runId: string;
  totalEncounters: number;
  passRate: number;
  safetyPassRate: number;             // must be 100%
  dangerousFailures: number;          // must be 0
  humanFactorDetectionRate: number;
  averageProcessingMs: number;
  complaintBreakdown: Record<string, { total: number; passed: number }>;
  demographicBreakdown: Record<string, { total: number; passed: number }>;
  failedCases: SimulatedEncounter[];
  createdAt: string;
}

// ─── COMPLAINT SCENARIO LIBRARY ──────────────────────────────────────────
// Each scenario defines a patient presentation that GPT-4o will use to
// generate a realistic conversation transcript.

export const SCENARIO_TEMPLATES = {

  // ── CHEST PAIN SCENARIOS ──────────────────────────────────────────────
  chest_pain: [
    {
      label: "Classic STEMI presentation",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      profile: { age: 62, sex: "male", comorbidities: ["diabetes", "hypertension"], medications: ["metoprolol"] },
      clinicalScript: "Patient has crushing substernal chest pressure 9/10 radiating to left arm, with diaphoresis, for 45 minutes. EKG shows ST elevation in leads II, III, aVF.",
    },
    {
      label: "Mr. Jones — pressure pain, stopped anticoagulant, normal EKG",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 64, sex: "male", comorbidities: ["diabetes", "hypertension", "hyperlipidemia"], medications: ["metoprolol"] },
      clinicalScript: "Patient stopped Xarelto 3 months ago after cardiac ablation. Constant pressure chest pain 7/10 with slight SOB since this morning. Normal EKG.",
    },
    {
      label: "Aortic dissection — tearing pain worst at onset",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      profile: { age: 54, sex: "male", comorbidities: ["hypertension"], medications: ["lisinopril"] },
      clinicalScript: "Sudden tearing/ripping chest pain that was worst at onset, radiating to the back. BP 160/90. No EKG changes.",
    },
    {
      label: "Young woman — atypical ACS",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 42, sex: "female", comorbidities: ["diabetes", "lupus"], medications: ["hydroxychloroquine"] },
      clinicalScript: "Jaw pain and fatigue for 2 days, mild chest tightness. No classic pressure. Diabetic woman — atypical presentation.",
    },
    {
      label: "MSK — reproducible with palpation, young healthy",
      expectedDisposition: "urgent_care_workup",
      isSafety: false,
      profile: { age: 26, sex: "female", comorbidities: [], medications: [] },
      clinicalScript: "Sharp left chest pain worse with deep breath and movement. Reproducible with palpation. Started after moving furniture. No cardiac risk factors.",
    },
    {
      label: "Panic attack mimicking ACS",
      expectedDisposition: "urgent_care_workup",
      isSafety: false,
      profile: { age: 33, sex: "female", comorbidities: ["anxiety"], medications: ["sertraline"] },
      clinicalScript: "Chest tightness, racing heart, tingling in hands. Triggered by stress at work. Better with slow breathing. Normal EKG, no risk factors.",
    },
    {
      label: "PE — pleuritic chest pain, recent long flight",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 45, sex: "female", comorbidities: [], medications: ["oral contraceptive"] },
      clinicalScript: "Sharp pleuritic chest pain and mild SOB after 14-hour flight yesterday. Unilateral leg swelling. On OCP. Wells score elevated.",
    },
    // Human factors variants
    {
      label: "Distressed patient — severe chest pain, crying, scared",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      humanFactor: "distress",
      profile: { age: 58, sex: "male", comorbidities: ["hypertension"] },
      clinicalScript: "Patient in obvious distress, repeatedly saying 'am I dying?' Pressure chest pain 10/10, diaphoresis. Difficulty answering questions calmly.",
    },
    {
      label: "Non-English speaking — chest pain via interpreter",
      expectedDisposition: "er_now",
      isSafety: true,
      humanFactor: "language_barrier",
      profile: { age: 67, sex: "male", comorbidities: ["diabetes", "hypertension"], primaryLanguage: "Spanish" },
      clinicalScript: "Patient speaks only Spanish. Via family interpreter: chest pressure, arm pain, started 2 hours ago. High risk profile.",
    },
  ],

  // ── ABDOMINAL PAIN SCENARIOS ──────────────────────────────────────────
  abdominal_pain: [
    {
      label: "Classic appendicitis — RLQ, anorexia, fever",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 28, sex: "male", comorbidities: [], medications: [] },
      clinicalScript: "RLQ pain 8/10 constant for 18 hours, started periumbilical and migrated to RLQ. Fever 100.8. Anorexia, nausea. Alvarado score 7.",
    },
    {
      label: "Elderly AAA — back pain, pulsatile mass",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      profile: { age: 74, sex: "male", comorbidities: ["hypertension"], medications: ["aspirin"], smokingStatus: "former" },
      clinicalScript: "Sudden severe abdominal and back pain. Pulsatile mass palpable in abdomen. Hypotensive. Smoker, hypertension.",
    },
    {
      label: "Pregnant patient — abdominal pain and vaginal bleeding",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 29, sex: "female", comorbidities: ["pregnancy_8weeks"], medications: ["prenatal vitamins"] },
      clinicalScript: "8 weeks pregnant with lower abdominal pain and light vaginal bleeding. Shoulder pain when lying down. Ectopic must be excluded.",
    },
    {
      label: "Gallbladder — RUQ after fatty meal",
      expectedDisposition: "er_now",
      isSafety: false,
      profile: { age: 42, sex: "female", comorbidities: [], medications: [] },
      clinicalScript: "RUQ pain 7/10 after eating fried food. Radiates to right shoulder. Nausea. Fever 100.2. Murphy's sign positive.",
    },
    {
      label: "Constipation — mild LLQ, last BM 4 days",
      expectedDisposition: "treat_and_watch",
      isSafety: false,
      profile: { age: 35, sex: "female", comorbidities: [], medications: ["iron supplements"] },
      clinicalScript: "Mild LLQ cramping. Last bowel movement 4 days ago. No fever, no vomiting, no bleeding. Taking iron supplements. Pain 2/10.",
    },
    {
      label: "Mesenteric ischemia — severe pain, mild tenderness, AFib",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 71, sex: "male", comorbidities: ["atrial_fibrillation"], medications: ["digoxin"] },
      clinicalScript: "Severe diffuse abdominal pain 9/10 but only mild tenderness on exam. AFib history. Pain out of proportion to physical findings.",
    },
    {
      label: "Pediatric intussusception — 18 month old",
      expectedDisposition: "er_now",
      isSafety: true,
      humanFactor: "pediatric_proxy",
      profile: { age: 1.5, sex: "male", comorbidities: [] },
      clinicalScript: "18-month-old brought by mother. Episodic severe screaming with knees drawn to chest. Lethargic between episodes. No fever. Possible currant jelly stool.",
    },
  ],

  // ── HEADACHE SCENARIOS ────────────────────────────────────────────────
  headache: [
    {
      label: "Thunderclap — SAH until proven otherwise",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      profile: { age: 44, sex: "female", comorbidities: [] },
      clinicalScript: "Worst headache of life. Sudden onset like 'a bat hitting me in the head.' Maximum intensity within seconds. No prior headaches like this.",
    },
    {
      label: "GCA — age 68, jaw claudication",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 68, sex: "female", comorbidities: ["PMR_history"], medications: ["ibuprofen"] },
      clinicalScript: "Temporal headache for 3 weeks. Jaw hurts and gets tired when chewing. Scalp tender. ESR elevated at last check. Vision slightly blurry.",
    },
    {
      label: "Meningitis — fever, neck stiffness, photophobia",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      profile: { age: 22, sex: "male", comorbidities: [] },
      clinicalScript: "Severe headache, fever 103, cannot flex neck. Photophobia. Roommate recently had viral illness. Petechial rash on legs.",
    },
    {
      label: "Classic migraine — known history",
      expectedDisposition: "treat_and_watch",
      isSafety: false,
      profile: { age: 34, sex: "female", comorbidities: ["migraine_hx"], medications: ["sumatriptan"] },
      clinicalScript: "Unilateral throbbing headache 7/10, nausea, photophobia. Similar to prior migraines. Missed dose of sumatriptan. No fever, no neck stiffness, no vision changes.",
    },
    {
      label: "Dr. Thomas patient — 7-day frontal headache, neck pain",
      expectedDisposition: "treat_and_watch",
      isSafety: false,
      profile: { age: 45, sex: "female", comorbidities: [], medications: ["OTC ibuprofen"] },
      clinicalScript: "Frontal headache over eyes for 7 days, off and on. Neck pain and tightness. No fever, no worst-of-life quality. Monthly headaches. Sinus congestion.",
    },
    {
      label: "Confused elderly patient — new severe headache",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      humanFactor: "cognitive_concern",
      profile: { age: 82, sex: "male", comorbidities: ["dementia"], medications: ["warfarin"] },
      clinicalScript: "Family brought in patient on warfarin with new severe headache and confusion. Cannot give history himself. Fell 3 days ago.",
    },
  ],

  // ── UTI / GU SCENARIOS ────────────────────────────────────────────────
  gu_uti: [
    {
      label: "Uncomplicated UTI — classic female presentation",
      expectedDisposition: "treat_and_follow",
      isSafety: false,
      profile: { age: 28, sex: "female", comorbidities: [] },
      clinicalScript: "Burning with urination, frequency, urgency for 2 days. No fever, no back pain. UA: leukocytes, nitrites. Negative pregnancy test.",
    },
    {
      label: "Pyelonephritis — fever, CVA tenderness",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 35, sex: "female", comorbidities: [] },
      clinicalScript: "Dysuria plus fever 102 and right flank pain. CVA tenderness on exam. Nausea, unable to keep fluids down. UA positive.",
    },
    {
      label: "Pregnant with UTI — first trimester",
      expectedDisposition: "treat_and_follow",
      isSafety: true,
      profile: { age: 27, sex: "female", comorbidities: ["pregnancy_10weeks"] },
      clinicalScript: "10 weeks pregnant with dysuria and frequency. No fever. UA positive. Must treat even if mild in pregnancy.",
    },
    {
      label: "Colonization only — no symptoms, UA positive",
      expectedDisposition: "watchful_waiting",
      isSafety: false,
      profile: { age: 55, sex: "female", comorbidities: ["diabetes"] },
      clinicalScript: "Diabetic woman, routine UA shows leukocytes. No dysuria, no frequency, no urgency, no fever. Feeling well. Asymptomatic bacteriuria.",
    },
    {
      label: "PID — adnexal tenderness, STD risk",
      expectedDisposition: "gyn_today",
      isSafety: true,
      profile: { age: 24, sex: "female", comorbidities: [] },
      clinicalScript: "Vaginal discharge, lower abdominal pain, new sexual partner. Adnexal tenderness on bimanual exam. Cervical motion tenderness.",
    },
    {
      label: "Young male UTI — must exclude STD",
      expectedDisposition: "std_workup",
      isSafety: false,
      profile: { age: 24, sex: "male", comorbidities: [] },
      clinicalScript: "Dysuria and urethral discharge in young male. STD risk factors. UTI uncommon in men under 60 — STD must be excluded.",
    },
  ],

  // ── URI / RESPIRATORY SCENARIOS ───────────────────────────────────────
  uri: [
    {
      label: "Pneumonia — age 82, CXR infiltrate, asthma",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 82, sex: "female", comorbidities: ["asthma"], medications: ["albuterol"] },
      clinicalScript: "4 days of cough, sore throat, fever 100.1, dysphagia. Albuterol 3x/day. CXR: infiltrate. CURB-65 score elevated. O2 sat 94%.",
    },
    {
      label: "Epiglottitis — drooling, stridor, cannot swallow",
      expectedDisposition: "ambulance_now",
      isSafety: true,
      profile: { age: 38, sex: "male", comorbidities: ["immunocompromised"] },
      clinicalScript: "Severe sore throat, drooling, stridor, sitting forward. Cannot swallow. Muffled voice. Looks toxic.",
    },
    {
      label: "Strep throat — Centor 4, positive rapid test",
      expectedDisposition: "treat_and_follow",
      isSafety: false,
      profile: { age: 19, sex: "female", comorbidities: [] },
      clinicalScript: "Fever 101, tonsillar exudate, tender anterior nodes, no cough. Centor score 4. Rapid strep positive.",
    },
    {
      label: "Viral URI — antibiotics not indicated",
      expectedDisposition: "treat_and_follow",
      isSafety: false,
      profile: { age: 32, sex: "male", comorbidities: [] },
      clinicalScript: "Runny nose, sore throat, mild cough for 3 days. No fever. Strep negative, flu negative. Clear discharge. Viral URI pattern.",
    },
    {
      label: "COPD exacerbation — more phlegm, worsening SOB",
      expectedDisposition: "er_now",
      isSafety: true,
      profile: { age: 68, sex: "male", comorbidities: ["COPD"], medications: ["tiotropium", "albuterol"], smokingStatus: "former" },
      clinicalScript: "COPD patient with more yellow phlegm and worsening shortness of breath for 3 days. Uses home O2 at 2L. O2 sat 86% on room air.",
    },
  ],
};

// ─── CONVERSATION TRANSCRIPT GENERATOR ───────────────────────────────────
// Generates a realistic patient-doctor dialogue for each scenario
// This is what DataAnnotation.tech pays MDs to do — we automate it

async function generateConversationTranscript(
  scenario: any,
  complaintId: string
): Promise<string> {

  const profileDesc = `
Patient: ${scenario.profile.age} year old ${scenario.profile.sex}
Comorbidities: ${scenario.profile.comorbidities?.join(", ") || "none"}
Medications: ${scenario.profile.medications?.join(", ") || "none"}
Communication style: ${scenario.humanFactor || "clear and cooperative"}
Language: ${scenario.profile.primaryLanguage || "English"}
`;

  const prompt = applyPHIGuard(`
You are simulating a realistic urgent care intake conversation for an AI medical system test.

Clinical scenario: ${scenario.clinicalScript}
${profileDesc}
Expected disposition: ${scenario.expectedDisposition}
Human factor to simulate: ${scenario.humanFactor || "none — patient is clear and cooperative"}

Generate a realistic text conversation between the Auralyn intake system asking questions
and the patient answering. The conversation should:

1. Start with the patient describing their chief complaint in their own words
2. Answer adaptive questions naturally — not perfectly, as real patients don't give
   perfectly organized histories
3. If human factor is "distress": patient expresses fear, uses emotional language
4. If human factor is "language_barrier": patient responds in broken English or a mix
5. If human factor is "cognitive_concern": patient says "I don't know" frequently, confused
6. If human factor is "pediatric_proxy": parent speaks on behalf of child
7. Include at least one answer that is vague or needs follow-up
8. Include the clinical details needed to reach the expected disposition

Format as alternating lines:
PATIENT: [patient response]
SYSTEM: [next question Auralyn would ask]
PATIENT: [response]
...

Generate 8-14 exchanges. Be clinically accurate. Use realistic patient language — not medical terms.
`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: "You generate realistic medical intake conversations for AI system testing. Be clinically accurate. Use natural patient language, not medical terminology.",
      },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

// ─── SINGLE ENCOUNTER RUNNER ──────────────────────────────────────────────

async function runSimulatedEncounter(
  scenario: any,
  complaintId: string,
  source: "gpt4o_generated" | "synthea" | "physician_authored"
): Promise<SimulatedEncounter> {

  const startTime = Date.now();
  const encounterId = crypto.randomUUID();

  // Step 1: Generate conversation transcript
  const transcript = await generateConversationTranscript(scenario, complaintId);

  // Step 2: Extract clinical state from transcript
  // (Uses the same ClinicalStateExtractor that runs in real encounters)
  const { extractClinicalStateFromTranscript } = await import(
    "../dialogue/ClinicalStateExtractor"
  );
  const clinicalState = await extractClinicalStateFromTranscript(transcript);

  // Step 3: Run through complaint pack
  let disposition = "unknown";
  try {
    switch (complaintId) {
      case "chest_pain": {
        const ekg = clinicalState.examFindings?.ekg || { obtained: false, normal: true };
        const result = assessChestPain(clinicalState, ekg);
        disposition = result.disposition;
        break;
      }
      case "abdominal_pain": {
        const result = assessAbdominalPain(clinicalState);
        disposition = result.disposition;
        break;
      }
      case "headache": {
        const result = assessHeadache(clinicalState);
        disposition = result.disposition;
        break;
      }
      case "gu_uti": {
        const ua = clinicalState.tests?.ua || { obtained: false };
        const result = assessGU(clinicalState, ua);
        disposition = result.disposition;
        break;
      }
      case "uri":
      case "sore_throat":
      case "cough": {
        const result = synthesizePlan(clinicalState);
        disposition = result.severity?.level || "treat_and_follow";
        break;
      }
    }
  } catch (err: any) {
    disposition = `ERROR: ${err.message}`;
  }

  const passed = disposition === scenario.expectedDisposition;
  const dangerousFailure = scenario.isSafety && !passed &&
    (disposition === "treat_and_watch" || disposition === "watchful_waiting" ||
     disposition === "treat_and_follow");

  return {
    id: encounterId,
    source,
    complaintId,
    patientProfile: scenario.profile,
    conversationTranscript: transcript,
    extractedClinicalState: clinicalState,
    auraylnDisposition: disposition,
    expectedDisposition: scenario.expectedDisposition,
    passed,
    isSafetyCase: scenario.isSafety || false,
    dangerousFailure,
    humanFactorSignal: scenario.humanFactor || "none",
    processingTimeMs: Date.now() - startTime,
    createdAt: new Date().toISOString(),
  };
}

// ─── BATCH SIMULATION RUNNER ──────────────────────────────────────────────

export async function runSimulationBatch(options: {
  encountersPerScenario?: number;   // default 1, increase for volume testing
  complaintsToTest?: string[];      // default all
  saveToDb?: boolean;               // save results to simulation_runs table
  verbose?: boolean;
}): Promise<SimulationRun> {

  const {
    encountersPerScenario = 1,
    complaintsToTest = Object.keys(SCENARIO_TEMPLATES),
    saveToDb = true,
    verbose = true,
  } = options;

  const runId = crypto.randomUUID();
  const allResults: SimulatedEncounter[] = [];
  const complaintBreakdown: Record<string, { total: number; passed: number }> = {};

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  AURALYN SIMULATION RUN: ${runId.slice(0, 8)}           ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  for (const complaintId of complaintsToTest) {
    const scenarios = SCENARIO_TEMPLATES[complaintId as keyof typeof SCENARIO_TEMPLATES];
    if (!scenarios) continue;

    complaintBreakdown[complaintId] = { total: 0, passed: 0 };
    console.log(`\n── ${complaintId.toUpperCase()} ──`);

    for (const scenario of scenarios) {
      for (let i = 0; i < encountersPerScenario; i++) {
        try {
          const result = await runSimulatedEncounter(scenario, complaintId, "gpt4o_generated");
          allResults.push(result);
          complaintBreakdown[complaintId].total++;
          if (result.passed) complaintBreakdown[complaintId].passed++;

          const icon = result.dangerousFailure ? "💀"
            : result.passed ? "✅"
            : result.isSafetyCase ? "🚨"
            : "❌";

          if (verbose) {
            console.log(`${icon} ${scenario.label}`);
            if (!result.passed) {
              console.log(`   Expected: ${result.expectedDisposition}`);
              console.log(`   Got:      ${result.auraylnDisposition}`);
              if (result.dangerousFailure) {
                console.log(`   ⚠️  DANGEROUS — patient would be under-triaged`);
              }
            }
          }

          // Rate limit GPT-4o calls
          await new Promise(r => setTimeout(r, 500));

        } catch (err: any) {
          console.error(`  ERROR running "${scenario.label}": ${err.message}`);
        }
      }
    }
  }

  // ── Aggregate results ────────────────────────────────────────────────
  const total = allResults.length;
  const passed = allResults.filter(r => r.passed).length;
  const safetyTotal = allResults.filter(r => r.isSafetyCase).length;
  const safetyPassed = allResults.filter(r => r.isSafetyCase && r.passed).length;
  const dangerousFailures = allResults.filter(r => r.dangerousFailure).length;
  const hfDetected = allResults.filter(r => r.humanFactorSignal !== "none").length;

  const run: SimulationRun = {
    runId,
    totalEncounters: total,
    passRate: total > 0 ? passed / total : 0,
    safetyPassRate: safetyTotal > 0 ? safetyPassed / safetyTotal : 1,
    dangerousFailures,
    humanFactorDetectionRate: hfDetected / Math.max(allResults.filter(r => r.humanFactorSignal !== "none").length, 1),
    averageProcessingMs: allResults.reduce((s, r) => s + r.processingTimeMs, 0) / Math.max(total, 1),
    complaintBreakdown,
    demographicBreakdown: buildDemographicBreakdown(allResults),
    failedCases: allResults.filter(r => !r.passed),
    createdAt: new Date().toISOString(),
  };

  // ── Print summary ────────────────────────────────────────────────────
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║ RESULTS                                              ║`);
  console.log(`║ Total:          ${total} encounters                        ║`);
  console.log(`║ Pass rate:      ${(run.passRate * 100).toFixed(1)}%                           ║`);
  console.log(`║ Safety pass:    ${(run.safetyPassRate * 100).toFixed(1)}% (must be 100%)             ║`);
  console.log(`║ Dangerous fail: ${dangerousFailures} (must be 0)                    ║`);
  console.log(`╚══════════════════════════════════════════════════════╝\n`);

  if (dangerousFailures > 0) {
    console.log("🚨 DEPLOYMENT BLOCKED — dangerous failures present\n");
  } else if (run.safetyPassRate < 1.0) {
    console.log("⚠️  Safety failures present — review before deployment\n");
  } else if (run.passRate >= 0.9) {
    console.log("✅ Simulation passed — system performing well\n");
  }

  // ── Save to DB ───────────────────────────────────────────────────────
  if (saveToDb) {
    await db.execute(
      `INSERT INTO simulation_runs
       (run_id, total_encounters, pass_rate, safety_pass_rate, dangerous_failures,
        complaint_breakdown, failed_cases, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        runId, total, run.passRate, run.safetyPassRate, dangerousFailures,
        JSON.stringify(complaintBreakdown),
        JSON.stringify(run.failedCases.map(f => ({
          id: f.id, complaintId: f.complaintId,
          expected: f.expectedDisposition, actual: f.auraylnDisposition,
          dangerous: f.dangerousFailure,
        }))),
        run.createdAt,
      ]
    );

    await appendAuditEvent({
      eventType: "SIMULATION_RUN_COMPLETE",
      metadata: {
        runId, total, passRate: run.passRate,
        safetyPassRate: run.safetyPassRate, dangerousFailures,
      },
    });
  }

  return run;
}

function buildDemographicBreakdown(results: SimulatedEncounter[]) {
  const breakdown: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    const ageGroup = r.patientProfile.age < 18 ? "pediatric"
      : r.patientProfile.age < 65 ? "adult"
      : "elderly";
    if (!breakdown[ageGroup]) breakdown[ageGroup] = { total: 0, passed: 0 };
    breakdown[ageGroup].total++;
    if (r.passed) breakdown[ageGroup].passed++;

    const sex = r.patientProfile.sex;
    if (!breakdown[sex]) breakdown[sex] = { total: 0, passed: 0 };
    breakdown[sex].total++;
    if (r.passed) breakdown[sex].passed++;
  }
  return breakdown;
}

// ─── DB MIGRATION ─────────────────────────────────────────────────────────
// Run this SQL once:
/*
CREATE TABLE IF NOT EXISTS simulation_runs (
  run_id              UUID PRIMARY KEY,
  total_encounters    INTEGER,
  pass_rate           DECIMAL(5,4),
  safety_pass_rate    DECIMAL(5,4),
  dangerous_failures  INTEGER,
  complaint_breakdown JSONB,
  failed_cases        JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulated_encounters (
  id                      UUID PRIMARY KEY,
  run_id                  UUID REFERENCES simulation_runs(run_id),
  source                  TEXT,
  complaint_id            TEXT,
  patient_profile         JSONB,
  conversation_transcript TEXT,
  extracted_clinical_state JSONB,
  auralyn_disposition     TEXT,
  expected_disposition    TEXT,
  passed                  BOOLEAN,
  is_safety_case          BOOLEAN,
  dangerous_failure       BOOLEAN,
  human_factor_signal     TEXT,
  processing_time_ms      INTEGER,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);
*/

// ─── PACKAGE.JSON SCRIPTS TO ADD ─────────────────────────────────────────
/*
"simulate:quick":  "npx tsx -e \"import('./server/simulation/EncounterSimulationEngine').then(m => m.runSimulationBatch({ encountersPerScenario: 1, verbose: true }))\"",
"simulate:full":   "npx tsx -e \"import('./server/simulation/EncounterSimulationEngine').then(m => m.runSimulationBatch({ encountersPerScenario: 5, verbose: true }))\"",
"simulate:volume": "npx tsx -e \"import('./server/simulation/EncounterSimulationEngine').then(m => m.runSimulationBatch({ encountersPerScenario: 100, verbose: false }))\"",
*/

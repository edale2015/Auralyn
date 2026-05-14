/**
 * AURALYN — Clinical State Extractor
 * 
 * This is the piece that makes the whole system work:
 * it converts a natural doctor-patient conversation transcript
 * into a structured ClinicalState object that the reasoning engine can use.
 * 
 * This runs AFTER the voice transcript is captured.
 * It uses GPT-4o with a specialized extraction prompt.
 * PHI guard is applied before every LLM call.
 * 
 * File: server/kb/ClinicalStateExtractor.ts
 */

import OpenAI from "openai";
import { applyPHIGuard } from "../safety/PHIGuard";
import { ClinicalState } from "./ClinicalStateBuilder";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * THE CORE EXTRACTION PROMPT
 * 
 * This is where the magic happens. The prompt teaches GPT-4o to
 * think like a physician extracting structured data from a conversation.
 * 
 * Key design decisions:
 * 1. Extract INFERENCES, not just explicit statements
 *    - "hurts to drink water" → dysphagia = true
 *    - "uses inhaler 3x/day" → asthma poorly controlled
 *    - "keeps me up at night" → nocturnal symptoms = true
 * 
 * 2. Capture NEGATIVES explicitly
 *    - "no nausea" is clinically meaningful
 *    - "hasn't been to ER for asthma" is meaningful
 * 
 * 3. Capture PATIENT PATTERN SIGNALS
 *    - "I think I need antibiotics" → patient requested abx
 *    - "I usually get a Z-pack" → prior pattern
 *    - "I've had this before" → prior similar illness
 * 
 * 4. Capture CONDITIONAL BRANCHES the physician explored
 *    - Questions about smoking → consider cessation
 *    - Question about second inhaler → upgrade asthma therapy
 */

const EXTRACTION_SYSTEM_PROMPT = `
You are a clinical data extraction engine. You will receive a transcript of a 
physician-patient conversation and extract ALL clinically relevant data into a 
structured JSON object.

CRITICAL RULES:
1. Extract INFERENCES, not just literal statements.
   - "it really hurts to drink water" = dysphagia: true
   - "keeps me up at night" = nocturnalCough: true, nocturnalDyspnea: true
   - "uses inhaler about 3 times a day" = albuterolUsagePerDay: 3, poorlyControlledAsthma: true
   - "yes but it helps for a little while" = inhalerHelpsPartially: true
   
2. Capture ALL mentioned symptoms, even those the patient denied.
   Denied symptoms are clinically important (they narrow the differential).
   
3. Capture patient's requests and prior patterns:
   - "I think I need antibiotics" = patientRequestedAbx: true
   - "I usually get a Z-pack" = usuallyGetsZpack: true
   - "I've had this type of infection before" = priorSimilarIllness: true

4. Capture physician's exam findings and test results mentioned:
   - "they are all negative" = rapidTests: { strep: negative, flu: negative, covid: negative }
   - "I think I see some infection on the X-ray" = cxrFindings: ["infiltrate"]
   - "your blood pressure is a little low" = hypotension: true

5. If a number is mentioned, extract it precisely:
   - "100.1 this morning" = fever: true, temp: 100.1, feverTiming: "this morning"
   - "4 days" = symptomDuration: 4
   - "3 times a day" = albuterolUsagePerDay: 3
   - "82" = age: 82

6. Extract the physician's DECISION BRANCHES that were opened:
   These tell you what the physician was considering.
   - Asked about second inhaler → asthmaManagement: true
   - Asked about ER visits for asthma → assessingAsthmaControl: true
   - Asked about smoking → smokingScreen: true
   - Offered contingency antibiotics → contingencyAbxOffered: true

Return ONLY valid JSON. No markdown, no explanation, no preamble.
The JSON structure is defined below. Use null for any field not mentioned.
`;

const EXTRACTION_SCHEMA = `
{
  "symptoms": {
    "chiefComplaint": "string",
    "sorethroat": "boolean | null",
    "cough": "boolean | null",
    "productivePhlegm": "boolean | null",
    "coloredPhlegm": "boolean | null",         // yellow or green phlegm
    "sinusCongestion": "boolean | null",
    "nasalDrainage": "boolean | null",
    "dysphagia": "boolean | null",             // painful swallowing
    "dyspnea": "boolean | null",               // shortness of breath
    "stridor": "boolean | null",
    "drooling": "boolean | null",
    "nocturnalCough": "boolean | null",
    "nocturnalDyspnea": "boolean | null",
    "chestTightness": "boolean | null",
    "chestPain": "boolean | null",
    "bodyAches": "boolean | null",
    "fatigue": "boolean | null",
    "nausea": "boolean | null",
    "vomiting": "boolean | null",
    "diarrhea": "boolean | null",
    "headache": "boolean | null",
    "tonsilllarExudate": "boolean | null",
    "tenderAnteriorNodes": "boolean | null",
    "uvulaEnlarged": "boolean | null",
    "facialPain": "boolean | null",
    "earPain": "boolean | null",
    "symptomDuration": "number | null",        // days
    "worseAfterInitialImprovement": "boolean | null",
    "symptomsWorsening": "boolean | null"
  },
  "vitals": {
    "fever": "boolean | null",
    "temp": "number | null",
    "feverTiming": "string | null",
    "o2sat": "number | null",
    "bpSystolic": "number | null",
    "bpDiastolic": "number | null",
    "hypotension": "boolean | null",
    "heartRate": "number | null",
    "respiratoryRate": "number | null"
  },
  "history": {
    "age": "number | null",
    "asthma": "boolean | null",
    "copd": "boolean | null",
    "diabetes": "boolean | null",
    "heartFailure": "boolean | null",
    "hypertension": "boolean | null",
    "immunocompromised": "boolean | null",
    "allergies": "boolean | null",
    "allergyMedications": ["string"],          // e.g. ["Claritin"]
    "nasalSpray": "boolean | null",
    "medicationAllergies": ["string"],         // drug allergies
    "currentMedications": ["string"],
    "smoker": "boolean | null",
    "hadPneumoniaBefore": "boolean | null",
    "priorBronchitis": "boolean | null",
    "priorSimilarIllness": "boolean | null",
    "usuallyGetsZpack": "boolean | null",
    "erVisitsAsthma12mo": "number | null",
    "albuterolUsagePerDay": "number | null",
    "hasSpacerDevice": "boolean | null",
    "hasSecondInhaler": "boolean | null",
    "inhalerHelpsPartially": "boolean | null",
    "weightKg": "number | null"
  },
  "patientSignals": {
    "patientRequestedAbx": "boolean | null",
    "patientRequestedXray": "boolean | null",
    "patientRequestedWorkNote": "boolean | null",
    "pharmacyMentioned": "string | null",
    "patientExpressedConcern": "string | null"
  },
  "tests": {
    "strepTested": "boolean | null",
    "strepResult": "string | null",            // positive | negative | pending
    "fluTested": "boolean | null",
    "fluResult": "string | null",
    "covidTested": "boolean | null",
    "covidResult": "string | null",
    "monoTested": "boolean | null",
    "monoResult": "string | null",
    "cxrOrdered": "boolean | null",
    "cxrFindings": ["string"]                  // e.g. ["infiltrate", "clear"]
  },
  "physicianDecisionBranches": {
    "asthmaManagement": "boolean | null",
    "smokingScreen": "boolean | null",
    "contingencyAbxOffered": "boolean | null",
    "steroidsDiscussed": "boolean | null",
    "nebDiscussed": "boolean | null",
    "workNoteDiscussed": "boolean | null"
  }
}
`;

export async function extractClinicalStateFromTranscript(
  transcript: string
): Promise<ClinicalState> {
  
  // Apply PHI guard before sending to OpenAI
  const guardedTranscript = applyPHIGuard(transcript);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: EXTRACTION_SYSTEM_PROMPT + "\n\nJSON SCHEMA:\n" + EXTRACTION_SCHEMA,
      },
      {
        role: "user",
        content: `Extract all clinical data from this transcript:\n\n${guardedTranscript}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const clean = content.replace(/```json|```/g, "").trim();
  
  try {
    const extracted = JSON.parse(clean);
    return mapExtractedToClinicalState(extracted);
  } catch {
    console.error("[ClinicalStateExtractor] JSON parse failed");
    throw new Error("Failed to extract clinical state from transcript");
  }
}

function mapExtractedToClinicalState(extracted: any): ClinicalState {
  return {
    symptoms: {
      ...extracted.symptoms,
      symptomDuration: extracted.symptoms?.symptomDuration ?? 0,
    },
    vitals: {
      ...extracted.vitals,
      fever: extracted.vitals?.fever ?? false,
      temp: extracted.vitals?.temp ?? null,
    },
    history: {
      ...extracted.history,
      age: extracted.history?.age ?? 0,
      medicationAllergies: extracted.history?.medicationAllergies ?? [],
      currentMedications: extracted.history?.currentMedications ?? [],
      allergyMedications: extracted.history?.allergyMedications ?? [],
      cxrFindings: extracted.tests?.cxrFindings ?? [],
      hadPneumoniaBefore: extracted.history?.hadPneumoniaBefore ?? false,
      usuallyGetsZpack: extracted.history?.usuallyGetsZpack ?? false,
      priorBronchitis: extracted.history?.priorBronchitis ?? false,
      asthma: extracted.history?.asthma ?? false,
      smoker: extracted.history?.smoker ?? false,
      albuterolUsagePerDay: extracted.history?.albuterolUsagePerDay ?? 0,
      erVisitsAsthma12mo: extracted.history?.erVisitsAsthma12mo ?? 0,
      hasSpacs: extracted.history?.hasSpacerDevice ?? false,
      hasSecondInhaler: extracted.history?.hasSecondInhaler ?? false,
    },
    tests: {
      strepNegative: extracted.tests?.strepResult === "negative",
      fluNegative: extracted.tests?.fluResult === "negative",
      covidNegative: extracted.tests?.covidResult === "negative",
      cxrFindings: extracted.tests?.cxrFindings ?? [],
    },
    preferences: {
      pharmacy: extracted.patientSignals?.pharmacyMentioned ?? null,
      needsWorkNote: extracted.patientSignals?.patientRequestedWorkNote ?? false,
    },
    diagnosis: null, // filled in after synthesis
  };
}

/**
 * EXAMPLE: What the extractor produces from Dr. Thomas's transcript
 * 
 * Input: the full conversation transcript
 * Output (abbreviated):
 * {
 *   symptoms: {
 *     chiefComplaint: "sore throat and cough",
 *     sorethroat: true,
 *     cough: true,
 *     productivePhlegm: true,
 *     sinusCongestion: true,
 *     dysphagia: true,          // "it really hurts" to drink
 *     dyspnea: true,
 *     nocturnalCough: true,     // "keeps me up at night"
 *     bodyAches: true,
 *     fatigue: true,
 *     nausea: false,            // explicitly denied
 *     symptomDuration: 4,
 *   },
 *   vitals: {
 *     fever: true,
 *     temp: 100.1,
 *     feverTiming: "this morning",
 *   },
 *   history: {
 *     age: 82,
 *     asthma: true,
 *     albuterolUsagePerDay: 3,  // inferred: "about 3 times a day"
 *     hasSpacerDevice: false,   // "no I don't"
 *     hasSecondInhaler: false,
 *     erVisitsAsthma12mo: 0,
 *     allergies: true,
 *     allergyMedications: ["Claritin"],
 *     nasalSpray: false,
 *     medicationAllergies: [],
 *     currentMedications: [],   // "No" to medications
 *     smoker: false,
 *   },
 *   patientSignals: {
 *     patientRequestedAbx: true,  // "I think I need antibiotics"
 *     patientRequestedXray: true, // "yes" to chest xray question
 *   },
 *   tests: {
 *     strepNegative: true,
 *     fluNegative: true,
 *     covidNegative: true,
 *     cxrFindings: ["infiltrate"],  // "I think I see some infection"
 *   }
 * }
 * 
 * With this state, the reasoning engine then produces:
 * - Diagnosis: Community-acquired pneumonia (primary) + Asthma exacerbation (secondary)
 * - Severity: Severe (age 82 + dysphagia + dyspnea + CXR infiltrate)
 * - Risk: Very high (age 82, asthma, pneumonia)
 * - Antibiotics: Two antibiotics NOW (amox-clav + azithromycin for CAP)
 * - Imaging: Chest X-ray (already done, positive)
 * - Asthma: Upgrade to ICS + nebulizer + spacer (3x/day usage = uncontrolled)
 * - Symptom management: Benzonatate, Mucinex DM, pseudoephedrine, acetaminophen/ibuprofen
 * - Option: Single-dose dexamethasone (steroid burst)
 */

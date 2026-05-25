// Clinical knowledge for the neuro_headache physician packet.
//
// Pulled in ONE call at the end of a conversation (after the LLM has closed
// the interview with the fixed handoff message). This data is what the
// physician reviews alongside the conversation transcript — it is NEVER
// shown to the patient.

export interface ClinicalKnowledge {
  slug:           string;
  display:        string;
  differentials:  Array<{ dx: string; commonality: "common" | "uncommon" | "rare"; redFlagFor?: string }>;
  labsImaging:    string[];
  treatments:     string[];
  icd10Codes:     Array<{ code: string; description: string }>;
  physicianNotes: string[];   // guideline reminders surfaced on the review card
}

export const NEURO_HEADACHE_KNOWLEDGE: ClinicalKnowledge = {
  slug:    "neuro_headache",
  display: "Headache",

  differentials: [
    { dx: "Tension-type headache",        commonality: "common"   },
    { dx: "Migraine (with or without aura)", commonality: "common" },
    { dx: "Sinusitis",                    commonality: "common"   },
    { dx: "Medication-overuse headache",  commonality: "common"   },
    { dx: "Cervicogenic headache",        commonality: "common"   },
    { dx: "Post-traumatic headache",      commonality: "uncommon", redFlagFor: "head trauma" },
    { dx: "Subarachnoid hemorrhage",      commonality: "rare",     redFlagFor: "thunderclap onset" },
    { dx: "Bacterial meningitis",         commonality: "rare",     redFlagFor: "fever + stiff neck" },
    { dx: "Ischemic stroke / TIA",        commonality: "rare",     redFlagFor: "focal neuro deficit" },
    { dx: "Giant cell arteritis",         commonality: "rare",     redFlagFor: "age >50 + new headache" },
    { dx: "Cerebral venous sinus thrombosis", commonality: "rare", redFlagFor: "postpartum / oral contraceptives" },
    { dx: "Intracranial mass",            commonality: "rare",     redFlagFor: "progressive + AM headache" },
  ],

  labsImaging: [
    "Vital signs (BP, HR, temp, O2 sat)",
    "Neurological exam (cranial nerves, motor, sensory, gait, cerebellar)",
    "If thunderclap suspected: non-contrast head CT now, LP if CT negative",
    "If fever + stiff neck: CBC, blood cultures x2, head CT then LP, empirical antibiotics if meningitis suspected",
    "If focal deficit: stat non-contrast head CT, CT angiography if stroke window allows",
    "If age >50 + new headache: ESR, CRP — consider temporal artery biopsy",
    "Routine labs only if systemic features (fever, weight loss, immunocompromise): CBC, BMP, CRP",
  ],

  treatments: [
    "Tension/migraine without red flags: NSAID (ibuprofen 600 mg PO) or acetaminophen 1 g PO",
    "Migraine: triptan if no contraindication; consider antiemetic (ondansetron 4 mg) if nausea",
    "Hydration, dim lighting, rest",
    "Avoid opioid analgesics for routine headache management",
    "Patient education on red-flag return precautions (sudden severe headache, fever, neck stiffness, neuro changes, vision loss, persistent vomiting)",
    "Follow-up with PCP or neurology if recurrent or escalating pattern",
  ],

  icd10Codes: [
    { code: "R51.9",  description: "Headache, unspecified" },
    { code: "G44.209", description: "Tension-type headache, unspecified, not intractable" },
    { code: "G43.909", description: "Migraine, unspecified, not intractable, without status migrainosus" },
    { code: "G44.40", description: "Drug-induced headache, NEC, not intractable" },
    { code: "R51.0",  description: "Headache with orthostatic component" },
  ],

  physicianNotes: [
    "AI conducted intake only — disposition has NOT been communicated to the patient.",
    "Confirm red-flag findings on direct exam before final disposition.",
    "Re-verify any positive red flag verbally — patient self-report via chat is not exam-equivalent.",
    "Document the rationale for ER vs urgent care vs PCP follow-up in the chart.",
  ],
};

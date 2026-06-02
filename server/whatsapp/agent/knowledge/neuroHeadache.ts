// Clinical knowledge for the neuro_headache physician packet.
//
// Pulled in ONE call at the end of a conversation (after the LLM has closed
// the interview with the fixed handoff message). This data is what the
// physician reviews alongside the conversation transcript — it is NEVER
// shown to the patient.

export interface ClinicalKnowledge {
  slug:           string;
  display:        string;
  differentials:  Array<{ dx: string; commonality: "common" | "uncommon" | "rare"; redFlagFor?: string; pattern?: string }>;
  labsImaging:    string[];
  treatments:     string[];
  icd10Codes:     Array<{ code: string; description: string }>;
  physicianNotes: string[];   // guideline reminders surfaced on the review card
}

export const NEURO_HEADACHE_KNOWLEDGE: ClinicalKnowledge = {
  slug:    "neuro_headache",
  display: "Headache",

  differentials: [
    { dx: "Tension-type headache",        commonality: "common",   pattern: "bilateral pressure, neck/shoulder tension, no neuro deficit, severity < 7" },
    { dx: "Migraine (with or without aura)", commonality: "common", pattern: "unilateral throbbing, nausea, light/sound sensitivity, worse with movement, prior similar history" },
    { dx: "Sinusitis",                    commonality: "common",   pattern: "frontal/facial pressure, congestion, worsening > 7 days" },
    { dx: "Viral illness headache",       commonality: "common",   pattern: "fever + sore throat + body aches + fatigue, < 7 days" },
    { dx: "Medication-overuse headache",  commonality: "common"   },
    { dx: "Cervicogenic headache",        commonality: "common"   },
    { dx: "Hypertensive headache",        commonality: "uncommon", redFlagFor: "markedly elevated BP", pattern: "known HTN, occipital, high severity, no other cause" },
    { dx: "Post-traumatic headache",      commonality: "uncommon", redFlagFor: "head trauma" },
    { dx: "Cluster headache",             commonality: "uncommon", redFlagFor: "clustered severe unilateral attacks" },
    { dx: "Idiopathic intracranial hypertension", commonality: "uncommon", redFlagFor: "pulsatile tinnitus / papilledema" },
    { dx: "Subarachnoid hemorrhage",      commonality: "rare",     redFlagFor: "thunderclap onset" },
    { dx: "Bacterial meningitis",         commonality: "rare",     redFlagFor: "fever + stiff neck / photophobia" },
    { dx: "Meningococcemia",              commonality: "rare",     redFlagFor: "fever + rash" },
    { dx: "Ischemic stroke / TIA",        commonality: "rare",     redFlagFor: "focal neuro deficit" },
    { dx: "Giant cell arteritis",         commonality: "rare",     redFlagFor: "age >=50 + temple tenderness / jaw claudication" },
    { dx: "Acute angle-closure glaucoma", commonality: "rare",     redFlagFor: "eye pain + headache" },
    { dx: "Carbon monoxide poisoning",    commonality: "rare",     redFlagFor: "exposure history (generator / heater / gas leak)" },
    { dx: "Preeclampsia / eclampsia",     commonality: "rare",     redFlagFor: "pregnancy >20 weeks or postpartum" },
    { dx: "Cerebral venous sinus thrombosis", commonality: "rare", redFlagFor: "pulsatile tinnitus / pregnancy / postpartum / OCPs" },
    { dx: "Intracranial mass",            commonality: "rare",     redFlagFor: "progressive + AM headache" },
  ],

  labsImaging: [
    "Vital signs (BP, HR, temp, O2 sat) — recheck BP if markedly elevated",
    "Neurological exam (cranial nerves, motor, sensory, gait, cerebellar); fundoscopy for papilledema",
    "If thunderclap suspected: non-contrast head CT now, LP if CT negative",
    "If fever + stiff neck / photophobia: CBC, blood cultures x2, head CT then LP, empirical antibiotics if meningitis suspected",
    "If fever + rash: assess for petechiae/purpura; treat as possible meningococcemia",
    "If focal deficit: stat non-contrast head CT, CT angiography if stroke window allows",
    "If age >=50 + new headache: ESR, CRP — consider temporal artery biopsy",
    "If eye pain: measure intraocular pressure / urgent ophthalmology for acute angle-closure glaucoma",
    "If pulsatile tinnitus: MRI brain + MR venography, ophthalmology / LP opening pressure (IIH vs CVST) — image regardless of demographics",
    "If carbon monoxide exposure: carboxyhemoglobin level (co-oximetry) / ABG",
    "If pregnant >20 weeks or postpartum: BP, urine protein, CBC/LFTs/platelets (preeclampsia screen)",
    "If migraine pattern: no imaging indicated unless first/worst headache or focal neuro deficit",
    "If tension-type pattern: no imaging indicated",
    "Routine labs only if systemic features (fever, weight loss, immunocompromise): CBC, BMP, CRP",
  ],

  treatments: [
    "Tension/migraine without red flags: NSAID (ibuprofen 600-800 mg PO) or acetaminophen 1 g PO",
    "Ketorolac (Toradol) 30 mg IM — parenteral NSAID option",
    "Migraine: triptan if no contraindication (sumatriptan 6 mg SQ or 50-100 mg PO); consider antiemetic (ondansetron 4 mg, or metoclopramide/Reglan 10 mg IV/IM if nausea)",
    "Tension with muscle component: cyclobenzaprine 5-10 mg PO or methocarbamol 750 mg PO",
    "IV fluids if a dehydration component is present",
    "Hydration, dim lighting, rest",
    "Avoid opioid analgesics for routine headache management",
    "Time-critical red flags (SAH, meningitis, stroke, acute glaucoma, GCA, CO exposure, preeclampsia): physician to direct definitive management — do not delay.",
    "If giant cell arteritis suspected: corticosteroids are time-critical to prevent vision loss — physician to initiate per guideline; do not wait for biopsy.",
    "If carbon monoxide exposure: remove from source, high-flow oxygen; physician to consider hyperbaric per toxicology.",
    "Patient education on red-flag return precautions (sudden severe headache, fever, neck stiffness, neuro changes, vision loss, persistent vomiting)",
    "Follow-up with PCP or neurology if recurrent or escalating pattern (frequent migraines, cluster pattern, abnormal imaging, or first/worst headache)",
  ],

  icd10Codes: [
    { code: "R51.9",  description: "Headache, unspecified" },
    { code: "G44.209", description: "Tension-type headache, unspecified, not intractable" },
    { code: "G43.909", description: "Migraine, unspecified, not intractable, without status migrainosus" },
    { code: "G43.009", description: "Migraine without aura, not intractable, without status migrainosus" },
    { code: "G43.109", description: "Migraine with aura, not intractable, without status migrainosus" },
    { code: "G44.309", description: "Post-traumatic headache, unspecified, not intractable" },
    { code: "M54.2",  description: "Cervicalgia (neck-pain component)" },
    { code: "G44.40", description: "Drug-induced headache, NEC, not intractable" },
    { code: "R51.0",  description: "Headache with orthostatic component" },
  ],

  physicianNotes: [
    "AI conducted intake only — disposition has NOT been communicated to the patient.",
    "Confirm red-flag findings on direct exam before final disposition.",
    "Re-verify any positive red flag verbally — patient self-report via chat is not exam-equivalent.",
    "Pulsatile tinnitus, eye pain, and focal deficits are red flags regardless of patient sex, age, or body habitus — do not demographically discount.",
    "Age 50+ with new headache: check ESR/CRP for giant cell arteritis; vision-loss risk is time-critical.",
    "Pregnant or recently postpartum with headache: screen for preeclampsia (BP, urine protein) and cerebral venous sinus thrombosis.",
    "Document the rationale for ER vs urgent care vs PCP follow-up in the chart.",
  ],
};

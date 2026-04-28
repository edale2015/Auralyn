/**
 * followUpProtocolSeeds.ts
 *
 * Default protocol definitions for each chronic/post-acute complaint slug.
 * Run once via: npx tsx server/followup/seedProtocols.ts
 * Or call seedFollowUpProtocols() from server startup if table is empty.
 */

export interface ProtocolQuestion {
  id:          string;
  text:        string;
  type:        "yn" | "scale" | "text";
  escalateIf?: string;
}

export interface ProtocolSeed {
  complaintSlug:        string;
  name:                 string;
  scheduleDays:         number[];
  questions:            ProtocolQuestion[];
  escalationThreshold:  number;
}

export const FOLLOW_UP_PROTOCOL_SEEDS: ProtocolSeed[] = [

  {
    complaintSlug:       "hypertensive_urgency",
    name:                "Post-Hypertensive Urgency Follow-Up",
    scheduleDays:        [1, 3, 7],
    escalationThreshold: 0.6,
    questions: [
      { id: "bp_checked",       text: "Have you been able to check your blood pressure today? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "headache",         text: "Are you having a headache, vision changes, or chest pain? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
      { id: "medication_taken", text: "Have you taken your blood pressure medication today? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
    ],
  },

  {
    complaintSlug:       "hyperglycemia",
    name:                "Post-Hyperglycemia Follow-Up",
    scheduleDays:        [1, 3, 7, 30],
    escalationThreshold: 0.65,
    questions: [
      { id: "glucose_checked", text: "Have you checked your blood sugar today? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "symptoms",        text: "Are you feeling nauseous, confused, or having difficulty breathing? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
      { id: "insulin_taken",   text: "Have you taken your diabetes medication or insulin as prescribed? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
    ],
  },

  {
    complaintSlug:       "hypoglycemia",
    name:                "Post-Hypoglycemia Follow-Up",
    scheduleDays:        [1, 3],
    escalationThreshold: 0.7,
    questions: [
      { id: "feeling_better",  text: "Are you feeling better since your visit? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "eating_regularly",text: "Have you been able to eat regular meals today? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "repeat_episode",  text: "Have you had another low blood sugar episode since your visit? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
    ],
  },

  {
    complaintSlug:       "asthma_exacerbation",
    name:                "Post-Asthma Exacerbation Follow-Up",
    scheduleDays:        [2, 7, 30],
    escalationThreshold: 0.65,
    questions: [
      { id: "breathing_improved",   text: "Is your breathing better than when you were seen? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "rescue_inhaler_use",   text: "Have you needed your rescue inhaler more than 2 times today? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
      { id: "controller_taken",     text: "Are you taking your controller inhaler as prescribed? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
    ],
  },

  {
    complaintSlug:       "copd_exacerbation",
    name:                "Post-COPD Exacerbation Follow-Up",
    scheduleDays:        [2, 7, 30],
    escalationThreshold: 0.6,
    questions: [
      { id: "breathing_improved", text: "Is your shortness of breath improving since your visit? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "fever",              text: "Do you have a fever or are you coughing up green or brown mucus? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
      { id: "medications_taken",  text: "Have you been taking all your prescribed medications? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
    ],
  },

  {
    complaintSlug:       "decompensated_heart_failure",
    name:                "Post-Heart Failure Follow-Up",
    scheduleDays:        [1, 3, 7],
    escalationThreshold: 0.55,
    questions: [
      { id: "weight_gained",  text: "Have you gained more than 2 pounds since yesterday? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
      { id: "swelling_worse", text: "Is the swelling in your legs or feet getting worse? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
      { id: "diuretic_taken", text: "Have you taken your water pill (diuretic) today? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
    ],
  },

  {
    complaintSlug:       "leg_swelling",
    name:                "Post-Leg Swelling Follow-Up",
    scheduleDays:        [3, 7],
    escalationThreshold: 0.65,
    questions: [
      { id: "swelling_improving", text: "Is your leg swelling getting better? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "pain_redness",       text: "Do you have new pain, redness, or warmth in the swollen leg? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
    ],
  },

  {
    complaintSlug:       "uti",
    name:                "Post-UTI Treatment Follow-Up",
    scheduleDays:        [3, 7],
    escalationThreshold: 0.7,
    questions: [
      { id: "symptoms_resolved",    text: "Have your UTI symptoms (burning, urgency) improved? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "antibiotics_completed",text: "Have you finished all your antibiotics? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "fever_or_back_pain",   text: "Do you have fever or back/flank pain? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
    ],
  },

  {
    complaintSlug:       "thyroid_symptoms",
    name:                "Post-Thyroid Visit Follow-Up",
    scheduleDays:        [7, 30],
    escalationThreshold: 0.65,
    questions: [
      { id: "medication_taken",     text: "Are you taking your thyroid medication as prescribed? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "symptoms_improving",   text: "Are your symptoms (fatigue, weight changes, heart racing) improving? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
    ],
  },

  {
    complaintSlug:       "metabolic_derangement",
    name:                "Post-Metabolic Visit Follow-Up",
    scheduleDays:        [7, 30],
    escalationThreshold: 0.7,
    questions: [
      { id: "diet_adherence",   text: "Have you been following the dietary changes discussed at your visit? Reply Y or N.", type: "yn" },
      { id: "medications_taken",text: "Are you taking all prescribed medications? Reply Y or N.", type: "yn", escalateIf: "yn:no" },
      { id: "new_symptoms",     text: "Have you had any new or worsening symptoms? Reply Y or N.", type: "yn", escalateIf: "yn:yes" },
    ],
  },
];

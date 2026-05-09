/**
 * differentialPulseTrigger.ts
 * Drop into: client/src/lib/differentialPulseTrigger.ts
 *
 * CONNECTS VOICE CAPTURE → DIFFERENTIAL PANEL ANIMATION
 *
 * WHAT THIS DOES:
 * When capturePatientAnswer() returns a high-confidence match on a field
 * that is a known differential driver, this module determines WHICH
 * diagnoses on the right panel should pulse/highlight — and how urgently.
 *
 * THREE ANIMATION LEVELS:
 *   CRITICAL  — red pulse border, stays for 4 seconds
 *               Triggered by: radiation to arm, thunderclap, syncope with exertion
 *               Means: physician attention required NOW
 *
 *   ELEVATE   — amber pulse border, stays for 2.5 seconds
 *               Triggered by: pleuritic pain, leg swelling, exertional onset
 *               Means: this diagnosis just became more likely
 *
 *   INFORM    — blue subtle flash, stays for 1.5 seconds
 *               Triggered by: burning quality, antacid relief, prior episode
 *               Means: useful signal, not urgent
 */

import type { CaptureResult } from "./livePatientCapture";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PulseLevel = "CRITICAL" | "ELEVATE" | "INFORM";

export interface DifferentialTrigger {
  diagnoses:   string[];
  level:       PulseLevel;
  durationMs:  number;
  reason:      string;
  scrollTo?:   boolean;
}

// ─── Diagnosis IDs ────────────────────────────────────────────────────────────

const DX = {
  STEMI_ACS:          "stemi_acs",
  NSTEMI:             "nstemi",
  UNSTABLE_ANGINA:    "unstable_angina",
  AORTIC_DISSECTION:  "aortic_dissection",
  PE:                 "pulmonary_embolism",
  PERICARDITIS:       "pericarditis",
  MYOCARDITIS:        "myocarditis",
  GERD:               "gerd_esophageal",
  MSK_CHEST:          "msk_costochondritis",
  ANXIETY_CHEST:      "anxiety_panic",

  SAH:                "subarachnoid_hemorrhage",
  STROKE:             "stroke_tia",
  MENINGITIS:         "meningitis",
  MIGRAINE:           "migraine",
  TENSION_HA:         "tension_headache",

  PNEUMONIA:          "pneumonia",
  ASTHMA:             "asthma_exacerbation",
  COPD:               "copd_exacerbation",

  APPENDICITIS:       "appendicitis",
  CHOLECYSTITIS:      "cholecystitis",
  PANCREATITIS:       "pancreatitis",
  BOWEL_OBSTRUCTION:  "bowel_obstruction",

  ECTOPIC:            "ectopic_pregnancy",
  TORSION:            "testicular_torsion",
  PYELONEPHRITIS:     "pyelonephritis",

  FRACTURE:           "fracture",
  CAUDA_EQUINA:       "cauda_equina",
  COMPARTMENT:        "compartment_syndrome",

  ANAPHYLAXIS:        "anaphylaxis",
  SEPSIS:             "sepsis",
  NECROTIZING:        "necrotizing_fasciitis",
};

// ─── Trigger map ──────────────────────────────────────────────────────────────

type TriggerMap = Record<string,
  Record<string,
    Record<string, DifferentialTrigger>>>;

const TRIGGER_MAP: TriggerMap = {

  chest_pain: {
    Q_CP_QUALITY: {
      pressure_squeezing: {
        diagnoses:  [DX.STEMI_ACS, DX.UNSTABLE_ANGINA, DX.NSTEMI],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Pressure quality → ACS",
        scrollTo:   true,
      },
      tearing_ripping: {
        diagnoses:  [DX.AORTIC_DISSECTION],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Tearing quality → Aortic dissection",
        scrollTo:   true,
      },
      sharp_stabbing: {
        diagnoses:  [DX.PERICARDITIS, DX.PE, DX.MSK_CHEST],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Sharp quality → PE / Pericarditis / MSK",
      },
      burning: {
        diagnoses:  [DX.GERD],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Burning quality → GERD",
      },
    },
    Q_CP_RADIATES: {
      left_arm: {
        diagnoses:  [DX.STEMI_ACS, DX.NSTEMI, DX.UNSTABLE_ANGINA],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Radiation to left arm → ACS",
        scrollTo:   true,
      },
      jaw: {
        diagnoses:  [DX.STEMI_ACS, DX.NSTEMI],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Jaw radiation → ACS",
        scrollTo:   true,
      },
      back: {
        diagnoses:  [DX.AORTIC_DISSECTION],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Radiation to back → Aortic dissection",
        scrollTo:   true,
      },
      none: {
        diagnoses:  [DX.MSK_CHEST, DX.GERD, DX.ANXIETY_CHEST],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "No radiation → MSK / GERD / Anxiety more likely",
      },
    },
    Q_CP_EXERTIONAL: {
      yes: {
        diagnoses:  [DX.STEMI_ACS, DX.UNSTABLE_ANGINA, DX.PE],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Exertional onset → ACS / PE",
        scrollTo:   true,
      },
      no: {
        diagnoses:  [DX.GERD, DX.ANXIETY_CHEST, DX.PERICARDITIS],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Non-exertional → GERD / Anxiety / Pericarditis",
      },
    },
    Q_CP_PLEURITIC: {
      yes: {
        diagnoses:  [DX.PE, DX.PERICARDITIS, DX.MSK_CHEST],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Pleuritic pain → PE / Pericarditis",
        scrollTo:   true,
      },
    },
    Q_CP_PERICARDITIC: {
      yes: {
        diagnoses:  [DX.PERICARDITIS],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Worse lying flat → Pericarditis",
      },
    },
    Q_CP_CONSTANT: {
      yes: {
        diagnoses:  [DX.STEMI_ACS, DX.AORTIC_DISSECTION],
        level:      "ELEVATE",
        durationMs: 2000,
        reason:     "Constant pain → ACS / Dissection more likely",
      },
    },
    ROS_SOB: {
      yes: {
        diagnoses:  [DX.PE, DX.STEMI_ACS, DX.MYOCARDITIS],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "SOB with chest pain → PE / ACS",
      },
    },
    ROS_DIAPHORESIS: {
      yes: {
        diagnoses:  [DX.STEMI_ACS, DX.NSTEMI],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Diaphoresis → ACS (high specificity)",
        scrollTo:   true,
      },
    },
    PMH_HTN: {
      yes: {
        diagnoses:  [DX.STEMI_ACS, DX.AORTIC_DISSECTION],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Hypertension → ACS / Dissection risk factor",
      },
    },
    MED_ANTICOAG: {
      yes: {
        diagnoses:  [DX.PE],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "On anticoagulants — PE less likely but not excluded",
      },
    },
  },

  headache: {
    Q_HA_ONSET: {
      thunderclap: {
        diagnoses:  [DX.SAH, DX.STROKE],
        level:      "CRITICAL",
        durationMs: 5000,
        reason:     "Thunderclap → SAH until proven otherwise",
        scrollTo:   true,
      },
      gradual: {
        diagnoses:  [DX.MIGRAINE, DX.TENSION_HA],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Gradual onset → Migraine / Tension",
      },
    },
    Q_HA_NECK_STIFF: {
      yes: {
        diagnoses:  [DX.MENINGITIS, DX.SAH],
        level:      "CRITICAL",
        durationMs: 5000,
        reason:     "Stiff neck → Meningitis / SAH",
        scrollTo:   true,
      },
    },
    Q_HA_PRIOR: {
      same: {
        diagnoses:  [DX.MIGRAINE, DX.TENSION_HA],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Same as prior headaches → Migraine / Tension",
      },
      different: {
        diagnoses:  [DX.SAH, DX.STROKE, DX.MENINGITIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Different from usual → Dangerous until proven otherwise",
        scrollTo:   true,
      },
      first: {
        diagnoses:  [DX.SAH, DX.MENINGITIS],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "First headache ever → evaluate for secondary cause",
        scrollTo:   true,
      },
    },
    Q_HA_ASSOCIATED: {
      photophobia: {
        diagnoses:  [DX.MIGRAINE, DX.MENINGITIS],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Photophobia → Migraine / Meningitis",
      },
      aura: {
        diagnoses:  [DX.MIGRAINE, DX.STROKE],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Aura → Migraine vs TIA/Stroke",
      },
      nausea: {
        diagnoses:  [DX.MIGRAINE, DX.SAH],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Nausea → Migraine (or SAH if thunderclap)",
      },
    },
  },

  shortness_of_breath: {
    Q_SOB_SEVERITY: {
      severe: {
        diagnoses:  [DX.PE, DX.STEMI_ACS, DX.ASTHMA],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Severe SOB → PE / ACS / Status asthmaticus",
        scrollTo:   true,
      },
    },
    Q_SOB_EXERTIONAL: {
      at_rest: {
        diagnoses:  [DX.PE, DX.STEMI_ACS],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "SOB at rest → PE / ACS elevated risk",
      },
    },
  },

  pulm_shortness_of_breath: {
    Q_SOB_SEVERITY: {
      severe: {
        diagnoses:  [DX.PE, DX.STEMI_ACS, DX.ASTHMA],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Severe SOB → PE / ACS / Status asthmaticus",
        scrollTo:   true,
      },
    },
    Q_SOB_EXERTIONAL: {
      at_rest: {
        diagnoses:  [DX.PE, DX.STEMI_ACS],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "SOB at rest → PE / ACS elevated risk",
      },
    },
  },

  gu_uti_symptoms: {
    Q_UTI_FLANK_PAIN: {
      yes: {
        diagnoses:  [DX.PYELONEPHRITIS],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Flank pain + UTI symptoms → Pyelonephritis",
        scrollTo:   true,
      },
    },
    Q_UTI_FEVER: {
      yes: {
        diagnoses:  [DX.PYELONEPHRITIS, DX.SEPSIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Fever + UTI symptoms → Pyelonephritis / Urosepsis",
        scrollTo:   true,
      },
    },
  },

  abdominal_pain: {
    Q_ABD_LOCATION: {
      rlq: {
        diagnoses:  [DX.APPENDICITIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "RLQ pain → Appendicitis",
        scrollTo:   true,
      },
      ruq: {
        diagnoses:  [DX.CHOLECYSTITIS],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "RUQ pain → Cholecystitis",
        scrollTo:   true,
      },
      epigastric: {
        diagnoses:  [DX.PANCREATITIS],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Epigastric → Pancreatitis",
      },
      diffuse: {
        diagnoses:  [DX.BOWEL_OBSTRUCTION, DX.SEPSIS],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Diffuse pain → Obstruction / Peritonitis",
      },
    },
    Q_ABD_FEVER: {
      yes: {
        diagnoses:  [DX.APPENDICITIS, DX.CHOLECYSTITIS, DX.SEPSIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Fever + abdominal pain → Surgical emergency rule out",
        scrollTo:   true,
      },
    },
    Q_VAG_PREGNANT: {
      yes: {
        diagnoses:  [DX.ECTOPIC],
        level:      "CRITICAL",
        durationMs: 5000,
        reason:     "Pregnant + abdominal pain → Ectopic until proven otherwise",
        scrollTo:   true,
      },
    },
  },

  msk_back_pain: {
    Q_BNP_BOWEL_BLADDER: {
      yes: {
        diagnoses:  [DX.CAUDA_EQUINA],
        level:      "CRITICAL",
        durationMs: 6000,
        reason:     "Bowel/bladder dysfunction → Cauda equina EMERGENCY",
        scrollTo:   true,
      },
    },
    Q_BNP_NEURO: {
      yes: {
        diagnoses:  [DX.CAUDA_EQUINA, DX.STROKE],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "Neuro symptoms with back pain → Cauda equina / Cord compression",
        scrollTo:   true,
      },
    },
    Q_BNP_FEVER: {
      yes: {
        diagnoses:  [DX.SEPSIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Fever + back pain → Epidural abscess / Discitis / Sepsis",
        scrollTo:   true,
      },
    },
  },

  back_pain: {
    Q_BNP_BOWEL_BLADDER: {
      yes: {
        diagnoses:  [DX.CAUDA_EQUINA],
        level:      "CRITICAL",
        durationMs: 6000,
        reason:     "Bowel/bladder dysfunction → Cauda equina EMERGENCY",
        scrollTo:   true,
      },
    },
    Q_BNP_NEURO: {
      yes: {
        diagnoses:  [DX.CAUDA_EQUINA, DX.STROKE],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "Neuro symptoms with back pain → Cauda equina / Cord compression",
        scrollTo:   true,
      },
    },
    Q_BNP_FEVER: {
      yes: {
        diagnoses:  [DX.SEPSIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Fever + back pain → Epidural abscess / Discitis / Sepsis",
        scrollTo:   true,
      },
    },
  },

  syncope: {
    Q_SYN_LOC: {
      full_loc: {
        diagnoses:  [DX.STEMI_ACS, DX.PE, DX.STROKE],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "True syncope → Cardiac / PE / Neurologic cause",
        scrollTo:   true,
      },
    },
    Q_SYN_POSITION: {
      exertion: {
        diagnoses:  [DX.STEMI_ACS],
        level:      "CRITICAL",
        durationMs: 5000,
        reason:     "Exertional syncope → Cardiac emergency",
        scrollTo:   true,
      },
    },
    Q_SYN_WARNING: {
      palpitations: {
        diagnoses:  [DX.STEMI_ACS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Palpitations before syncope → Arrhythmia / ACS",
        scrollTo:   true,
      },
      no_warning: {
        diagnoses:  [DX.STEMI_ACS, DX.PE],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "No warning → Arrhythmia more likely",
      },
    },
  },

  cardio_palpitations: {
    Q_PAL_SYNCOPE: {
      yes: {
        diagnoses:  [DX.STEMI_ACS, "ventricular_arrhythmia"],
        level:      "CRITICAL",
        durationMs: 5000,
        reason:     "Syncope with palpitations → Malignant arrhythmia",
        scrollTo:   true,
      },
    },
    Q_PAL_CHARACTER: {
      racing: {
        diagnoses:  ["svt", "afib"],
        level:      "ELEVATE",
        durationMs: 2500,
        reason:     "Racing → SVT / AFib",
      },
      skipping: {
        diagnoses:  ["pvcs", "pacs"],
        level:      "INFORM",
        durationMs: 1500,
        reason:     "Skipping → PVCs / PACs (usually benign)",
      },
    },
    Q_PAL_DURATION: {
      ongoing: {
        diagnoses:  ["afib", "svt", DX.STEMI_ACS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Ongoing palpitations → Active arrhythmia",
        scrollTo:   true,
      },
    },
  },

  derm_rash: {
    Q_RASH_APPEARANCE: {
      petechiae: {
        diagnoses:  [DX.MENINGITIS, DX.SEPSIS],
        level:      "CRITICAL",
        durationMs: 6000,
        reason:     "Non-blanching petechiae → Meningococcemia EMERGENCY",
        scrollTo:   true,
      },
      blisters: {
        diagnoses:  ["shingles", "stevens_johnson"],
        level:      "ELEVATE",
        durationMs: 3000,
        reason:     "Blisters → Herpes zoster / SJS",
      },
    },
    Q_RASH_FEVER: {
      yes: {
        diagnoses:  [DX.MENINGITIS, DX.SEPSIS],
        level:      "CRITICAL",
        durationMs: 4000,
        reason:     "Fever + rash → Meningococcemia / Sepsis rule out",
        scrollTo:   true,
      },
    },
  },
};

// ─── Main exported function ───────────────────────────────────────────────────

export function getDifferentialTrigger(
  result:      CaptureResult,
  complaintId: string
): DifferentialTrigger | null {
  if (!result.matched.length) return null;
  const topMatch = result.matched[0];
  if (topMatch.confidence === "low") return null;

  const complaintTriggers = TRIGGER_MAP[complaintId];
  if (!complaintTriggers) return null;

  const questionTriggers = complaintTriggers[result.questionId];
  if (!questionTriggers) return null;

  const trigger = questionTriggers[topMatch.value];
  if (!trigger) return null;

  if (topMatch.confidence === "medium" && trigger.level === "CRITICAL") {
    return { ...trigger, level: "ELEVATE", durationMs: 2500 };
  }
  return trigger;
}

// ─── Batch trigger for multiple matched values ────────────────────────────────

export function getAllDifferentialTriggers(
  result:      CaptureResult,
  complaintId: string
): DifferentialTrigger[] {
  const triggers: DifferentialTrigger[] = [];
  const complaintTriggers = TRIGGER_MAP[complaintId];
  if (!complaintTriggers) return triggers;

  const questionTriggers = complaintTriggers[result.questionId];
  if (!questionTriggers) return triggers;

  for (const match of result.matched) {
    const trigger = questionTriggers[match.value];
    if (!trigger) continue;
    if (match.confidence === "low") continue;

    const adjusted = match.confidence === "medium" && trigger.level === "CRITICAL"
      ? { ...trigger, level: "ELEVATE" as PulseLevel, durationMs: 2500 }
      : trigger;

    triggers.push(adjusted);
  }

  const seen = new Map<string, DifferentialTrigger>();
  for (const t of triggers) {
    for (const dxId of t.diagnoses) {
      const existing = seen.get(dxId);
      if (!existing || levelRank(t.level) > levelRank(existing.level)) {
        seen.set(dxId, t);
      }
    }
  }

  return [...new Set(triggers.filter(t =>
    t.diagnoses.some(dx => seen.get(dx) === t)
  ))];
}

function levelRank(level: PulseLevel): number {
  return { CRITICAL: 3, ELEVATE: 2, INFORM: 1 }[level];
}

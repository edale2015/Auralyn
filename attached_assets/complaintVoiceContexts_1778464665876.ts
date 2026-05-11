/**
 * complaintVoiceContexts.ts
 * Drop into: server/clinical/voice/complaintVoiceContexts.ts
 *
 * COMPLETE VOICE CAPTURE QUESTION CONTEXTS
 * All 18 top urgent care complaint clusters
 *
 * HOW THIS WORKS:
 * Each complaint has an array of QuestionContext objects.
 * When the physician is on a given question, the system uses that
 * context to interpret whatever the patient says.
 *
 * PATIENT SAYS → SYSTEM MAPS TO → FORM FIELD
 *
 * The synonym arrays are built from how actual patients describe
 * symptoms in urgent care — not textbook language.
 * "It hurts when I pee" = dysuria = UTI Q_PAIN_URINATION = yes
 */

import type { QuestionContext } from "./livePatientCapture";

// ─── Shared boolean options (used by all complaints) ─────────────────────────

const YES_NO_OPTIONS = [
  {
    value:    "yes",
    label:    "Yes",
    synonyms: ["yes", "yeah", "yep", "yup", "correct", "right", "true",
               "absolutely", "definitely", "i do", "i have", "that's right",
               "uh huh", "mm hmm", "positive", "affirmative"],
  },
  {
    value:    "no",
    label:    "No",
    synonyms: ["no", "nope", "nah", "not really", "don't think so",
               "i don't", "i haven't", "negative", "never",
               "not that i know of", "doesn't", "didn't", "hasn't", "not me"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 1 — COUGH / SINUS / SORE THROAT / FEVER / FATIGUE / BODY ACHES
// ═══════════════════════════════════════════════════════════════════════════════

export const URI_CLUSTER_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_URI_DURATION",
    questionText: "How long have you had these symptoms?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "lt_3_days",  label: "Less than 3 days",
        synonyms: ["today", "yesterday", "couple days", "two days", "one day",
                   "just started", "couple of days", "48 hours", "24 hours"] },
      { value: "3_7_days",   label: "3–7 days",
        synonyms: ["three days", "four days", "five days", "six days",
                   "few days", "several days", "about a week", "almost a week",
                   "this week"] },
      { value: "gt_1_week",  label: "More than 1 week",
        synonyms: ["week", "over a week", "two weeks", "weeks", "long time",
                   "more than a week", "ten days", "ongoing"] },
    ],
  },
  {
    questionId:   "Q_URI_SORE_THROAT",
    questionText: "Do you have a sore throat?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["sore throat", "my throat hurts", "throat pain",
                   "painful to swallow", "hurts to swallow", "scratchy throat",
                   "raw throat", "throat is killing me", "strep"] },
      { value: "no",  label: "No",
        synonyms: ["no throat", "throat is fine", "not my throat"] },
    ],
  },
  {
    questionId:   "Q_URI_FEVER",
    questionText: "Do you have a fever or feel feverish?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["fever", "temperature", "feverish", "hot", "chills",
                   "i measured it", "102", "103", "101", "running a fever",
                   "feeling hot", "burning up"] },
      { value: "no",  label: "No",
        synonyms: ["no fever", "no temperature", "i checked", "normal temp",
                   "not feverish", "afebrile"] },
    ],
  },
  {
    questionId:   "Q_URI_COUGH_TYPE",
    questionText: "What kind of cough do you have?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "dry",        label: "Dry / Non-productive",
        synonyms: ["dry", "dry cough", "nothing comes up", "no mucus",
                   "tickle", "tickly", "irritating", "hacking"] },
      { value: "productive", label: "Productive / Mucus",
        synonyms: ["productive", "phlegm", "mucus", "stuff coming up",
                   "green", "yellow", "brown", "coughing stuff up",
                   "gunky", "thick", "congested cough"] },
      { value: "bloody",     label: "Blood in mucus",
        synonyms: ["blood", "bloody", "pink", "red in the mucus",
                   "coughing up blood", "hemoptysis"] },
    ],
  },
  {
    questionId:   "Q_URI_CONGESTION",
    questionText: "Do you have nasal congestion or runny nose?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["congested", "stuffy", "runny nose", "runny",
                   "stuffed up", "can't breathe through nose",
                   "nose is blocked", "dripping", "post nasal drip",
                   "sinus", "sinuses", "pressure in my face"] },
      { value: "no",  label: "No", synonyms: ["no congestion", "nose is clear", "not stuffy"] },
    ],
  },
  {
    questionId:   "Q_URI_BODY_ACHES",
    questionText: "Do you have body aches or muscle pain?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["body aches", "achy", "aches", "muscles hurt",
                   "everything hurts", "sore all over", "myalgia",
                   "joints hurt", "flu-like", "feel terrible"] },
      { value: "no",  label: "No", synonyms: ["no aches", "not achy", "muscles are fine"] },
    ],
  },
  {
    questionId:   "Q_URI_COVID_FLU_TEST",
    questionText: "Have you tested for COVID or flu?",
    questionType: "chip_select",
    section: 3, isActive: false,
    options: [
      { value: "covid_pos",  label: "COVID positive",
        synonyms: ["covid positive", "tested positive", "i have covid",
                   "covid came back positive", "positive for covid"] },
      { value: "flu_pos",    label: "Flu positive",
        synonyms: ["flu positive", "have the flu", "influenza",
                   "positive for flu", "flu a", "flu b"] },
      { value: "tested_neg", label: "Tested negative",
        synonyms: ["negative", "tested negative", "came back negative",
                   "no covid", "no flu"] },
      { value: "not_tested", label: "Not tested",
        synonyms: ["haven't tested", "didn't test", "no test",
                   "not tested", "i don't know"] },
    ],
  },
  {
    questionId:   "Q_URI_SICK_CONTACT",
    questionText: "Have you been around anyone sick?",
    questionType: "boolean_pair",
    section: 3, isActive: false,
    options: YES_NO_OPTIONS,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 2 — CHEST PAIN / SHORTNESS OF BREATH
// (extends existing chest pain — adds SOB-specific questions)
// ═══════════════════════════════════════════════════════════════════════════════

export const CHEST_SOB_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_CP_QUALITY",
    questionText: "How would you describe the pain — sharp, pressure, burning, aching, tearing?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "pressure_squeezing", label: "Pressure / Squeezing",
        synonyms: ["pressure", "squeezing", "tight", "tightness", "heavy",
                   "weight", "elephant", "band", "crushing", "sitting on my chest",
                   "like someone is sitting on my chest", "constricting"] },
      { value: "sharp_stabbing",     label: "Sharp / Stabbing",
        synonyms: ["sharp", "stabbing", "stab", "knife", "needle",
                   "piercing", "shooting", "like a knife"] },
      { value: "burning",            label: "Burning",
        synonyms: ["burning", "burn", "heartburn", "fire", "hot",
                   "acid", "indigestion", "sour", "like acid"] },
      { value: "aching_dull",        label: "Aching / Dull",
        synonyms: ["aching", "ache", "dull", "sore", "hurts", "hurt",
                   "just hurts", "uncomfortable", "nagging", "it just hurts"] },
      { value: "tearing_ripping",    label: "Tearing / Ripping",
        synonyms: ["tearing", "tear", "ripping", "rip",
                   "like something tore", "like something ripped"] },
    ],
  },
  {
    questionId:   "Q_SOB_SEVERITY",
    questionText: "How bad is your shortness of breath — mild, moderate, or severe?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "mild",     label: "Mild",
        synonyms: ["mild", "little", "slight", "a bit", "somewhat",
                   "mildly short of breath", "not too bad", "minor"] },
      { value: "moderate", label: "Moderate",
        synonyms: ["moderate", "moderately", "pretty bad", "noticeable",
                   "significant", "hard to breathe", "labored"] },
      { value: "severe",   label: "Severe",
        synonyms: ["severe", "very bad", "terrible", "can't breathe",
                   "gasping", "really struggling", "worst ever",
                   "can't catch my breath", "suffocating"] },
    ],
  },
  {
    questionId:   "Q_SOB_EXERTIONAL",
    questionText: "Does the shortness of breath happen with activity or also at rest?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "exertional_only", label: "Exertion only",
        synonyms: ["only when i walk", "only with activity", "when i exercise",
                   "when i climb stairs", "exertion", "when i move",
                   "fine at rest", "only when active"] },
      { value: "at_rest",         label: "Also at rest",
        synonyms: ["at rest", "even sitting", "even lying down",
                   "all the time", "constant", "right now", "just sitting here"] },
    ],
  },
  {
    questionId:   "Q_CP_RADIATES",
    questionText: "Does the pain go anywhere — arm, jaw, neck, back?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "left_arm",  label: "Left arm",
        synonyms: ["left arm", "down my arm", "arm", "left side arm",
                   "shoulder and arm", "radiates to arm"] },
      { value: "jaw",       label: "Jaw",
        synonyms: ["jaw", "my jaw", "teeth", "chin", "face",
                   "radiates to jaw"] },
      { value: "neck",      label: "Neck",
        synonyms: ["neck", "throat area", "up my neck"] },
      { value: "back",      label: "Back / Between shoulder blades",
        synonyms: ["back", "my back", "between shoulder blades",
                   "shoulder blades", "through to my back", "spine"] },
      { value: "none",      label: "Stays in one place",
        synonyms: ["nowhere", "stays here", "just here", "doesn't go anywhere",
                   "no radiation", "only in my chest"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 3 — PAIN WITH URINATION / FREQUENCY / UTI / KIDNEY
// ═══════════════════════════════════════════════════════════════════════════════

export const UTI_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_UTI_DYSURIA",
    questionText: "Does it hurt or burn when you urinate?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["yes", "burns", "burning", "hurts when i pee",
                   "pain when urinating", "stinging", "painful",
                   "like fire", "it burns so bad", "dysuria",
                   "hurts to pee", "burning when i go"] },
      { value: "no",  label: "No",
        synonyms: ["no", "doesn't burn", "no pain", "no burning",
                   "just frequent", "just the urgency"] },
    ],
  },
  {
    questionId:   "Q_UTI_FREQUENCY",
    questionText: "Are you going to the bathroom more often than usual?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["yes", "constantly", "all the time", "every few minutes",
                   "can't stop going", "urinary frequency", "going a lot",
                   "every hour", "running to the bathroom"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_UTI_URGENCY",
    questionText: "Do you feel a sudden urge to go that's hard to control?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["urgency", "can't hold it", "have to go right now",
                   "can't make it", "rushing to bathroom",
                   "sudden urge", "gotta go now"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_UTI_HEMATURIA",
    questionText: "Is there any blood in your urine?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["blood", "bloody", "pink urine", "red", "dark",
                   "blood in my urine", "hematuria", "cola colored",
                   "brownish", "rusty"] },
      { value: "no",  label: "No", synonyms: ["no blood", "normal color", "clear", "yellow"] },
    ],
  },
  {
    questionId:   "Q_UTI_FLANK_PAIN",
    questionText: "Do you have pain in your side or back — flank pain?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["flank pain", "side pain", "back pain", "kidney area",
                   "my side hurts", "lower back", "under my ribs",
                   "back hurts too", "kidney pain", "costovertebral"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_UTI_FEVER",
    questionText: "Do you have fever or chills?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["fever", "chills", "shaking", "rigors",
                   "cold then hot", "temperature", "feverish"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_UTI_PRIOR",
    questionText: "Have you had a UTI before?",
    questionType: "boolean_pair",
    section: 3, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["yes", "all the time", "frequently", "chronic",
                   "i get them a lot", "recurring", "before"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 4 — MUSCULOSKELETAL PAIN (ANKLE/WRIST/FINGER/SHOULDER/BACK)
// ═══════════════════════════════════════════════════════════════════════════════

export const MSK_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_MSK_MECHANISM",
    questionText: "How did this happen — was there an injury or did it come on its own?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "trauma",    label: "Trauma / Injury",
        synonyms: ["fell", "fall", "twisted", "rolled", "sprained",
                   "hit", "accident", "injury", "hurt it", "trauma",
                   "playing sports", "lifted something", "moving",
                   "car accident", "i was running"] },
      { value: "gradual",   label: "Came on gradually",
        synonyms: ["gradual", "slowly", "over time", "woke up with it",
                   "not sure", "just started hurting", "no injury",
                   "no trauma", "it just started"] },
      { value: "overuse",   label: "Repetitive use",
        synonyms: ["overuse", "repetitive", "been using it a lot",
                   "from work", "typing", "lifting at work",
                   "same motion", "overdid it"] },
    ],
  },
  {
    questionId:   "Q_MSK_WEIGHT_BEAR",
    questionText: "Can you put weight on it or use it normally?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes",      label: "Yes, can bear weight",
        synonyms: ["yes", "can walk", "can use it", "bearing weight",
                   "limping but walking", "using it", "kind of"] },
      { value: "no",       label: "No, cannot bear weight",
        synonyms: ["no", "can't walk", "can't bear weight", "can't put weight",
                   "won't walk on it", "can't use it", "completely off it"] },
    ],
  },
  {
    questionId:   "Q_MSK_SWELLING",
    questionText: "Is there swelling?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["swollen", "swelling", "puffed up", "puffy",
                   "bigger than the other side", "inflamed", "yes swollen"] },
      { value: "no",  label: "No",
        synonyms: ["no swelling", "not swollen", "looks normal",
                   "same size", "no puffiness"] },
    ],
  },
  {
    questionId:   "Q_MSK_DEFORMITY",
    questionText: "Does it look deformed or out of place?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["deformed", "out of place", "looks wrong",
                   "bent wrong", "dislocated", "looks crooked",
                   "not normal shape", "popped out"] },
      { value: "no",  label: "No",
        synonyms: ["looks normal", "no deformity", "looks okay",
                   "normal shape", "not deformed"] },
    ],
  },
  {
    questionId:   "Q_MSK_PAIN_SEVERITY",
    questionText: "Rate your pain 1 to 10.",
    questionType: "scale",
    section: 2, isActive: false,
  },
  {
    questionId:   "Q_MSK_LOCATION",
    questionText: "Point to exactly where the pain is worst.",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "ankle",    label: "Ankle",
        synonyms: ["ankle", "my ankle", "outside of ankle", "inside ankle"] },
      { value: "wrist",    label: "Wrist",
        synonyms: ["wrist", "my wrist", "wrist joint"] },
      { value: "shoulder", label: "Shoulder",
        synonyms: ["shoulder", "my shoulder", "rotator cuff",
                   "shoulder joint", "top of arm"] },
      { value: "back_lower", label: "Lower back",
        synonyms: ["lower back", "low back", "lumbar", "bottom of back",
                   "my back", "spine"] },
      { value: "knee",     label: "Knee",
        synonyms: ["knee", "my knee", "kneecap", "knee joint"] },
      { value: "finger",   label: "Finger / Hand",
        synonyms: ["finger", "hand", "knuckle", "thumb", "fingers"] },
      { value: "hip",      label: "Hip",
        synonyms: ["hip", "my hip", "hip joint", "groin"] },
      { value: "neck",     label: "Neck",
        synonyms: ["neck", "my neck", "cervical", "stiff neck"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 5 — SYNCOPE / PRESYNCOPE
// ═══════════════════════════════════════════════════════════════════════════════

export const SYNCOPE_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_SYN_LOC",
    questionText: "Did you actually lose consciousness or did you almost pass out?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "full_loc",  label: "Fully lost consciousness",
        synonyms: ["passed out", "blacked out", "lost consciousness",
                   "fell to the floor", "woke up on floor",
                   "don't remember", "someone found me", "actually fainted"] },
      { value: "near_syn",  label: "Almost passed out",
        synonyms: ["almost", "nearly", "lightheaded", "dizzy",
                   "almost fainted", "tunnel vision", "greyed out",
                   "felt like i was going to pass out", "presyncope"] },
    ],
  },
  {
    questionId:   "Q_SYN_POSITION",
    questionText: "Were you standing, sitting, or lying down when it happened?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "standing",  label: "Standing",
        synonyms: ["standing", "stood up", "when i got up",
                   "standing in line", "upright"] },
      { value: "exertion",  label: "During exertion",
        synonyms: ["exercise", "running", "working out", "playing",
                   "climbing stairs", "walking fast", "during activity"] },
      { value: "sitting",   label: "Sitting",
        synonyms: ["sitting", "seated", "in a chair", "at my desk"] },
    ],
  },
  {
    questionId:   "Q_SYN_WARNING",
    questionText: "Did you have any warning before it happened?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "no_warning",   label: "No warning — sudden",
        synonyms: ["no warning", "suddenly", "out of nowhere",
                   "without warning", "instant", "no prodrome"] },
      { value: "lightheaded",  label: "Lightheaded / dizzy first",
        synonyms: ["lightheaded", "dizzy", "felt dizzy first",
                   "got dizzy", "woozy", "felt off"] },
      { value: "nausea",       label: "Nausea or sweating first",
        synonyms: ["nausea", "sweating", "clammy", "felt sick",
                   "felt nauseous", "got hot"] },
      { value: "palpitations", label: "Heart racing or pounding first",
        synonyms: ["heart racing", "palpitations", "heart pounding",
                   "felt my heart", "fluttering"] },
    ],
  },
  {
    questionId:   "Q_SYN_DURATION",
    questionText: "How long were you out?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "seconds",  label: "Seconds",
        synonyms: ["seconds", "brief", "a few seconds", "very brief",
                   "quick", "immediately came around"] },
      { value: "minutes",  label: "Minutes",
        synonyms: ["minutes", "a few minutes", "couple minutes",
                   "minute or two"] },
      { value: "prolonged", label: "More than 5 minutes",
        synonyms: ["long time", "more than 5 minutes", "don't know",
                   "they had to call 911", "prolonged"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 6 — RASH (PRURITIC / NON-PRURITIC)
// ═══════════════════════════════════════════════════════════════════════════════

export const RASH_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_RASH_ITCH",
    questionText: "Is the rash itchy?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — itchy",
        synonyms: ["itchy", "itches", "i keep scratching", "so itchy",
                   "pruritic", "can't stop scratching", "very itchy",
                   "drives me crazy", "burning and itching"] },
      { value: "no",  label: "No — not itchy",
        synonyms: ["no", "not itchy", "doesn't itch", "no itching",
                   "just the rash", "not pruritic"] },
    ],
  },
  {
    questionId:   "Q_RASH_APPEARANCE",
    questionText: "What does it look like?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "red_flat",   label: "Red flat spots",
        synonyms: ["red", "flat", "red spots", "red patches",
                   "macular", "flat red", "blotchy"] },
      { value: "raised",     label: "Raised bumps or welts",
        synonyms: ["raised", "bumps", "welts", "hives", "raised bumps",
                   "papules", "pimple-like", "blistery bumps"] },
      { value: "blisters",   label: "Blisters",
        synonyms: ["blisters", "fluid filled", "vesicles", "popped",
                   "like chickenpox", "water blisters"] },
      { value: "ring",       label: "Ring-shaped",
        synonyms: ["ring", "circle", "bullseye", "oval", "ring shape",
                   "ring-like", "target", "lyme"] },
      { value: "petechiae",  label: "Tiny pinpoint red dots",
        synonyms: ["tiny dots", "pinpoint", "pin pricks",
                   "doesn't blanch", "petechiae", "purple dots",
                   "doesn't go away when i press"] },
    ],
  },
  {
    questionId:   "Q_RASH_LOCATION",
    questionText: "Where is the rash?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "face",       label: "Face",
        synonyms: ["face", "cheeks", "forehead", "chin", "around mouth"] },
      { value: "trunk",      label: "Chest / Abdomen / Back",
        synonyms: ["chest", "stomach", "belly", "back", "trunk", "torso", "body"] },
      { value: "arms",       label: "Arms",
        synonyms: ["arm", "arms", "forearm", "upper arm", "elbow"] },
      { value: "legs",       label: "Legs",
        synonyms: ["leg", "legs", "thigh", "calf", "shin", "lower leg"] },
      { value: "widespread", label: "All over",
        synonyms: ["everywhere", "all over", "whole body", "head to toe",
                   "spreading", "generalized"] },
      { value: "one_side",   label: "One side only",
        synonyms: ["one side", "just the left", "just the right",
                   "only on one side", "dermatomal", "like a stripe"] },
    ],
  },
  {
    questionId:   "Q_RASH_NEW_PRODUCT",
    questionText: "Did you use any new products, soaps, detergents, or take any new medications?",
    questionType: "boolean_pair",
    section: 3, isActive: false,
    options: YES_NO_OPTIONS,
  },
  {
    questionId:   "Q_RASH_FEVER",
    questionText: "Do you have a fever with the rash?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["fever", "temperature", "feverish", "yes fever",
                   "running a fever"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 7 — ABDOMINAL PAIN / NAUSEA / DIARRHEA
// ═══════════════════════════════════════════════════════════════════════════════

export const ABDOMINAL_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_ABD_LOCATION",
    questionText: "Where is the pain worst?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "ruq",        label: "Right upper — under ribs",
        synonyms: ["right side", "right upper", "under my right ribs",
                   "right upper quadrant", "where my liver is", "gallbladder area"] },
      { value: "luq",        label: "Left upper",
        synonyms: ["left side upper", "left upper", "under left ribs",
                   "left upper quadrant"] },
      { value: "rlq",        label: "Right lower",
        synonyms: ["right lower", "right lower quadrant", "appendix area",
                   "lower right", "near my appendix"] },
      { value: "llq",        label: "Left lower",
        synonyms: ["left lower", "lower left", "left lower quadrant",
                   "sigmoid area"] },
      { value: "epigastric", label: "Middle upper — stomach area",
        synonyms: ["middle", "upper middle", "stomach", "epigastric",
                   "between ribs", "upper abdomen"] },
      { value: "periumbilical", label: "Around belly button",
        synonyms: ["belly button", "around belly button", "umbilical",
                   "middle", "center"] },
      { value: "diffuse",    label: "All over",
        synonyms: ["everywhere", "all over", "whole belly",
                   "cramping everywhere", "diffuse"] },
    ],
  },
  {
    questionId:   "Q_ABD_QUALITY",
    questionText: "What kind of pain is it?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "crampy",     label: "Crampy / Comes and goes",
        synonyms: ["cramps", "cramping", "comes and goes", "waves",
                   "spasms", "colicky", "colicky pain", "intermittent"] },
      { value: "constant",   label: "Constant",
        synonyms: ["constant", "steady", "doesn't go away",
                   "continuous", "all the time", "always there"] },
      { value: "sharp",      label: "Sharp",
        synonyms: ["sharp", "stabbing", "knife-like", "piercing"] },
      { value: "pressure",   label: "Pressure / Bloating",
        synonyms: ["pressure", "bloating", "bloated", "full feeling",
                   "distended", "gassy"] },
    ],
  },
  {
    questionId:   "Q_ABD_NAUSEA",
    questionText: "Do you have nausea or have you vomited?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "nausea_only", label: "Nausea only",
        synonyms: ["nausea", "nauseous", "queasy", "feel sick",
                   "feel like throwing up", "unsettled stomach"] },
      { value: "vomiting",    label: "Vomiting",
        synonyms: ["vomiting", "vomited", "throwing up", "threw up",
                   "been sick", "puked", "can't keep anything down"] },
      { value: "both",        label: "Both",
        synonyms: ["nausea and vomiting", "both", "nauseous and throwing up"] },
      { value: "neither",     label: "Neither",
        synonyms: ["no", "not nauseous", "no vomiting", "neither"] },
    ],
  },
  {
    questionId:   "Q_ABD_DIARRHEA",
    questionText: "Do you have diarrhea?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["diarrhea", "loose stools", "watery", "runny",
                   "can't stop going", "frequent loose", "liquid stool",
                   "going all day", "explosive"] },
      { value: "no",  label: "No",
        synonyms: ["no diarrhea", "normal", "no", "not loose"] },
    ],
  },
  {
    questionId:   "Q_ABD_FEVER",
    questionText: "Any fever?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: YES_NO_OPTIONS,
  },
  {
    questionId:   "Q_ABD_LAST_BM",
    questionText: "When was your last normal bowel movement?",
    questionType: "text",
    section: 2, isActive: false,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 8 — STD EXPOSURE (GONORRHEA / CHLAMYDIA / TRICHOMONIASIS / SYPHILIS)
// ═══════════════════════════════════════════════════════════════════════════════

export const STD_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_STD_EXPOSURE_TYPE",
    questionText: "What brings you in today — exposure, symptoms, or routine screening?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "exposure",  label: "Known exposure",
        synonyms: ["exposure", "partner told me", "partner has it",
                   "was told", "exposed to", "my partner tested positive",
                   "found out my partner has"] },
      { value: "symptoms",  label: "I have symptoms",
        synonyms: ["symptoms", "discharge", "burning", "sore", "rash",
                   "ulcer", "something is wrong", "i noticed"] },
      { value: "screening", label: "Routine screening",
        synonyms: ["screening", "just want to get tested", "routine",
                   "no symptoms", "just checking", "annual"] },
    ],
  },
  {
    questionId:   "Q_STD_DISCHARGE",
    questionText: "Do you have any discharge?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["discharge", "yes discharge", "drainage", "dripping",
                   "coming out of", "oozing", "secretion"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_STD_ULCER_SORE",
    questionText: "Any sores, ulcers, or bumps in the genital area?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["sore", "ulcer", "bump", "lesion", "blister",
                   "open sore", "painful sore", "painless sore"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_STD_LAST_CONTACT",
    questionText: "When was the last potential exposure?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "lt_1_week",  label: "Within last week",
        synonyms: ["this week", "few days ago", "yesterday", "couple days",
                   "within a week", "recently"] },
      { value: "1_4_weeks",  label: "1–4 weeks ago",
        synonyms: ["last week", "two weeks", "three weeks",
                   "about a month ago", "few weeks"] },
      { value: "gt_1_month", label: "More than a month ago",
        synonyms: ["over a month", "months ago", "long time ago",
                   "more than a month"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 9 — VAGINAL DISCHARGE / ITCHING / VAGINAL BLEEDING
// ═══════════════════════════════════════════════════════════════════════════════

export const VAGINAL_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_VAG_CHIEF",
    questionText: "What is your main concern today?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "discharge",  label: "Discharge",
        synonyms: ["discharge", "abnormal discharge", "different discharge",
                   "coming out", "leaking", "odor"] },
      { value: "itching",    label: "Itching",
        synonyms: ["itching", "itchy", "irritation", "burning",
                   "so itchy", "uncomfortable", "vulvar"] },
      { value: "bleeding",   label: "Bleeding",
        synonyms: ["bleeding", "blood", "spotting", "period",
                   "between periods", "after sex", "abnormal bleeding"] },
      { value: "odor",       label: "Odor",
        synonyms: ["smell", "odor", "fishy", "bad smell",
                   "different smell", "noticeable odor"] },
    ],
  },
  {
    questionId:   "Q_VAG_DISCHARGE_COLOR",
    questionText: "What color and consistency is the discharge?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "white_cottage", label: "White / Cottage cheese",
        synonyms: ["white", "chunky", "cottage cheese", "clumpy",
                   "thick white", "looks like cottage cheese",
                   "yeast", "candida"] },
      { value: "gray_white",    label: "Gray / White / Fishy odor",
        synonyms: ["gray", "grey", "grayish", "fishy", "fish smell",
                   "thin", "watery gray", "bv"] },
      { value: "yellow_green",  label: "Yellow or green",
        synonyms: ["yellow", "green", "yellowish", "greenish",
                   "pus-like", "colored discharge"] },
      { value: "clear",         label: "Clear / Normal",
        synonyms: ["clear", "normal", "looks normal", "transparent"] },
    ],
  },
  {
    questionId:   "Q_VAG_LMP",
    questionText: "When was your last menstrual period?",
    questionType: "text",
    section: 2, isActive: false,
  },
  {
    questionId:   "Q_VAG_PREGNANT",
    questionText: "Is there any chance you could be pregnant?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: YES_NO_OPTIONS,
  },
  {
    questionId:   "Q_VAG_PAIN",
    questionText: "Do you have pelvic pain or pain with intercourse?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["pain", "pelvic pain", "hurts", "pain with sex",
                   "painful intercourse", "dyspareunia", "cramping"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 10 — LACERATION
// ═══════════════════════════════════════════════════════════════════════════════

export const LACERATION_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_LAC_HOW",
    questionText: "How did this happen?",
    questionType: "text",
    section: 2, isActive: false,
  },
  {
    questionId:   "Q_LAC_WHEN",
    questionText: "When did this happen?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "lt_6_hours",  label: "Less than 6 hours ago",
        synonyms: ["just now", "this morning", "hour ago", "couple hours",
                   "few hours", "today", "fresh"] },
      { value: "6_12_hours",  label: "6–12 hours ago",
        synonyms: ["this afternoon", "this morning early", "several hours",
                   "half a day ago"] },
      { value: "gt_12_hours", label: "More than 12 hours ago",
        synonyms: ["yesterday", "last night", "over 12 hours",
                   "more than a day", "old wound"] },
    ],
  },
  {
    questionId:   "Q_LAC_BLEEDING",
    questionText: "Is it still bleeding?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes",      label: "Yes, still bleeding",
        synonyms: ["still bleeding", "won't stop", "bleeding through",
                   "soaking through", "yes bleeding"] },
      { value: "no",       label: "No, bleeding stopped",
        synonyms: ["stopped", "not bleeding", "clotted",
                   "stopped bleeding", "controlled"] },
    ],
  },
  {
    questionId:   "Q_LAC_TETANUS",
    questionText: "When was your last tetanus shot?",
    questionType: "chip_select",
    section: 5, isActive: false,
    options: [
      { value: "lt_5_years",  label: "Within 5 years",
        synonyms: ["recently", "last year", "couple years", "up to date",
                   "within 5 years", "yes i'm current"] },
      { value: "5_10_years",  label: "5–10 years ago",
        synonyms: ["5 years ago", "10 years ago", "few years",
                   "not sure but recently"] },
      { value: "gt_10_years", label: "More than 10 years",
        synonyms: ["don't remember", "long time ago", "childhood",
                   "no idea", "over 10 years"] },
    ],
  },
  {
    questionId:   "Q_LAC_CONTAMINATED",
    questionText: "Was this from something dirty, rusty, or an animal bite?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — contaminated",
        synonyms: ["rusty", "dirty", "animal bite", "dog bite",
                   "cat bite", "dirty knife", "contaminated",
                   "outside", "soil", "ground"] },
      { value: "no",  label: "No — clean",
        synonyms: ["clean", "glass", "knife", "clean cut", "not dirty"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 11 — HEADACHE
// ═══════════════════════════════════════════════════════════════════════════════

export const HEADACHE_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_HA_ONSET",
    questionText: "Did this headache come on suddenly or gradually?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "thunderclap", label: "Sudden — worst of life",
        synonyms: ["sudden", "suddenly", "worst headache of my life",
                   "thunderclap", "out of nowhere", "explosive",
                   "like a bomb", "instantaneous", "worst ever"] },
      { value: "gradual",     label: "Came on gradually",
        synonyms: ["gradual", "slowly", "over hours", "built up",
                   "gradually worse", "started mild"] },
    ],
  },
  {
    questionId:   "Q_HA_LOCATION",
    questionText: "Where is the headache?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "frontal",     label: "Forehead / Front",
        synonyms: ["forehead", "front", "behind eyes", "sinus area",
                   "front of head"] },
      { value: "temporal",    label: "Temples / Sides",
        synonyms: ["temples", "sides", "temporal", "side of head",
                   "my temples"] },
      { value: "occipital",   label: "Back of head",
        synonyms: ["back of head", "occipital", "back", "base of skull",
                   "neck and back of head"] },
      { value: "unilateral",  label: "One side only",
        synonyms: ["one side", "left side", "right side", "migraine side",
                   "only on one side"] },
      { value: "whole_head",  label: "Whole head",
        synonyms: ["whole head", "everywhere", "all over", "global"] },
    ],
  },
  {
    questionId:   "Q_HA_ASSOCIATED",
    questionText: "Do you have nausea, light sensitivity, or vision changes?",
    questionType: "chip_select",
    section: 4, isActive: false,
    options: [
      { value: "nausea",      label: "Nausea / Vomiting",
        synonyms: ["nausea", "nauseous", "vomiting", "sick to stomach",
                   "throwing up"] },
      { value: "photophobia", label: "Light sensitive",
        synonyms: ["light sensitive", "photophobia", "lights hurt",
                   "can't stand light", "bright lights bother me"] },
      { value: "phonophobia", label: "Sound sensitive",
        synonyms: ["sound sensitive", "noise hurts", "loud sounds",
                   "phonophobia", "quiet place helps"] },
      { value: "aura",        label: "Visual aura",
        synonyms: ["aura", "zigzag", "visual changes", "seeing spots",
                   "flashing lights", "blind spot"] },
    ],
  },
  {
    questionId:   "Q_HA_NECK_STIFF",
    questionText: "Is your neck stiff or painful to move?",
    questionType: "boolean_pair",
    section: 4, isActive: false,
    options: [
      { value: "yes", label: "Yes — stiff neck",
        synonyms: ["stiff neck", "can't move neck", "neck is stiff",
                   "neck pain", "can't look down", "meningismus"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_HA_PRIOR",
    questionText: "Have you had headaches like this before?",
    questionType: "chip_select",
    section: 3, isActive: false,
    options: [
      { value: "same",     label: "Yes — same as my usual headaches",
        synonyms: ["same", "yes same", "my usual", "typical for me",
                   "i get these all the time", "migraine pattern"] },
      { value: "different", label: "Different from usual",
        synonyms: ["different", "never had one like this", "unusual",
                   "not typical", "worse than usual", "different this time"] },
      { value: "first",    label: "First headache like this",
        synonyms: ["first time", "never", "first headache",
                   "never had one", "new"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 12 — HEAD TRAUMA
// ═══════════════════════════════════════════════════════════════════════════════

export const HEAD_TRAUMA_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_HT_LOC",
    questionText: "Did you lose consciousness?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["yes", "passed out", "blacked out", "unconscious",
                   "knocked out", "don't remember", "woke up on floor"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_HT_AMNESIA",
    questionText: "Is there anything you can't remember — before or after the injury?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — memory gap",
        synonyms: ["can't remember", "memory loss", "blank", "amnesia",
                   "don't know what happened", "foggy", "gap in memory"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_HT_VOMIT",
    questionText: "Have you vomited since the injury?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["vomited", "threw up", "vomiting", "been sick",
                   "couldn't keep anything down"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_HT_MECHANISM",
    questionText: "How did it happen?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "fall",      label: "Fall",
        synonyms: ["fell", "fall", "tripped", "slipped",
                   "fell down", "fell off"] },
      { value: "mvA",       label: "Motor vehicle accident",
        synonyms: ["car accident", "mva", "car crash", "hit by car",
                   "bicycle accident", "motorcycle"] },
      { value: "struck",    label: "Struck by object",
        synonyms: ["hit in head", "struck", "something fell on me",
                   "got hit", "hit with", "baseball", "ball hit me"] },
      { value: "assault",   label: "Assault",
        synonyms: ["assaulted", "punched", "attack", "hit by someone",
                   "was hit", "fight"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 13 — BACK OR NECK PAIN (non-traumatic)
// ═══════════════════════════════════════════════════════════════════════════════

export const BACK_NECK_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_BNP_NEURO",
    questionText: "Do you have numbness, tingling, or weakness in your arms or legs?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — neurological symptoms",
        synonyms: ["numbness", "tingling", "weakness", "pins and needles",
                   "electric shock feeling", "shooting down leg",
                   "shooting down arm", "sciatica", "numb", "weak leg",
                   "foot drop", "can't grip"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_BNP_BOWEL_BLADDER",
    questionText: "Any problems with bladder or bowel control?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — CAUDA EQUINA SCREEN",
        synonyms: ["can't control", "leaking", "incontinent",
                   "can't pee", "can't feel to go", "retention",
                   "saddle anesthesia", "numbness down there"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_BNP_RADIATION",
    questionText: "Does the pain go down your leg or arm?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — radiates",
        synonyms: ["goes down", "radiates", "shoots down", "down my leg",
                   "into my leg", "sciatica", "down my arm", "into my arm",
                   "travels", "electric shock down leg"] },
      { value: "no",  label: "No — stays in back/neck",
        synonyms: ["stays in back", "just my back", "no radiation",
                   "doesn't go anywhere", "just the neck"] },
    ],
  },
  {
    questionId:   "Q_BNP_FEVER",
    questionText: "Any fever or recent infection?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: YES_NO_OPTIONS,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 14 — EYE REDNESS
// ═══════════════════════════════════════════════════════════════════════════════

export const EYE_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_EYE_VISION",
    questionText: "Is your vision affected?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — vision change",
        synonyms: ["blurry", "blurry vision", "can't see clearly",
                   "vision is off", "halos", "double vision",
                   "lost vision", "vision changed", "cloudy"] },
      { value: "no",  label: "No — vision clear",
        synonyms: ["vision is fine", "can see clearly", "no change in vision",
                   "normal vision", "20/20"] },
    ],
  },
  {
    questionId:   "Q_EYE_PAIN",
    questionText: "Is the eye painful?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes — painful",
        synonyms: ["painful", "pain", "hurts", "sore eye",
                   "eye pain", "aching", "throbbing", "pressure in eye"] },
      { value: "no",  label: "No — no pain",
        synonyms: ["no pain", "doesn't hurt", "just red", "painless",
                   "not painful"] },
    ],
  },
  {
    questionId:   "Q_EYE_DISCHARGE",
    questionText: "Is there discharge from the eye?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "purulent", label: "Pus / Yellow-green discharge",
        synonyms: ["pus", "yellow", "green", "gunky", "crusty",
                   "discharge", "goopy", "stuck shut in morning",
                   "matted", "crusted"] },
      { value: "watery",   label: "Watery / Clear",
        synonyms: ["watery", "tearing", "clear", "tears",
                   "watery discharge"] },
      { value: "none",     label: "No discharge",
        synonyms: ["no discharge", "dry", "no drainage", "nothing coming out"] },
    ],
  },
  {
    questionId:   "Q_EYE_CONTACT_LENS",
    questionText: "Do you wear contact lenses?",
    questionType: "boolean_pair",
    section: 5, isActive: false,
    options: YES_NO_OPTIONS,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 15 — PALPITATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const PALPITATION_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_PAL_CHARACTER",
    questionText: "How would you describe it — racing, fluttering, skipping, or pounding?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "racing",    label: "Racing / Fast",
        synonyms: ["racing", "fast", "too fast", "rapid",
                   "heart is racing", "tachycardia", "going fast"] },
      { value: "fluttering", label: "Fluttering",
        synonyms: ["fluttering", "flutter", "like a butterfly",
                   "flopping", "wiggling", "quivering"] },
      { value: "skipping",  label: "Skipping / Missing beats",
        synonyms: ["skipping", "skips", "missing a beat", "irregular",
                   "pauses", "flip flop", "extra beat"] },
      { value: "pounding",  label: "Pounding / Hard",
        synonyms: ["pounding", "hard", "forceful", "strong",
                   "can feel it in chest", "thumping"] },
    ],
  },
  {
    questionId:   "Q_PAL_SYNCOPE",
    questionText: "Did you pass out or nearly pass out during the episode?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: [
      { value: "yes", label: "Yes",
        synonyms: ["passed out", "nearly passed out", "syncope",
                   "lightheaded", "almost fainted", "blacked out"] },
      { value: "no",  label: "No", synonyms: YES_NO_OPTIONS[1].synonyms },
    ],
  },
  {
    questionId:   "Q_PAL_DURATION",
    questionText: "How long do episodes last?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "seconds",  label: "Seconds",
        synonyms: ["seconds", "brief", "quick", "comes and goes quickly"] },
      { value: "minutes",  label: "Minutes",
        synonyms: ["minutes", "few minutes", "5 minutes", "10 minutes"] },
      { value: "hours",    label: "Hours",
        synonyms: ["hours", "long time", "all day", "persistent",
                   "won't stop"] },
      { value: "ongoing",  label: "Still happening now",
        synonyms: ["right now", "still happening", "ongoing", "current"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 16 — HYPERTENSION
// ═══════════════════════════════════════════════════════════════════════════════

export const HTN_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_HTN_SYMPTOMS",
    questionText: "Do you have headache, vision changes, chest pain, or shortness of breath?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "headache",        label: "Headache",
        synonyms: ["headache", "head hurts", "head pain", "throbbing head"] },
      { value: "vision_changes",  label: "Vision changes",
        synonyms: ["vision", "blurry", "can't see clearly", "spots",
                   "vision is off"] },
      { value: "chest_pain",      label: "Chest pain",
        synonyms: ["chest pain", "chest hurts", "chest tightness"] },
      { value: "sob",             label: "Shortness of breath",
        synonyms: ["short of breath", "can't breathe", "dyspnea"] },
      { value: "no_symptoms",     label: "No symptoms — incidental finding",
        synonyms: ["no symptoms", "felt fine", "just checked it",
                   "no complaints", "asymptomatic", "checking blood pressure"] },
    ],
  },
  {
    questionId:   "Q_HTN_MEDS_TAKEN",
    questionText: "Did you take your blood pressure medication today?",
    questionType: "boolean_pair",
    section: 5, isActive: false,
    options: [
      { value: "yes",   label: "Yes — took medications",
        synonyms: ["yes", "took it", "took them", "i took my meds",
                   "took my pill"] },
      { value: "no",    label: "No — missed medications",
        synonyms: ["no", "forgot", "ran out", "didn't take",
                   "missed it", "out of medication", "no refill"] },
    ],
  },
  {
    questionId:   "Q_HTN_HOME_BP",
    questionText: "What was your blood pressure at home?",
    questionType: "text",
    section: 2, isActive: false,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 17 — MEDICATION REFILL
// ═══════════════════════════════════════════════════════════════════════════════

export const MED_REFILL_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_REF_MEDICATION",
    questionText: "Which medication do you need refilled?",
    questionType: "text",
    section: 2, isActive: false,
  },
  {
    questionId:   "Q_REF_SIDE_EFFECTS",
    questionText: "Are you having any side effects from this medication?",
    questionType: "boolean_pair",
    section: 2, isActive: false,
    options: YES_NO_OPTIONS,
  },
  {
    questionId:   "Q_REF_CONTROLLED",
    questionText: "Is this a controlled substance?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "controlled",     label: "Yes — controlled",
        synonyms: ["controlled", "narcotic", "opioid", "benzodiazepine",
                   "stimulant", "adderall", "xanax", "percocet",
                   "oxycodone", "hydrocodone", "ambien", "klonopin"] },
      { value: "not_controlled", label: "No — not controlled",
        synonyms: ["not controlled", "regular", "blood pressure",
                   "cholesterol", "thyroid", "metformin", "lisinopril",
                   "atorvastatin", "not a narcotic"] },
    ],
  },
  {
    questionId:   "Q_REF_LAST_SEEN",
    questionText: "When were you last seen by the prescribing doctor?",
    questionType: "chip_select",
    section: 3, isActive: false,
    options: [
      { value: "lt_3_months",  label: "Within 3 months",
        synonyms: ["recently", "last month", "two months", "this year",
                   "couple months", "within 3 months"] },
      { value: "3_12_months",  label: "3–12 months ago",
        synonyms: ["6 months", "few months", "this year but a while",
                   "about 6 months", "summer", "spring"] },
      { value: "gt_1_year",    label: "More than a year ago",
        synonyms: ["last year", "over a year", "long time",
                   "haven't seen them in a while", "years ago"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLUSTER 18 — PAIN: TOOTH / JOINT / MYALGIA
// (with SSRI / ANTIPSYCHOTIC medication awareness)
// ═══════════════════════════════════════════════════════════════════════════════

export const PAIN_COMPLEX_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_PAIN_LOCATION",
    questionText: "Where is the pain?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "tooth",    label: "Tooth / Dental",
        synonyms: ["tooth", "teeth", "dental", "my tooth",
                   "jaw", "gum", "molar", "toothache"] },
      { value: "joint",    label: "Joint",
        synonyms: ["joint", "knee", "hip", "wrist", "ankle",
                   "elbow", "shoulder", "knuckle", "finger joint"] },
      { value: "muscle",   label: "Muscle / Body wide",
        synonyms: ["muscle", "muscles", "myalgia", "all over",
                   "body aches", "fibromyalgia", "everywhere",
                   "generalized pain", "diffuse"] },
    ],
  },
  {
    questionId:   "Q_PAIN_PSYCH_MEDS",
    questionText: "Are you on any psychiatric medications — antidepressants or antipsychotics?",
    questionType: "chip_select",
    section: 7, isActive: false,
    options: [
      { value: "ssri_snri",      label: "Antidepressant (SSRI/SNRI)",
        synonyms: ["antidepressant", "ssri", "snri", "prozac",
                   "zoloft", "lexapro", "effexor", "cymbalta",
                   "sertraline", "fluoxetine", "escitalopram",
                   "for depression", "for anxiety"] },
      { value: "antipsychotic",  label: "Antipsychotic",
        synonyms: ["antipsychotic", "abilify", "risperdal", "seroquel",
                   "zyprexa", "haldol", "latuda", "olanzapine",
                   "quetiapine", "aripiprazole", "for bipolar",
                   "for schizophrenia"] },
      { value: "both",           label: "Both",
        synonyms: ["both", "multiple", "antidepressant and antipsychotic"] },
      { value: "none",           label: "None",
        synonyms: ["none", "no psych meds", "not on any",
                   "no psychiatric medications", "no"] },
    ],
  },
  // CLINICAL NOTE: SSRI/SNRI + NSAIDs = GI bleeding risk
  // Antipsychotics = QT prolongation risk with some antibiotics
  // These flags feed directly into medication safety filters
  {
    questionId:   "Q_PAIN_NSAID_USE",
    questionText: "Have you taken ibuprofen or other anti-inflammatories for this?",
    questionType: "chip_select",
    section: 2, isActive: false,
    options: [
      { value: "effective",    label: "Yes — it helped",
        synonyms: ["helped", "works", "better with ibuprofen",
                   "nsaid helps", "motrin helps"] },
      { value: "ineffective",  label: "Yes — didn't help",
        synonyms: ["tried it", "didn't work", "no help",
                   "ibuprofen didn't help", "still hurts after"] },
      { value: "not_taken",    label: "No — haven't tried",
        synonyms: ["haven't tried", "no", "not yet",
                   "afraid to take", "can't take nsaids"] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER REGISTRY — maps complaint slugs to their context arrays
// ═══════════════════════════════════════════════════════════════════════════════

export const COMPLAINT_VOICE_CONTEXTS: Record<string, QuestionContext[]> = {
  // Cluster 1 — URI / cold / flu / sore throat
  "upper_respiratory":       URI_CLUSTER_CONTEXTS,
  "sore_throat":             URI_CLUSTER_CONTEXTS,
  "flu_covid":               URI_CLUSTER_CONTEXTS,
  "sinusitis":               URI_CLUSTER_CONTEXTS,
  "cough":                   URI_CLUSTER_CONTEXTS,

  // Cluster 2 — Chest / SOB
  "chest_pain":              CHEST_SOB_CONTEXTS,
  "shortness_of_breath":     CHEST_SOB_CONTEXTS,

  // Cluster 3 — UTI
  "uti":                     UTI_CONTEXTS,
  "kidney_stone":            UTI_CONTEXTS,
  "hematuria":               UTI_CONTEXTS,

  // Cluster 4 — MSK
  "ankle_injury":            MSK_CONTEXTS,
  "back_pain":               BACK_NECK_CONTEXTS,
  "neck_pain":               BACK_NECK_CONTEXTS,
  "shoulder_pain":           MSK_CONTEXTS,
  "wrist_hand_injury":       MSK_CONTEXTS,
  "knee_pain":               MSK_CONTEXTS,

  // Cluster 5 — Syncope
  "syncope":                 SYNCOPE_CONTEXTS,

  // Cluster 6 — Rash
  "rash_mild":               RASH_CONTEXTS,
  "urticaria":               RASH_CONTEXTS,
  "skin_infection":          RASH_CONTEXTS,

  // Cluster 7 — Abdominal
  "abdominal_pain":          ABDOMINAL_CONTEXTS,
  "nausea_vomiting":         ABDOMINAL_CONTEXTS,
  "diarrhea":                ABDOMINAL_CONTEXTS,

  // Cluster 8 — STD
  "std_gonorrhea_chlamydia": STD_CONTEXTS,
  "std_syphilis":            STD_CONTEXTS,
  "std_herpes":              STD_CONTEXTS,
  "prep_pep":                STD_CONTEXTS,

  // Cluster 9 — Vaginal
  "vaginal_discharge":       VAGINAL_CONTEXTS,
  "pelvic_pain_female":      VAGINAL_CONTEXTS,

  // Cluster 10 — Laceration
  "wound_laceration":        LACERATION_CONTEXTS,

  // Cluster 11 — Headache
  "headache":                HEADACHE_CONTEXTS,
  "migraine":                HEADACHE_CONTEXTS,

  // Cluster 12 — Head trauma
  "head_trauma":             HEAD_TRAUMA_CONTEXTS,
  "concussion":              HEAD_TRAUMA_CONTEXTS,

  // Cluster 13 — Back/neck
  "back_pain_nontraumatic":  BACK_NECK_CONTEXTS,

  // Cluster 14 — Eye
  "eye_complaint":           EYE_CONTEXTS,
  "pink_eye":                EYE_CONTEXTS,

  // Cluster 15 — Palpitations
  "palpitations":            PALPITATION_CONTEXTS,

  // Cluster 16 — HTN
  "hypertensive_urgency":    HTN_CONTEXTS,

  // Cluster 17 — Med refill
  "medication_refill":       MED_REFILL_CONTEXTS,

  // Cluster 18 — Complex pain
  "dental_pain":             PAIN_COMPLEX_CONTEXTS,
  "joint_pain_polyarticular": PAIN_COMPLEX_CONTEXTS,
  "fatigue_malaise":         PAIN_COMPLEX_CONTEXTS,
};

export function getContextsForComplaint(complaintId: string): QuestionContext[] {
  return COMPLAINT_VOICE_CONTEXTS[complaintId] ?? [];
}

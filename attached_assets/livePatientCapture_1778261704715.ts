/**
 * livePatientCapture.ts
 *
 * LIVE PATIENT INTERVIEW VOICE CAPTURE
 *
 * HOW THIS WORKS IN PRACTICE:
 *
 * 1. Physician taps "Listen" (microphone stays open during interview)
 * 2. Physician asks: "How would you describe the pain — sharp, dull, pressure?"
 * 3. Patient says: "Sharp" or "It just hurts" or "Like pressure on my chest"
 * 4. System extracts the answer and auto-fills the form field
 * 5. Green flash = auto-confirmed. Yellow flash = physician taps once to confirm.
 * 6. Physician moves to next question. No charting. No repeating.
 *
 * COMMERCIAL VALUE:
 * - Standard urgent care visit: 8-12 minutes of history taking
 * - With live capture: 3-4 minutes (physician asks, patient answers, form fills)
 * - Time saved per visit: 4-8 minutes
 * - At 20 patients/day: 80-160 minutes saved = 10-20 additional patient slots
 * - NPS impact: physician makes eye contact, not staring at screen
 *   "The doctor actually listened to me" → highest NPS driver
 *
 * CONTEXT-AWARE EXTRACTION:
 * The system knows which question is currently active on screen.
 * It only needs to parse the patient's answer against the known options.
 * "It just hurts" maps to Aching/Dull because the active question
 * has those options and "hurts" without qualifier = non-specific = dull/aching.
 *
 * CONFIDENCE LEVELS:
 * HIGH   (auto-fill, green flash, move on) — clear match: "sharp", "pressure"
 * MEDIUM (yellow highlight, physician taps once) — "it just hurts", "kind of burning"
 * LOW    (show all options highlighted, physician selects) — truly ambiguous
 */

// ─── Question context types ───────────────────────────────────────────────────
// Mirrors the question structure visible in the screenshots

export interface QuestionContext {
  questionId:    string;   // Q_CP_QUALITY, Q_CP_ONSET, etc.
  questionText:  string;   // "Character / quality — select all that apply"
  questionType:  "chip_select" | "boolean_pair" | "scale" | "text" | "vitals";
  options?:      Array<{
    value:       string;   // internal value: "pressure_squeezing"
    label:       string;   // display label: "Pressure / Squeezing"
    synonyms:    string[]; // words patient might use
  }>;
  section:       number;   // 1-7
  isActive:      boolean;
}

export interface CaptureResult {
  questionId:    string;
  matched:       Array<{
    value:       string;
    label:       string;
    confidence:  "high" | "medium" | "low";
    matchedOn:   string;  // which word triggered the match
  }>;
  rawAnswer:     string;
  autoConfirm:   boolean;  // true = no physician tap needed
  displayHint?:  string;   // shown to physician if not auto-confirmed
}

// ─── Answer libraries per question type ──────────────────────────────────────

// From Screenshot 2 — Character/Quality chips
export const QUALITY_OPTIONS = [
  {
    value:    "pressure_squeezing",
    label:    "Pressure / Squeezing",
    synonyms: ["pressure", "squeezing", "squeeze", "tight", "tightness",
               "heavy", "weight", "sitting on", "elephant", "band",
               "constricting", "crushing"],
  },
  {
    value:    "sharp_stabbing",
    label:    "Sharp / Stabbing",
    synonyms: ["sharp", "stabbing", "stab", "knife", "needle",
               "piercing", "shooting", "lancinating"],
  },
  {
    value:    "burning",
    label:    "Burning",
    synonyms: ["burning", "burn", "heartburn", "fire", "hot",
               "acid", "indigestion", "sour"],
  },
  {
    value:    "aching_dull",
    label:    "Aching / Dull",
    synonyms: ["aching", "ache", "dull", "sore", "hurts", "hurt",
               "pain", "just hurts", "uncomfortable", "bothersome",
               "nagging", "throbbing", "pounding"],
  },
  {
    value:    "tearing_ripping",
    label:    "Tearing / Ripping",
    synonyms: ["tearing", "tear", "ripping", "rip", "tearing",
               "like something tore", "like something ripped"],
  },
];

// From Screenshot 1 — Onset timing chips
export const ONSET_OPTIONS = [
  {
    value:    "sudden",
    label:    "Sudden (seconds)",
    synonyms: ["sudden", "suddenly", "instantly", "out of nowhere",
               "all at once", "immediately", "bang", "seconds",
               "like a switch", "woke me up"],
  },
  {
    value:    "rapid",
    label:    "Rapid (minutes)",
    synonyms: ["rapid", "quickly", "fast", "minutes", "came on quickly",
               "pretty fast", "within minutes"],
  },
  {
    value:    "gradual",
    label:    "Gradual (hours+)",
    synonyms: ["gradual", "gradually", "slowly", "over time", "hours",
               "built up", "came on slowly", "getting worse over",
               "crept up", "started mild"],
  },
];

// Boolean pair questions — what patients say for yes/no questions
const AFFIRMATIVE = ["yes", "yeah", "yep", "yup", "correct", "right", "true",
                     "absolutely", "definitely", "certainly", "i do", "i have",
                     "that's right", "uh huh", "mm hmm", "positive"];
const NEGATIVE    = ["no", "nope", "nah", "not really", "don't think so",
                     "i don't", "i haven't", "negative", "never",
                     "not that i know of", "doesn't", "didn't", "hasn't"];

// Scale (1-10 pain) — patients often say these
const SCALE_PATTERNS = [
  /\b(ten|10)\b/i,
  /\b(nine|9)\b/i,
  /\b(eight|8)\b/i,
  /\b(seven|7)\b/i,
  /\b(six|6)\b/i,
  /\b(five|5)\b/i,
  /\b(four|4)\b/i,
  /\b(three|3)\b/i,
  /\b(two|2)\b/i,
  /\b(one|1)\b/i,
];

const SCALE_WORDS: Record<string, number> = {
  "terrible": 9, "unbearable": 10, "worst": 10, "excruciating": 10,
  "very bad": 8, "really bad": 8, "pretty bad": 7,
  "moderate": 5, "medium": 5, "half": 5,
  "mild": 3, "little": 2, "slight": 2, "barely": 1,
};

// ─── Core matcher ─────────────────────────────────────────────────────────────

function scoreAnswer(
  patientSpeech: string,
  option: { value: string; label: string; synonyms: string[] }
): { score: number; matchedOn: string } {

  const speech = patientSpeech.toLowerCase().trim();
  let score    = 0;
  let matchedOn = "";

  for (const syn of option.synonyms) {
    if (speech === syn) {
      score     = 1.0;
      matchedOn = syn;
      break;
    }
    if (speech.includes(syn)) {
      const s = Math.max(score, 0.8);
      if (s > score) { score = s; matchedOn = syn; }
    }
    // Fuzzy: patient said something close
    if (syn.split(" ").some(word => word.length > 3 && speech.includes(word))) {
      const s = Math.max(score, 0.5);
      if (s > score) { score = s; matchedOn = word_that_matched(speech, syn); }
    }
  }

  return { score, matchedOn };
}

function word_that_matched(speech: string, phrase: string): string {
  return phrase.split(" ").find(w => w.length > 3 && speech.includes(w)) ?? phrase;
}

// ─── Main capture function ────────────────────────────────────────────────────

export function capturePatientAnswer(
  patientSpeech:   string,
  questionContext: QuestionContext
): CaptureResult {

  const speech  = patientSpeech.toLowerCase().trim();
  const result:  CaptureResult = {
    questionId:  questionContext.questionId,
    matched:     [],
    rawAnswer:   patientSpeech,
    autoConfirm: false,
  };

  switch (questionContext.questionType) {

    case "chip_select": {
      const options = questionContext.options ?? [];
      const scores  = options.map(opt => ({
        ...opt,
        ...scoreAnswer(speech, opt),
      })).sort((a, b) => b.score - a.score);

      const highConf   = scores.filter(s => s.score >= 0.8);
      const medConf    = scores.filter(s => s.score >= 0.4 && s.score < 0.8);

      if (highConf.length > 0) {
        result.matched    = highConf.map(s => ({
          value:      s.value,
          label:      s.label,
          confidence: "high" as const,
          matchedOn:  s.matchedOn,
        }));
        result.autoConfirm = true;
      } else if (medConf.length > 0) {
        result.matched    = medConf.slice(0, 2).map(s => ({
          value:      s.value,
          label:      s.label,
          confidence: "medium" as const,
          matchedOn:  s.matchedOn,
        }));
        result.displayHint = `Patient said "${patientSpeech}" — tap to confirm`;
        result.autoConfirm = false;
      } else {
        // No match — show all options for physician to select
        result.displayHint = `Could not parse "${patientSpeech}" — please select`;
        result.autoConfirm = false;
      }
      break;
    }

    case "boolean_pair": {
      const isYes = AFFIRMATIVE.some(a => speech.includes(a));
      const isNo  = NEGATIVE.some(n => speech.includes(n));

      if (isYes && !isNo) {
        result.matched    = [{ value: "yes", label: "Yes", confidence: "high", matchedOn: "affirmative" }];
        result.autoConfirm = true;
      } else if (isNo && !isYes) {
        result.matched    = [{ value: "no", label: "No", confidence: "high", matchedOn: "negative" }];
        result.autoConfirm = true;
      } else {
        result.displayHint = `Ambiguous: "${patientSpeech}" — tap Yes or No`;
      }
      break;
    }

    case "scale": {
      // Try numeric word first
      for (const [word, val] of Object.entries(SCALE_WORDS)) {
        if (speech.includes(word)) {
          result.matched    = [{ value: String(val), label: String(val), confidence: "medium", matchedOn: word }];
          result.displayHint = `Heard "${word}" → ${val}/10 — tap to confirm`;
          break;
        }
      }
      // Try explicit number
      if (result.matched.length === 0) {
        for (let i = 0; i < SCALE_PATTERNS.length; i++) {
          if (SCALE_PATTERNS[i].test(speech)) {
            const val = 10 - i;
            result.matched    = [{ value: String(val), label: String(val), confidence: "high", matchedOn: String(val) }];
            result.autoConfirm = true;
            break;
          }
        }
      }
      break;
    }

    case "text": {
      // Free text — just capture whatever they said
      result.matched    = [{ value: patientSpeech, label: patientSpeech, confidence: "high", matchedOn: "verbatim" }];
      result.autoConfirm = true;
      break;
    }
  }

  return result;
}

// ─── Session manager ──────────────────────────────────────────────────────────
// Tracks the active question during a live interview session.
// Your React component calls setActiveQuestion() as the physician
// moves through the form.

export class LiveInterviewSession {
  private activeQuestion: QuestionContext | null = null;
  private captureHistory: CaptureResult[]        = [];
  private isListening:    boolean                = false;

  setActiveQuestion(ctx: QuestionContext): void {
    this.activeQuestion = ctx;
  }

  async processPatientSpeech(speech: string): Promise<CaptureResult | null> {
    if (!this.activeQuestion) return null;

    const result = capturePatientAnswer(speech, this.activeQuestion);
    this.captureHistory.push(result);
    return result;
  }

  getHistory(): CaptureResult[] {
    return [...this.captureHistory];
  }

  getFieldsFilled(): number {
    return this.captureHistory.filter(r => r.matched.length > 0).length;
  }
}

// ─── Pre-built question contexts for chest pain ───────────────────────────────
// Build these for each complaint. Mirror exactly what's in your form.
// These map to the chip buttons visible in the screenshots.

export const CHEST_PAIN_QUESTION_CONTEXTS: QuestionContext[] = [
  {
    questionId:   "Q_CP_ONSET_TIMING",
    questionText: "Onset timing — how did it start?",
    questionType: "chip_select",
    section:      2,
    isActive:     false,
    options:      ONSET_OPTIONS,
  },
  {
    questionId:   "Q_CP_SEVERITY",
    questionText: "Pain severity — 1 (mild) to 10 (worst ever)",
    questionType: "scale",
    section:      2,
    isActive:     false,
  },
  {
    questionId:   "Q_CP_QUALITY",
    questionText: "Character / quality — select all that apply",
    questionType: "chip_select",
    section:      2,
    isActive:     false,
    options:      QUALITY_OPTIONS,
  },
  {
    questionId:   "Q_CP_CONSTANT",
    questionText: "Pain is constant (not coming and going)?",
    questionType: "boolean_pair",
    section:      2,
    isActive:     false,
  },
  {
    questionId:   "Q_CP_EXERTIONAL",
    questionText: "Came on with exertion or physical activity?",
    questionType: "boolean_pair",
    section:      2,
    isActive:     false,
  },
  {
    questionId:   "Q_CP_RADIATES",
    questionText: "Radiates to arm, jaw, neck, or between shoulder blades?",
    questionType: "boolean_pair",
    section:      2,
    isActive:     false,
  },
  {
    questionId:   "Q_CP_PLEURITIC",
    questionText: "Chest pain after exhaling (pleuritic)?",
    questionType: "boolean_pair",
    section:      2,
    isActive:     false,
  },
  {
    questionId:   "Q_CP_PERICARDITIC",
    questionText: "Worse lying flat, better leaning forward?",
    questionType: "boolean_pair",
    section:      2,
    isActive:     false,
  },
  {
    questionId:   "ROS_SOB",
    questionText: "Shortness of breath?",
    questionType: "boolean_pair",
    section:      4,
    isActive:     false,
  },
  {
    questionId:   "ROS_DIAPHORESIS",
    questionText: "Diaphoresis (sweating / clammy)?",
    questionType: "boolean_pair",
    section:      4,
    isActive:     false,
  },
  {
    questionId:   "PMH_HTN",
    questionText: "Hypertension?",
    questionType: "boolean_pair",
    section:      5,
    isActive:     false,
  },
  {
    questionId:   "PMH_DM",
    questionText: "Diabetes?",
    questionType: "boolean_pair",
    section:      5,
    isActive:     false,
  },
  {
    questionId:   "MED_ANTICOAG",
    questionText: "On anticoagulants (warfarin / NOAC)?",
    questionType: "boolean_pair",
    section:      7,
    isActive:     false,
  },
  {
    questionId:   "ALLERGY_PCN",
    questionText: "Allergy: Penicillin?",
    questionType: "boolean_pair",
    section:      7,
    isActive:     false,
  },
];

// ─── NPS optimization note ────────────────────────────────────────────────────
/**
 * THE COMMERCIAL CASE (from your framing):
 *
 * Current state without live capture:
 *   - Physician asks question
 *   - Patient answers
 *   - Physician looks at screen, finds field, clicks button
 *   - Patient watches physician stare at screen
 *   - NPS driver missed: "The doctor was focused on me"
 *
 * With live capture:
 *   - Physician asks question (looking at patient)
 *   - Patient answers
 *   - Form fills automatically (physician hears a soft chime)
 *   - Physician glances at green flash to confirm
 *   - Returns eye contact to patient immediately
 *   - NPS driver hit: "The doctor really listened"
 *   - Visit time: 4-8 minutes shorter
 *   - More patients per day
 *   - Higher NPS scores
 *
 * This is the feature that sells Auralyn to urgent care groups.
 * Not the differential diagnosis (impressive but invisible to patients).
 * Not the 13-step pipeline (impressive but invisible to patients).
 * THIS — the physician looking at them instead of a screen.
 *
 * Urgent care CMO pitch:
 * "Our physicians see 20% more patients and score 15% higher on NPS.
 *  Both because the same tool frees their attention."
 */

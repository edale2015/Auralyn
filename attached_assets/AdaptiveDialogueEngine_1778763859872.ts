/**
 * AURALYN — Adaptive Pre-Encounter Dialogue Engine
 *
 * This is the system that talks to the patient BEFORE the physician
 * enters the room. It conducts a structured, adaptive interview,
 * guides self-examination, captures vitals context, and hands off
 * a complete clinical state to the reasoning engine.
 *
 * Design principles:
 *   1. ADAPTIVE — questions branch based on answers, never linear
 *   2. CONVERGENT — knows when it has enough, stops asking
 *   3. CONSISTENT — detects when answers change or contradict
 *   4. RESPECTFUL — plain language, no medical jargon, no alarm
 *   5. HONEST ABOUT LIMITS — never pretends to diagnose
 *   6. GAP-AWARE — explicitly tracks what only the physician can assess
 *
 * The hardest design problem: patients change their stories.
 * Not because they are lying — because:
 *   - A question phrased differently triggers different recall
 *   - They remember something only after being asked a related question
 *   - Pain has changed between questions
 *   - They want to be helpful and sometimes guess
 *
 * Solution: log every answer with timestamp, flag contradictions
 * for physician attention, never discard prior answers.
 *
 * File: server/dialogue/AdaptiveDialogueEngine.ts
 */

import OpenAI from "openai";
import { applyPHIGuard } from "../safety/PHIGuard";
import { db } from "../db";
import { appendAuditEvent } from "../audit/HashChain";

// ─── TYPES ────────────────────────────────────────────────────────────────

export type DialogueChannel =
  | "whatsapp"
  | "sms"
  | "web_chat"
  | "tablet_kiosk"
  | "voice_phone"
  | "voice_room";   // in-room speaker/microphone

export type DialoguePhase =
  | "greeting"
  | "chief_complaint"
  | "triage_screen"       // immediate safety check
  | "history_gathering"
  | "self_exam_guidance"
  | "vitals_capture"
  | "medication_allergy"
  | "social_context"
  | "complete";

export interface DialogueTurn {
  turnId: string;
  timestamp: string;
  speaker: "auralyn" | "patient";
  text: string;
  phase: DialoguePhase;
  questionId: string | null;     // which clinical question this addressed
  extractedData: Record<string, any>; // what was extracted from this turn
  confidenceScore: number;        // 0-1 how confident the extraction is
  flagged: boolean;               // needs physician attention
  flagReason: string | null;
}

export interface AnswerLog {
  questionId: string;
  question: string;
  firstAnswer: string;
  firstAnswerTime: string;
  currentAnswer: string;
  currentAnswerTime: string;
  answerChanged: boolean;
  changeSignificant: boolean;    // clinical significance of the change
  changeNote: string | null;     // what changed and why it matters
}

export interface SelfExamResult {
  examType: string;
  instruction: string;
  patientReport: string;
  clinicalInterpretation: string;
  confidence: "high" | "moderate" | "low" | "requires_physician";
  physicianVerificationRequired: boolean;
}

export interface DialogueGap {
  category: "physical_exam" | "visual_assessment" | "instrument_required" |
            "lab_result" | "imaging_result" | "clinical_gestalt";
  description: string;             // what needs to be assessed
  priority: "critical" | "important" | "helpful";
  whyPhysicianOnly: string;        // explicit reason this can't be done remotely
  suggestedAction: string;         // what the physician should do
}

export interface PreEncounterSummary {
  encounterId: string;
  patientId: string;
  chiefComplaint: string;
  dialogueDuration: number;        // minutes
  turnsCompleted: number;
  channel: DialogueChannel;

  // Clinical state — everything gathered
  clinicalState: any;              // full ClinicalState object

  // Preliminary reasoning
  preliminaryDisposition: string;
  dispositionConfidence: number;   // 0-1
  topDifferential: string[];
  safetyAlertsTriggered: string[];

  // Gaps for physician
  physicalExamGaps: DialogueGap[];
  storyFlags: AnswerLog[];         // answers that changed
  selfExamResults: SelfExamResult[];

  // Briefing card text (what physician sees on their device)
  briefingCard: PhysicianBriefingCard;
}

export interface PhysicianBriefingCard {
  oneLiner: string;                // "82F with 7-day frontal headache, no danger signals, pattern unclear"
  urgencySignal: "routine" | "watch" | "expedite" | "immediate";
  preliminaryDisposition: string;
  topDifferential: string[];
  criticalGaps: string[];          // must close before disposition
  importantGaps: string[];         // should close if possible
  storyFlags: string[];            // "Patient changed answer about fever — originally said yes, now says no"
  selfExamFindings: string[];
  medicationFlags: string[];
  suggestedFirstWords: string;     // what to say walking in, based on what's known
}

// ─── QUESTION LIBRARY ─────────────────────────────────────────────────────
/**
 * Questions are organized by:
 *   - which complaint packs they apply to (tags)
 *   - their priority (always ask vs conditional)
 *   - what clinical data they extract
 *   - how to phrase them for patient vs clinical record
 *
 * Plain language versions are used with patients.
 * Clinical labels are used in the extracted ClinicalState.
 */

export interface DialogueQuestion {
  id: string;
  patientText: string;           // what the patient sees/hears
  voiceText?: string;            // alternate phrasing for voice (more natural)
  clinicalLabel: string;         // what this maps to in ClinicalState
  appliesTo: string[];           // complaint pack tags
  priority: "always" | "conditional" | "enriching";
  condition?: (state: Partial<any>) => boolean; // when to ask
  followUpIf?: {                 // ask follow-up if answer matches
    answerPattern: RegExp | string;
    followUpId: string;
  }[];
  selfExamGuidance?: SelfExamGuidance;
  extractionHint: string;        // what to look for in the answer
}

export interface SelfExamGuidance {
  instruction: string;
  voiceInstruction: string;
  whatToReport: string;
  physicianVerificationRequired: boolean;
  requiredFor: string[];         // diagnoses this helps assess
}

// Core universal questions — asked for every patient
export const UNIVERSAL_QUESTIONS: DialogueQuestion[] = [
  {
    id: "Q001",
    patientText: "Can you tell me what's bothering you today — what's your main concern?",
    voiceText: "What's bringing you in today? What's bothering you most?",
    clinicalLabel: "chiefComplaint",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "Extract the primary symptom and any secondary symptoms mentioned",
  },
  {
    id: "Q002",
    patientText: "How long have you been feeling this way?",
    voiceText: "How long has this been going on?",
    clinicalLabel: "symptomDuration",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "Extract duration in hours or days. Flag if >7 days for most complaints.",
  },
  {
    id: "Q003",
    patientText: "On a scale of 0 to 10, with 0 being no discomfort and 10 being the worst you've ever felt, how would you rate it right now?",
    voiceText: "How bad is it on a scale of 0 to 10?",
    clinicalLabel: "painScore",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "Extract numeric pain score. Flag if ≥8.",
  },
  {
    id: "Q004",
    patientText: "Are you taking any medications regularly, including vitamins or supplements?",
    voiceText: "What medications do you take, including any vitamins or supplements?",
    clinicalLabel: "currentMedications",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "List all medications. Flag: GLP-1, anticoagulants, steroids, immunosuppressants, cardiac medications.",
  },
  {
    id: "Q005",
    patientText: "Do you have any allergies to medications?",
    voiceText: "Are you allergic to any medications?",
    clinicalLabel: "medicationAllergies",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "List drug allergies. Note reaction type if mentioned.",
  },
  {
    id: "Q006",
    patientText: "Do you have any medical conditions we should know about?",
    voiceText: "Do you have any medical problems or conditions?",
    clinicalLabel: "medicalHistory",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "Extract diagnoses. Flag: diabetes, heart disease, COPD, cancer, pregnancy, immunocompromised.",
  },
  {
    id: "Q007",
    patientText: "How old are you?",
    voiceText: "How old are you?",
    clinicalLabel: "age",
    appliesTo: ["all"],
    priority: "always",
    extractionHint: "Extract age as number. Flag: <2, <18, >65, >80.",
  },
];

// Abdominal pain specific questions
export const ABDOMINAL_QUESTIONS: DialogueQuestion[] = [
  {
    id: "ABD001",
    patientText: "Can you point to where it hurts most? If you were looking at your belly, would you say it's more on the upper right, upper left, lower right, lower left, the middle, or all over?",
    voiceText: "Where does it hurt? Upper right, upper left, lower right, lower left, or all over?",
    clinicalLabel: "painLocation",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Map to RUQ/LUQ/RLQ/LLQ/epigastric/suprapubic/diffuse",
  },
  {
    id: "ABD002",
    patientText: "Is the pain there all the time, or does it come and go?",
    voiceText: "Is it constant or does it come and go?",
    clinicalLabel: "constant",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Constant = higher urgency. Intermittent = may allow outpatient workup.",
    followUpIf: [{
      answerPattern: /come.and.go|intermittent|comes.and.goes/i,
      followUpId: "ABD002b",
    }],
  },
  {
    id: "ABD002b",
    patientText: "When the pain comes, how long does it last each time — seconds, minutes, or hours?",
    voiceText: "When it comes on, how long does each episode last?",
    clinicalLabel: "episodeDuration",
    appliesTo: ["abdominal"],
    priority: "conditional",
    condition: (s) => s.constant === false,
    extractionHint: "Short episodes = colic (stone, gallbladder). Longer = inflammatory.",
  },
  {
    id: "ABD003",
    patientText: "How would you describe the feeling — is it more of a sharp stabbing, a dull ache, a cramping or squeezing, or a burning sensation?",
    voiceText: "Is the pain sharp, dull, crampy, or burning?",
    clinicalLabel: "painQuality",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Sharp=surgical/stone, crampy=colic/gastro, burning=gastritis/GERD, dull=visceral",
  },
  {
    id: "ABD004",
    patientText: "Does the pain go anywhere else — like to your back, shoulder, groin, or down into your leg?",
    voiceText: "Does it spread anywhere — back, shoulder, or groin?",
    clinicalLabel: "radiation",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Back=pancreatitis/AAA/pyelo, shoulder=diaphragm irritation, groin=stone",
  },
  {
    id: "ABD005",
    patientText: "Do you have any nausea, vomiting, or diarrhea?",
    voiceText: "Any nausea, vomiting, or diarrhea?",
    clinicalLabel: "associatedGI",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Extract each separately. Vomiting unable to keep fluids = higher urgency.",
    followUpIf: [
      { answerPattern: /vomit|throwing up|sick/i, followUpId: "ABD005b" },
      { answerPattern: /diarrhea|loose|watery/i, followUpId: "ABD005c" },
    ],
  },
  {
    id: "ABD005b",
    patientText: "When you vomit, are you able to keep any fluids down — like water or clear juice?",
    voiceText: "Can you keep fluids down at all?",
    clinicalLabel: "canKeepFluidDown",
    appliesTo: ["abdominal"],
    priority: "conditional",
    extractionHint: "Cannot keep fluids = IV hydration candidate, higher urgency",
  },
  {
    id: "ABD005c",
    patientText: "How many times have you had diarrhea today, and is there any blood or very dark material in it?",
    voiceText: "How many times today, and any blood in it?",
    clinicalLabel: "diarrheaDetail",
    appliesTo: ["abdominal"],
    priority: "conditional",
    extractionHint: "Blood = GI bleed flag. >5x/day = dehydration risk.",
  },
  {
    id: "ABD006",
    patientText: "Have you had a fever — felt hot or been told your temperature was up?",
    voiceText: "Have you had a fever?",
    clinicalLabel: "fever",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Fever + abdominal pain = infectious or surgical cause more likely",
  },
  {
    id: "ABD007",
    patientText: "Any pain or burning when you urinate, or do you feel like you need to go much more often than usual?",
    voiceText: "Any pain or burning when you pee, or going more often than usual?",
    clinicalLabel: "urinarySymptoms",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Dysuria+frequency = UTI/pyelo. No urinary symptoms makes renal cause less likely.",
  },
  {
    id: "ABD008",
    patientText: "When was your last bowel movement, and was it normal?",
    voiceText: "When did you last have a bowel movement?",
    clinicalLabel: "lastBowelMovement",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "No BM + no gas = obstruction concern. Last BM >3 days = constipation possible.",
  },
  {
    id: "ABD009",
    patientText: "Have you had any pain like this before? If so, what did you find out it was?",
    voiceText: "Have you had this type of pain before? What was it?",
    clinicalLabel: "priorSimilarPain",
    appliesTo: ["abdominal"],
    priority: "always",
    extractionHint: "Prior stone=stone likely, prior gallbladder=gallbladder likely, prior hernia=hernia",
  },
  // Self-exam: abdominal palpation guidance
  {
    id: "ABD_EXAM001",
    patientText: "I'd like you to gently press on your belly to help us understand what's happening. Start by pressing gently on the right side below your belly button. How does that feel — is it tender, or no different from anywhere else?",
    voiceText: "Can you gently press on the lower right side of your belly? Does that hurt?",
    clinicalLabel: "selfExamRLQ",
    appliesTo: ["abdominal"],
    priority: "enriching",
    selfExamGuidance: {
      instruction: "Press gently with two fingers on the lower right side of your belly, about halfway between your belly button and your hip bone.",
      voiceInstruction: "Use two fingers and press gently on the lower right of your belly — about halfway between your belly button and right hip.",
      whatToReport: "Rate the tenderness 0-10. Does pressing make it hurt more? Does RELEASING make it hurt MORE? (That would be important to report.)",
      physicianVerificationRequired: true,
      requiredFor: ["appendicitis", "ovarian_torsion", "hernia", "nephrolithiasis"],
    },
    extractionHint: "Patient self-report of RLQ tenderness. ALWAYS requires physician verification. Flag if severe.",
  },
];

// Headache-specific questions
export const HEADACHE_QUESTIONS: DialogueQuestion[] = [
  {
    id: "HA001",
    patientText: "Did this headache come on suddenly — like a thunderclap or explosion — or did it build up gradually?",
    voiceText: "Did it come on suddenly like an explosion, or build up slowly?",
    clinicalLabel: "onsetType",
    appliesTo: ["headache"],
    priority: "always",
    extractionHint: "SUDDEN MAXIMUM ONSET = thunderclap = SAH until proven. Flag immediately.",
  },
  {
    id: "HA002",
    patientText: "Is this the worst headache you have ever had in your life?",
    voiceText: "Is this the worst headache you've ever had?",
    clinicalLabel: "worstHeadacheOfLife",
    appliesTo: ["headache"],
    priority: "always",
    extractionHint: "YES = immediate ER flag. No exceptions.",
  },
  {
    id: "HA003",
    patientText: "Do you have any of these symptoms along with the headache: fever, stiff neck, rash, confusion, weakness in an arm or leg, or difficulty speaking?",
    voiceText: "Along with the headache, do you have fever, stiff neck, confusion, arm weakness, or trouble speaking?",
    clinicalLabel: "dangerSymptoms",
    appliesTo: ["headache"],
    priority: "always",
    extractionHint: "ANY YES = danger signal = ER. Extract each symptom separately.",
  },
  {
    id: "HA004",
    patientText: "Where is the headache — is it on one side, both sides, in the front, the back, or all over?",
    voiceText: "Where does your head hurt — one side, both sides, front, back?",
    clinicalLabel: "headacheLocation",
    appliesTo: ["headache"],
    priority: "always",
    extractionHint: "Unilateral=migraine. Bilateral=tension. Frontal=sinus/tension. Temporal (age>50)=GCA concern.",
  },
  {
    id: "HA005",
    patientText: "Is there anything that makes it better or worse — like light, noise, movement, lying down, or eating?",
    voiceText: "Does light, noise, or movement make it worse? Does lying down help or hurt?",
    clinicalLabel: "headacheModifiers",
    appliesTo: ["headache"],
    priority: "always",
    extractionHint: "Photophobia+phonophobia=migraine. Worse supine=ICP. Worse bending=sinus.",
  },
  {
    id: "HA006",
    patientText: "Do you have any nausea, or does light bother your eyes?",
    voiceText: "Any nausea or sensitivity to light?",
    clinicalLabel: "migraineAssociated",
    appliesTo: ["headache"],
    priority: "always",
    extractionHint: "Nausea+photophobia = migraine criteria",
  },
  // Age-gated: under 40
  {
    id: "HA007_young",
    patientText: "Do you hear a whooshing or pulsing sound in your ears, almost like your heartbeat?",
    voiceText: "Do you hear a pulsing or whooshing sound in your ears?",
    clinicalLabel: "pulsatileTinnitus",
    appliesTo: ["headache"],
    priority: "conditional",
    condition: (s) => (s.age ?? 99) < 40,
    extractionHint: "Pulsatile tinnitus in young patient = IIH screening question",
  },
  // Age-gated: over 50
  {
    id: "HA007_elder",
    patientText: "Does the pain go into the sides of your head, and does your jaw hurt or get tired when you chew?",
    voiceText: "Does the side of your head hurt, and does chewing make your jaw tired or painful?",
    clinicalLabel: "jawClaudicaton",
    appliesTo: ["headache"],
    priority: "conditional",
    condition: (s) => (s.age ?? 0) >= 50,
    extractionHint: "Jaw claudication in >50yo = GCA pathognomonic. IMMEDIATE referral.",
  },
  // Self-exam: neck stiffness
  {
    id: "HA_EXAM001",
    patientText: "I'd like you to try something. Gently try to bring your chin down toward your chest. Can you do that comfortably, or does it cause pain or feel very stiff?",
    voiceText: "Try to slowly bring your chin to your chest. Can you do it comfortably?",
    clinicalLabel: "neckFlexionTest",
    appliesTo: ["headache"],
    priority: "always",
    selfExamGuidance: {
      instruction: "Slowly try to bring your chin toward your chest. Stop if it hurts.",
      voiceInstruction: "Gently try to bring your chin down to your chest — does that feel normal or stiff?",
      whatToReport: "Can you touch chin to chest? Does it cause pain or stiffness trying?",
      physicianVerificationRequired: true,
      requiredFor: ["meningitis", "meningismus"],
    },
    extractionHint: "Cannot flex neck comfortably = possible meningismus = physician must verify immediately",
  },
];

// Chest pain questions
export const CHEST_PAIN_QUESTIONS: DialogueQuestion[] = [
  {
    id: "CP001",
    patientText: "Are you having any difficulty breathing right now?",
    voiceText: "Are you having trouble breathing right now?",
    clinicalLabel: "acuteDyspnea",
    appliesTo: ["chest_pain"],
    priority: "always",
    extractionHint: "Severe dyspnea = ambulance trigger. Flag immediately.",
  },
  {
    id: "CP002",
    patientText: "How would you describe the chest pain — is it more of a pressure or squeezing, sharp, burning, or tearing?",
    voiceText: "Is the chest pain more of a pressure, squeezing, sharp, burning, or tearing feeling?",
    clinicalLabel: "painQuality",
    appliesTo: ["chest_pain"],
    priority: "always",
    extractionHint: "Pressure/squeezing=ACS concern. Tearing=dissection. Sharp+positional=MSK/pleurisy.",
  },
  {
    id: "CP003",
    patientText: "Does the pain go anywhere — like your left arm, shoulder, jaw, neck, or back?",
    voiceText: "Does it spread to your arm, jaw, neck, or back?",
    clinicalLabel: "chestPainRadiation",
    appliesTo: ["chest_pain"],
    priority: "always",
    extractionHint: "Arm/jaw/neck=ACS. Back+tearing=dissection. No radiation=less specific.",
  },
  {
    id: "CP004",
    patientText: "Are you sweating more than usual — like breaking out in a cold sweat?",
    voiceText: "Are you sweating — like a cold sweat?",
    clinicalLabel: "diaphoresis",
    appliesTo: ["chest_pain"],
    priority: "always",
    extractionHint: "Diaphoresis with chest pain = AMBULANCE trigger. Flag immediately.",
  },
];

// ─── DIALOGUE ENGINE ──────────────────────────────────────────────────────

export class AdaptiveDialogueEngine {
  private openai: OpenAI;
  private encounterId: string;
  private channel: DialogueChannel;
  private turns: DialogueTurn[] = [];
  private answerLog: Map<string, AnswerLog> = new Map();
  private clinicalState: Partial<any> = {};
  private selfExamResults: SelfExamResult[] = [];
  private phase: DialoguePhase = "greeting";
  private questionsAsked: Set<string> = new Set();
  private safetyAlertsTriggered: string[] = [];

  constructor(encounterId: string, channel: DialogueChannel) {
    this.encounterId = encounterId;
    this.channel = channel;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // ── Generate next question ──────────────────────────────────────────────
  async generateNextMessage(patientInput: string): Promise<{
    message: string;
    phase: DialoguePhase;
    complete: boolean;
  }> {
    // Extract clinical data from patient's latest response
    await this.extractFromResponse(patientInput);

    // Check for immediate safety triggers
    const safetyTrigger = this.checkSafetyTriggers();
    if (safetyTrigger) {
      await this.logTurn("auralyn", safetyTrigger.message, "triage_screen");
      return {
        message: safetyTrigger.message,
        phase: "triage_screen",
        complete: true, // stop dialogue, alert physician immediately
      };
    }

    // Determine what to ask next
    const nextQuestion = this.selectNextQuestion();

    if (!nextQuestion) {
      // All high-priority questions answered — move to self-exam
      const selfExam = this.getNextSelfExamGuidance();
      if (selfExam) {
        const message = this.formatForChannel(selfExam.instruction, selfExam.voiceInstruction);
        await this.logTurn("auralyn", message, "self_exam_guidance");
        return { message, phase: "self_exam_guidance", complete: false };
      }

      // Complete
      this.phase = "complete";
      const closing = this.generateClosingMessage();
      await this.logTurn("auralyn", closing, "complete");
      return { message: closing, phase: "complete", complete: true };
    }

    const message = this.formatForChannel(nextQuestion.patientText, nextQuestion.voiceText);
    this.questionsAsked.add(nextQuestion.id);
    await this.logTurn("auralyn", message, this.phase, nextQuestion.id);
    return { message, phase: this.phase, complete: false };
  }

  // ── Extract clinical data from a patient response ─────────────────────
  private async extractFromResponse(patientInput: string): Promise<void> {
    const guardedInput = applyPHIGuard(patientInput);

    const lastQuestion = Array.from(this.questionsAsked).pop();
    const contextPrompt = `
You are a clinical data extractor. A patient has just responded to a medical intake question.

Last question asked: ${lastQuestion ?? "initial greeting"}
Patient response: "${guardedInput}"
Current known clinical state: ${JSON.stringify(this.clinicalState, null, 2)}

Extract ALL clinically relevant information from this response.
Return ONLY a JSON object of extracted fields. No preamble.
Be conservative — only extract what is clearly stated.
Flag anything ambiguous with a confidence score < 0.7.

Format:
{
  "extracted": { "fieldName": value, ... },
  "confidence": { "fieldName": 0-1, ... },
  "flags": ["any concerning statements or ambiguities"],
  "changedAnswers": { "fieldName": "previous was X, now says Y" }
}
`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 500,
      messages: [
        { role: "system", content: "You extract clinical data. Return only JSON." },
        { role: "user", content: guardedInput + "\n\n" + contextPrompt },
      ],
    });

    try {
      const content = response.choices[0]?.message?.content ?? "{}";
      const clean = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Merge extracted data, detecting changes
      for (const [field, value] of Object.entries(parsed.extracted ?? {})) {
        const previous = this.clinicalState[field];
        if (previous !== undefined && previous !== value) {
          // Answer changed — log it
          const existing = this.answerLog.get(field);
          if (!existing) {
            this.answerLog.set(field, {
              questionId: lastQuestion ?? "unknown",
              question: lastQuestion ?? "unknown",
              firstAnswer: String(previous),
              firstAnswerTime: new Date().toISOString(),
              currentAnswer: String(value),
              currentAnswerTime: new Date().toISOString(),
              answerChanged: true,
              changeSignificant: this.isChangeSignificant(field, previous, value),
              changeNote: `Initially reported "${previous}", now reporting "${value}"`,
            });
          } else {
            existing.currentAnswer = String(value);
            existing.currentAnswerTime = new Date().toISOString();
          }
        }
        this.clinicalState[field] = value;
      }

      // Log safety flags
      for (const flag of parsed.flags ?? []) {
        if (this.isSafetyFlag(flag)) {
          this.safetyAlertsTriggered.push(flag);
        }
      }
    } catch {
      console.error("[DialogueEngine] Extraction parse failed");
    }
  }

  // ── Immediate safety trigger check ─────────────────────────────────────
  private checkSafetyTriggers(): { message: string; alertType: string } | null {
    const s = this.clinicalState;

    // Thunderclap headache
    if (s.worstHeadacheOfLife === true || s.onsetType === "thunderclap") {
      return {
        alertType: "thunderclap_headache",
        message: "I need to pause here. The way you described your headache coming on suddenly and being the worst you've ever had is something we take very seriously. Please let a staff member know immediately, or if you are alone, please call 911. I'm alerting our medical team right now.",
      };
    }

    // Cannot breathe
    if (s.severeDyspnea === true || s.cannotSpeak === true) {
      return {
        alertType: "respiratory_emergency",
        message: "If you are having serious trouble breathing right now, please call 911 or tell someone near you immediately. Do not continue this questionnaire — get help now.",
      };
    }

    // Diaphoresis with chest pain
    if (s.chestPain === true && s.diaphoresis === true) {
      return {
        alertType: "acs_concern",
        message: "Please stop filling out this form and tell a staff member right away that you have chest pain with sweating. This needs to be seen immediately.",
      };
    }

    // Altered mental status (if somehow still completing intake)
    if (s.confusion === true) {
      return {
        alertType: "altered_mental_status",
        message: "Please have someone help you right now and alert our staff immediately.",
      };
    }

    return null;
  }

  // ── Select next question ────────────────────────────────────────────────
  private selectNextQuestion(): DialogueQuestion | null {
    const complaint = this.clinicalState.chiefComplaint ?? "";
    const pack = this.getComplaintPack(complaint);

    // Get all applicable questions
    const allQuestions = [
      ...UNIVERSAL_QUESTIONS,
      ...(pack === "abdominal" ? ABDOMINAL_QUESTIONS : []),
      ...(pack === "headache" ? HEADACHE_QUESTIONS : []),
      ...(pack === "chest_pain" ? CHEST_PAIN_QUESTIONS : []),
    ];

    // Filter: not asked, condition met, appropriate priority
    for (const q of allQuestions) {
      if (this.questionsAsked.has(q.id)) continue;
      if (q.selfExamGuidance) continue; // handled separately
      if (q.priority === "conditional" && q.condition) {
        if (!q.condition(this.clinicalState)) continue;
      }
      if (q.priority === "enriching" && !this.shouldAskEnriching()) continue;
      return q;
    }

    // Check follow-up questions triggered by prior answers
    for (const q of allQuestions) {
      if (!this.questionsAsked.has(q.id)) continue;
      if (!q.followUpIf) continue;
      for (const followUp of q.followUpIf) {
        const answer = String(this.clinicalState[q.clinicalLabel] ?? "");
        const pattern = typeof followUp.answerPattern === "string"
          ? new RegExp(followUp.answerPattern, "i")
          : followUp.answerPattern;
        if (pattern.test(answer)) {
          const followUpQ = allQuestions.find(fq => fq.id === followUp.followUpId);
          if (followUpQ && !this.questionsAsked.has(followUpQ.id)) {
            return followUpQ;
          }
        }
      }
    }

    return null;
  }

  // ── Self-exam guidance ──────────────────────────────────────────────────
  private getNextSelfExamGuidance(): SelfExamGuidance | null {
    const complaint = this.clinicalState.chiefComplaint ?? "";
    const pack = this.getComplaintPack(complaint);

    const allQuestions = [
      ...(pack === "abdominal" ? ABDOMINAL_QUESTIONS : []),
      ...(pack === "headache" ? HEADACHE_QUESTIONS : []),
    ];

    for (const q of allQuestions) {
      if (!q.selfExamGuidance) continue;
      if (this.questionsAsked.has(q.id + "_EXAM_DONE")) continue;
      this.questionsAsked.add(q.id + "_EXAM_DONE");
      return q.selfExamGuidance;
    }

    return null;
  }

  // ── Format message for channel ─────────────────────────────────────────
  private formatForChannel(textVersion: string, voiceVersion?: string): string {
    if (this.channel === "voice_phone" || this.channel === "voice_room") {
      return voiceVersion ?? textVersion;
    }
    if (this.channel === "sms") {
      // Shorter for SMS
      return textVersion.length > 160
        ? textVersion.substring(0, 157) + "..."
        : textVersion;
    }
    return textVersion;
  }

  private generateClosingMessage(): string {
    return "Thank you — that's very helpful. Dr. Thomas will be with you shortly. They've already seen your answers and can get started right away. Is there anything else important you'd like them to know?";
  }

  private getComplaintPack(complaint: string): string {
    const c = complaint.toLowerCase();
    if (c.includes("stomach") || c.includes("belly") || c.includes("abdomen")) return "abdominal";
    if (c.includes("head") || c.includes("migraine")) return "headache";
    if (c.includes("chest") || c.includes("heart")) return "chest_pain";
    if (c.includes("throat") || c.includes("cough") || c.includes("cold")) return "uri";
    if (c.includes("urin") || c.includes("pee") || c.includes("burn")) return "gu";
    return "general";
  }

  private shouldAskEnriching(): boolean {
    // Only ask enriching questions if we have time (not in ER situation)
    return this.safetyAlertsTriggered.length === 0 &&
      (this.clinicalState.painScore ?? 0) < 8;
  }

  private isChangeSignificant(field: string, previous: any, current: any): boolean {
    // Clinically significant fields where answer changes matter most
    const significantFields = [
      "fever", "dyspnea", "chestPain", "syncope", "worstHeadacheOfLife",
      "diaphoresis", "bloodInStool", "pregnancyStatus", "painScore",
    ];
    return significantFields.includes(field);
  }

  private isSafetyFlag(flag: string): boolean {
    const safetyKeywords = [
      "worst headache", "thunderclap", "cannot breathe", "chest pain sweating",
      "confusion", "weakness", "stroke", "syncope", "blood vomit",
    ];
    return safetyKeywords.some(k => flag.toLowerCase().includes(k));
  }

  private async logTurn(
    speaker: "auralyn" | "patient",
    text: string,
    phase: DialoguePhase,
    questionId?: string
  ): Promise<void> {
    const turn: DialogueTurn = {
      turnId: `${this.encounterId}-${this.turns.length}`,
      timestamp: new Date().toISOString(),
      speaker,
      text,
      phase,
      questionId: questionId ?? null,
      extractedData: {},
      confidenceScore: 1.0,
      flagged: false,
      flagReason: null,
    };
    this.turns.push(turn);
  }

  // ── Generate physician briefing card ───────────────────────────────────
  generateBriefingCard(): PhysicianBriefingCard {
    const s = this.clinicalState;
    const complaint = s.chiefComplaint ?? "unspecified complaint";
    const age = s.age ? `${s.age}yo` : "age unknown";
    const sex = s.genderIdentity ?? "patient";

    // One-liner
    const oneLiner = `${age} ${sex} with ${complaint}` +
      (s.symptomDuration ? `, ${s.symptomDuration} days` : "") +
      (s.painScore ? `, pain ${s.painScore}/10` : "") +
      (this.safetyAlertsTriggered.length > 0
        ? ` — SAFETY ALERTS: ${this.safetyAlertsTriggered.join(", ")}`
        : ", no danger signals triggered");

    // Physical exam gaps — what only you can assess
    const criticalGaps: string[] = [
      "Patient appearance — does this person look unwell, in distress, or toxic?",
      "Work of breathing — retractions, nasal flaring, accessory muscle use, speaking in full sentences?",
      "Skin color — pallor, jaundice, cyanosis, diaphoresis, rash?",
    ];

    // Complaint-specific exam gaps
    const pack = this.getComplaintPack(complaint);
    if (pack === "abdominal") {
      criticalGaps.push("Abdominal palpation — TTP, guarding, rebound (patient self-exam is a guide only)");
      criticalGaps.push("Bowel sounds — auscultate before palpating");
      if (s.age < 40 || s.genderIdentity === "male") {
        criticalGaps.push("Inguinal region — hernia assessment");
      }
      if ((s.age ?? 99) < 35 && (s.hasTestes || s.genderIdentity === "male")) {
        criticalGaps.push("Scrotal exam — testicular torsion must be excluded");
      }
    }
    if (pack === "headache") {
      criticalGaps.push("Neck flexion — formal meningismus assessment (patient self-test is insufficient)");
      criticalGaps.push("Neurological screen — pupils, speech, grip strength, gait");
      if ((s.age ?? 0) >= 50) {
        criticalGaps.push("Temporal arteries — palpate for tenderness and pulsation (GCA screen)");
      }
    }
    if (pack === "uri") {
      criticalGaps.push("Throat and tonsils — exudate, uvula position, posterior pharynx");
      criticalGaps.push("Ears — tympanic membranes");
      criticalGaps.push("Lung auscultation — particularly if cough or dyspnea");
    }
    if (pack === "chest_pain") {
      criticalGaps.push("EKG — obtain before physician enters room if possible");
      criticalGaps.push("Chest wall reproducibility — palpate for TTP");
      criticalGaps.push("Lung auscultation — equality of breath sounds");
    }

    // Story flags
    const storyFlags: string[] = [];
    for (const [field, log] of this.answerLog.entries()) {
      if (log.answerChanged) {
        storyFlags.push(
          `${field}: ${log.changeNote}` +
          (log.changeSignificant ? " [CLINICALLY SIGNIFICANT]" : "")
        );
      }
    }

    // Self-exam findings
    const selfExamFindings = this.selfExamResults.map(r =>
      `${r.examType}: "${r.patientReport}" — ${r.clinicalInterpretation} (${r.confidence} confidence — physician verification ${r.physicianVerificationRequired ? "REQUIRED" : "optional"})`
    );

    // Medication flags
    const medicationFlags: string[] = [];
    const meds = (s.currentMedications ?? []) as string[];
    if (meds.some((m: string) => /ozempic|semaglutide|glp/i.test(m))) {
      medicationFlags.push("GLP-1 agonist → add pancreatitis to differential, gastroparesis possible");
    }
    if (meds.some((m: string) => /xarelto|eliquis|warfarin|anticoagul/i.test(m))) {
      medicationFlags.push("Anticoagulant → lower CT threshold, bleeding risk");
    }
    if (meds.some((m: string) => /prednisone|steroid|methylpred/i.test(m))) {
      medicationFlags.push("Steroid use → masks peritoneal signs and fever, lower ER threshold");
    }
    if (meds.some((m: string) => /oxybutynin|anticholinerg/i.test(m))) {
      medicationFlags.push("Anticholinergic → urinary retention and ileus on differential");
    }

    // Suggested first words walking in
    const suggestedFirstWords = this.generateSuggestedOpener(s, storyFlags);

    // Urgency signal
    const urgencySignal = this.safetyAlertsTriggered.length > 0 ? "immediate" :
      (s.painScore ?? 0) >= 8 ? "expedite" :
      (s.painScore ?? 0) >= 5 ? "watch" : "routine";

    return {
      oneLiner,
      urgencySignal,
      preliminaryDisposition: this.getPreliminaryDisposition(s),
      topDifferential: this.getTopDifferential(s, pack),
      criticalGaps,
      importantGaps: [
        "Confirm vital signs — patient-reported vitals are approximate",
        "Verify medication list — patients often forget medications",
      ],
      storyFlags,
      selfExamFindings,
      medicationFlags,
      suggestedFirstWords,
    };
  }

  private generateSuggestedOpener(s: any, storyFlags: string[]): string {
    const complaint = s.chiefComplaint ?? "your symptoms";
    const duration = s.symptomDuration ? ` for ${s.symptomDuration} days` : "";
    const flag = storyFlags.length > 0
      ? ` I noticed your answers about ${storyFlags[0].split(":")[0]} changed — I'll want to clarify that.`
      : "";
    return `I've already seen your answers — I know you've been having ${complaint}${duration}. Let me take a quick look and ask you a few more things.${flag}`;
  }

  private getPreliminaryDisposition(s: any): string {
    if (this.safetyAlertsTriggered.length > 0) return "IMMEDIATE — safety alert triggered";
    if ((s.painScore ?? 0) >= 8 && s.constant) return "ER likely — severity and constancy";
    if ((s.age ?? 0) >= 65 && (s.painScore ?? 0) >= 5) return "ER probable — age + pain level";
    return "Pending physician assessment";
  }

  private getTopDifferential(s: any, pack: string): string[] {
    if (pack === "abdominal") {
      const diff = [];
      if (s.painLocation === "RLQ") diff.push("Appendicitis", "Nephrolithiasis", "Ovarian torsion (if female)");
      if (s.painLocation === "epigastric") diff.push("Gastritis/PUD", "Pancreatitis", "MI (if cardiac risk)");
      if (s.painLocation === "RUQ") diff.push("Cholecystitis", "Hepatitis", "Right lower lobe PNA");
      return diff.slice(0, 3);
    }
    if (pack === "headache") {
      return ["Migraine", "Tension headache", "Sinus headache"];
    }
    if (pack === "chest_pain") {
      return ["ACS", "Musculoskeletal", "GERD"];
    }
    return ["Pending full assessment"];
  }

  // ── Public getters ──────────────────────────────────────────────────────
  getClinicalState(): Partial<any> { return this.clinicalState; }
  getTurns(): DialogueTurn[] { return this.turns; }
  getAnswerLog(): AnswerLog[] { return Array.from(this.answerLog.values()); }
  getSafetyAlerts(): string[] { return this.safetyAlertsTriggered; }
  isComplete(): boolean { return this.phase === "complete"; }
}

/**
 * EXAMPLE BRIEFING CARD — for Dr. Thomas's abdominal pain patient:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AURALYN PRE-ENCOUNTER BRIEFING                              │
 * │ [EXPEDITE]                                                  │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Adult with stomach pain x2 days, pain 8/10, constant        │
 * │ No danger signals triggered in dialogue                     │
 * ├─────────────────────────────────────────────────────────────┤
 * │ PRELIMINARY DISPOSITION: ER likely (severity + constancy)   │
 * │ TOP DIFFERENTIAL: Appendicitis · Nephrolithiasis · Hernia   │
 * ├─────────────────────────────────────────────────────────────┤
 * │ CRITICAL GAPS — close before disposition:                   │
 * │ • Does this patient look unwell / in distress?              │
 * │ • Abdominal palpation — TTP, guarding, rebound              │
 * │ • Scrotal exam (male) — torsion excluded?                   │
 * ├─────────────────────────────────────────────────────────────┤
 * │ STORY FLAGS:                                                │
 * │ • fever: initially said "no fever" then said "maybe a        │
 * │   little warm last night" [verify]                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ MEDICATION FLAGS:                                           │
 * │ • Ozempic → pancreatitis on differential, get lipase        │
 * │ • Oxybutynin → retention/ileus possible                     │
 * ├─────────────────────────────────────────────────────────────┤
 * │ SUGGESTED OPENER:                                           │
 * │ "I've seen your answers — I know your stomach has been      │
 * │ hurting for 2 days and it's pretty bad. Let me take a look  │
 * │ and ask you a few more things."                             │
 * └─────────────────────────────────────────────────────────────┘
 */

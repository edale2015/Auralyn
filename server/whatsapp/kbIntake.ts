import { sendWhatsAppMessage, markNewConversation } from "./send";
import {
  createCase,
  appendMessage,
  mergeAnswers,
  setTriage,
  setCaseState,
} from "../services/caseService";
import { matchComplaintFromText, listEnabledComplaints } from "../services/complaintMatchService";
import type { QRow } from "../services/questionFlowService";
import {
  extractAndRespond,
  generateClosingMessage,
  mapFieldsToQIds,
  isComplete,
  keywordExtract,
} from "./conversationalEngine";
import {
  getNextQuestion,
  getNextGapQuestion,
  MIN_QUESTIONS_BEFORE_DISPOSITION,
} from "../conversation/questionSequences";
import { getComplaintBundle, type ComplaintBundle } from "./complaintBundle";
import {
  startIntake as startChestPainIntake,
  advanceIntake as advanceChestPainIntake,
  type IntakeState,
} from "./chestPainIntake";
import { addPhysicianCase } from "../physician/physicianController";
import { hasSystemPrompt } from "./agent/prompts/registry";
import {
  startAgentSession,
  nextReply as agentNextReply,
  type AgentSession,
} from "./agent/streamingAgent";
import {
  buildPhysicianPacket,
  formatPhysicianPacket,
  sendPhysicianPacket,
  handlePhysicianReply,
  isPhysicianNumber,
} from "./agent/physicianPacket";
import {
  matchesEmergencyBypass,
  triggerEmergencyProtocol,
  EMERGENCY_BYPASS_PATIENT_MESSAGE,
} from "../emergency/emergencyProtocol";
import { runOrchestratorTriage } from "../services/orchestratorTriageAdapter";
import { executePipeline, type PipelineResult } from "../clinical/ruleExecutionEngine";
import {
  logInteraction,
  startSession,
  incrementMessageCount,
  endSession,
  recordCsat,
  recordNps,
} from "../services/interactionAuditService";
import { analyzeMood, buildTonePrefix } from "../services/moodToneService";
import {
  setSurveyState,
  getSurveyState,
  clearSurveyState,
} from "../services/surveyStateService";
import { sha256Hex } from "../services/hash";

// ── Slug → router-code reverse map (for scripted question sequences) ──────────
// `questionSequences.ts` uses short routerCodes ("headache", "cough", …).
// `kbIntake` has the full engine slugs from COMPLAINT_REGISTRY.csv.
// This map converts every known CC_ID → routerCode so gap-skipping works.
// Unmapped slugs fall back to their raw value; SEQUENCES falls back to
// DEFAULT_QUESTIONS, which are all null-hinted (never skipped).
const SLUG_TO_ROUTER: Record<string, string> = {
  // ── Headache / Neuro ──────────────────────────────────────────────────────
  neuro_headache:              "headache",
  ortho_trauma_head_injury:    "headache",
  neuro_confusion_ams:         "headache",
  neuro_seizure:               "headache",
  neuro_weakness_numbness:     "headache",

  // ── Nausea / Vomiting ─────────────────────────────────────────────────────
  nausea:                      "nausea_vomiting",
  gi_vomiting:                 "nausea_vomiting",
  general_nausea_malaise:      "nausea_vomiting",

  // ── Abdominal Pain ────────────────────────────────────────────────────────
  abdominal_pain:              "abdominal_pain",
  gi_abdominal_pain:           "abdominal_pain",
  gi_diarrhea:                 "abdominal_pain",
  gi_constipation:             "abdominal_pain",
  gi_gi_bleeding:              "abdominal_pain",
  gi_jaundice:                 "abdominal_pain",
  gi_acute_pancreatitis_like:  "abdominal_pain",
  gu_pelvic_pain_possible_ovarian_torsion: "abdominal_pain",
  gu_testicular_pain:          "abdominal_pain",
  gu_testicular_pain_prostatitis: "abdominal_pain",
  gu_vaginal_bleeding:         "abdominal_pain",
  gyn_pelvic_pain:             "abdominal_pain",
  tox_overdose_intoxication:   "abdominal_pain",
  tox_poisoning_exposure:      "abdominal_pain",
  tox_withdrawal:              "abdominal_pain",
  cardio_leg_swelling:         "abdominal_pain",

  // ── Chest Pain ────────────────────────────────────────────────────────────
  chest_pain:                  "chest_pain",
  cardio_chest_pain:           "chest_pain",

  // ── Shortness of Breath ───────────────────────────────────────────────────
  pulm_shortness_of_breath:    "shortness_of_breath",
  pulm_chest_tightness:        "shortness_of_breath",
  pulm_wheezing:               "shortness_of_breath",

  // ── Sore Throat / Dysphagia ───────────────────────────────────────────────
  sore_throat:                 "sore_throat",
  ent_sore_throat:             "sore_throat",
  gi_dysphagia:                "sore_throat",
  dental_pain:                 "sore_throat",

  // ── Cough ─────────────────────────────────────────────────────────────────
  cough:                       "cough",
  persistent_cough:            "cough",
  pulm_cough:                  "cough",
  pulm_hemoptysis:             "cough",

  // ── UTI / Urinary ─────────────────────────────────────────────────────────
  gu_uti_symptoms:             "uti",
  gu_dysuria_uti:              "uti",
  gu_flank_pain:               "uti",
  gu_hematuria:                "uti",
  gu_sti_exposure_discharge:   "uti",
  gu_urinary_retention:        "uti",

  // ── Sinus / URI ───────────────────────────────────────────────────────────
  ent_sinus_pressure:          "uri_sinus",
  sinus_pressure:              "uri_sinus",
  ent_nasal_congestion:        "uri_sinus",
  allergic_rhinitis:           "uri_sinus",

  // ── Back Pain / MSK ───────────────────────────────────────────────────────
  msk_back_pain:               "back_pain",
  msk_joint_pain:              "back_pain",
  msk_sprain_injury:           "back_pain",

  // ── Fever / Systemic ──────────────────────────────────────────────────────
  id_fever:                    "fever",
  id_flu_like:                 "fever",
  general_fatigue:             "fever",
  general_generalized_weakness: "fever",
  environmental_heat_illness:  "fever",
  environmental_hypothermia_cold_exposure: "fever",
  endo_hyperglycemia:          "fever",
  endo_thyroid_symptoms:       "fever",

  // ── Rash / Derm ───────────────────────────────────────────────────────────
  derm_rash:                   "rash",
  derm_allergic_reaction:      "rash",
  derm_cellulitis:             "rash",

  // ── Dizziness ─────────────────────────────────────────────────────────────
  dizziness:                   "dizziness",
  neuro_dizziness_vertigo:     "dizziness",
  neuro_syncope:               "dizziness",
  endo_hypoglycemia:           "dizziness",

  // ── Ear Pain ──────────────────────────────────────────────────────────────
  earache:                     "ear_pain",
  ent_ear_pain:                "ear_pain",
  ent_earache:                 "ear_pain",

  // ── Eye Complaints ────────────────────────────────────────────────────────
  ophtho_eye_pain_foreign_body: "eye_complaint",
  ophtho_red_eye:              "eye_complaint",
  ophtho_vision_loss:          "eye_complaint",

  // ── Anxiety / Psych ───────────────────────────────────────────────────────
  psych_anxiety_panic:         "anxiety",
  psych_agitation_psychosis:   "anxiety",
  psych_depression_suicidal_ideation: "anxiety",
  insomnia:                    "anxiety",

  // ── Laceration / Trauma ───────────────────────────────────────────────────
  ortho_trauma_laceration:     "laceration",
  ortho_trauma_fracture_dislocation: "laceration",
  id_animal_bite_wound_infection: "laceration",

  // ── Palpitations ─────────────────────────────────────────────────────────
  cardio_palpitations:         "palpitations",
};

function slugToRouter(slug: string): string {
  return SLUG_TO_ROUTER[slug] ?? slug;
}

// ── Listen-first acknowledgment builder (T018) ───────────────────────────────
// Builds a short ack sentence from keyword-extracted fields so Auralyn can
// confirm what it heard BEFORE asking the next scripted question.  No LLM.
const FIELD_POS_LABEL: Record<string, string> = {
  nausea:    "nausea",
  vomiting:  "vomiting",
  fever:     "fever",
  chills:    "chills",
  dyspnea:   "trouble breathing",
  myalgia:   "body aches",
  fatigue:   "fatigue",
  rhinorrhea: "congestion",
  diaphoresis: "sweating",
  stiff_neck: "neck stiffness",
  thunderclap: "sudden severe headache",
};
const FIELD_NEG_LABEL: Record<string, string> = {
  fever:  "no fever",
  dyspnea: "no trouble breathing",
};

function buildListenAck(extracted: Record<string, any>): string {
  const parts: string[] = [];
  if (extracted.duration) parts.push(String(extracted.duration));
  if (typeof extracted.severity === "number") parts.push(`pain ${extracted.severity}/10`);
  for (const [k, v] of Object.entries(extracted)) {
    if (k === "duration" || k === "severity" || k === "age") continue;
    if ((v === "yes" || v === true) && FIELD_POS_LABEL[k]) parts.push(FIELD_POS_LABEL[k]);
    if ((v === "no" || v === false) && FIELD_NEG_LABEL[k]) parts.push(FIELD_NEG_LABEL[k]);
  }
  if (parts.length === 0) return "";
  return `Got it — I noted ${parts.join(", ")}. `;
}

// ── In-memory hot session store ────────────────────────────────────────────────
// Eliminates ~38s of Firestore round-trips from the patient-facing hot path.
// Firestore writes are fire-and-forget background persistence — patient reply
// is never gated on them.  On server restart, the Firestore fallback in
// getActiveCaseId restores any in-progress sessions automatically.
interface HotSession {
  caseId:          string;
  complaint:       { slug: string; display: string };
  answers:         Record<string, any>;         // Q_ID → value (safety pipeline)
  extractedFields: Record<string, any>;         // semantic goal fields
  exchanges:       Array<{ role: string; text: string }>;  // last N turns
  state:           string;
  createdAt:       number;
  // The safety field the LAST assistant response asked about. The next patient
  // message can only set THAT safety field — nothing else. Null on the very
  // first turn (no safety question has been posed yet).
  pendingSafetyAsk?: string | null;
  // Streaming-agent session. Present when the matched complaint slug has a
  // registered system prompt; every patient message is forwarded to Claude
  // Sonnet with the system prompt + full history (ONE LLM call per turn, no
  // per-turn database calls). Null on slugs without a system prompt, which
  // fall back to the legacy extract-and-respond path until they get one.
  agent?:          AgentSession | null;
  // Precomputed complaint bundle (goals, prompt fragments, fallback question
  // library). Resolved once on session start via getComplaintBundle(slug);
  // passed through to extractAndRespond so it skips the per-turn lookup.
  // Streaming-agent (Claude) sessions also get a bundle for API symmetry,
  // but the agent path never consults it.
  bundle?:         ComplaintBundle;
  // F017: index of the next scripted question to send (0-based).
  // Incremented after each scripted-phase turn. When questionIndex reaches
  // MIN_QUESTIONS_BEFORE_DISPOSITION - 1, the engine switches to GPT extraction.
  questionIndex?:  number;
  // True once an engine-detected red flag has fired the physician alert + pushed
  // this case to the top of the review queue. The patient interview continues
  // after a red flag (the physician owns the disposition), so the rule engine
  // re-flags on every later turn — this guard keeps the alert/queue placement
  // idempotent (fires exactly once per session).
  redFlagFlagged?: boolean;
  // Deterministic chest-pain intake state (scope: intake questions only). When
  // present, the conversation is driven by the fixed six-section intake script
  // in chestPainIntake.ts — no LLM, no rule-engine disposition. Null/absent on
  // every other pathway, which keeps the legacy flow unchanged.
  intake?: IntakeState;
}

const hotSessions = new Map<string, HotSession>();

function hotKey(threadId: string): string {
  return `whatsapp:${threadId}`;
}

function hotGet(threadId: string): HotSession | null {
  return hotSessions.get(hotKey(threadId)) ?? null;
}

function hotSet(threadId: string, session: HotSession): void {
  hotSessions.set(hotKey(threadId), session);
}

function hotDel(threadId: string): void {
  hotSessions.delete(hotKey(threadId));
}

// Read-only accessor for verification/repro harnesses. No production callers.
export function __peekHotSession(threadId: string): HotSession | null {
  return hotGet(threadId);
}

// Last full pipeline result produced on the red-flag escalation path. Populated
// by doEscalation() so verification harnesses can confirm an escalated case still
// completed all pipeline stages with a populated differential. No production
// callers — read-only test hook.
let __lastEscalationPipeline: PipelineResult | null = null;
export function __peekLastEscalation(): PipelineResult | null {
  return __lastEscalationPipeline;
}

// Firestore fallback — used only on first message after server restart
async function firestoreLookup(threadId: string): Promise<HotSession | null> {
  try {
    const { getActiveCaseId } = await import("../services/channelThreadService");
    const caseId = await (getActiveCaseId as any)({ channel: "whatsapp", threadId });
    if (!caseId) return null;
    const { getCase } = await import("../services/caseService");
    const doc = await getCase(caseId);
    if (!doc || doc.state === "CLOSED" || doc.state === "TRIAGED") return null;
    const session: HotSession = {
      caseId,
      complaint: { slug: doc.complaint.slug, display: doc.complaint.display },
      answers:   (doc.answers?.structured ?? {}) as Record<string, any>,
      state:     doc.state,
      createdAt: Date.now(),
    };
    hotSet(threadId, session);        // warm the cache for future messages
    return session;
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapMasterDisposition(disp: string | null): string | null {
  if (!disp) return null;
  const d = disp.toUpperCase().trim();
  // ── ER / Emergency (F005 fix: cover all emergency variant names) ──────────
  if (["ER_NOW","ED_NOW","CALL_911","911","ER","ED",
       "AMBULANCE","AMBULANCE_NOW","EMERGENCY","EMERGENT",
       "GO_TO_ER","GO_TO_ED","911_NOW"].includes(d))       return "er_send";
  // ── Urgent Care ───────────────────────────────────────────────────────────
  if (["URGENT_CARE","UC","URGENT","SAME_DAY"].includes(d)) return "urgent_care";
  // ── PCP / Routine ─────────────────────────────────────────────────────────
  if (["PCP","ROUTINE","ROUTINE_CARE","PRIMARY_CARE",
       "SEE_DOCTOR","SCHEDULE","FOLLOW_UP"].includes(d))    return "pcp";
  // ── Self-Care / Telehealth ────────────────────────────────────────────────
  if (["HOME_CARE","SELF_CARE","TELEHEALTH","HOME",
       "WATCHFUL_WAITING","MONITOR","OTC"].includes(d))     return "self_care";
  return null;
}

function formatTriageResult(triage: any, masterResult?: PipelineResult | null): string {
  const emoji: Record<string, string> = {
    er_send: "🔴", urgent_care: "🟠", pcp: "🟡", self_care: "🟢",
  };
  const label: Record<string, string> = {
    er_send: "Emergency — Go to ER immediately",
    urgent_care: "Go to Urgent Care today",
    pcp: "See Your Doctor this week",
    self_care: "Self-Care at Home",
  };
  const e = emoji[triage.disposition] ?? "🔵";
  const l = label[triage.disposition] ?? triage.disposition;

  const lines = [
    `✅ *Assessment complete*`, ``,
    `${e} *${l}*`,
    `📋 Top finding: ${triage.topCluster ?? "—"}`,
    `📊 Confidence: ${triage.confidence}`,
  ];

  if (masterResult?.hardStop && masterResult.hardStopReason) {
    const flagName = masterResult.hardStopReason.split(":")[0].trim();
    lines.push(``, `🚨 *Critical alert: ${flagName}*`, `_Seek emergency care immediately._`);
  } else if ((triage.rfTriggered?.length ?? 0) > 0) {
    lines.push(``, `⚠️ *Red flag(s) noted — seek care promptly.*`);
  }

  if (masterResult && masterResult.totalRulesFired > 0) {
    const rfCount = masterResult.criticalFlagsHit?.length ?? 0;
    lines.push(``, `🧠 *${masterResult.totalRulesFired} clinical rules evaluated*${rfCount > 0 ? ` · ${rfCount} critical flag(s)` : ""}`);
  }

  lines.push(``, `_AI-assisted decision support only. Not a substitute for physician evaluation._`);
  return lines.join("\n");
}

// ── Safety escalation ──────────────────────────────────────────────────────────
// Sent and session closed the moment ANY answer triggers a critical disposition.
const EMERGENCY_MESSAGE =
  `🚨 *Based on your symptoms, you need emergency care immediately.*\n\n` +
  `Please call 911 or go to your nearest emergency room right now.\n\n` +
  `Do not wait. If you cannot get there safely, call 911 and they will come to you.\n\n` +
  `_Stay safe — Auralyn_`;

function isCriticalPipelineResult(result: PipelineResult): boolean {
  if (result.hardStop) return true;
  const d = (result.finalDisposition ?? "").toUpperCase();
  return ["ER_NOW", "ED_NOW", "CALL_911", "911", "AMBULANCE_NOW", "AMBULANCE"].includes(d);
}

const CRITICAL_KEYWORDS = [
  "thunderclap", "worst headache", "worst pain of", "worst of your life",
  "worst of his life", "worst of her life",
  "facial droop", "arm weakness", "leg weakness", "slurred speech",
  "cannot breathe", "can't breathe", "unable to breathe",
  "coughing blood", "vomiting blood", "unconscious", "loss of consciousness",
];

// Instant keyword-based fallback: if the rule engine has no rule for this
// complaint/question, critical safety questions with a "yes" still escalate.
function isInstantKeywordEscalation(q: QRow, answer: string | number): boolean {
  if (answer !== "yes") return false;
  const text = q.QUESTION_TEXT.toLowerCase();
  return CRITICAL_KEYWORDS.some((kw) => text.includes(kw));
}

// First-message safety net: deterministic scan of raw patient text. The LLM
// is NOT trusted to trigger a hard stop on the initial complaint — only an
// explicit critical phrase from the patient does.
function hasInstantEscalationInText(text: string): boolean {
  const lower = text.toLowerCase();
  return CRITICAL_KEYWORDS.some((kw) => lower.includes(kw));
}

async function checkEscalation(
  complaintSlug: string,
  answers: Record<string, any>
): Promise<boolean> {
  try {
    const result = await executePipeline(
      complaintSlug,
      answers as Record<string, string | number | boolean>
    );
    return isCriticalPipelineResult(result);
  } catch {
    return false; // never block a patient on engine error
  }
}

// F004 fix: full self-introduction sent on first contact (hi / hello / /start)
function buildIntroMessage(): string {
  return [
    `👋 *Hi, I'm Auralyn* — your AI medical triage assistant.`,
    ``,
    `I'll ask you a few quick questions about your symptoms and give you a clinical recommendation in under 2 minutes — completely free.`,
    ``,
    `🩺 *What's your main symptom today?*`,
    ``,
    `Just type it in plain words — for example:`,
    `• "chest pain"`,
    `• "sore throat"`,
    `• "stomach ache"`,
    `• "I have a fever and cough"`,
    ``,
    `_AI-assisted decision support only. Not a substitute for a doctor._`,
  ].join("\n");
}

function buildNoMatchMessage(_tonePrefix: string): string {
  return `Hi, I'm Auralyn, your urgent care assistant. What's bringing you in today?`;
}

// buildComplaintMenu kept for backward compat (used nowhere except legacy paths)
function buildComplaintMenu(): string {
  return buildIntroMessage();
}

function buildTriageFromPipeline(p: PipelineResult): Record<string, any> {
  const disposition = mapMasterDisposition(p.finalDisposition) ?? "urgent_care";
  let confidence: string;
  if (p.hardStop)               confidence = "HIGH";
  else if (p.totalRulesFired >= 8) confidence = "MODERATE";
  else                          confidence = "LOW";
  const dxStep    = p.steps.find(s => s.ruleType === "diagnosis");
  const topDx     = dxStep?.rulesFired?.[0]?.rule_name ?? null;
  const topCluster = p.hardStop
    ? (p.hardStopReason?.split(":")[0]?.trim() ?? "Critical red flag")
    : (topDx ?? p.complaint_id.replace(/_/g, " "));
  return {
    disposition, confidence, topCluster,
    rfTriggered: p.criticalFlagsHit ?? [],
    consistencyFlags: [],
  };
}

// ── Streaming-agent close: ONE database read, then physician-queue handoff ───
//
// Called once per agent-driven conversation, immediately after the model has
// emitted the fixed handoff message (already sent to the patient by the
// caller). Pulls the clinical-knowledge entry for the matched complaint and
// writes a single physician-review record. NEVER tells the patient anything
// about disposition — that's the physician's call.
async function deliverAgentClose(params: {
  session:   AgentSession;
  caseId:    string;
  cleanFrom: string;
  threadId:  string;
}): Promise<void> {
  const { session, caseId, cleanFrom, threadId } = params;
  const packet = buildPhysicianPacket({ caseId, session });
  if (!packet) {
    console.warn(`[WhatsApp] no physician packet built for slug ${session.slug} (no knowledge registered)`);
    hotDel(threadId);
    return;
  }

  const reviewText = formatPhysicianPacket(packet);

  // Physician handoff over WhatsApp — fire-and-forget. The patient already
  // received the closing handoff message; sending the physician packet must
  // not block this function or the webhook ack.
  setImmediate(() => {
    sendPhysicianPacket({ packet, patientPhone: cleanFrom })
      .catch((e: any) =>
        console.error(`[WhatsApp] physician handoff dispatch error: ${e?.message ?? e}`),
      );
  });

  setImmediate(() => {
    // Triage row: status NEEDS_REVIEW (physician decides), no AI-named
    // disposition. The transcript + clinical reference live in the review
    // packet attached below.
    setTriage(caseId, {
      disposition:      "needs_review",
      confidence:       "PENDING_PHYSICIAN",
      topCluster:       packet.display,
      rfTriggered:      [],
      consistencyFlags: [],
      physicianPacket:  reviewText,
    } as any, "NEEDS_REVIEW" as any).catch(() => {});

    endSession(caseId, "needs_review" as any).catch(() => {});

    logInteraction({
      sessionId: caseId, caseId, channel: "whatsapp",
      direction: "outbound", skillName: "agent_close",
      messageText:  "[handoff message sent to patient]",
      responseText: `slug=${packet.slug}|closeReason=${packet.closeReason ?? "unknown"}|durationMs=${packet.durationMs}`,
    }).catch(() => {});
  });

  hotDel(threadId);
}

// ── Map chest-pain intake answers → rule-engine PipelineInputs ────────────────
// The intake records yes/no answers as the literal string "yes" or "no".
// The rule engine evaluates boolean logic on field presence (truthy = present).
// Severity is stored as a digit string; the engine expects a number.
function mapChestPainAnswersToInputs(
  answers: Record<string, string>
): Record<string, string | number | boolean> {
  const yesNo = (v?: string) => v === "yes";
  const num   = (v?: string) => { const n = parseInt(v ?? "5", 10); return isNaN(n) ? 5 : Math.min(Math.max(n, 1), 10); };
  return {
    radiation:    yesNo(answers.radiation),
    dyspnea:      yesNo(answers.dyspnea),
    diaphoresis:  yesNo(answers.diaphoresis),
    nausea:       yesNo(answers.nausea),
    severity:     num(answers.severity),
    onset:        answers.onset      ?? "",
    character:    answers.character  ?? "",
    location:     answers.location   ?? "",
    worse:        answers.worse      ?? "",
    better:       answers.better     ?? "",
    allergies:    answers.allergies  ?? "none",
    medications:  answers.medications ?? "none",
  };
}

// ── Triage runner (zero LLM — pure rule engine) ────────────────────────────────
async function runTriageAndSend(params: {
  caseId: string;
  complaintSlug: string;
  answers: Record<string, any>;
  to: string;
  threadId: string;
}) {
  const t0 = Date.now();
  const masterResult = await executePipeline(
    params.complaintSlug,
    params.answers as Record<string, string | number | boolean>
  ).catch((e: any) => {
    console.error("[WhatsApp] executePipeline error:", e?.message);
    return null as PipelineResult | null;
  });

  const triage = masterResult
    ? buildTriageFromPipeline(masterResult)
    : { disposition: "urgent_care", confidence: "LOW", topCluster: "—", rfTriggered: [], consistencyFlags: [] };

  const needsReview =
    triage.confidence === "LOW"           ||
    (triage.rfTriggered?.length ?? 0) > 0 ||
    masterResult?.hardStop === true;

  const resultText = formatTriageResult(triage, masterResult);

  // Patient gets result — Firestore write is background
  await sendWhatsAppMessage(params.to, resultText);
  console.log(`[WhatsApp] ⚡ ${Date.now() - t0}ms total — disp=${triage.disposition} rules=${masterResult?.totalRulesFired ?? 0} hardStop=${masterResult?.hardStop ?? false}`);

  // ── Background persistence (fire-and-forget) ──────────────────────────────
  setImmediate(() => {
    setTriage(params.caseId, triage as any, (needsReview ? "NEEDS_REVIEW" : "TRIAGED") as any).catch(() => {});
    endSession(params.caseId, triage.disposition as any).catch(() => {});
    logInteraction({
      sessionId: params.caseId, caseId: params.caseId, channel: "whatsapp",
      direction: "outbound", skillName: "triage_result", messageText: resultText,
      responseText: `disposition=${triage.disposition}|confidence=${triage.confidence}|rules=${masterResult?.totalRulesFired ?? 0}`,
    }).catch(() => {});

    // ── Physician queue — push case for signoff ──────────────────────────────
    // Extract top diagnoses and workup items from the pipeline steps so the
    // physician dashboard shows a real differential rather than empty arrays.
    if (masterResult) {
      try {
        const dxStep  = masterResult.steps.find(s => s.ruleType === "diagnosis" && (s.rulesFired?.length ?? 0) > 0);
        const wkStep  = masterResult.steps.find(s => s.ruleType === "workup"    && (s.rulesFired?.length ?? 0) > 0);
        const differential = (dxStep?.rulesFired ?? []).slice(0, 5).map((r, i) => ({
          dx:         r.rule_name,
          likelihood: (i === 0 ? "high" : i <= 2 ? "moderate" : "low") as "high" | "moderate" | "low",
          reasoning:  String(r.outputs?.description ?? r.outputs?.rationale ?? r.rule_name),
        }));
        const workup = (wkStep?.rulesFired ?? []).slice(0, 8).map(r => r.rule_name);
        if (differential.length > 0) {
          addPhysicianCase({
            slug:                params.complaintSlug,
            fields:              params.answers as Record<string, any>,
            differential,
            workup,
            proposedDisposition: triage.disposition,
            dispositionReason:   triage.topCluster ?? `${params.complaintSlug} assessment`,
          });
          console.log(`[WhatsApp] physician case queued — slug=${params.complaintSlug} dx=${differential[0]?.dx}`);
        }
      } catch (e: any) {
        console.warn("[WhatsApp] addPhysicianCase non-fatal:", e?.message);
      }
    }

    // LLM enrichment for physician review packet — never blocks patient
    runOrchestratorTriage({
      complaintSlug: params.complaintSlug,
      answers: params.answers,
      sessionId: params.caseId,
      caseId: params.caseId,
      channel: "whatsapp",
    }).catch((e: any) =>
      console.warn("[WhatsApp] Async orchestrator (non-blocking):", e?.message)
    );
  });

  // Clear hot session
  hotDel(params.threadId);

  setTimeout(async () => {
    const surveyText = `📋 *Quick feedback*\n\nHow would you rate your experience today?\n\n5️⃣ Excellent  4️⃣ Good  3️⃣ Okay  2️⃣ Poor  1️⃣ Very poor\n\nReply 1–5`;
    await sendWhatsAppMessage(params.to, surveyText);
    await setSurveyState("whatsapp", params.threadId, params.caseId, "csat");
    logInteraction({ sessionId: params.caseId, channel: "whatsapp", direction: "outbound", skillName: "csat_survey", messageText: surveyText }).catch(() => {});
  }, 2000);
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function handleWhatsAppKBIntake(params: {
  from: string;
  text: string;
  messageSid: string;
}): Promise<boolean> {
  console.log('[T1] handleWhatsAppKBIntake started', Date.now());
  const { from, text } = params;
  const threadId  = from.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const cleanFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const rawText   = text.trim();
  const mood      = analyzeMood(rawText);

  // ── Physician inbound replies — short-circuit BEFORE any patient logic ────
  // If this WhatsApp message came from PHYSICIAN_PHONE_NUMBER, it's a
  // disposition action (URGENT / UC / CALL / HOME) for a pending patient
  // packet, not patient triage input. Route it and exit.
  if (isPhysicianNumber(from)) {
    const handled = await handlePhysicianReply({ from, text: rawText }).catch((e: any) => {
      console.error("[WhatsApp] physician reply handler error:", e?.message ?? e);
      return false;
    });
    if (handled) return true;
  }

  // ── Universal emergency bypass — runs BEFORE any triage, for every patient
  // message regardless of session state. If the patient texts an unambiguous
  // emergency phrase ("I can't breathe", "call 911", "I collapsed", …) we tell
  // them to call 911 and fire the staff emergency alert to the physician. We do
  // NOT route this into triage and never let an in-progress conversation block
  // it. The clinical red-flag keyword checks further down still cover symptom
  // phrasing; this is the obvious-distress fast path.
  if (matchesEmergencyBypass(rawText)) {
    await sendWhatsAppMessage(cleanFrom, EMERGENCY_BYPASS_PATIENT_MESSAGE);
    setImmediate(() => {
      triggerEmergencyProtocol({
        observation: rawText,
        source:      "patient_whatsapp",
        traceId:     threadId,
      }).catch((e: any) => console.error("[WhatsApp] emergency protocol error:", e?.message ?? e));
    });
    return true;
  }

  // ── /start / hello ──────────────────────────────────────────────────────────
  if (rawText.toLowerCase() === "/start" || rawText.toLowerCase() === "hi" || rawText.toLowerCase() === "hello") {
    const existing = hotGet(threadId);
    if (existing) {
      // Background: close old Firestore case
      setImmediate(() => setCaseState(existing.caseId, "CLOSED").catch(() => {}));
    }
    hotDel(threadId);
    clearSurveyState("whatsapp", threadId).catch(() => {});
    markNewConversation(cleanFrom);   // fresh conversation → show 911 disclaimer once
    await sendWhatsAppMessage(cleanFrom, buildIntroMessage());
    return true;
  }

  // ── /reset ──────────────────────────────────────────────────────────────────
  if (rawText.toLowerCase() === "/reset") {
    const existing = hotGet(threadId);
    if (existing) {
      setImmediate(() => setCaseState(existing.caseId, "CLOSED").catch(() => {}));
    }
    hotDel(threadId);
    clearSurveyState("whatsapp", threadId).catch(() => {});
    markNewConversation(cleanFrom);   // fresh conversation → show 911 disclaimer once
    await sendWhatsAppMessage(cleanFrom, "Session cleared. Send your symptom or 'hi' to start again.");
    return true;
  }

  // ── Survey replies ──────────────────────────────────────────────────────────
  // FIX 1 + FIX 3: Only check survey state for numeric messages (CSAT 1-5, NPS 0-10).
  // Symptom text ("chest pain", "yes", "no") skips the Redis fetch entirely — zero latency.
  // Numeric replies get a 500ms hard timeout so a slow/unreachable Upstash never blocks.
  const looksNumeric = /^\d+$/.test(rawText.trim());
  const survey = looksNumeric
    ? await Promise.race([
        getSurveyState("whatsapp", threadId),
        new Promise<null>(r => setTimeout(() => r(null), 500)),
      ])
    : null;
  if (survey) {
    const n = parseInt(rawText.trim());
    if (survey.phase === "csat" && !isNaN(n) && n >= 1 && n <= 5) {
      recordCsat(survey.sessionId, n).catch(() => {});
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "inbound", skillName: "csat_reply", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
      await setSurveyState("whatsapp", threadId, survey.sessionId, "nps");
      const npsText = `Thanks! One more — how likely are you to recommend Auralyn to someone you know?\n\n0 = Not at all   10 = Absolutely yes\n\nReply 0–10`;
      await sendWhatsAppMessage(cleanFrom, npsText);
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "outbound", skillName: "nps_survey", messageText: npsText }).catch(() => {});
      return true;
    }
    if (survey.phase === "nps" && !isNaN(n) && n >= 0 && n <= 10) {
      recordNps(survey.sessionId, n).catch(() => {});
      clearSurveyState("whatsapp", threadId).catch(() => {});
      logInteraction({ sessionId: survey.sessionId, channel: "whatsapp", direction: "inbound", skillName: "nps_reply", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
      await sendWhatsAppMessage(cleanFrom, `🙏 Thank you! Your feedback helps us improve care. Stay well.`);
      return true;
    }
  }

  console.log('[T2] getSurveyState done', Date.now());

  // ── Look up existing session ────────────────────────────────────────────────
  // 1. Hot cache (in-memory, instant)
  // 2. Firestore fallback with 2s hard timeout (only on first message after restart)
  let session = hotGet(threadId);
  if (!session) session = await Promise.race([
    firestoreLookup(threadId),
    new Promise<null>(r => setTimeout(() => r(null), 2000)),
  ]);
  console.log('[T3] firestoreLookup done', Date.now(), session ? `caseId=${session.caseId}` : "no session");

  // ── Session reset: any new complaint match closes the prior session ────────
  //
  // If the patient's message matches ANY complaint via the router, treat it
  // as a fresh chief complaint and start over — even if it matches the same
  // slug as the current session. This protects against state leaking between
  // conversations (e.g. patient resumes hours later with a new headache and
  // we accidentally pick up where the last interview left off). Routine
  // answers like "yes" / "3 days" / "35, male" do not match a chief
  // complaint, so they keep the session alive as expected.
  const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
  if (session) {
    const isExpired      = Date.now() - (session.createdAt ?? 0) > SESSION_MAX_AGE_MS;
    const incomingMatch  = matchComplaintFromText(rawText);
    // Only a switch to a DIFFERENT chief complaint starts a fresh session.
    // Re-mentioning the active complaint inside an answer ("the chest pain is
    // squeezing", "the pain in my chest spreads…") matches the same slug and
    // must NOT reset — doing so dropped all collected answers and re-asked Q0
    // every turn, so the complaint never locked and the conversation looped.
    // Stale resumes with the same complaint are still closed by the 4h expiry.
    const isComplaintSwitch =
      incomingMatch !== null && incomingMatch.slug !== session.complaint.slug;
    if (isExpired || isComplaintSwitch) {
      const reason = isExpired
        ? "expired (>4h)"
        : `chief complaint switched (${incomingMatch!.slug}); was ${session.complaint.slug}`;
      console.log(`[Session] Closing prior session: ${reason}`);
      setImmediate(() => setCaseState(session!.caseId, "CLOSED").catch(() => {}));
      hotDel(threadId);
      session = null;
    }
  }

  // ── New session — complaint selection ───────────────────────────────────────
  if (!session) {
    markNewConversation(cleanFrom);   // fresh conversation → show 911 disclaimer once
    const complaints = (listEnabledComplaints() as any[]).slice(0, 20);
    const byNumber = Number(rawText.trim()) - 1;
    let match: { slug: string; display: string } | null = null;

    if (!isNaN(byNumber) && byNumber >= 0 && byNumber < complaints.length) {
      const c = complaints[byNumber];
      match = { slug: c.CC_ID, display: c.LABEL };
    } else {
      match = matchComplaintFromText(rawText);
    }

    if (!match) {
      const tonePrefix = buildTonePrefix(mood.mood);
      await sendWhatsAppMessage(cleanFrom, buildNoMatchMessage(tonePrefix));
      return true;
    }

    // ── Create session in memory immediately (instant) ──────────────────────
    const nowIso = new Date().toISOString();
    const caseId = `CASE_${nowIso.replace(/[-:.TZ]/g, "")}_${Math.random().toString(16).slice(2, 8)}`;
    // Streaming-agent slugs (currently neuro_headache; the rest will register
    // their system prompts in agent/prompts/registry.ts as they're written).
    // For agent-driven slugs every patient turn is a single LLM call; there
    // is no per-turn DB call and no rule engine. For non-agent slugs we fall
    // through to the legacy extract-and-respond path below.
    const agentSession = hasSystemPrompt(match.slug) ? startAgentSession(match.slug) : null;
    session = {
      caseId, complaint: match, answers: {}, extractedFields: {}, exchanges: [],
      state: "DRAFT", createdAt: Date.now(), pendingSafetyAsk: null,
      agent: agentSession,
      // Resolve the complaint bundle once per session (cache hit when slug
      // was prewarmed at startup). Cheap O(1) lookup; pass through to every
      // extractAndRespond call so the system prompt skeleton is reused.
      bundle: getComplaintBundle(match.slug),
    };
    hotSet(threadId, session);

    // ── Background: persist to Firestore + audit (never blocks patient) ──────
    setImmediate(() => {
      createCase({
        channel: "whatsapp", threadId, userId: threadId,
        complaintSlug: match!.slug, complaintDisplay: match!.display,
        engine: "GENERIC_V1",
      }).catch(() => {});

      // channelThreadService uses "telegram" type but works for whatsapp via dynamic import
      import("../services/channelThreadService").then(({ setActiveCaseId }) =>
        (setActiveCaseId as any)({ channel: "whatsapp", threadId, activeCaseId: caseId }).catch(() => {})
      ).catch(() => {});

      startSession(caseId, caseId, "whatsapp").catch(() => {});
      incrementMessageCount(caseId).catch(() => {});
      appendMessage(caseId, { ts: nowIso, dir: "in", channel: "whatsapp", text: rawText }).catch(() => {});
      logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "inbound", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
    });

    // First-message hard stop: deterministic keyword scan. Runs BEFORE any
    // engine work so an explicit emergency phrase short-circuits immediately.
    if (hasInstantEscalationInText(rawText)) {
      setImmediate(() => {
        setTriage(caseId, { disposition: "er_send", confidence: "HIGH", topCluster: "Critical red flag — initial message keyword", rfTriggered: ["KEYWORD_ESCALATION"], consistencyFlags: [] } as any, "CLOSED" as any).catch(() => {});
        endSession(caseId, "er_send" as any).catch(() => {});
      });
      await sendWhatsAppMessage(cleanFrom, EMERGENCY_MESSAGE);
      hotDel(threadId);
      return true;
    }

    // ── Deterministic chest-pain intake (scope: intake questions only) ──────
    // Six ordered sections (chief complaint → HPI → secondary → modifying →
    // allergies → medications) driven by a fixed script — zero LLM, no
    // rule-engine disposition, no escalation during intake. Each answer is
    // recorded against the question just asked (including plain negatives) and
    // the cursor only moves forward, so a question can never be re-asked.
    if (slugToRouter(match.slug) === "chest_pain") {
      const { state, question } = startChestPainIntake(rawText);
      session.intake = state;
      session.exchanges = [
        { role: "user",      text: rawText },
        { role: "assistant", text: question.text },
      ];
      hotSet(threadId, session);
      await sendWhatsAppMessage(cleanFrom, question.text);
      console.log('[T5] chest-pain intake Q0 sent (deterministic)', Date.now());
      return true;
    }

    // ── Streaming-agent path: ONE LLM call to generate the first question ───
    // The initial complaint message is the first patient turn. We feed it to
    // Claude Sonnet with the loaded system prompt; the assistant's reply is
    // its first triage question (usually age + sex per the protocol).
    if (agentSession) {
      const reply = await agentNextReply(agentSession, rawText);
      session.exchanges = [
        { role: "user",      text: rawText    },
        { role: "assistant", text: reply.text },
      ];
      hotSet(threadId, session);
      await sendWhatsAppMessage(cleanFrom, reply.text);
      console.log('[T5] sendWhatsAppMessage done', Date.now(), `agent latency=${reply.latencyMs}ms`);

      // It is extraordinarily unlikely for the model to close on turn 1, but
      // if it ever did (e.g. a forced handoff), drain the packet so we never
      // leave the patient mid-air.
      if (reply.closed) {
        await deliverAgentClose({ session: agentSession, caseId, cleanFrom, threadId });
      }
      return true;
    }

    // ── Legacy path (slugs without a registered protocol) ───────────────────
    // F017: Turn 0 — send scripted Q[0] with ZERO LLM calls.
    // T018: keyword-extract any volunteered fields from the opening message so
    //       the next scripted question targets the first gap.
    console.log('[T4] scripted Q[0] — no LLM (F017/F020)', Date.now());
    const routerCode0  = slugToRouter(match.slug);
    const initKwFields = keywordExtract(match.slug, rawText, null, true);
    // F020: gap-aware — skip Q[0] if the patient already answered its field
    const gap0  = getNextGapQuestion(routerCode0, initKwFields, 0);
    const q0    = gap0?.question ?? "How long have you been having these symptoms?";
    const qi0   = gap0?.nextIndex ?? 1;

    session.extractedFields  = initKwFields;
    session.answers          = mapFieldsToQIds(match.slug, initKwFields);
    session.questionIndex    = qi0;
    session.exchanges = [
      { role: "user",      text: rawText },
      { role: "assistant", text: q0      },
    ];
    session.pendingSafetyAsk = null;
    hotSet(threadId, session);

    await sendWhatsAppMessage(cleanFrom, q0);
    console.log('[T5] sendWhatsAppMessage done', Date.now());
    return true;
  }

  // ── Existing session — conversational answer handling ──────────────────────
  // Non-null alias: `session` is narrowed to non-null here, but TypeScript does
  // not carry that narrowing into the nested helper closures below, so they
  // reference `activeSession` (a non-null const) instead of `session`.
  const activeSession = session;
  const { caseId, complaint, answers } = activeSession;

  // Background audit writes (never block the patient)
  setImmediate(() => {
    incrementMessageCount(caseId).catch(() => {});
    appendMessage(caseId, { ts: new Date().toISOString(), dir: "in", channel: "whatsapp", text: rawText }).catch(() => {});
    logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "inbound", messageText: rawText, moodLabel: mood.mood, moodScore: mood.score, toneLabel: mood.tone }).catch(() => {});
  });

  // ── Deterministic chest-pain intake turn (scope: intake questions only) ────
  // Record the answer to the question just asked, then send the next scripted
  // question. No GPT, no escalation, no disposition — the cursor only advances,
  // so a question is never re-asked and the flow runs cleanly to medications.
  if (activeSession.intake) {
    const { question } = advanceChestPainIntake(activeSession.intake, rawText);
    hotSet(threadId, activeSession);
    if (question) {
      await sendWhatsAppMessage(cleanFrom, question.text);
      console.log('[T5] chest-pain intake Q sent (deterministic)', Date.now());
      return true;
    }
    // Script exhausted — intake complete. Run the full 13-step triage pipeline,
    // send the patient their assessment, and push a case to the physician queue.
    // runTriageAndSend handles hotDel + CSAT survey.
    const pipelineInputs = mapChestPainAnswersToInputs(activeSession.intake.answers);
    console.log('[T5] chest-pain intake complete — running triage pipeline', Date.now());
    await runTriageAndSend({
      caseId,
      complaintSlug: "chest_pain",
      answers: pipelineInputs,
      to: cleanFrom,
      threadId,
    });
    return true;
  }

  // ── Fix 5: Immediate ack for longer messages ───────────────────────────────
  const wordCount = rawText.trim().split(/\s+/).length;
  if (wordCount > 4) {
    await sendWhatsAppMessage(cleanFrom, "Got it…");
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function persistState(updatedAnswers: Record<string, any>) {
    setImmediate(() => {
      const answerHash = sha256Hex(JSON.stringify(updatedAnswers));
      import("../firebase").then(({ getFirestore }) => {
        getFirestore().collection("cases").doc(caseId).update({
          updatedAt: new Date().toISOString(),
          "answers.structured": updatedAnswers,
          "answers.answerHash": answerHash,
        }).catch(() => {});
      }).catch(() => {});
    });
  }

  async function doEscalation(updatedAns: Record<string, any>, trigger: string) {
    // Red flag detected. Detection, the patient 911 message, the physician alert,
    // and top-of-queue placement all stay intact — but the clinical pipeline now
    // runs to COMPLETION so the physician receives the full differential / workup /
    // disposition for this escalated case, not a bare "ESCALATION" stub. The
    // patient-facing disposition is non-negotiably ER regardless of how the rest
    // of the pipeline scores.
    const masterResult = await executePipeline(
      complaint.slug,
      updatedAns as Record<string, string | number | boolean>,
    ).catch((e: any) => {
      console.error("[WhatsApp] escalation pipeline error:", e?.message);
      return null as PipelineResult | null;
    });
    __lastEscalationPipeline = masterResult;   // verification hook only — no prod callers

    const triage = masterResult
      ? buildTriageFromPipeline(masterResult)
      : { disposition: "er_send", confidence: "HIGH", topCluster: "Critical red flag — auto-escalated", rfTriggered: ["ESCALATION"], consistencyFlags: [] };
    // Escalation stays authoritative: force ER + surface the critical flags fired.
    triage.disposition = "er_send";
    triage.confidence  = "HIGH";
    triage.rfTriggered = (masterResult?.criticalFlagsHit?.length ?? 0) > 0
      ? masterResult!.criticalFlagsHit
      : ["ESCALATION"];

    const stageCount   = masterResult?.steps?.length ?? 0;
    const dxStep       = masterResult?.steps?.find(s => s.ruleType === "diagnosis");
    const differential = (dxStep?.rulesFired ?? []).slice(0, 8).map((r: any) => r.rule_name ?? r.rule_id);

    setImmediate(() => {
      const answerHash = sha256Hex(JSON.stringify(updatedAns));
      import("../firebase").then(({ getFirestore }) => {
        getFirestore().collection("cases").doc(caseId).update({
          updatedAt: new Date().toISOString(),
          "answers.structured": updatedAns,
          "answers.answerHash": answerHash,
        }).catch(() => {});
      }).catch(() => {});
      // TOP-OF-QUEUE physician review (NEEDS_REVIEW), full pipeline triage attached.
      setTriage(caseId, {
        ...triage,
        escalated: true,
        priority:  "CRITICAL_TOP",
        masterPipeline: masterResult ? {
          finalDisposition: masterResult.finalDisposition,
          hardStop:         masterResult.hardStop,
          hardStopReason:   masterResult.hardStopReason,
          totalRulesFired:  masterResult.totalRulesFired,
          criticalFlagsHit: masterResult.criticalFlagsHit,
          stages:           stageCount,
          differential,
        } : null,
      } as any, "NEEDS_REVIEW" as any).catch(() => {});
      endSession(caseId, "er_send" as any).catch(() => {});
      logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "outbound", skillName: "safety_escalation", messageText: EMERGENCY_MESSAGE, responseText: `escalated=true|trigger=${trigger}|disposition=er_send|stages=${stageCount}|rulesFired=${masterResult?.totalRulesFired ?? 0}|differential=${differential.join(";")}` }).catch(() => {});
      // Full physician review packet (differential/workup enrichment) — non-blocking.
      runOrchestratorTriage({
        complaintSlug: complaint.slug,
        answers: updatedAns,
        sessionId: caseId,
        caseId,
        channel: "whatsapp",
      }).catch((e: any) => console.warn("[WhatsApp] escalation orchestrator (non-blocking):", e?.message));
    });

    await sendWhatsAppMessage(cleanFrom, EMERGENCY_MESSAGE);
    hotDel(threadId);
  }

  // ── Red-flag handoff that does NOT terminate the patient conversation ──────
  //
  // When the rule engine detects a red flag mid-interview, detection stays
  // fully intact: the full clinical pipeline runs to completion, the physician
  // is alerted, and the case is pushed to the TOP of the review queue
  // (NEEDS_REVIEW). The deterministic ER disposition is recorded for the
  // physician and never downgraded. What this does NOT do — unlike
  // doEscalation() — is send the patient a "go to the ER" message or close the
  // session. The patient keeps answering questions and the interview flows
  // through every pipeline stage; the physician owns the patient-facing
  // disposition. Idempotent: the alert + queue placement fire once per session
  // even though the engine re-flags on every subsequent turn.
  async function flagRedFlagForPhysician(updatedAns: Record<string, any>, trigger: string) {
    if (activeSession.redFlagFlagged) return;
    activeSession.redFlagFlagged = true;
    hotSet(threadId, activeSession);

    // Full clinical pipeline runs to completion so the physician review packet
    // carries the differential / workup, not a bare escalation stub.
    const masterResult = await executePipeline(
      complaint.slug,
      updatedAns as Record<string, string | number | boolean>,
    ).catch((e: any) => {
      console.error("[WhatsApp] red-flag pipeline error:", e?.message);
      return null as PipelineResult | null;
    });
    __lastEscalationPipeline = masterResult;   // verification hook only — no prod callers

    const triage = masterResult
      ? buildTriageFromPipeline(masterResult)
      : { disposition: "er_send", confidence: "HIGH", topCluster: "Critical red flag — auto-escalated", rfTriggered: ["ESCALATION"], consistencyFlags: [] };
    // Escalation stays authoritative for the physician: force ER + critical
    // flags. Deterministic HIGH/CRITICAL risk is never downgraded.
    triage.disposition = "er_send";
    triage.confidence  = "HIGH";
    triage.rfTriggered = (masterResult?.criticalFlagsHit?.length ?? 0) > 0
      ? masterResult!.criticalFlagsHit
      : ["ESCALATION"];

    const stageCount   = masterResult?.steps?.length ?? 0;
    const dxStep       = masterResult?.steps?.find(s => s.ruleType === "diagnosis");
    const differential = (dxStep?.rulesFired ?? []).slice(0, 8).map((r: any) => r.rule_name ?? r.rule_id);

    console.log(`[WhatsApp] 🚩 Red flag → physician alert + top-of-queue (trigger=${trigger}, stages=${stageCount}); patient interview continues`);

    setImmediate(() => {
      const answerHash = sha256Hex(JSON.stringify(updatedAns));
      import("../firebase").then(({ getFirestore }) => {
        getFirestore().collection("cases").doc(caseId).update({
          updatedAt: new Date().toISOString(),
          "answers.structured": updatedAns,
          "answers.answerHash": answerHash,
        }).catch(() => {});
      }).catch(() => {});
      // TOP-OF-QUEUE physician review (NEEDS_REVIEW), full pipeline triage
      // attached. NOTE: no endSession — the patient conversation is still open.
      setTriage(caseId, {
        ...triage,
        escalated: true,
        priority:  "CRITICAL_TOP",
        masterPipeline: masterResult ? {
          finalDisposition: masterResult.finalDisposition,
          hardStop:         masterResult.hardStop,
          hardStopReason:   masterResult.hardStopReason,
          totalRulesFired:  masterResult.totalRulesFired,
          criticalFlagsHit: masterResult.criticalFlagsHit,
          stages:           stageCount,
          differential,
        } : null,
      } as any, "NEEDS_REVIEW" as any).catch(() => {});
      logInteraction({ sessionId: caseId, caseId, channel: "whatsapp", direction: "outbound", skillName: "safety_redflag_alert", messageText: "[physician alerted — patient interview continues]", responseText: `escalated=true|trigger=${trigger}|disposition=er_send|stages=${stageCount}|rulesFired=${masterResult?.totalRulesFired ?? 0}|differential=${differential.join(";")}` }).catch(() => {});
      // Full physician review packet (differential/workup enrichment) — non-blocking.
      runOrchestratorTriage({
        complaintSlug: complaint.slug,
        answers: updatedAns,
        sessionId: caseId,
        caseId,
        channel: "whatsapp",
      }).catch((e: any) => console.warn("[WhatsApp] red-flag orchestrator (non-blocking):", e?.message));
    });
    // NO patient EMERGENCY_MESSAGE, NO hotDel — the interview continues.
  }

  // ── Step 1: Pre-LLM keyword safety scan — short-circuits the LLM call ─────
  const CRITICAL_PHRASES = [
    "can't breathe", "cannot breathe", "unable to breathe", "worst headache of my life",
    "chest pain and can't", "coughing blood", "vomiting blood", "thunderclap",
    "facial droop", "arm weakness", "slurred speech", "unconscious",
  ];
  if (CRITICAL_PHRASES.some(p => rawText.toLowerCase().includes(p))) {
    console.log(`[WhatsApp] 🚨 Keyword escalation triggered`);
    await doEscalation(answers, "keyword");
    return true;
  }

  // ── Streaming-agent branch: ONE LLM call per turn, NO per-turn DB ─────────
  //
  // The agent owns the conversation. It returns the next assistant reply
  // (already sent to the patient verbatim) and a `closed` flag. The single
  // database read in the entire conversation lifecycle is buildPhysicianPacket
  // at close, fired from deliverAgentClose.
  if (session.agent) {
    const reply = await agentNextReply(session.agent, rawText);
    session.exchanges = [
      ...(session.exchanges ?? []),
      { role: "user",      text: rawText    },
      { role: "assistant", text: reply.text },
    ].slice(-40);
    hotSet(threadId, session);
    await sendWhatsAppMessage(cleanFrom, reply.text);
    console.log('[T5] sendWhatsAppMessage done', Date.now(), `agent latency=${reply.latencyMs}ms closed=${reply.closed}`);

    if (reply.closed) {
      await deliverAgentClose({ session: session.agent, caseId, cleanFrom, threadId });
    }
    return true;
  }

  const exchanges    = session.exchanges ?? [];
  const qIndex       = session.questionIndex ?? 1;
  const routerCode   = slugToRouter(complaint.slug);

  // ── F017: Scripted-question phase (turns 1 … MIN_QUESTIONS-2) ─────────────
  // For the first MIN_QUESTIONS_BEFORE_DISPOSITION turns we return pre-written
  // questions from the clinical sequence — zero LLM round-trips.  GPT is
  // called only for turns that cannot be resolved by keyword logic (free-form
  // long replies) or after the scripted phase ends.
  //
  // T018 (listen-first): on long replies (>4 words) we run GPT extraction so
  // every volunteered field is captured, then pair the extracted-field
  // acknowledgment with the NEXT SCRIPTED question (never GPT-generated text).
  // This ensures Auralyn acknowledges what was heard before asking a gap.
  if (qIndex < MIN_QUESTIONS_BEFORE_DISPOSITION) {

    let extracted: Record<string, any>;

    if (wordCount > 4) {
      // Free-form multi-symptom reply — use GPT for extraction only.
      // The RESPONSE field from the LLM is discarded; we build the reply
      // from (a) a deterministic ack of extracted fields and (b) the next
      // scripted question.  This is ONE GPT call, satisfying F017 crit 3.
      console.log('[T4] scripted phase — GPT extract only (free-form)', Date.now());
      const gpte = await extractAndRespond(
        rawText,
        session.extractedFields ?? {},
        complaint.slug,
        exchanges,
        false,
        session.pendingSafetyAsk ?? null,
        session.bundle,
      );
      extracted = gpte.extracted;
    } else {
      // Short/simple reply — keyword extraction only (0ms, no LLM).
      console.log('[T4] scripted phase — keyword extract (short reply)', Date.now());
      extracted = keywordExtract(complaint.slug, rawText, session.pendingSafetyAsk ?? null, false);
    }

    // Merge extracted fields
    const updatedFields  = { ...(session.extractedFields ?? {}), ...extracted };
    const updatedAnswers = { ...answers, ...mapFieldsToQIds(complaint.slug, extracted) };
    session.extractedFields  = updatedFields;
    session.answers          = updatedAnswers;
    session.pendingSafetyAsk = null;          // safety gate resets each scripted turn
    persistState(updatedAnswers);

    // Safety check — always runs regardless of scripted phase.
    // A red flag fires the physician alert + top-of-queue review (idempotent)
    // and runs the full pipeline, but it does NOT terminate the conversation:
    // we fall through and keep asking questions so the interview flows through
    // every pipeline stage. The physician owns the patient-facing disposition.
    const shouldEscalateS = await checkEscalation(complaint.slug, updatedAnswers);
    if (shouldEscalateS) {
      console.log(`[WhatsApp] 🚩 Red flag in scripted phase for ${complaint.slug} — alerting physician, interview continues`);
      await flagRedFlagForPhysician(updatedAnswers, "engine");
      // intentionally NO return — continue to the next scripted question
    }

    const completeS = isComplete(complaint.slug, updatedFields);
    if (completeS) {
      const closing = await generateClosingMessage({ complaintDisplay: complaint.display });
      await sendWhatsAppMessage(cleanFrom, closing);
      await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers: updatedAnswers, to: cleanFrom, threadId });
      return true;
    }

    // T018 + F020: build listen-first response — ack what was heard + next gap Q
    // getNextGapQuestion scans forward from qIndex, skipping already-answered fields
    const gapResult = getNextGapQuestion(routerCode, updatedFields, qIndex);
    const scriptedQ = gapResult?.question ?? "Can you tell me more about your symptoms?";
    const ack = wordCount > 4 ? buildListenAck(extracted) : "";
    const reply = ack ? `${ack}${scriptedQ}` : scriptedQ;

    session.questionIndex = gapResult?.nextIndex ?? (qIndex + 1);
    session.exchanges = [
      ...exchanges,
      { role: "user",      text: rawText },
      { role: "assistant", text: reply   },
    ].slice(-10);
    hotSet(threadId, session);

    await sendWhatsAppMessage(cleanFrom, reply);
    console.log('[T5] sendWhatsAppMessage done (scripted)', Date.now());
    return true;
  }

  // ── Step 2: GPT phase — single combined LLM call (extract + next question) ─
  // Reached only after MIN_QUESTIONS_BEFORE_DISPOSITION - 1 scripted turns.
  // session.pendingSafetyAsk is the safety field the previous assistant
  // response asked about (or null). extractAndRespond will drop any safety
  // field extraction that doesn't match — so chat-history phrases like
  // "my head and neck hurt" can't get re-emitted as stiff_neck:true.
  console.log('[T4] extractAndRespond (GPT phase)', Date.now());
  const combined  = await extractAndRespond(
    rawText,
    session.extractedFields ?? {},
    complaint.slug,
    exchanges,
    false,
    session.pendingSafetyAsk ?? null,
    session.bundle,
  );

  // Merge extracted fields into session
  const updatedFields  = { ...(session.extractedFields ?? {}), ...combined.extracted };
  const updatedAnswers = { ...answers, ...mapFieldsToQIds(complaint.slug, combined.extracted) };

  session.extractedFields  = updatedFields;
  session.answers          = updatedAnswers;
  session.pendingSafetyAsk = combined.nextSafetyAsk;
  persistState(updatedAnswers);

  // ── Step 3: Rule-pipeline safety check on the updated answers (~50-100ms) ──
  const complete       = isComplete(complaint.slug, updatedFields);
  const shouldEscalate = await checkEscalation(complaint.slug, updatedAnswers);

  // Red flag → physician alert + top-of-queue + full pipeline (idempotent), but
  // the conversation continues through every stage rather than terminating with
  // a patient-facing "go to the ER". The physician owns the disposition.
  if (shouldEscalate) {
    console.log(`[WhatsApp] 🚩 Red flag for ${complaint.slug} — alerting physician, interview continues`);
    await flagRedFlagForPhysician(updatedAnswers, "engine");
    // intentionally NO return — fall through to completion / next-question
  }

  // ── Step 4: Interview complete → closing message + triage ─────────────────
  if (complete) {
    console.log('[T4] conversational engine: interview complete', Date.now());
    const closing = await generateClosingMessage({ complaintDisplay: complaint.display });
    await sendWhatsAppMessage(cleanFrom, closing);
    console.log('[T5] sendWhatsAppMessage done', Date.now());
    await runTriageAndSend({ caseId, complaintSlug: complaint.slug, answers: updatedAnswers, to: cleanFrom, threadId });
    return true;
  }

  // ── Step 5: Send the next question from the combined call ─────────────────
  session.questionIndex = (qIndex ?? 0) + 1;
  session.exchanges = [
    ...exchanges,
    { role: "user",      text: rawText           },
    { role: "assistant", text: combined.response },
  ].slice(-10);
  hotSet(threadId, session);

  await sendWhatsAppMessage(cleanFrom, combined.response);
  console.log('[T5] sendWhatsAppMessage done', Date.now());
  return true;
}

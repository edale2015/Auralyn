/**
 * chestPainIntakeSim.ts — Automated conversation simulator for the REAL
 * WhatsApp chat intake path (chest_pain only, intake questions only).
 *
 * It drives server/whatsapp/kbIntake.ts:handleWhatsAppKBIntake — the exact
 * function the Twilio webhook in server/index.ts calls — using the real
 * in-memory session store. Outbound messages are captured via the same test
 * interceptor hook the production /api/test/kb-sim endpoint uses; nothing is
 * faked and no answer is injected into the session by the simulator.
 *
 * For each answer set it: sends a message, reads the bot's question, answers,
 * reads the next question, and records every question asked — then asserts:
 *   1. No question is ever asked twice (loop detection).
 *   2. The flow advances through all six intake sections and reaches
 *      medications, then ends intake cleanly.
 *   3. No ER/escalation message appears during intake.
 *   4. The session never resets or re-greets mid-conversation.
 *
 * Run: npx tsx tests/sim/chestPainIntakeSim.ts
 */

import {
  registerTestInterceptor,
  clearTestInterceptor,
} from "../../server/whatsapp/send";
import { handleWhatsAppKBIntake, __peekHotSession } from "../../server/whatsapp/kbIntake";
import {
  CHEST_PAIN_INTAKE,
  CHEST_PAIN_INTAKE_CLOSING,
  INTAKE_SECTIONS,
  type IntakeQuestion,
  type IntakeSection,
} from "../../server/whatsapp/chestPainIntake";
import { EMERGENCY_DISCLAIMER } from "../../server/whatsapp/disclaimer";

// ── message classification helpers (black-box on the real outbound text) ─────

function stripFooter(msg: string): string {
  return msg.split(EMERGENCY_DISCLAIMER).join("").trim();
}

/** Identify which intake question a bot message is, by substring match. */
function identifyQuestion(msg: string): IntakeQuestion | null {
  const body = stripFooter(msg);
  let best: IntakeQuestion | null = null;
  for (const q of CHEST_PAIN_INTAKE) {
    if (body.includes(q.text) && (!best || q.text.length > best.text.length)) {
      best = q;
    }
  }
  return best;
}

const ER_RE =
  /\b911\b|emergency room|emergency care immediately|\bgo to (?:the )?er\b|🚨|Emergency — Go to ER/i;
function looksLikeEscalation(msg: string): boolean {
  // Strip the once-per-conversation 911 disclaimer footer first — that fixed
  // boilerplate is not an escalation.
  return ER_RE.test(stripFooter(msg));
}

const REGREET_RE =
  /main symptom today|what's bringing you in|whats bringing you in|Session cleared|I'm Auralyn/i;
function looksLikeRegreet(msg: string, turnIdx: number): boolean {
  if (turnIdx === 0) return false; // the very first turn legitimately greets
  return REGREET_RE.test(stripFooter(msg));
}

function isClosing(msg: string): boolean {
  return stripFooter(msg).includes(CHEST_PAIN_INTAKE_CLOSING);
}

// ── answer strategies — what a patient types for a given question ────────────

type Strategy = (q: IntakeQuestion, nthAnswer: number) => string;

const NATURAL_NEGATIVES = [
  "nope",
  "not really",
  "none that I know of",
  "nah",
  "no, not at all",
  "don't think so",
];

const strategies: Record<string, Strategy> = {
  all_no: () => "No",
  all_yes: () => "Yes",
  natural_negatives: (_q, n) => NATURAL_NEGATIVES[n % NATURAL_NEGATIVES.length],
  mixed: (q) =>
    ({
      cp_hpi_onset:       "about an hour ago",
      cp_hpi_character:   "it feels squeezing",
      cp_hpi_location:    "the middle of my chest",
      cp_hpi_severity:    "7",
      cp_sec_radiation:   "yes, into my left arm",
      cp_sec_dyspnea:     "no",
      cp_sec_diaphoresis: "yes a little",
      cp_sec_nausea:      "no",
      cp_mod_worse:       "worse when I walk around",
      cp_mod_better:      "a little better when I sit",
      cp_allergies:       "penicillin",
      cp_medications:     "I take lisinopril daily",
    } as Record<string, string>)[q.id] ?? "No",
};

// ── conversation driver ──────────────────────────────────────────────────────

interface TurnRecord {
  turn:     number;
  patient:  string;
  botMsgs:  string[];
  question: IntakeQuestion | null;
}

interface ConvoResult {
  name:        string;
  transcript:  TurnRecord[];
  failures:    string[];
  reachedMeds: boolean;
  sections:    Set<IntakeSection>;
  recorded:    Record<string, string>;  // persisted answers read from real store
}

let phoneCounter = 7_300_000;
function nextPhone(): string {
  phoneCounter += 137;
  return `+1555${phoneCounter}`;
}

// threadId derivation must match handleWhatsAppKBIntake exactly, so the peek
// reads the SAME hot session the handler wrote.
function threadIdOf(phone: string): string {
  return phone.replace(/^whatsapp:/, "").replace(/^\+/, "");
}

// Deep snapshot of the answers the REAL session store currently holds for this
// thread (null once the session is closed/deleted on intake completion).
function peekAnswers(phone: string): Record<string, string> | null {
  const s = __peekHotSession(threadIdOf(phone));
  if (!s?.intake) return null;
  return { ...s.intake.answers };
}

async function send(phone: string, text: string, sid: string): Promise<string[]> {
  const captured: string[] = [];
  registerTestInterceptor(phone, (msg) => captured.push(msg));
  try {
    await handleWhatsAppKBIntake({ from: phone, text, messageSid: sid });
  } finally {
    clearTestInterceptor(phone);
  }
  return captured;
}

async function runConversation(name: string, strategyKey: string): Promise<ConvoResult> {
  const strat = strategies[strategyKey];
  const phone = nextPhone();
  const transcript: TurnRecord[] = [];
  const failures: string[] = [];
  const askedById = new Map<string, number>();   // id → first turn asked
  const askedByText = new Map<string, number>();  // raw question text → first turn
  const sections = new Set<IntakeSection>();
  sections.add("chief_complaint"); // supplied by the opening complaint message
  let reachedMeds = false;
  let nthAnswer = 0;
  // Last non-null snapshot of the REAL session store's recorded answers. The
  // session is deleted on clean close, so this captures the persisted state
  // right up to the final (medications) turn.
  let lastAnswers: Record<string, string> | null = null;
  // Every question we answered, with the exact patient text typed — used to
  // prove each answer (especially plain/natural negatives) was recorded.
  const answered: Array<{ q: IntakeQuestion; answer: string }> = [];

  const MAX_TURNS = 25;

  // Turn 0 — chief complaint.
  let captured = await send(phone, "chest pain", `${name}-0`);
  lastAnswers = peekAnswers(phone) ?? lastAnswers;
  let botQ = identifyQuestion(captured.find(identifyQuestion) ?? captured[captured.length - 1] ?? "");
  transcript.push({ turn: 0, patient: "chest pain", botMsgs: captured, question: botQ });
  scanSafety(captured, 0);

  let turn = 0;
  while (turn < MAX_TURNS) {
    if (!botQ) {
      // No question this turn. Acceptable ONLY if intake closed cleanly.
      const closed = captured.some(isClosing);
      if (!closed) {
        failures.push(
          `turn ${turn}: bot sent no recognizable intake question and did not close cleanly. ` +
          `Messages: ${JSON.stringify(captured.map(stripFooter))}`,
        );
      }
      break;
    }

    // Loop detection — has this question (id or exact text) been asked before?
    if (askedById.has(botQ.id)) {
      failures.push(
        `LOOP: question "${botQ.text}" (id=${botQ.id}) asked again on turn ${turn} ` +
        `(first asked turn ${askedById.get(botQ.id)}).`,
      );
    } else {
      askedById.set(botQ.id, turn);
    }
    if (askedByText.has(botQ.text)) {
      if (!failures.some((f) => f.includes(botQ!.id))) {
        failures.push(`LOOP: identical question text repeated on turn ${turn}: "${botQ.text}"`);
      }
    } else {
      askedByText.set(botQ.text, turn);
    }

    sections.add(botQ.section);
    if (botQ.section === "medications") reachedMeds = true;

    // Answer the question the bot just asked.
    const answer = strat(botQ, nthAnswer++);
    answered.push({ q: botQ, answer });
    turn += 1;
    captured = await send(phone, answer, `${name}-${turn}`);
    lastAnswers = peekAnswers(phone) ?? lastAnswers;
    scanSafety(captured, turn);

    const nextQ = identifyQuestion(captured.find(identifyQuestion) ?? captured[captured.length - 1] ?? "");
    transcript.push({ turn, patient: answer, botMsgs: captured, question: nextQ });

    if (!nextQ) {
      const closed = captured.some(isClosing);
      if (closed) {
        // Intake ended cleanly right after the last question was answered.
        break;
      }
      failures.push(
        `turn ${turn}: after answering "${botQ.text}" the bot asked no new question and did not close. ` +
        `Messages: ${JSON.stringify(captured.map(stripFooter))}`,
      );
      break;
    }
    botQ = nextQ;
  }

  if (turn >= MAX_TURNS) {
    failures.push(`STUCK: exceeded ${MAX_TURNS} turns without completing intake.`);
  }

  // Assertion 2 — all six sections reached + medications + clean close.
  for (const s of INTAKE_SECTIONS) {
    if (!sections.has(s)) failures.push(`MISSING SECTION: never reached "${s}".`);
  }
  if (!reachedMeds) failures.push(`MISSING: never reached the medications section.`);
  if (!transcript.some((t) => t.botMsgs.some(isClosing))) {
    failures.push(`MISSING: intake never ended with a clean closing message.`);
  }

  // Assertion 5 (ROOT CAUSE) — every answer was RECORDED and PERSISTED in the
  // real session store between turns. This is the exact failure that produced
  // the legacy loop: a negative ("No"/"nope"/"none that I know of") that did
  // not mark its question answered. We read the live hot session, not the
  // simulator's own bookkeeping. The final medications turn closes (and deletes)
  // the session, so its field is verified via the clean close above; every
  // earlier question's field must be present and non-empty here.
  const recorded = lastAnswers ?? {};
  const isNegStrategy = strategyKey === "all_no" || strategyKey === "natural_negatives";
  for (const { q, answer } of answered) {
    if (q.field === "medications") continue; // session already deleted on close
    const v = recorded[q.field];
    if (v === undefined || v === null || String(v).trim() === "") {
      failures.push(
        `UNRECORDED ANSWER: patient answered "${answer}" to ${q.section}/${q.id} ` +
        `but field "${q.field}" was not persisted in the session store (got ${JSON.stringify(v)}). ` +
        `This is the loop root cause.`,
      );
      continue;
    }
    if (isNegStrategy) {
      const expected = q.section === "allergies" || q.section === "medications" ? "none" : "no";
      if (String(v) !== expected) {
        failures.push(
          `NEGATIVE NOT NORMALIZED: "${answer}" → ${q.section}/${q.id} recorded as ` +
          `${JSON.stringify(v)}, expected ${JSON.stringify(expected)}.`,
        );
      }
    }
  }

  function scanSafety(msgs: string[], turnIdx: number) {
    for (const m of msgs) {
      if (looksLikeEscalation(m)) {
        failures.push(`ESCALATION during intake on turn ${turnIdx}: "${stripFooter(m)}"`);
      }
      if (looksLikeRegreet(m, turnIdx)) {
        failures.push(`RESET/RE-GREET during intake on turn ${turnIdx}: "${stripFooter(m)}"`);
      }
    }
  }

  return { name, transcript, failures, reachedMeds, sections, recorded };
}

// ── reporting ─────────────────────────────────────────────────────────────────

function printConversation(r: ConvoResult): boolean {
  const pass = r.failures.length === 0;
  console.log(`\n${"═".repeat(72)}`);
  console.log(`ANSWER SET: ${r.name}    ${pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log("─".repeat(72));
  for (const t of r.transcript) {
    console.log(`  [turn ${t.turn}] patient → ${JSON.stringify(t.patient)}`);
    for (const m of t.botMsgs) {
      const body = stripFooter(m).replace(/\n+/g, " ⏎ ");
      const tag = t.question && stripFooter(m).includes(t.question.text)
        ? `  «${t.question.section}/${t.question.id}»`
        : "";
      console.log(`            bot → ${JSON.stringify(body)}${tag}`);
    }
  }
  console.log("─".repeat(72));
  const qIds = r.transcript.map((t) => t.question?.id).filter(Boolean);
  console.log(`  questions asked (in order): ${qIds.join(" → ")}`);
  console.log(`  unique questions: ${new Set(qIds).size} / total asked: ${qIds.length}`);
  console.log(`  sections reached: ${[...r.sections].join(", ")}`);
  console.log(`  reached medications: ${r.reachedMeds}`);
  console.log(`  persisted answers (from real session store): ${JSON.stringify(r.recorded)}`);
  if (!pass) {
    console.log(`  FAILURES:`);
    for (const f of r.failures) console.log(`    • ${f}`);
  }
  return pass;
}

async function main() {
  console.log("CHEST-PAIN INTAKE SIMULATOR — driving the real WhatsApp handler (handleWhatsAppKBIntake)");
  const sets = ["all_no", "all_yes", "mixed", "natural_negatives"];
  const results: ConvoResult[] = [];
  for (const s of sets) {
    results.push(await runConversation(s, s));
  }

  let allPass = true;
  for (const r of results) {
    const pass = printConversation(r);
    allPass = allPass && pass;
  }

  console.log(`\n${"═".repeat(72)}`);
  console.log(`OVERALL: ${allPass ? "✅ ALL ANSWER SETS PASS" : "❌ ONE OR MORE ANSWER SETS FAILED"}`);
  console.log("═".repeat(72));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("SIMULATOR CRASHED:", e);
  process.exit(2);
});

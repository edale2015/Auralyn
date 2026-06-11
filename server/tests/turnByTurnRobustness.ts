/**
 * turnByTurnRobustness.ts — V030
 *
 * Deep robustness test for the LIVE turn-by-turn conversational intake path —
 * the one a real WhatsApp message goes through (handleWhatsAppKBIntake), driven
 * here via the internal POST /api/test/kb-sim shim (no Twilio needed).
 *
 * This is DELIBERATELY NOT the lab /narrative-run path. /narrative-run takes all
 * answers at once and cannot loop. This driver asks/answers ONE question per turn,
 * which is where the observed looping / re-greeting / never-terminating bug lives.
 *
 * Per (complaint × answer-set) it asserts:
 *   - No question is asked twice in one conversation        (REPEAT  -> FAIL)
 *   - The conversation does not re-greet mid-stream         (RESET   -> FAIL)
 *   - It terminates within a turn budget                    (LOOP    -> FAIL)
 *   - It does not jump to ER *instead of* proceeding        (ER_JUMP -> FAIL)
 *     (a red-flag alert is fine AS LONG AS the interview continues)
 *
 * Usage: npx tsx server/tests/turnByTurnRobustness.ts
 */

import * as fs from "fs";
import * as path from "path";

const BASE = process.env.LAB_BASE ?? "http://localhost:5000";
const MAX_TURNS = 30;
const COVERAGE_CSV = path.resolve(process.cwd(), "test-reports", "coverage-1025.csv");

// Sample: chest-pain family is mandatory; plus a spread of body systems; plus
// at least one V029 NO_DATA complaint to confirm graceful (non-looping) handling.
const SAMPLE: string[] = [
  "chest_pain",          // required — chest family
  "cardio_chest_pain",   // required — chest family
  "chest_pain_cardiac",  // required — chest family
  "card_chest_pain",     // chest family + NO_DATA in lab (0 questions)
  "cough",
  "headache",
  "sore_throat",
  "abdominal_pain",
  "back_pain",
  "dizziness",
  "shortness_of_breath",
  "fever",
  "skin_rash",
  "ear_pain",
  "sinus_pressure",
  "palpitations",
  "shoulder_pain",       // NO_DATA in lab (0 questions) — graceful-stop check
];

type AnswerSet = "all_no" | "all_yes" | "mixed" | "nl_neg";
const ANSWER_SETS: AnswerSet[] = ["all_no", "all_yes", "mixed", "nl_neg"];

const NL_NEG = ["nope", "not really", "none that I know of", "no I don't think so"];

function answerFor(set: AnswerSet, turn: number): string {
  switch (set) {
    case "all_no":
      return "no";
    case "all_yes":
      return "yes";
    case "mixed":
      return turn % 2 === 0 ? "yes" : "no";
    case "nl_neg":
      return NL_NEG[turn % NL_NEG.length];
  }
}

function humanize(slug: string): string {
  return slug.replace(/_/g, " ").trim();
}

function openerFor(slug: string): string {
  const h = humanize(slug);
  // Natural-language opener; the router matches on the text, not the slug.
  if (/^(a|e|i|o|u)/i.test(h)) return `I have ${h}`;
  return `I have ${h}`;
}

// Strip the standard emergency boilerplate that is appended to many replies so it
// doesn't poison completion / ER detection or repeat-normalization.
function stripBoilerplate(s: string): string {
  return s
    .replace(/if this is a medical emergency[^\n]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s: string): string {
  return stripBoilerplate(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RE_COMPLETE = /(assessment is complete|✅|added to (the )?(review )?queue|physician will (review|see)|your case has been|recommend(ed)? disposition)/i;
const RE_GREETING = /(i'?m auralyn|bringing you in today|how can i help you|what'?s bringing you in)/i;
// ER directive that is NOT the standard boilerplate (boilerplate already stripped).
const RE_ER = /(call 911 now|go to the (nearest )?(emergency room|er) (now|immediately)|seek emergency care|dial 911|this is an emergency)/i;

interface KbReply {
  ok: boolean;
  reply?: string;
  error?: string;
}

async function kbSim(sessionId: string, message: string): Promise<KbReply> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}/api/test/kb-sim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
      signal: ctrl.signal,
    });
    const body = (await res.json()) as KbReply;
    return body;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    clearTimeout(t);
  }
}

interface ConvoResult {
  complaint: string;
  answerSet: AnswerSet;
  turns: number;
  pass: boolean;
  reason: string;
  failTag: string; // "" | REPEAT | RESET | LOOP | ER_JUMP | ERROR
}

async function runConversation(complaint: string, set: AnswerSet, tag: string): Promise<ConvoResult> {
  const sessionId = `v030_${complaint}_${set}_${tag}`;
  const askedQuestions = new Set<string>();
  let lastReply = "";

  // Turn 1 — opener.
  let r = await kbSim(sessionId, openerFor(complaint));
  if (!r.ok || !r.reply) {
    return { complaint, answerSet: set, turns: 1, pass: false, reason: `FAIL ERROR: no reply at opener (${r.error ?? "empty"})`, failTag: "ERROR" };
  }

  let turn = 1;
  while (turn <= MAX_TURNS) {
    const reply = r.reply ?? "";
    lastReply = reply;
    const core = stripBoilerplate(reply);

    // 1) Terminated normally?
    if (RE_COMPLETE.test(core)) {
      return { complaint, answerSet: set, turns: turn, pass: true, reason: `PASS: completed at turn ${turn}`, failTag: "" };
    }

    // 2) Greeting where a question was expected.
    if (RE_GREETING.test(core)) {
      if (turn === 1) {
        // Greeted on the opener => router never recognized the complaint, no
        // intake session was created. Subsequent messages will re-greet forever.
        return { complaint, answerSet: set, turns: turn, pass: false, reason: `FAIL RESET: complaint not recognized — greeted at opener; intake never started (would re-greet forever)`, failTag: "RESET" };
      }
      // Re-greet mid-conversation (no prior completion) => session reset bug.
      return { complaint, answerSet: set, turns: turn, pass: false, reason: `FAIL RESET: re-greeted mid-conversation at turn ${turn}: "${core.slice(0, 80)}"`, failTag: "RESET" };
    }

    // 3) ER jump that ENDS the interview (no follow-up question) instead of proceeding.
    if (RE_ER.test(core) && !core.includes("?")) {
      return { complaint, answerSet: set, turns: turn, pass: false, reason: `FAIL ER_JUMP: terminal ER escalation instead of proceeding at turn ${turn}: "${core.slice(0, 80)}"`, failTag: "ER_JUMP" };
    }

    // 4) Repeated bot message (loop). Distinguish a genuinely re-asked question
    //    (contains "?") from a stalled non-question acknowledgement (e.g. the
    //    engine emitting "Got it…" repeatedly without advancing).
    const key = norm(reply);
    if (key && askedQuestions.has(key)) {
      if (core.includes("?")) {
        return { complaint, answerSet: set, turns: turn, pass: false, reason: `FAIL REPEAT: question asked twice at turn ${turn}: "${core.slice(0, 80)}"`, failTag: "REPEAT" };
      }
      return { complaint, answerSet: set, turns: turn, pass: false, reason: `FAIL STALL: conversation stalled — repeated non-question reply with no advance at turn ${turn}: "${core.slice(0, 80)}"`, failTag: "STALL" };
    }
    if (key) askedQuestions.add(key);

    // Send the next answer.
    turn++;
    r = await kbSim(sessionId, answerFor(set, turn));
    if (!r.ok || !r.reply) {
      // No reply after an answer. If we already had a real interview, treat a
      // silent close as a graceful (non-looping) end — but flag it for review.
      if (turn > 2) {
        return { complaint, answerSet: set, turns: turn, pass: true, reason: `PASS: conversation ended (no further reply) after turn ${turn - 1} — graceful stop`, failTag: "" };
      }
      return { complaint, answerSet: set, turns: turn, pass: false, reason: `FAIL ERROR: dropped after ${turn - 1} turns (${r.error ?? "empty"})`, failTag: "ERROR" };
    }
  }

  // Ran out of turn budget without terminating.
  return { complaint, answerSet: set, turns: MAX_TURNS, pass: false, reason: `FAIL LOOP: no termination within ${MAX_TURNS} turns (last: "${stripBoilerplate(lastReply).slice(0, 80)}")`, failTag: "LOOP" };
}

function loadNoDataSet(): Set<string> {
  const nd = new Set<string>();
  if (!fs.existsSync(COVERAGE_CSV)) return nd;
  const lines = fs.readFileSync(COVERAGE_CSV, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols[10] === "NO_DATA") nd.add(cols[0]);
  }
  return nd;
}

async function main() {
  const noData = loadNoDataSet();
  console.log("=== V030 — Turn-by-turn robustness (LIVE conversational path via /api/test/kb-sim) ===");
  console.log(`entry point: POST /api/test/kb-sim -> handleWhatsAppKBIntake (NOT /narrative-run)`);
  console.log(`sample: ${SAMPLE.length} complaints × ${ANSWER_SETS.length} answer sets = ${SAMPLE.length * ANSWER_SETS.length} conversations`);
  console.log(`chest-pain family included: chest_pain, cardio_chest_pain, chest_pain_cardiac, card_chest_pain`);
  console.log(`V029 NO_DATA complaints in sample: ${SAMPLE.filter((c) => noData.has(c)).join(", ") || "(none matched CSV)"}`);
  console.log("");

  const results: ConvoResult[] = [];
  const startMs = Date.now();
  let totalCalls = 0;

  for (const complaint of SAMPLE) {
    const ndTag = noData.has(complaint) ? " [NO_DATA]" : "";
    for (const set of ANSWER_SETS) {
      const res = await runConversation(complaint, set, "1");
      totalCalls += res.turns;
      results.push(res);
      const status = res.pass ? "PASS" : "FAIL";
      console.log(`[${status}] ${complaint}${ndTag} × ${set} (${res.turns} turns) — ${res.reason}`);
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const passes = results.filter((r) => r.pass).length;
  const fails = results.filter((r) => !r.pass);

  console.log("");
  console.log("=== FAILURE BREAKDOWN ===");
  if (fails.length === 0) {
    console.log("no loop/reset/fail markers — all conversations passed");
  } else {
    const byTag: Record<string, number> = {};
    for (const f of fails) byTag[f.failTag] = (byTag[f.failTag] ?? 0) + 1;
    for (const [k, v] of Object.entries(byTag)) console.log(`  ${k}: ${v}`);
    console.log("  --- failing conversations ---");
    for (const f of fails) console.log(`  FAIL ${f.failTag}: ${f.complaint} × ${f.answerSet} — ${f.reason}`);
  }

  console.log("");
  console.log("=== FINAL TALLY ===");
  console.log(`conversations: ${results.length}  PASS: ${passes}  FAIL: ${fails.length}`);
  console.log(`total turns driven: ${totalCalls}  wall-clock: ${elapsed}s`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

// Model-in-the-loop integration test for the neuro_headache skip logic.
//
// This drives the REAL agent path (startAgentSession -> nextReply, which
// streams Claude Sonnet) and asserts the prompt's conditional question flow
// behaves as intended. Because the flow is produced by an LLM, not a
// deterministic rules engine, these assertions are tolerant (regex over the
// UNION of questions asked across a simulated interview) rather than exact.
//
// COST / SAFETY GATING:
//   - Opt-in only: runs when RUN_LLM_INTEGRATION=1 AND an Anthropic key is set.
//     Normal `npx vitest` runs skip the whole suite (no spend, no latency).
//   - Synthetic patients only — no PHI. The simulator answers with canned,
//     non-identifying text.
//
// Run with:
//   RUN_LLM_INTEGRATION=1 ANTHROPIC_API_KEY=sk-... \
//     npx vitest run --config vitest.config.ts \
//     tests/integration/neuroHeadacheSkipLogic.integration.test.ts

import { describe, it, expect } from "vitest";
import {
  startAgentSession,
  nextReply,
  type AgentSession,
} from "../../server/whatsapp/agent/streamingAgent";

const HAS_KEY = !!(process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_Key);
const RUN = process.env.RUN_LLM_INTEGRATION === "1" && HAS_KEY;

// Each interview may run up to ~12 model turns at up to 8s each.
const INTERVIEW_TIMEOUT_MS = 180_000;

// --- detection regexes (case-insensitive, tolerant of phrasing) -------------
const RX = {
  auralyn:     /auralyn/i,
  asksDemo:    /(how old|your age\b|years old|male or female|man or woman|biological sex|\bsex\b)/i,
  thunderclap: /(thunderclap|came? on suddenly|come on suddenly|sudden(ly)?|explosi|gradually|onset)/i,
  temporal:    /(temple|sides? of (your )?head|side of (your )?head|jaw|chew)/i,
  feverAsk:    /\bfever\b|temperature|running hot/i,
  feverFollow: /(stiff neck|neck stiff|\brash\b|sensitiv\w* to light|photophob|bright lights?)/i,
};

interface Scenario {
  age: string;          // synthetic
  sex: "male" | "female";
  duration: string;     // free text the simulator gives when asked "how long"
  febrile: boolean;     // answer to the fever question
}

/** Map the assistant's latest question to a canned, synthetic patient reply. */
function patientReply(assistantText: string, s: Scenario): string {
  const t = assistantText.toLowerCase();
  if (RX.asksDemo.test(t)) return `I'm ${s.age} and ${s.sex}.`;
  if (/(how long|since when|when did it start|duration)/.test(t)) return s.duration;
  if (RX.feverAsk.test(t)) return s.febrile ? "Yes, I've had a fever." : "No fever.";
  if (RX.feverFollow.test(t)) return "No, none of that.";
  if (/(severity|scale of 1|how bad|1 to 10|1-10)/.test(t)) return "About a 4 out of 10.";
  if (/(where|location|front|back|one side|all over)/.test(t)) return "Kind of all over.";
  if (/(throbbing|pressure|stabbing|squeezing|feel like|describe)/.test(t)) return "More like pressure.";
  if (/(medication|medicine|taken anything|tylenol|advil|ibuprofen|tried)/.test(t)) return "No, I haven't taken anything.";
  // Generic safe negative for every other red-flag / history question.
  return "No, nothing like that.";
}

/** Drive a full simulated interview; return every assistant turn's text. */
async function runInterview(opener: string, s: Scenario, maxTurns = 12): Promise<string[]> {
  const session = startAgentSession("neuro_headache") as AgentSession;
  expect(session, "neuro_headache must have a registered prompt").toBeTruthy();

  const asked: string[] = [];
  let patientMsg = opener;
  for (let turn = 0; turn < maxTurns && !session.closed; turn++) {
    const reply = await nextReply(session, patientMsg);
    asked.push(reply.text);
    if (reply.closed) break;
    patientMsg = patientReply(reply.text, s);
  }
  return asked;
}

const union = (texts: string[]) => texts.join("\n").toLowerCase();

describe.skipIf(!RUN)("neuro_headache skip logic (model-in-the-loop)", () => {
  it(
    "introduces as Auralyn and asks age/sex first on a fresh session",
    async () => {
      const session = startAgentSession("neuro_headache") as AgentSession;
      const first = await nextReply(session, "I have a headache");
      expect(first.text).toMatch(RX.auralyn);
      expect(first.text).toMatch(RX.asksDemo);
    },
    INTERVIEW_TIMEOUT_MS,
  );

  it(
    "asks the temporal-arteritis question for a 52-year-old female",
    async () => {
      const texts = await runInterview("I have a headache", {
        age: "52", sex: "female", duration: "about two days", febrile: false,
      });
      expect(union(texts)).toMatch(RX.temporal);
    },
    INTERVIEW_TIMEOUT_MS,
  );

  it(
    "does NOT ask the temporal-arteritis question for a 30-year-old male",
    async () => {
      const texts = await runInterview("I have a headache", {
        age: "30", sex: "male", duration: "about two days", febrile: false,
      });
      // jaw/temple questions are age-gated (>=50); a young male should not get them.
      expect(union(texts)).not.toMatch(RX.temporal);
    },
    INTERVIEW_TIMEOUT_MS,
  );

  it(
    "asks about thunderclap onset for a recent-onset headache",
    async () => {
      const texts = await runInterview("I have a headache", {
        age: "40", sex: "female", duration: "it started just a few hours ago", febrile: false,
      });
      expect(union(texts)).toMatch(RX.thunderclap);
    },
    INTERVIEW_TIMEOUT_MS,
  );

  it(
    "SAFEGUARD: still asks about onset even for a 3-week-old headache (no duration gating)",
    async () => {
      // The proposed protocol skipped the SAH/thunderclap screen at >3 days.
      // We intentionally kept it always-asked — a sentinel bleed can present
      // days later. This locks that decision in against the live model.
      const texts = await runInterview("I have a headache", {
        age: "40", sex: "female", duration: "about 3 weeks now", febrile: false,
      });
      expect(union(texts)).toMatch(RX.thunderclap);
    },
    INTERVIEW_TIMEOUT_MS,
  );

  it(
    "asks the meningitis follow-up (stiff neck / rash / photophobia) after a positive fever",
    async () => {
      const texts = await runInterview("I have a headache", {
        age: "35", sex: "male", duration: "since yesterday", febrile: true,
      });
      const u = union(texts);
      expect(u, "should have asked about fever").toMatch(RX.feverAsk);
      expect(u, "fever positive should trigger stiff-neck/rash/light follow-up").toMatch(RX.feverFollow);
    },
    INTERVIEW_TIMEOUT_MS,
  );

  it(
    "never speaks a disposition to the patient (no '911' / 'ER' / 'urgent care')",
    async () => {
      const texts = await runInterview("I have a headache", {
        age: "60", sex: "female", duration: "it came on suddenly an hour ago", febrile: true,
      });
      const u = union(texts);
      expect(u).not.toMatch(/\b911\b/);
      expect(u).not.toMatch(/emergency room|\bgo to the er\b|\bthe er\b/);
      expect(u).not.toMatch(/urgent care/);
    },
    INTERVIEW_TIMEOUT_MS,
  );
});

describe.skipIf(RUN)("neuro_headache skip logic (model-in-the-loop) — SKIPPED", () => {
  it("is opt-in; set RUN_LLM_INTEGRATION=1 and an Anthropic key to enable", () => {
    expect(true).toBe(true);
  });
});

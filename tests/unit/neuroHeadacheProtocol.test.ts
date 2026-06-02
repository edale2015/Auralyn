// Regression guards for the neuro_headache protocol.
//
// SCOPE NOTE: the question-flow skip logic (e.g. "age 52 female gets the
// temporal-arteritis question, 30-year-old male does not") lives in the LLM
// system prompt, not in deterministic code, so it cannot be exercised offline
// without a live model call. These tests instead lock in the safety INVARIANTS
// of the prompt text and the additive physician-packet content — i.e. the
// safeguards that must not silently regress.

import { describe, it, expect } from "vitest";
import {
  NEURO_HEADACHE_PROMPT,
  NEURO_HEADACHE_FALLBACK_QUESTIONS,
} from "../../server/whatsapp/agent/prompts/neuroHeadache";
import { NEURO_HEADACHE_KNOWLEDGE } from "../../server/whatsapp/agent/knowledge/neuroHeadache";

describe("neuro_headache prompt — physician-gate / disposition safeguards", () => {
  it("never instructs the LLM to give the patient a disposition", () => {
    // The LLM must never speak '911' / 'ER' / 'urgent care' to the patient.
    // The only place those appear is the explanation that a SEPARATE keyword
    // router handles them — assert no imperative directing the patient.
    expect(NEURO_HEADACHE_PROMPT).toMatch(/NEVER tell the patient where they need to go/i);
    expect(NEURO_HEADACHE_PROMPT).toMatch(/do not give a disposition under any circumstance/i);
    // The fixed handoff is the only sanctioned closing message.
    expect(NEURO_HEADACHE_PROMPT).toContain(
      "I'm sending your information to our care team right now",
    );
  });

  it("introduces as Auralyn and under no other name", () => {
    expect(NEURO_HEADACHE_PROMPT).toContain("Hi, I'm Auralyn!");
    expect(NEURO_HEADACHE_PROMPT).toMatch(/Never introduce yourself under any other name/i);
    expect(NEURO_HEADACHE_PROMPT.toLowerCase()).not.toContain("lollipop");
  });

  it("asks about thunderclap onset regardless of duration (no SAH screen gating)", () => {
    expect(NEURO_HEADACHE_PROMPT).toMatch(/regardless of how long it has lasted/i);
    expect(NEURO_HEADACHE_PROMPT).toMatch(/always ask about onset, even for longer-lasting headaches/i);
  });

  it("forbids demographic discounting of pulsatile tinnitus / eye pain / focal deficits", () => {
    expect(NEURO_HEADACHE_PROMPT).toMatch(
      /never dismiss or downgrade them based on the patient's age, sex, or body type/i,
    );
  });
});

describe("neuro_headache fallback questions — no patient-facing disposition", () => {
  it("contains no emergency-routing instruction to the patient", () => {
    const banned = [/\b911\b/i, /\bER\b/, /emergency room/i, /urgent care/i, /go to the/i];
    for (const q of NEURO_HEADACHE_FALLBACK_QUESTIONS) {
      for (const re of banned) {
        expect(q, `fallback question must not direct patient: "${q}"`).not.toMatch(re);
      }
    }
  });
});

describe("neuro_headache physician packet — cannot-miss differentials retained", () => {
  const names = NEURO_HEADACHE_KNOWLEDGE.differentials.map((d) => d.dx.toLowerCase());

  it.each([
    "subarachnoid hemorrhage",
    "bacterial meningitis",
    "giant cell arteritis",
    "idiopathic intracranial hypertension",
    "cerebral venous sinus thrombosis", // dropped by the proposed protocol; must stay
    "acute angle-closure glaucoma",
    "carbon monoxide poisoning",
    "preeclampsia / eclampsia",
    "ischemic stroke / tia",
  ])("retains differential: %s", (dx) => {
    expect(names.some((n) => n.includes(dx))).toBe(true);
  });

  it("keeps the demographic-discount warning in physician notes", () => {
    expect(
      NEURO_HEADACHE_KNOWLEDGE.physicianNotes.some((n) =>
        /regardless of patient sex, age, or body habitus/i.test(n),
      ),
    ).toBe(true);
  });
});

describe("neuro_headache physician packet — additive content", () => {
  it("carries the physician's pattern descriptions on common differentials", () => {
    const tension = NEURO_HEADACHE_KNOWLEDGE.differentials.find((d) =>
      /tension-type/i.test(d.dx),
    );
    expect(tension?.pattern).toMatch(/bilateral pressure/i);
  });

  it("includes the expanded physician-selectable treatment options", () => {
    const tx = NEURO_HEADACHE_KNOWLEDGE.treatments.join(" | ");
    expect(tx).toMatch(/ketorolac/i);
    expect(tx).toMatch(/metoclopramide|reglan/i);
    expect(tx).toMatch(/sumatriptan/i);
    expect(tx).toMatch(/cyclobenzaprine/i);
    expect(tx).toMatch(/methocarbamol/i);
  });

  it("notes no-imaging-indicated for migraine and tension patterns", () => {
    const wk = NEURO_HEADACHE_KNOWLEDGE.labsImaging.join(" | ");
    expect(wk).toMatch(/migraine pattern: no imaging/i);
    expect(wk).toMatch(/tension-type pattern: no imaging/i);
  });
});

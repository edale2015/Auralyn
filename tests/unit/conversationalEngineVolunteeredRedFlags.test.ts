/**
 * Regression suite for the volunteered-red-flag fix in conversationalEngine.
 *
 * A patient may state a red flag in their own words at ANY point — not only as
 * the answer to the exact question the engine pended. The deterministic keyword
 * extractor detects it from the patient's literal words; canExtractSafetyField
 * must then trust that keyword-sourced positive regardless of `pendingSafetyAsk`,
 * while the LLM path stays gated so the model cannot invent a red flag.
 *
 * A missed escalation is a patient-safety failure; an extra one is safe.
 */

import { describe, it, expect } from "vitest";
import {
  canExtractSafetyField,
  keywordExtract,
} from "../../server/whatsapp/conversationalEngine";

describe("canExtractSafetyField — volunteered red flags", () => {
  it("keyword source: accepts a volunteered red flag even when no question was pending", () => {
    // Patient volunteers cauda-equina red flag; pendingSafetyAsk is null.
    expect(
      canExtractSafetyField("msk_back_pain", "bowel_bladder", true, false, null, "keyword"),
    ).toBe(true);
  });

  it("keyword source: accepts a volunteered red flag that differs from the pended question", () => {
    // Engine pended about duration/fever, patient volunteers stiff neck.
    expect(
      canExtractSafetyField("neuro_headache", "stiff_neck", true, false, "fever", "keyword"),
    ).toBe(true);
  });

  it("llm source (default): still gated to the exact pended question", () => {
    // The model must NOT set a safety field it inferred from prose.
    expect(
      canExtractSafetyField("neuro_headache", "stiff_neck", true, false, "fever"),
    ).toBe(false);
    // ...but may confirm the field we actually asked about.
    expect(
      canExtractSafetyField("neuro_headache", "stiff_neck", true, false, "stiff_neck"),
    ).toBe(true);
  });

  it("never sets a safety field on the first message (no question asked yet)", () => {
    expect(
      canExtractSafetyField("neuro_headache", "stiff_neck", true, true, null, "keyword"),
    ).toBe(false);
  });
});

describe("keywordExtract — negation guards on trusted red-flag fields", () => {
  it("'no drooling' is NOT a volunteered positive", () => {
    const f = keywordExtract("sore_throat", "no drooling or muffled voice", null, false);
    expect(f.drooling).toBe(false);
  });

  it("volunteered drooling escalates", () => {
    const f = keywordExtract("sore_throat", "I am drooling and having trouble swallowing", null, false);
    expect(f.drooling).toBe(true);
  });

  it("'no sweating' does not set diaphoresis positive", () => {
    const f = keywordExtract("chest_pain", "no sweating or nausea", null, false);
    expect(f.diaphoresis).toBe(false);
  });
});

// BACKLOG: the volunteered-red-flag path is only as strong as the keyword
// regexes in _keywordExtract(). A red-flag field with NO keyword pattern — e.g.
// neuro_headache.neuro_deficit, which has no extractor branch — is still NOT
// caught deterministically when volunteered; it depends on the LLM path, which
// is (correctly) gated to pendingSafetyAsk. Before clinical use, audit EVERY
// safety:true field across COMPLAINT_GOALS and confirm each has a keyword
// pattern (with negation guard) in _keywordExtract, or document why it is
// acceptably covered elsewhere. Tracked, not blocking this fix.
it.todo("keyword-coverage audit: every safety:true field has a negation-guarded keyword pattern (e.g. neuro_deficit currently has none)");

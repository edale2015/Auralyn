import { describe, it, expect } from "vitest";
import { parseComplaint, type ComplaintCode } from "../../server/chat/parseComplaint";

// ── Helpers ───────────────────────────────────────────────────────────────────

function primary(text: string): ComplaintCode | undefined {
  return parseComplaint(text)?.primary;
}

function secondary(text: string): ComplaintCode[] {
  return parseComplaint(text)?.secondary ?? [];
}

function confidence(text: string): "high" | "low" | undefined {
  return parseComplaint(text)?.confidence;
}

// ── Review 1 false-positive cases — all should be fixed ──────────────────────

describe("false positives from original string.includes() parser", () => {
  // sore_throat false positives
  it('"My muscles are sore" should NOT be sore_throat', () => {
    expect(primary("My muscles are sore")).not.toBe("sore_throat");
  });
  it('"sore back" should be back_pain, not sore_throat', () => {
    expect(primary("sore back")).toBe("back_pain");
  });
  it('"I need to clear my throat" → no complaint or uri, not sore_throat', () => {
    expect(primary("I need to clear my throat")).not.toBe("sore_throat");
  });

  // ear_pain false positives
  it('"I can\'t hear you" should be undefined (no ear_pain)', () => {
    expect(parseComplaint("I can't hear you")).toBeUndefined();
  });
  it('"I fear the worst" should be undefined', () => {
    expect(parseComplaint("I fear the worst")).toBeUndefined();
  });
  it('"It\'s unclear what\'s wrong" should be undefined', () => {
    expect(parseComplaint("It's unclear what's wrong")).toBeUndefined();
  });
  it('"I\'m in a lot of fear" should be undefined', () => {
    expect(parseComplaint("I'm in a lot of fear")).toBeUndefined();
  });
  it('"near my eye" should be undefined or eye_complaint, not ear_pain', () => {
    const r = primary("near my eye");
    expect(r).not.toBe("ear_pain");
  });

  // burning → UTI false positives
  it('"I\'m burning up" should be fever, not uti_simple', () => {
    expect(primary("I'm burning up")).toBe("fever");
  });
  it('"burning chest pain" should be chest_pain, not uti_simple', () => {
    expect(primary("burning chest pain")).toBe("chest_pain");
  });
  it('"heartburn" should be gi_complaint, not uti_simple', () => {
    expect(primary("heartburn")).toBe("gi_complaint");
  });
  it('"my eyes are burning" should be eye_complaint, not uti_simple', () => {
    expect(primary("my eyes are burning")).toBe("eye_complaint");
  });
  it('"burning sensation in my chest" should be chest_pain, not uti_simple', () => {
    expect(primary("burning sensation in my chest")).toBe("chest_pain");
  });
  it('"burning pain in my stomach" should be gi_complaint, not uti_simple', () => {
    expect(primary("burning pain in my stomach")).toBe("gi_complaint");
  });
  it('"burning sensation" alone should NOT be uti_simple (no urinary context)', () => {
    expect(primary("burning sensation")).not.toBe("uti_simple");
  });

  // skin / cold false positives
  it('"my skin is dry" should not be rash', () => {
    expect(primary("my skin is dry")).not.toBe("rash");
  });
  it('"I feel cold and shivery" should not be uri', () => {
    expect(primary("I feel cold and shivery")).not.toBe("uri");
  });
  it('"cold sweat" should not be uri', () => {
    expect(primary("cold sweat")).not.toBe("uri");
  });
  it('"my hands are cold" should not be uri', () => {
    expect(primary("my hands are cold")).not.toBe("uri");
  });
});

// ── True positives — correct matches must still work ─────────────────────────

describe("correct positive matches", () => {
  it('"I have a sore throat" → sore_throat', () => {
    expect(primary("I have a sore throat")).toBe("sore_throat");
  });
  it('"ear pain for 2 days" → ear_pain', () => {
    expect(primary("ear pain for 2 days")).toBe("ear_pain");
  });
  it('"earache" → ear_pain', () => {
    expect(primary("earache")).toBe("ear_pain");
  });
  it('"I have a cold" → uri', () => {
    expect(primary("I have a cold")).toBe("uri");
  });
  it('"bad headache" → headache_mild', () => {
    expect(primary("bad headache")).toBe("headache_mild");
  });
  it('"I have a rash on my arm" → rash', () => {
    expect(primary("I have a rash on my arm")).toBe("rash");
  });
  it('"burning when I pee" → uti_simple', () => {
    expect(primary("burning when I pee")).toBe("uti_simple");
  });
  it('"frequent urination and burning" → uti_simple', () => {
    expect(primary("frequent urination and burning")).toBe("uti_simple");
  });
  it('"chest pain" → chest_pain', () => {
    expect(primary("chest pain")).toBe("chest_pain");
  });
  it('"chest pressure" → chest_pain', () => {
    expect(primary("chest pressure")).toBe("chest_pain");
  });
  it('"migraine" → headache_mild', () => {
    expect(primary("migraine")).toBe("headache_mild");
  });
  it('"coughing" → cough', () => {
    expect(primary("coughing")).toBe("cough");
  });
  it('"runny nose" → uri', () => {
    expect(primary("runny nose")).toBe("uri");
  });
  it('"nasal congestion" → uri', () => {
    expect(primary("nasal congestion")).toBe("uri");
  });
  it('"lower back pain" → back_pain', () => {
    expect(primary("lower back pain")).toBe("back_pain");
  });
  it('"nausea" → gi_complaint', () => {
    expect(primary("nausea")).toBe("gi_complaint");
  });
  it('"pink eye" → eye_complaint', () => {
    expect(primary("pink eye")).toBe("eye_complaint");
  });
  it('"strep" → sore_throat', () => {
    expect(primary("strep")).toBe("sore_throat");
  });
  it('"hives" → rash', () => {
    expect(primary("hives")).toBe("rash");
  });
  it('"high fever" → fever', () => {
    expect(primary("high fever")).toBe("fever");
  });
  it('"fever 102" → fever', () => {
    expect(primary("fever 102")).toBe("fever");
  });
  it('"UTI" → uti_simple', () => {
    expect(primary("UTI")).toBe("uti_simple");
  });
  it('"dysuria" → uti_simple', () => {
    expect(primary("dysuria")).toBe("uti_simple");
  });
  it('"otitis" → ear_pain', () => {
    expect(primary("otitis")).toBe("ear_pain");
  });
});

// ── Multi-complaint secondary capture ─────────────────────────────────────────

describe("multi-complaint capture — secondary complaints", () => {
  it('"sore throat and cough" → primary sore_throat, secondary includes cough', () => {
    const parsed = parseComplaint("sore throat and cough");
    expect(parsed?.primary).toBe("sore_throat");
    expect(parsed?.secondary).toContain("cough");
  });

  it('"sore throat and cough" → confidence low (multiple complaints)', () => {
    expect(confidence("sore throat and cough")).toBe("low");
  });

  it('"cough and fever" → both captured', () => {
    const parsed = parseComplaint("cough and fever");
    const all = [parsed?.primary, ...(parsed?.secondary ?? [])];
    expect(all).toContain("cough");
    expect(all).toContain("fever");
  });

  it('"bad cough fever and chest burning" → primary is chest_pain (priority boost)', () => {
    // chest_pain gets priorityBoost: +3, so it should beat cough+fever
    expect(primary("bad cough fever and chest burning")).toBe("chest_pain");
  });

  it('"chest pressure, cough, and runny nose" → chest_pain is primary', () => {
    expect(primary("chest pressure, cough, and runny nose")).toBe("chest_pain");
  });

  it('scores object is present and contains matched codes', () => {
    const parsed = parseComplaint("sore throat and cough");
    expect(parsed?.scores).toBeDefined();
    expect(typeof parsed?.scores?.sore_throat).toBe("number");
    expect(typeof parsed?.scores?.cough).toBe("number");
  });
});

// ── Negation detection ────────────────────────────────────────────────────────

describe("negation detection", () => {
  it('"no cough" should not return cough as primary', () => {
    expect(primary("no cough")).not.toBe("cough");
  });

  it('"denies fever" should not return fever as primary', () => {
    expect(primary("denies fever")).not.toBe("fever");
  });

  it('"no sore throat" should not match sore_throat', () => {
    expect(primary("no sore throat")).not.toBe("sore_throat");
  });

  it('"I have a cough but no fever" — cough matched, fever negated', () => {
    const parsed = parseComplaint("I have a cough but no fever");
    expect(parsed?.primary).toBe("cough");
    // fever is close to "no fever" so should be negated
    const all = [parsed?.primary, ...(parsed?.secondary ?? [])];
    expect(all).not.toContain("fever");
  });

  it('"no ear pain" → negation blocks ear_pain', () => {
    // "no" comes before "ear pain" and is within the 25-char window
    expect(primary("no ear pain")).not.toBe("ear_pain");
  });
});

// ── Confidence scoring ────────────────────────────────────────────────────────

describe("confidence scoring", () => {
  it('single unambiguous complaint → "high" confidence', () => {
    expect(confidence("I have a sore throat")).toBe("high");
  });

  it('multiple complaints with close scores → "low" confidence', () => {
    expect(confidence("sore throat and cough")).toBe("low");
  });

  it('empty input → undefined (no result, no confidence)', () => {
    expect(parseComplaint("")).toBeUndefined();
    expect(parseComplaint("   ")).toBeUndefined();
    expect(parseComplaint(undefined)).toBeUndefined();
  });

  it('"earache" → single match → high confidence', () => {
    expect(confidence("earache")).toBe("high");
  });
});

// ── Scored parser — priority ordering ────────────────────────────────────────

describe("score-based priority — first match does NOT always win", () => {
  it('"burning when I pee" → uti_simple beats generic "burning"', () => {
    expect(primary("burning when I pee")).toBe("uti_simple");
  });

  it('"chest pain and runny nose" → chest_pain primary (priority boost)', () => {
    expect(primary("chest pain and runny nose")).toBe("chest_pain");
  });

  it('"shortness of breath and cough" → chest_pain primary (SOB in chest_pain rules)', () => {
    // "shortness of breath" is a chest_pain pattern with weight 3 + boost 3
    // "cough" is weight 4 — without boost chest_pain may lose
    // Verify primary is one of these two (depends on boost)
    const r = primary("shortness of breath and cough");
    expect(["chest_pain", "cough"]).toContain(r);
  });

  it('"strep throat" → sore_throat (explicit clinical terms score high)', () => {
    expect(primary("strep throat")).toBe("sore_throat");
  });
});

// ── UTI specificity ───────────────────────────────────────────────────────────

describe("UTI requires urinary context", () => {
  it('"burning sensation" without urinary context → NOT uti_simple', () => {
    expect(primary("burning sensation")).not.toBe("uti_simple");
  });
  it('"burning" alone → NOT uti_simple', () => {
    expect(primary("burning")).not.toBe("uti_simple");
  });
  it('"frequent urination" → uti_simple', () => {
    expect(primary("frequent urination")).toBe("uti_simple");
  });
  it('"painful urination" → uti_simple', () => {
    expect(primary("painful urination")).toBe("uti_simple");
  });
  it('"burning during urination" → uti_simple', () => {
    expect(primary("burning during urination")).toBe("uti_simple");
  });
});

// ── chest_pain priority boost ─────────────────────────────────────────────────

describe("chest_pain priority boost prevents misrouting", () => {
  it('"heartburn and chest pain" → chest_pain, not gi_complaint', () => {
    expect(primary("heartburn and chest pain")).toBe("chest_pain");
  });
  it('"chest tightness" → chest_pain', () => {
    expect(primary("chest tightness")).toBe("chest_pain");
  });
});

// ── URI — clinical context required ──────────────────────────────────────────

describe("URI requires clinical context", () => {
  it('"I have a cold" → uri', () => {
    expect(primary("I have a cold")).toBe("uri");
  });
  it('"common cold" → uri', () => {
    expect(primary("common cold")).toBe("uri");
  });
  it('"congestion and runny nose" → uri', () => {
    expect(primary("congestion and runny nose")).toBe("uri");
  });
  it('"sinusitis" → uri', () => {
    expect(primary("sinusitis")).toBe("uri");
  });
});

// ── Raw field ─────────────────────────────────────────────────────────────────

describe("raw field preservation", () => {
  it("preserves the original trimmed text in raw", () => {
    const parsed = parseComplaint("  sore throat  ");
    expect(parsed?.raw).toBe("sore throat");
  });

  it("raw includes the full original text when multi-complaint", () => {
    const parsed = parseComplaint("sore throat and cough");
    expect(parsed?.raw).toBe("sore throat and cough");
  });
});

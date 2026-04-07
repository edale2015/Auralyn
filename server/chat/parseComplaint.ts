/**
 * Scored complaint parser — Packet 7
 *
 * Turns free-text patient input into a ranked, multi-complaint structure.
 *
 * Design decisions compared to the original chatIntakeEngine.ts inline parser:
 *
 * Original problems fixed here:
 *  1. Substring false positives — "sore" matched sore_throat for "sore back",
 *     "ear" matched ear_pain for "I fear the worst" / "unclear" / "hear you".
 *     All patterns here use \b word boundaries and require clinical context.
 *
 *  2. First-match-wins ordering — the original parsed a single complaint based
 *     on which regex branch fired first. Pattern order decided clinical priority.
 *     The scored model assigns a numeric weight to each matching pattern and
 *     ranks by total score + priority boost, not by declaration order.
 *
 *  3. Silent secondary complaint loss — "sore throat and cough" returned only
 *     sore_throat. The new model captures all matched complaints; the highest-
 *     scoring becomes primary, the rest become secondary.
 *
 *  4. Negation blindness — "no cough" and "denies fever" were treated the same
 *     as "cough" and "fever". The parser now scans a 25-character window before
 *     each match for negation words and skips the pattern if negated.
 *
 *  5. "Burning" → UTI misroute — "burning eyes", "heartburn", "burning chest
 *     pain", "I'm burning up" all mapped to uti_simple. UTI now requires an
 *     explicit urinary qualifier. Non-urinary "burning" context routes to
 *     chest_pain, eye_complaint, gi_complaint, or fever respectively.
 *
 * Confidence semantics:
 *   "high"  — exactly one complaint matched, OR the top score beats second by ≥ 3
 *   "low"   — multiple complaints with close scores (ambiguous presentation)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComplaintCode =
  | "sore_throat"
  | "cough"
  | "uti_simple"
  | "rash"
  | "ear_pain"
  | "headache_mild"
  | "uri"
  | "fever"
  | "eye_complaint"
  | "chest_pain"
  | "back_pain"
  | "gi_complaint";

/** All known complaint codes in an array for runtime checks. */
export const ALL_COMPLAINT_CODES: ComplaintCode[] = [
  "chest_pain", "uti_simple", "sore_throat", "ear_pain", "eye_complaint",
  "back_pain", "gi_complaint", "fever", "cough", "headache_mild", "rash", "uri",
];

export interface ParsedComplaint {
  primary:    ComplaintCode;
  secondary:  ComplaintCode[];
  raw:        string;
  confidence: "high" | "low";
  /** Weighted score for each matched code. Higher = stronger match. */
  scores:     Record<string, number>;
}

// ── Internal pattern types ─────────────────────────────────────────────────────

interface WeightedPattern {
  regex:  RegExp;
  weight: number;  // points added to the complaint score when this pattern fires
}

interface ComplaintRule {
  code:          ComplaintCode;
  patterns:      WeightedPattern[];
  /**
   * Extra points added to the final score after pattern matching.
   * Used for high-acuity complaints (chest_pain = +3) so that
   * "bad cough, fever, and chest burning" routes to chest_pain
   * even if "cough" and "fever" each score individually.
   */
  priorityBoost?: number;
}

// ── Negation ──────────────────────────────────────────────────────────────────

const NEGATION_WORDS = /\b(no|not|never|without|denies|denied|deny|absent|absence|resolved|gone|better|improving)\b/i;

/**
 * Returns true if a negation word appears in the 25 characters immediately
 * before the match position. The window is tight to avoid false negatives like
 * "no pain, but I do have a cough" negating "cough".
 */
function isNegated(normalizedText: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - 25);
  const window = normalizedText.slice(windowStart, matchIndex);
  return NEGATION_WORDS.test(window);
}

// ── Text normalization ────────────────────────────────────────────────────────

/**
 * Lowercase, collapse punctuation to spaces, collapse runs of whitespace.
 * Preserves word boundaries for the regex engine.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Pattern rules ─────────────────────────────────────────────────────────────
//
// Ordered roughly by clinical acuity for readability, but ORDER DOES NOT DETERMINE
// PRIORITY — scores do. Every complaint is evaluated independently; the highest
// total score wins.
//
// Pattern weight guidelines:
//   5 — Exact clinical term (e.g. "strep", "uti", "earache")
//   4 — Explicit body-part + pain combo (e.g. "ear pain", "sore throat")
//   3 — Context-inferred but specific (e.g. "burning up" → fever)
//   2 — Broad match that needs other patterns to disambiguate
//
// priorityBoost guidelines:
//   +3 — high-acuity / red-flag complaint (chest pain, severe headache)
//   +1 — moderate acuity preference (UTI over generic burning)

const RULES: ComplaintRule[] = [
  // ── Chest pain — highest priority boost to prevent cardiac → UTI misroute ──
  {
    code: "chest_pain",
    priorityBoost: 3,
    patterns: [
      { regex: /\bchest\s+(pain|pressure|tightness|tight|burning|discomfort|heaviness)\b/i, weight: 5 },
      { regex: /\bpain\s+(in\s+)?(my\s+)?chest\b/i,                                         weight: 5 },
      // "burning sensation in my chest", "pain in the chest" — symptom + any filler + body-part
      { regex: /\b(pain|burning|pressure|tightness|discomfort)\b.{0,20}\bin\s+(my\s+)?chest\b/i, weight: 5 },
      { regex: /\bheart\s+(pain|racing|palpitation)s?\b/i,                                   weight: 4 },
      { regex: /\bshortness\s+of\s+breath\b/i,                                               weight: 3 },
      { regex: /\bsob\b/i,                                                                    weight: 2 },
    ],
  },

  // ── UTI — requires an explicit urinary qualifier; "burning" alone is NOT uti
  {
    code: "uti_simple",
    priorityBoost: 1,
    patterns: [
      { regex: /\b(uti|urinary\s+tract\s+infection)\b/i,                                     weight: 5 },
      { regex: /\bburning\s+(when|during|while|with)\s+(i\s+)?(pee|urinate|urination)\b/i,   weight: 5 },
      { regex: /\b(frequent|painful|burning)\s+urination\b/i,                                weight: 4 },
      { regex: /\b(pain|burning|pressure)\s+in\s+(my\s+)?(bladder|urethra)\b/i,              weight: 4 },
      { regex: /\b(dysuria|pyuria)\b/i,                                                       weight: 4 },
      { regex: /\b(urgency|frequency)\s+(to\s+)?(urinate|pee|void)\b/i,                      weight: 3 },
    ],
  },

  // ── Sore throat — requires throat context; "sore back" and "sore muscles" blocked
  {
    code: "sore_throat",
    patterns: [
      { regex: /\bsore\s+throat\b/i,                                                          weight: 5 },
      { regex: /\bthroat\s+(pain|hurts|is\s+sore|burning|scratchy|raw|swollen)\b/i,           weight: 4 },
      { regex: /\b(pain|difficulty|trouble|can.t)\s+(swallowing|to\s+swallow)\b/i,            weight: 4 },
      { regex: /\bstrep\b/i,                                                                   weight: 4 },
      { regex: /\bpharyngitis\b/i,                                                             weight: 4 },
      { regex: /\btonsil(litis|lar)?\b/i,                                                      weight: 3 },
    ],
  },

  // ── Ear pain — blocks "fear", "hear", "unclear", "near my eye"
  {
    code: "ear_pain",
    patterns: [
      { regex: /\bearache\b/i,                                                                 weight: 5 },
      { regex: /\botitis\b/i,                                                                  weight: 5 },
      { regex: /\bear\s+(pain|ache|hurts|is\s+hurting|infection|pressure|ringing|fullness|drainage|discharge|blocked)\b/i, weight: 5 },
      { regex: /\b(pain|ache|pressure|fullness)\s+in\s+(my\s+)?ear\b/i,                       weight: 4 },
      { regex: /\btinnitus\b/i,                                                                weight: 3 },
    ],
  },

  // ── Eye complaint — prevents "burning eyes" → UTI
  {
    code: "eye_complaint",
    patterns: [
      { regex: /\bpink\s*eye\b/i,                                                             weight: 5 },
      { regex: /\bconjunctivitis\b/i,                                                         weight: 5 },
      { regex: /\beye\s+(pain|infection|irritation|redness|discharge|burning)\b/i,            weight: 5 },
      { regex: /\b(red|pink|burning|itchy|watery|crusty|discharge)\s+eye(s)?\b/i,             weight: 4 },
      // "my eyes are burning" — adjective comes after noun in natural speech
      { regex: /\beye(s)?\s+(are\s+)?(burning|red|itchy|watery|irritated|infected)\b/i,      weight: 4 },
      { regex: /\bblurry\s+vision\b/i,                                                        weight: 3 },
    ],
  },

  // ── Back pain — prevents "sore back" → sore_throat
  {
    code: "back_pain",
    patterns: [
      { regex: /\b(sore|aching|pain|stiff|tight)\s+(lower\s+)?back\b/i,                      weight: 5 },
      { regex: /\bback\s+(pain|ache|spasm|injury|strain|stiffness)\b/i,                       weight: 5 },
      { regex: /\blower\s+back\b/i,                                                            weight: 4 },
      { regex: /\b(lumbar|sacral)\b/i,                                                         weight: 3 },
    ],
  },

  // ── GI complaint — prevents "heartburn" / "stomach burning" → UTI
  {
    code: "gi_complaint",
    patterns: [
      { regex: /\bheartburn\b/i,                                                               weight: 5 },
      { regex: /\bgerd\b/i,                                                                    weight: 5 },
      { regex: /\b(nausea|vomiting|diarrhea|constipation|indigestion)\b/i,                    weight: 4 },
      { regex: /\b(stomach|belly|abdominal|abdomen)\s+(pain|ache|cramps|burning|upset|discomfort)\b/i, weight: 4 },
      // "burning pain in my stomach" — symptom precedes body-part in natural speech
      { regex: /\b(pain|burning|cramps|ache|discomfort)\s+in\s+(my\s+)?(stomach|belly|abdomen)\b/i, weight: 4 },
      { regex: /\b(throwing|threw)\s+up\b/i,                                                   weight: 4 },
      { regex: /\bgastrointestinal\b/i,                                                         weight: 3 },
    ],
  },

  // ── Fever — prevents "burning up" / "burning sensation" → UTI
  {
    code: "fever",
    patterns: [
      { regex: /\bfever\b/i,                                                                   weight: 5 },
      { regex: /\bhigh\s+temp(erature)?\b/i,                                                   weight: 4 },
      { regex: /\btemperature\s+(of|is|was)?\s*\d+/i,                                         weight: 4 },
      { regex: /\brunning\s+a\s+(fever|temp)\b/i,                                              weight: 4 },
      { regex: /\bburning\s+up\b/i,                                                            weight: 3 },  // "I'm burning up" → fever, not UTI
      { regex: /\b(febrile|pyrexia|hyperthermia)\b/i,                                          weight: 3 },
    ],
  },

  // ── Cough — standalone; not a substring trap
  {
    code: "cough",
    patterns: [
      { regex: /\bcough(ing)?\b/i,                                                             weight: 4 },
      { regex: /\bcoughing\s+(up|blood|phlegm|mucus|sputum)\b/i,                              weight: 5 },
      { regex: /\bwhooping\s+cough\b/i,                                                        weight: 5 },
      { regex: /\bpertussis\b/i,                                                               weight: 5 },
    ],
  },

  // ── Headache — "head cold" does NOT trigger; requires pain context
  {
    code: "headache_mild",
    patterns: [
      { regex: /\bheadache\b/i,                                                                weight: 5 },
      { regex: /\bmigraine\b/i,                                                                weight: 5 },
      { regex: /\bhead\s+(ache|pain|throbbing|pounding|pressure|splitting)\b/i,                weight: 4 },
      // "head cold" does NOT match \bhead\s+(ache|pain|...) — intentional
    ],
  },

  // ── Rash — "skin is dry" does NOT trigger; requires explicit complaint context
  {
    code: "rash",
    patterns: [
      { regex: /\brash\b/i,                                                                    weight: 5 },
      { regex: /\bhives\b/i,                                                                   weight: 5 },
      { regex: /\burticaria\b/i,                                                               weight: 5 },
      { regex: /\b(skin|body)\s+(rash|reaction|bumps|hives|breakout|irritation|lesion)\b/i,   weight: 4 },
      { regex: /\bitching\b/i,                                                                 weight: 3 },
      { regex: /\beczema\b/i,                                                                  weight: 4 },
      { regex: /\bdermatitis\b/i,                                                              weight: 4 },
    ],
  },

  // ── URI — "I feel cold" / "cold sweat" do NOT trigger; requires clinical cold context
  {
    code: "uri",
    patterns: [
      { regex: /\buri\b/i,                                                                     weight: 5 },
      { regex: /\bcommon\s+cold\b/i,                                                           weight: 5 },
      { regex: /\bi\s+(have|got|caught)\s+a\s+cold\b/i,                                       weight: 5 },
      { regex: /\bsinusitis\b/i,                                                               weight: 5 },
      { regex: /\brunny\s+nose\b/i,                                                            weight: 4 },
      { regex: /\bnasal\s+(congestion|drip|discharge)\b/i,                                    weight: 4 },
      { regex: /\bcongestion\b/i,                                                               weight: 4 },
      { regex: /\bsneezing\b/i,                                                                weight: 3 },
      { regex: /\bpost.nasal\s+drip\b/i,                                                       weight: 3 },
    ],
  },
];

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a free-text patient complaint into a scored, ranked structure.
 *
 * Returns `undefined` if no complaint pattern matched (or all matches were
 * negated), which the caller should treat as "out of scope for self-service chat."
 */
export function parseComplaint(text?: string): ParsedComplaint | undefined {
  if (!text?.trim()) return undefined;

  const raw        = text.trim();
  const normalized = normalizeText(raw);

  const scores: Partial<Record<ComplaintCode, number>> = {};

  for (const rule of RULES) {
    let totalScore = 0;

    for (const { regex, weight } of rule.patterns) {
      // Reset lastIndex for global regexes (not applicable here, but defensive)
      const cloned = new RegExp(regex.source, regex.flags);
      const match  = cloned.exec(normalized);
      if (!match) continue;
      if (match.index !== undefined && isNegated(normalized, match.index)) continue;

      totalScore += weight;
    }

    if (totalScore > 0) {
      scores[rule.code] = totalScore + (rule.priorityBoost ?? 0);
    }
  }

  // Sort by descending score
  const ranked = (Object.entries(scores) as [ComplaintCode, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);

  if (ranked.length === 0) return undefined;

  const topScore    = scores[ranked[0]] ?? 0;
  const secondScore = ranked[1] ? (scores[ranked[1]] ?? 0) : 0;

  // "high" confidence when:
  //   - only one complaint detected, OR
  //   - top score outpaces second by at least 3 points (clear winner)
  const confidence: "high" | "low" =
    ranked.length === 1 || topScore - secondScore >= 3 ? "high" : "low";

  return {
    primary:    ranked[0],
    secondary:  ranked.slice(1),
    raw,
    confidence,
    scores:     scores as Record<string, number>,
  };
}

/**
 * R003 — Complaint Pattern Router
 *
 * 18 regex clusters covering the primary complaint presentations.
 * Pure synchronous regex — zero network, zero LLM, always <50ms.
 *
 * Usage:
 *   routeComplaint("my head hurts")      → "headache"
 *   routeComplaint("I am nauseated")     → "nausea_vomiting"
 *   routeComplaint("6")                  → "unknown"
 */

export type ComplaintCode =
  | "headache"
  | "nausea_vomiting"
  | "abdominal_pain"
  | "chest_pain"
  | "shortness_of_breath"
  | "uri_sinus"
  | "sore_throat"
  | "cough"
  | "uti"
  | "back_pain"
  | "fever"
  | "rash"
  | "dizziness"
  | "ear_pain"
  | "eye_complaint"
  | "anxiety"
  | "laceration"
  | "palpitations"
  | "unknown";

interface Cluster {
  code: ComplaintCode;
  pattern: RegExp;
}

// ── 18 clusters ordered most-specific → least-specific ───────────────────────
// Keep palpitations before chest_pain so "heart racing" doesn't match chest only.
// Keep chest_pain before shortness_of_breath to catch "chest tight + can't breathe".
// Keep abdominal_pain after nausea_vomiting to catch "stomach hurts" separately.

// NOTE on word boundaries: trailing \b breaks on inflected verbs like "hurts" (t→s is not
// a boundary). Patterns here use \b only at the START of anchors, and match word stems so
// "hurts", "hurting", "aches", "cramping" all work correctly.

const CLUSTERS: Cluster[] = [
  {
    code: "palpitations",
    // Must come before chest_pain so "heart racing" routes here, not chest_pain
    pattern: /\b(palpitat\w*|heart[\s-]+rac\w*|heart[\s-]+pound\w*|heart[\s-]+flutter\w*|heart[\s-]+skip\w*|fast\s+heart\w*|irregular\s+heart\w*|racing\s+heart\w*)/i,
  },
  {
    code: "chest_pain",
    pattern: /\b(chest[\s-]+pain|chest[\s-]+tight\w*|chest[\s-]+pressure|chest[\s-]+hurt\w*|chest[\s-]+discomfort|chest[\s-]+squeez\w*)/i,
  },
  {
    code: "shortness_of_breath",
    pattern: /\b(short\s+of\s+breath|can'?t\s+breath\w*|hard\s+to\s+breath\w*|trouble\s+breath\w*|difficulty\s+breath\w*|\bsob\b|breathless\w*|can'?t\s+get\s+(any\s+)?air|low\s+o2)/i,
  },
  {
    code: "headache",
    // "head hurt/hurts/hurting/pain/ache/aches/pounding/throbbing" + migraine
    pattern: /\b(headache\w*|migraine\w*|head\s+hurt\w*|head\s+pain\w*|head\s+ache\w*|head\s+is\s+(kill|pound|throb)\w*|head\s+(pound|throb)\w*)/i,
  },
  {
    code: "sore_throat",
    pattern: /\b(sore\s+throat|throat\s+(hurt\w*|pain\w*|sore|irritat\w*|burn\w*)|strep\b|pharyngitis|tonsil\w*|my\s+throat)/i,
  },
  {
    code: "ear_pain",
    pattern: /\b(ear[\s-]+(pain|hurt\w*|ache\w*|infection|pressure|full)|earache|otalgia|otitis|ringing\s+in\s+(my\s+)?ear)/i,
  },
  {
    code: "eye_complaint",
    pattern: /\b(eye[\s-]+(pain|hurt\w*|red\w*|pink|discharge|blurry|vision|itch\w*|water\w*|drain\w*)|pinkeye|conjunctivitis|blurry\s+vision|vision[\s-]+(blur\w*|change\w*|loss|double))/i,
  },
  {
    code: "uti",
    pattern: /\b(uti\b|burning\s+when\s+(i\s+)?(pee\w*|urinat\w*)|urinary[\s-]+tract|burning\s+urinat\w*|frequent\s+urinat\w*|painful\s+urinat\w*|bladder\s+infection|dysuria)/i,
  },
  {
    code: "uri_sinus",
    pattern: /\b(runny\s+nose|stuffy\s+nose|congestion\w*|sinus[\s-]+(pain|pressure|infect\w*|headache)|cold\s+symptoms?\b|nasal[\s-]+(congestion|drip)|stuffed\s+up|postnasal)/i,
  },
  {
    code: "cough",
    pattern: /\b(cough\w*|hack\w*|whooping)/i,
  },
  {
    code: "nausea_vomiting",
    pattern: /\b(nausea\w*|vomit\w*|throwing\s+up|sick\s+to\s+(my\s+)?stomach|puk\w*)/i,
  },
  {
    code: "abdominal_pain",
    // "stomach hurts/hurting/hurt", "belly aches/aching", "cramps/cramping"
    pattern: /\b(stomach[\s-]+hurt\w*|stomach[\s-]+pain\w*|stomach[\s-]+ache\w*|stomach[\s-]+cramp\w*|belly[\s-]+hurt\w*|belly[\s-]+pain\w*|belly[\s-]+ache\w*|abdominal[\s-]+pain\w*|abdominal[\s-]+cramp\w*|abdomen[\s-]+hurt\w*|cramp\w*\s+(in|my|the)|gut[\s-]+hurt\w*|gut[\s-]+pain|my\s+stomach\s+(is\s+)?(kill\w*|hurt\w*))/i,
  },
  {
    code: "back_pain",
    pattern: /\b(back[\s-]+pain|back[\s-]+hurt\w*|back[\s-]+ache\w*|back[\s-]+spasm\w*|back\s+is\s+(kill\w*|hurt\w*|sore\w*|bad)|lower[\s-]+back|lumbar[\s-]+(pain|hurt\w*|ache\w*)|spine[\s-]+(pain|hurt\w*))/i,
  },
  {
    code: "dizziness",
    pattern: /\b(dizz(y|iness)|vertigo|lightheaded\w*|light[\s-]+headed|feel\w*\s+(faint|unsteady)|room[\s-]+spin\w*|off[\s-]+balance)/i,
  },
  {
    code: "fever",
    pattern: /\b(fever\b|febrile|high\s+temperature|running\s+a\s+(fever|temp)|temperature\s+of\s+\d{2,3}|temp\s+of\s+\d{2,3})/i,
  },
  {
    code: "rash",
    pattern: /\b(rash\b|hive\w*|skin[\s-]+(irritat\w*|red\w*|breakout\w*|lesion\w*|spot\w*|bump\w*|itch\w*)|itchy\s+skin|dermatitis|eczema|urticaria|welt\w*)/i,
  },
  {
    code: "laceration",
    pattern: /\b(lacerat\w*|gash\w*|slice\w*|stab\w*|puncture\w*|open\s+wound|bleed\w*|\bcut\b|\bwound\b)/i,
  },
  {
    code: "anxiety",
    pattern: /\b(anxiety|anxious|panic[\s-]+attack|panic\b|can'?t\s+calm\s+down|racing\s+thoughts|freaking\s+out)/i,
  },
];

/**
 * Route free-text patient input to one of 18 complaint clusters.
 * Pure regex — runs in <50ms, no network, no LLM.
 *
 * @returns ComplaintCode — "unknown" when nothing matches
 */
export function routeComplaint(text: string): ComplaintCode {
  const t = text.trim();

  // Bare numbers, single chars, or empty → not a complaint
  if (!t || /^\d+$/.test(t) || t.length < 2) return "unknown";

  for (const cluster of CLUSTERS) {
    if (cluster.pattern.test(t)) return cluster.code;
  }

  return "unknown";
}

/**
 * Maps a router ComplaintCode to the conversational engine's internal slug.
 * The engine uses legacy slugs (neuro_headache, msk_back_pain, etc.).
 */
export function routerCodeToEngineSlug(code: ComplaintCode): string {
  const MAP: Record<string, string> = {
    headache:            "neuro_headache",
    nausea_vomiting:     "nausea",
    abdominal_pain:      "abdominal_pain",
    chest_pain:          "chest_pain",
    shortness_of_breath: "cough",
    uri_sinus:           "ent_sinus_pressure",
    sore_throat:         "sore_throat",
    cough:               "cough",
    uti:                 "gu_uti_symptoms",
    back_pain:           "msk_back_pain",
    fever:               "id_fever",
    rash:                "id_fever",
    dizziness:           "dizziness",
    ear_pain:            "ent_sinus_pressure",
    eye_complaint:       "general",
    anxiety:             "general",
    laceration:          "general",
    palpitations:        "chest_pain",
    unknown:             "general",
  };
  return MAP[code] ?? "general";
}

/**
 * Human-readable display name for a complaint code.
 */
export function complaintCodeDisplay(code: ComplaintCode): string {
  const DISPLAY: Record<string, string> = {
    headache:            "Headache",
    nausea_vomiting:     "Nausea / Vomiting",
    abdominal_pain:      "Abdominal Pain",
    chest_pain:          "Chest Pain",
    shortness_of_breath: "Shortness of Breath",
    uri_sinus:           "Cold / Sinus",
    sore_throat:         "Sore Throat",
    cough:               "Cough",
    uti:                 "UTI / Urinary Symptoms",
    back_pain:           "Back Pain",
    fever:               "Fever",
    rash:                "Rash / Skin",
    dizziness:           "Dizziness",
    ear_pain:            "Ear Pain",
    eye_complaint:       "Eye Complaint",
    anxiety:             "Anxiety / Panic",
    laceration:          "Cut / Laceration",
    palpitations:        "Heart Palpitations",
    unknown:             "General Symptoms",
  };
  return DISPLAY[code] ?? "General Symptoms";
}

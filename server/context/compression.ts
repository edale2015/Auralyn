export interface ClinicalMessage {
  role:    "system" | "user" | "assistant" | "tool";
  content: string | unknown;
}

export interface ClinicalSummary {
  chief_complaint:  string | null;
  key_symptoms:     string[];
  red_flags:        string[];
  negatives:        string[];
  timeline:         string | null;
  positives:        string[];
}

const COMPRESSION_THRESHOLD = 20;

function extractField(messages: ClinicalMessage[], key: string): string | null {
  for (const m of messages) {
    if (typeof m.content !== "string") continue;
    const lower = m.content.toLowerCase();
    if (lower.includes(key.replace("_", " ")) || lower.includes(key)) {
      const match = m.content.match(new RegExp(`${key}[:\\s]+([^.\\n]+)`, "i"));
      if (match) return match[1].trim();
    }
  }
  return null;
}

function extractList(messages: ClinicalMessage[], keywords: string[]): string[] {
  const found: string[] = [];
  for (const m of messages) {
    if (typeof m.content !== "string") continue;
    for (const kw of keywords) {
      if (m.content.toLowerCase().includes(kw.toLowerCase())) {
        found.push(kw);
      }
    }
  }
  return [...new Set(found)];
}

const RED_FLAG_KEYWORDS = [
  "stridor", "drooling", "unable_to_swallow", "respiratory_distress",
  "altered_mental_status", "trismus", "neck_stiffness", "red_flag",
  "emergency", "911", "severe", "peritonsillar",
];

const SYMPTOM_KEYWORDS = [
  "fever", "cough", "exudate", "sore throat", "nodes", "rash",
  "dysphagia", "odynophagia", "fatigue", "myalgia",
];

export function buildClinicalSummary(messages: ClinicalMessage[]): ClinicalSummary {
  return {
    chief_complaint: extractField(messages, "complaint") ?? extractField(messages, "chief"),
    key_symptoms:    extractList(messages, SYMPTOM_KEYWORDS),
    red_flags:       extractList(messages, RED_FLAG_KEYWORDS),
    negatives:       extractList(messages, ["no ", "denies", "without", "absent"]),
    positives:       extractList(messages, ["yes", "positive", "present", "confirmed"]),
    timeline:        extractField(messages, "onset") ?? extractField(messages, "duration"),
  };
}

export function compressClinicalContext(messages: ClinicalMessage[]): ClinicalMessage[] {
  if (messages.length < COMPRESSION_THRESHOLD) return messages;

  const summary = buildClinicalSummary(messages);

  return [
    {
      role:    "system",
      content: `[CLINICAL SUMMARY — auto-compressed]\n${JSON.stringify(summary, null, 2)}`,
    },
    ...messages.slice(-6),
  ];
}

export function compressContext(messages: ClinicalMessage[]): ClinicalMessage[] {
  return compressClinicalContext(messages);
}

const URGENT_VARIANTS = new Set([
  "urgent_or_ed", "urgent", "ed", "er", "emergency", "emergent",
  "urgent_or_er", "go_to_ed", "go_to_er", "seek_emergency", "call_911"
]);

const ROUTINE_VARIANTS = new Set([
  "routine", "supportive", "self_care", "self_care_with_precautions",
  "routine_or_supportive", "home_care", "monitor", "watchful_waiting"
]);

export type NormalizedDisposition = "urgent" | "routine" | "unknown";

export function normalizeDisposition(raw: string | undefined | null): NormalizedDisposition {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase().trim().replace(/\s+/g, "_");

  if (URGENT_VARIANTS.has(lower)) return "urgent";
  if (ROUTINE_VARIANTS.has(lower)) return "routine";

  // Partial matches
  if (lower.includes("urgent") || lower.includes("ed") || lower.includes("emergency")) return "urgent";
  if (lower.includes("routine") || lower.includes("self_care") || lower.includes("supportive")) return "routine";

  return "unknown";
}

export function dispositionsMatch(a: string | undefined, b: string | undefined): boolean {
  const normA = normalizeDisposition(a);
  const normB = normalizeDisposition(b);
  if (normA === "unknown" || normB === "unknown") return false;
  return normA === normB;
}

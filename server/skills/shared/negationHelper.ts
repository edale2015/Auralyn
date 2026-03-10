export type PhraseAssertion = "affirmed" | "negated" | "absent";

const NEGATION_PREFIXES = [
  "no",
  "not",
  "denies",
  "deny",
  "without",
  "negative for",
  "free of",
  "never had",
  "has no",
  "having no",
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitIntoClauses(text: string): string[] {
  return text
    .split(/[.!?\n,]|(?:\s+(?:but|however|although|though|yet|except)\s+)/i)
    .map((c) => c.toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function isPhraseNegatedInClause(clause: string, phrase: string): boolean {
  const normalizedClause = normalizeText(clause);
  const normalizedPhrase = normalizeText(phrase);

  if (!normalizedClause.includes(normalizedPhrase)) return false;

  for (const prefix of NEGATION_PREFIXES) {
    const pattern = new RegExp(
      `\\b${escapeRegex(prefix)}\\b(?:\\s+\\w+){0,2}\\s+${escapeRegex(normalizedPhrase)}\\b`,
      "i"
    );
    if (pattern.test(normalizedClause)) return true;
  }

  return false;
}

export function isPhraseAffirmedInClause(clause: string, phrase: string): boolean {
  const normalizedClause = normalizeText(clause);
  const normalizedPhrase = normalizeText(phrase);

  if (!normalizedClause.includes(normalizedPhrase)) return false;
  if (isPhraseNegatedInClause(normalizedClause, normalizedPhrase)) return false;
  return true;
}

export function getPhraseAssertion(text: string, phrase: string): PhraseAssertion {
  const clauses = splitIntoClauses(text);

  let sawAffirmed = false;
  let sawNegated = false;

  for (const clause of clauses) {
    if (!clause.includes(normalizeText(phrase))) continue;
    if (isPhraseNegatedInClause(clause, phrase)) sawNegated = true;
    else if (isPhraseAffirmedInClause(clause, phrase)) sawAffirmed = true;
  }

  if (sawAffirmed) return "affirmed";
  if (sawNegated) return "negated";
  return "absent";
}

export function phrasePresent(text: string, phrase: string): boolean {
  return getPhraseAssertion(text, phrase) === "affirmed";
}

export function phraseNegated(text: string, phrase: string): boolean {
  return getPhraseAssertion(text, phrase) === "negated";
}

export function countAffirmedTerms(text: string, phrases: string[]): number {
  return phrases.filter((p) => phrasePresent(text, p)).length;
}

export function countNegatedTerms(text: string, phrases: string[]): number {
  return phrases.filter((p) => phraseNegated(text, p)).length;
}

export function extractAssertions(
  text: string,
  phrases: string[]
): {
  affirmed: string[];
  negated: string[];
  absent: string[];
} {
  const affirmed: string[] = [];
  const negated: string[] = [];
  const absent: string[] = [];

  for (const phrase of phrases) {
    const state = getPhraseAssertion(text, phrase);
    if (state === "affirmed") affirmed.push(phrase);
    else if (state === "negated") negated.push(phrase);
    else absent.push(phrase);
  }

  return { affirmed, negated, absent };
}

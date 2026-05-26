// Registry of complaint → system prompt.
//
// One entry per complaint protocol. neuro_headache is wired today; the other
// 17 complaints will register here as their prompts are written.

import { NEURO_HEADACHE_PROMPT, NEURO_HEADACHE_FALLBACK_QUESTIONS } from "./neuroHeadache";

const PROMPTS: Record<string, string> = {
  neuro_headache: NEURO_HEADACHE_PROMPT,
};

const FALLBACK_QUESTIONS: Record<string, string[]> = {
  neuro_headache: NEURO_HEADACHE_FALLBACK_QUESTIONS,
};

export function getSystemPrompt(slug: string): string | null {
  return PROMPTS[slug] ?? null;
}

export function hasSystemPrompt(slug: string): boolean {
  return slug in PROMPTS;
}

export function listSupportedSlugs(): string[] {
  return Object.keys(PROMPTS);
}

/**
 * Pick the deterministic fallback question for a slug at a given patient
 * turn count. Used when the Anthropic API call times out. Returns null when
 * the slug has no fallback list or we are past the end of the protocol.
 */
export function getFallbackQuestion(slug: string, userTurnCount: number): string | null {
  const list = FALLBACK_QUESTIONS[slug];
  if (!list) return null;
  const idx = userTurnCount - 1;       // turn N → 0-indexed list slot N-1
  if (idx < 0 || idx >= list.length) return null;
  return list[idx];
}

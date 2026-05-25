// Registry of complaint → system prompt.
//
// One entry per complaint protocol. neuro_headache is wired today; the other
// 17 complaints will register here as their prompts are written.

import { NEURO_HEADACHE_PROMPT } from "./neuroHeadache";

const PROMPTS: Record<string, string> = {
  neuro_headache: NEURO_HEADACHE_PROMPT,
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

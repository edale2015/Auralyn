import type { AnswerValue } from "../../shared/agentTypes";

const YES_TOKENS = new Set(["yes", "y", "yeah", "yep", "true", "sure", "correct", "affirmative"]);
const NO_TOKENS = new Set(["no", "n", "nah", "nope", "false", "negative"]);
const UNSURE_TOKENS = new Set(["not sure", "not_sure", "unsure", "maybe", "idk", "don't know", "dont know", "i don't know", "i dont know", "unknown"]);

export function normalizeChatAnswer(raw: string): AnswerValue {
  const s = raw.trim().toLowerCase();

  if (YES_TOKENS.has(s)) return "yes";
  if (NO_TOKENS.has(s)) return "no";
  if (UNSURE_TOKENS.has(s)) return "not_sure";

  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }

  return raw.trim();
}

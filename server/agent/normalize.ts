import type { AnswerValue } from "../../shared/agentTypes";

export function normalizeAnswer(v: unknown): AnswerValue {
  if (v === null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "yes") return "yes";
    if (s === "no") return "no";
    if (s === "not sure" || s === "not_sure" || s === "unknown") return "not_sure";
    return v;
  }
  return String(v) as AnswerValue;
}

import { SkillContext, SkillResult } from "./skillTypes";

export class SkillValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}

export function assertContextHasCaseId(context: SkillContext): void {
  if (!context.caseId || context.caseId.trim() === "") {
    throw new SkillValidationError("SkillContext.caseId is required");
  }
}

export function assertComplaintIdIfNeeded(
  context: SkillContext,
  skillName: string
): void {
  if (!context.complaintId || context.complaintId.trim() === "") {
    throw new SkillValidationError(`${skillName}: complaintId is required`);
  }
}

export function assertSkillResultShape<T>(
  result: SkillResult<T>,
  skillName: string
): void {
  if (!result.skillId) {
    throw new SkillValidationError(`${skillName}: skillId missing`);
  }
  if (!result.skillName) {
    throw new SkillValidationError(`${skillName}: skillName missing`);
  }
  if (!result.version) {
    throw new SkillValidationError(`${skillName}: version missing`);
  }
  if (!["success", "partial", "error"].includes(result.status)) {
    throw new SkillValidationError(`${skillName}: invalid status`);
  }
  if (typeof result.confidence !== "number") {
    throw new SkillValidationError(`${skillName}: confidence must be numeric`);
  }
  if (!result.audit) {
    throw new SkillValidationError(`${skillName}: audit missing`);
  }
  if (!Array.isArray(result.audit.tablesUsed)) {
    throw new SkillValidationError(`${skillName}: audit.tablesUsed invalid`);
  }
  if (!Array.isArray(result.audit.ruleHits)) {
    throw new SkillValidationError(`${skillName}: audit.ruleHits invalid`);
  }
  if (!Array.isArray(result.audit.missingData)) {
    throw new SkillValidationError(`${skillName}: audit.missingData invalid`);
  }
  if (typeof result.audit.latencyMs !== "number") {
    throw new SkillValidationError(`${skillName}: audit.latencyMs invalid`);
  }
}

export function requireObject(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SkillValidationError(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

export function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

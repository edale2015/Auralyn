import { SKILL_VERSION_REGISTRY } from "./skillVersionRegistry";

export function getRollbackTarget(skillName: string): string | null {
  const row = SKILL_VERSION_REGISTRY.find((r) => r.skillName === skillName && r.active);
  return row?.rollbackTargetVersion ?? null;
}

export function getActiveVersion(skillName: string): string | null {
  const row = SKILL_VERSION_REGISTRY.find((r) => r.skillName === skillName && r.active);
  return row?.version ?? null;
}

export function getPassRate(skillName: string): number | null {
  const row = SKILL_VERSION_REGISTRY.find((r) => r.skillName === skillName && r.active);
  return row?.goldenCasePassRate ?? null;
}

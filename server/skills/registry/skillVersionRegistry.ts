export type SkillVersionRecord = {
  skillName: string;
  version: string;
  active: boolean;
  lastChangedAt: string;
  goldenCasePassRate?: number;
  rollbackTargetVersion?: string;
};

export const SKILL_VERSION_REGISTRY: SkillVersionRecord[] = [
  {
    skillName: "detect_red_flags",
    version: "v1",
    active: true,
    lastChangedAt: new Date().toISOString(),
    goldenCasePassRate: 1,
    rollbackTargetVersion: "v1",
  },
  {
    skillName: "determine_disposition",
    version: "v1",
    active: true,
    lastChangedAt: new Date().toISOString(),
    goldenCasePassRate: 1,
    rollbackTargetVersion: "v1",
  },
  {
    skillName: "score_differential_clusters",
    version: "v1",
    active: true,
    lastChangedAt: new Date().toISOString(),
    goldenCasePassRate: 1,
    rollbackTargetVersion: "v1",
  },
  {
    skillName: "apply_clinical_score",
    version: "v1",
    active: true,
    lastChangedAt: new Date().toISOString(),
    goldenCasePassRate: 1,
    rollbackTargetVersion: "v1",
  },
  {
    skillName: "generate_differential",
    version: "v1",
    active: true,
    lastChangedAt: new Date().toISOString(),
    goldenCasePassRate: 1,
    rollbackTargetVersion: "v1",
  },
];

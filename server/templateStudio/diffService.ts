import type { TemplateStep, TemplateVersion } from "../../shared/templateStudio";

export interface StepDiff {
  stepId: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  before?: Partial<TemplateStep>;
  after?: Partial<TemplateStep>;
  changedFields?: string[];
}

export interface TemplateDiffResult {
  fromVersionId: string;
  toVersionId: string;
  diffs: StepDiff[];
}

function stepFieldDiff(a?: TemplateStep, b?: TemplateStep): string[] {
  if (!a || !b) return [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify((a as any)[key]) !== JSON.stringify((b as any)[key])) {
      changed.push(key);
    }
  }
  return changed;
}

export class TemplateDiffService {
  diffVersions(from: TemplateVersion, to: TemplateVersion): TemplateDiffResult {
    const beforeMap = new Map(from.steps.map(s => [s.id, s]));
    const afterMap = new Map(to.steps.map(s => [s.id, s]));
    const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const diffs: StepDiff[] = [];

    for (const stepId of allIds) {
      const before = beforeMap.get(stepId);
      const after = afterMap.get(stepId);

      if (!before && after) {
        diffs.push({ stepId, changeType: "added", after });
      } else if (before && !after) {
        diffs.push({ stepId, changeType: "removed", before });
      } else if (before && after) {
        const changedFields = stepFieldDiff(before, after);
        diffs.push({
          stepId,
          changeType: changedFields.length ? "modified" : "unchanged",
          before,
          after,
          changedFields,
        });
      }
    }

    return { fromVersionId: from.versionId, toVersionId: to.versionId, diffs };
  }
}

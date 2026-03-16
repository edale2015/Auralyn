import { listVersions } from "./clinicalVersionStore";
import { VersionTimelineEntry } from "./clinicalVersionTypes";

export function buildClinicalTimeline(): VersionTimelineEntry[] {
  const versions = listVersions();

  return versions.map((v) => ({
    version: v.id,
    time: v.createdAt,
    description: v.changeSummary?.details || v.description || "Clinical data update",
    status: v.status,
    createdBy: v.createdBy,
  }));
}

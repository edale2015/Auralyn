import { ClinicalVersion } from "./clinicalVersionTypes";

const versionStore: ClinicalVersion[] = [];

export function addVersion(v: ClinicalVersion) {
  versionStore.push(v);
  if (versionStore.length > 500) versionStore.shift();
}

export function listVersions(): ClinicalVersion[] {
  return [...versionStore].sort((a, b) => b.createdAt - a.createdAt);
}

export function getVersion(id: string): ClinicalVersion | undefined {
  return versionStore.find((v) => v.id === id);
}

export function updateVersionStatus(id: string, status: ClinicalVersion["status"]): boolean {
  const v = versionStore.find((ver) => ver.id === id);
  if (!v) return false;
  v.status = status;
  return true;
}

export function getLatestDeployedVersion(): ClinicalVersion | undefined {
  return [...versionStore]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((v) => v.status === "deployed");
}

export function getVersionCount(): number {
  return versionStore.length;
}

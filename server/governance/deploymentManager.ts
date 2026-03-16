export interface DeploymentVersion {
  id: string;
  label: string;
  config: any;
  deployedBy?: string;
  timestamp: number;
  status: "active" | "rolled_back" | "superseded";
}

let currentVersionId = "v1";
const versions: DeploymentVersion[] = [
  {
    id: "v1",
    label: "Initial Release",
    config: {},
    timestamp: Date.now(),
    status: "active",
  },
];

export function deployNewVersion(config: any, label?: string, deployedBy?: string): DeploymentVersion {
  const existing = versions.find((v) => v.status === "active");
  if (existing) existing.status = "superseded";

  const versionId = `v${versions.length + 1}`;
  const version: DeploymentVersion = {
    id: versionId,
    label: label || `Deployment ${versionId}`,
    config,
    deployedBy,
    timestamp: Date.now(),
    status: "active",
  };

  versions.push(version);
  currentVersionId = versionId;
  return version;
}

export function rollbackVersion(versionId: string): boolean {
  const target = versions.find((v) => v.id === versionId);
  if (!target) return false;

  const current = versions.find((v) => v.status === "active");
  if (current) current.status = "rolled_back";

  target.status = "active";
  currentVersionId = versionId;
  return true;
}

export function getCurrentVersion(): DeploymentVersion | undefined {
  return versions.find((v) => v.id === currentVersionId);
}

export function listVersions(): DeploymentVersion[] {
  return [...versions].sort((a, b) => b.timestamp - a.timestamp);
}

export function getDeploymentStats() {
  return {
    currentVersion: currentVersionId,
    totalVersions: versions.length,
    activeVersion: versions.find((v) => v.status === "active"),
    history: versions.slice(-10).reverse(),
  };
}

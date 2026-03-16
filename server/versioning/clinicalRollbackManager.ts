import { getVersion, updateVersionStatus, listVersions, getLatestDeployedVersion } from "./clinicalVersionStore";

export function deployClinicalVersion(id: string, deployedBy?: string): { deployed: string; previous?: string } | null {
  const v = getVersion(id);
  if (!v) return null;

  const currentDeployed = getLatestDeployedVersion();
  if (currentDeployed && currentDeployed.id !== id) {
    updateVersionStatus(currentDeployed.id, "rolled_back");
  }

  updateVersionStatus(id, "deployed");

  return {
    deployed: id,
    previous: currentDeployed?.id,
  };
}

export function rollbackClinicalVersion(targetId: string, rolledBackBy?: string): { rolledBackTo: string; from?: string } | null {
  const target = getVersion(targetId);
  if (!target) return null;

  const currentDeployed = getLatestDeployedVersion();
  if (currentDeployed) {
    updateVersionStatus(currentDeployed.id, "rolled_back");
  }

  updateVersionStatus(targetId, "deployed");

  return {
    rolledBackTo: targetId,
    from: currentDeployed?.id,
  };
}

export function getCurrentDeploymentInfo() {
  const deployed = getLatestDeployedVersion();
  const versions = listVersions();

  return {
    currentVersion: deployed?.id || null,
    currentDescription: deployed?.description || null,
    deployedAt: deployed?.createdAt || null,
    availableRollbacks: versions
      .filter((v) => v.status !== "deployed" && v.id !== deployed?.id)
      .slice(0, 10)
      .map((v) => ({ id: v.id, description: v.description, createdAt: v.createdAt })),
  };
}

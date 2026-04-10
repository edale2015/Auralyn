import { broadcast } from "../control/controlBus";

export interface Region {
  name: string;
  population: number;
  load: number;
  hasTelemed: boolean;
  [key: string]: unknown;
}

export interface DeploymentResult {
  region: string;
  status: "queued" | "deployed" | "failed";
  ts: string;
}

const deploymentLog: DeploymentResult[] = [];

export function findExpansionTargets(regions: Region[]): Region[] {
  return regions.filter(
    r => r.population > 500_000 && r.load < 0.5 && r.hasTelemed === false
  );
}

export async function deployRegion(region: Region): Promise<DeploymentResult> {
  console.log(`[Rollout] Deploying to: ${region.name}`);

  const deployApi = process.env.DEPLOY_API;
  let status: DeploymentResult["status"] = "queued";

  if (deployApi) {
    try {
      await fetch(deployApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(region),
      });
      status = "deployed";
    } catch {
      status = "failed";
    }
  }

  const result: DeploymentResult = {
    region: region.name,
    status,
    ts: new Date().toISOString(),
  };

  deploymentLog.push(result);
  if (deploymentLog.length > 500) deploymentLog.shift();
  broadcast("region_deployed", result);
  return result;
}

export async function runNationalExpansion(regions: Region[]): Promise<DeploymentResult[]> {
  const targets = findExpansionTargets(regions);
  const results: DeploymentResult[] = [];
  for (const t of targets) {
    results.push(await deployRegion(t));
  }
  broadcast("national_expansion", { targets: results.length, ts: Date.now() });
  return results;
}

export function getDeploymentLog(): DeploymentResult[] {
  return [...deploymentLog];
}

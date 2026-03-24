import { execSync } from "child_process";

export function scaleFly(instances: number): void {
  try {
    console.log(`[FlyScale] Scaling to ${instances} instances...`);
    execSync(`flyctl scale count ${instances}`, { stdio: "inherit" });
    console.log(`[FlyScale] Scaled to ${instances} instances`);
  } catch (e: any) {
    console.error(`[FlyScale] Scale failed: ${e.message}`);
  }
}

export function evaluateAndScale(rooms: { riskScore: number }[]): { action: string; instances?: number } {
  const highRisk = rooms.filter((r) => r.riskScore > 0.7).length;

  if (highRisk > 10) {
    scaleFly(5);
    return { action: "SCALED_UP", instances: 5 };
  }

  if (highRisk === 0) {
    return { action: "STABLE" };
  }

  return { action: "MONITORING", instances: highRisk };
}

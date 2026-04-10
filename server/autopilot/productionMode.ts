export type DeploymentMode = "staging" | "canary" | "production";

let _mode: DeploymentMode = "staging";

export function setMode(m: DeploymentMode | string): void {
  const valid: DeploymentMode[] = ["staging", "canary", "production"];
  _mode = valid.includes(m as DeploymentMode) ? (m as DeploymentMode) : "staging";
  console.log(`[ProductionMode] Deployment mode set to: ${_mode}`);
}

export function getMode(): DeploymentMode {
  return _mode;
}

export function enforceProductionSafety(state: { safety: { mismatchRate: number } }): boolean {
  if (state.safety.mismatchRate > 0.01) {
    throw new Error("🚨 Production halted: safety mismatch rate exceeds 1%");
  }
  return true;
}

export function isCanary(userId: string): boolean {
  if (!userId || userId.length === 0) return false;
  return userId.charCodeAt(0) % 10 === 0;
}

export function canaryRolloutFraction(userId: string): number {
  return userId ? userId.charCodeAt(0) % 100 : 0;
}

export function isProductionSafe(mismatchRate: number): boolean {
  return mismatchRate <= 0.01;
}

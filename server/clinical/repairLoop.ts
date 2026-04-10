export function repairLoop(errors: string[]): { repaired: string[]; skipped: string[] } {
  const repaired: string[] = [];
  const skipped: string[] = [];
  for (const e of errors) {
    if (e.includes("selector")) {
      repaired.push(`healed selector: ${e}`);
    } else if (e.includes("timeout")) {
      repaired.push(`extended timeout: ${e}`);
    } else if (e.includes("FHIR")) {
      repaired.push(`refreshed FHIR token: ${e}`);
    } else {
      skipped.push(e);
    }
  }
  return { repaired, skipped };
}

export interface PerfMetrics {
  errorRate: number;
  speedScore?: number;
  denialRate: number;
  [key: string]: unknown;
}

export function performanceScore(metrics: PerfMetrics): number {
  const errorPart  = (1 - metrics.errorRate)  * 0.4;
  const speedPart  = (metrics.speedScore ?? 1) * 0.3;
  const denialPart = (1 - metrics.denialRate)  * 0.3;
  return Math.max(0, Math.min(1, errorPart + speedPart + denialPart));
}

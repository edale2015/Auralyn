export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;
  checks: { name: string; status: "pass" | "fail"; durationMs: number; message?: string }[];
}

const startTime = Date.now();

export async function runHealthChecks(): Promise<HealthStatus> {
  const checks: HealthStatus["checks"] = [];

  const memStart = Date.now();
  const mem = process.memoryUsage();
  checks.push({
    name: "memory",
    status: mem.heapUsed < 500 * 1024 * 1024 ? "pass" : "fail",
    durationMs: Date.now() - memStart,
    message: `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
  });

  checks.push({ name: "uptime", status: "pass", durationMs: 0, message: `${Math.round((Date.now() - startTime) / 1000)}s` });

  const overallStatus = checks.every((c) => c.status === "pass") ? "healthy" : checks.some((c) => c.status === "fail") ? "unhealthy" : "degraded";

  return { status: overallStatus, uptime: Date.now() - startTime, timestamp: new Date().toISOString(), checks };
}

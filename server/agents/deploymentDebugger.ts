/**
 * Deployment Debugger
 * Analyses log strings and in-process service health for self-diagnosis.
 */

export interface DiagnosticResult {
  issue:       string;
  severity:    "critical" | "warning" | "info";
  suggestion:  string;
  pattern:     string;
}

const PATTERNS: Array<{ re: RegExp; issue: string; severity: DiagnosticResult["severity"]; suggestion: string }> = [
  { re: /ECONNREFUSED/,           issue: "Database connection refused",        severity: "critical", suggestion: "Check DATABASE_URL env var and database service status" },
  { re: /timeout|ETIMEDOUT/i,     issue: "Service timeout",                    severity: "warning",  suggestion: "Check async queue and external API latency; consider increasing timeout" },
  { re: /ENOMEM|heap out of/i,    issue: "Out of memory",                      severity: "critical", suggestion: "Increase memory limit or reduce in-memory cache sizes" },
  { re: /MODULE_NOT_FOUND/,       issue: "Missing module",                     severity: "critical", suggestion: "Run npm install; check import paths" },
  { re: /OPENAI_API_KEY/i,        issue: "OpenAI API key not configured",      severity: "warning",  suggestion: "Set OPENAI_API_KEY in environment secrets" },
  { re: /401|Unauthorized/,       issue: "Authentication failure",             severity: "warning",  suggestion: "Check API tokens and authorization headers" },
  { re: /429|rate limit/i,        issue: "Rate limit hit",                     severity: "warning",  suggestion: "Add retry backoff; consider caching upstream responses" },
  { re: /SyntaxError|JSON.parse/i,issue: "JSON parse failure",                 severity: "warning",  suggestion: "Validate request body schema; check API response format" },
  { re: /ENOENT/,                 issue: "File not found",                     severity: "warning",  suggestion: "Check file paths in environment config" },
  { re: /certificate|SSL|TLS/i,   issue: "TLS/SSL issue",                      severity: "critical", suggestion: "Verify SSL certificates; ensure DATABASE_URL includes ?sslmode=require" },
];

export class DeploymentDebugger {
  analyzeFailure(logs: string): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    for (const p of PATTERNS) {
      if (p.re.test(logs)) {
        results.push({ issue: p.issue, severity: p.severity, suggestion: p.suggestion, pattern: p.re.source });
      }
    }
    if (results.length === 0) {
      results.push({ issue: "Unknown issue — no pattern matched", severity: "info", suggestion: "Review logs manually; check server/routes.ts and workflow console", pattern: "none" });
    }
    return results;
  }

  async getServiceHealth(): Promise<Record<string, { status: "ok" | "degraded" | "unknown"; note: string }>> {
    const health: Record<string, { status: "ok" | "degraded" | "unknown"; note: string }> = {};

    // Redis
    try {
      const { getRedisAsync } = await import("../queue/redis");
      const redis = await getRedisAsync();
      health.redis = redis ? { status: "ok", note: "Upstash REST connected" } : { status: "degraded", note: "No Redis client available" };
    } catch { health.redis = { status: "unknown", note: "Redis init error" }; }

    // DB
    health.postgres = process.env.DATABASE_URL
      ? { status: "ok", note: "DATABASE_URL configured" }
      : { status: "degraded", note: "DATABASE_URL not set" };

    // OpenAI
    health.openai = process.env.OPENAI_API_KEY
      ? { status: "ok",      note: "API key configured" }
      : { status: "degraded", note: "OPENAI_API_KEY not set — LLM agents in fallback mode" };

    // FHIR
    health.fhir = process.env.FHIR_BASE_URL
      ? { status: "ok",      note: `FHIR endpoint: ${process.env.FHIR_BASE_URL}` }
      : { status: "unknown",  note: "FHIR_BASE_URL not configured (FHIR adapters disabled)" };

    return health;
  }

  summarizeLogs(rawLogs: string): { errorCount: number; warnCount: number; infoCount: number; topErrors: string[] } {
    const lines     = rawLogs.split("\n");
    const errors    = lines.filter((l) => /error|ERROR|FATAL/i.test(l));
    const warns     = lines.filter((l) => /warn|WARN/i.test(l));
    const infos     = lines.filter((l) => /info|INFO/i.test(l));
    return {
      errorCount: errors.length,
      warnCount:  warns.length,
      infoCount:  infos.length,
      topErrors:  errors.slice(0, 5).map((l) => l.trim()),
    };
  }
}

export const deploymentDebugger = new DeploymentDebugger();

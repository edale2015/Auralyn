/**
 * server/tools/secretScrubber.ts — Redact secrets before export
 *
 * Catches: process.env.* references, inline API keys, secrets, passwords,
 * DB connection strings, and JWT secrets.
 */

const SECRET_PATTERNS: RegExp[] = [
  /process\.env\.[A-Z0-9_]+/g,
  /api[_-]?key\s*[:=]\s*['"][^'"]{4,}['"]/gi,
  /secret\s*[:=]\s*['"][^'"]{4,}['"]/gi,
  /password\s*[:=]\s*['"][^'"]{4,}['"]/gi,
  /postgres:\/\/[^\s'"]+/gi,
  /mongodb(\+srv)?:\/\/[^\s'"]+/gi,
  /redis:\/\/[^\s'"]+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g, // JWT
];

export function scrubSecrets(content: string): string {
  let result = content;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }
  return result;
}

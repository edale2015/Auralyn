/**
 * server/tools/allowlist.ts — Allowlist for Claude review slice exports
 *
 * Only files under these prefixes are eligible for export.
 * .env, credentials, node_modules, logs, and secrets are blocked by omission.
 */

export const ALLOWLIST: string[] = [
  "server/ai/",
  "server/clinical/",
  "server/validation/",
  "server/controlTower/",
  "server/rlhf/",
  "server/fda/",
  "server/services/",
  "server/routes/",
  "server/ws/",
  "server/realtime/",
  "server/simulation/",
  "server/prediction/",
  "client/src/pages/",
  "client/src/components/",
  "shared/",
];

export function isAllowed(filePath: string): boolean {
  return ALLOWLIST.some(prefix => filePath.startsWith(prefix));
}

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'self_improvement_events.ndjson');

export function logSelfImprovementEvent(event: Record<string, unknown>): void {
  fs.appendFileSync(FILE, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n');
}

export function summarizeSelfImprovementBacklog(): { byType: Record<string, number> } {
  if (!fs.existsSync(FILE)) return { byType: {} };
  const rows = fs.readFileSync(FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((x) => JSON.parse(x) as Record<string, unknown>);
  const byType: Record<string, number> = {};
  rows.forEach((r) => {
    const t = String(r.type || 'unknown');
    byType[t] = (byType[t] || 0) + 1;
  });
  return { byType };
}

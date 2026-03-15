import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'physician_feedback.ndjson');

export function appendPhysicianFeedback(payload: Record<string, unknown>): void {
  fs.appendFileSync(FILE, JSON.stringify(payload) + '\n');
}

export function getPhysicianFeedbackStats(): { total: number; recentDisagreements: unknown[] } {
  if (!fs.existsSync(FILE)) return { total: 0, recentDisagreements: [] };
  const rows = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
  return {
    total: rows.length,
    recentDisagreements: rows.filter((r) => r.agreed === false).slice(-10)
  };
}

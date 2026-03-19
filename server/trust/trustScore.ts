interface TrustEntry {
  score: number;
  totalCases: number;
  successfulCases: number;
  lastUpdated: string;
}

const trustScores: Record<string, TrustEntry> = {};
const trustLog: Array<{ complaint: string; success: boolean; timestamp: string }> = [];

export function updateTrust(complaint: string, success: boolean): TrustEntry {
  const key = complaint.toLowerCase().trim();
  if (!trustScores[key]) {
    trustScores[key] = { score: 0.5, totalCases: 0, successfulCases: 0, lastUpdated: "" };
  }

  const entry = trustScores[key];
  entry.totalCases++;

  if (success) {
    entry.successfulCases++;
    entry.score = Math.min(1, entry.score + 0.05);
  } else {
    entry.score = Math.max(0, entry.score - 0.1);
  }

  entry.lastUpdated = new Date().toISOString();

  trustLog.push({ complaint: key, success, timestamp: entry.lastUpdated });
  if (trustLog.length > 500) trustLog.splice(0, trustLog.length - 500);

  return { ...entry };
}

export function canAutoHandle(complaint: string): { allowed: boolean; score: number; reason: string } {
  const key = complaint.toLowerCase().trim();
  const entry = trustScores[key];

  if (!entry) return { allowed: false, score: 0, reason: "No trust data — requires physician review" };
  if (entry.totalCases < 10) return { allowed: false, score: entry.score, reason: `Insufficient data (${entry.totalCases} cases) — requires physician review` };
  if (entry.score >= 0.85) return { allowed: true, score: entry.score, reason: `Trust score ${(entry.score * 100).toFixed(0)}% — auto-handling approved` };
  return { allowed: false, score: entry.score, reason: `Trust score ${(entry.score * 100).toFixed(0)}% below 85% threshold` };
}

export function getTrustScores(): Record<string, TrustEntry> {
  return { ...trustScores };
}

export function getTrustLog(limit = 100): typeof trustLog {
  return trustLog.slice(-limit);
}

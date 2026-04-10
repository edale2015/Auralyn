export interface HistoryEntry {
  outcome: string;
  riskScore?: number;
  [key: string]: unknown;
}

export interface QueueItem {
  patientId: string;
  riskScore: number;
  complaint?: string;
  [key: string]: unknown;
}

export interface VisitRecord {
  time: number;
  er: boolean;
  [key: string]: unknown;
}

export interface ClinicPerformance {
  avgTime: number;
  erRate: number;
  totalVisits: number;
}

export function tuneThresholds(history: HistoryEntry[]): number {
  if (history.length === 0) return 0.8;
  const erRate = history.filter(h => h.outcome === "ER" || h.outcome === "ER_NOW").length / history.length;
  if (erRate > 0.3)  return 0.6;
  if (erRate > 0.2)  return 0.7;
  return 0.8;
}

export function interruptForCritical(queue: QueueItem[]): QueueItem[] {
  return [...queue].sort((a, b) => b.riskScore - a.riskScore);
}

export function clinicPerformanceMetrics(visits: VisitRecord[]): ClinicPerformance {
  if (visits.length === 0) return { avgTime: 0, erRate: 0, totalVisits: 0 };
  const avgTime = visits.reduce((a, b) => a + b.time, 0) / visits.length;
  const erRate  = visits.filter(v => v.er).length / visits.length;
  return { avgTime: Math.round(avgTime), erRate: +erRate.toFixed(4), totalVisits: visits.length };
}

export async function sendFollowup(
  patientId: string,
  baseUrl = ""
): Promise<{ ok: boolean; status?: number }> {
  try {
    const res = await fetch(`${baseUrl}/api/followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export function broadcastRegionAlert(
  alert: unknown,
  regions: string[]
): void {
  regions.forEach(r => {
    const url = process.env[`REGION_${r}`];
    if (!url) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    }).catch(e => console.warn(`[IntelligenceUtils] Alert broadcast to ${r} failed:`, e?.message));
  });
}

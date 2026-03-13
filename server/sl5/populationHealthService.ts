import * as fs from "fs/promises";
import * as path from "path";

const COMPLAINTS = ["cough", "sore_throat", "sinus_pressure", "ear_pain", "uti", "rash", "fever", "chest_pain", "abdominal_pain"];
const DISPOSITIONS = ["Home Care", "Urgent Care", "ED", "Prescription", "Watchful Waiting", "Telehealth Follow-up"];

function seedRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function getComplaintTrends() {
  const weeks = ["W-6", "W-5", "W-4", "W-3", "W-2", "W-1", "W0"];
  return COMPLAINTS.map((complaint, ci) => {
    const rng = seedRng(ci * 7919);
    const volumes = weeks.map((_, wi) => Math.floor(15 + rng() * 85 + (wi === 6 ? rng() * 30 : 0)));
    const drift = Math.abs(volumes[6] - volumes[5]) / (volumes[5] || 1);
    return { complaint, weeks, volumes, driftScore: Number((drift * 100).toFixed(1)), trending: drift > 0.2 };
  });
}

export function getDispositionDistribution() {
  return COMPLAINTS.map((complaint, ci) => {
    const rng = seedRng(ci * 1337);
    const raw = DISPOSITIONS.map(() => rng() * 100);
    const total = raw.reduce((a, b) => a + b, 0);
    const distribution = Object.fromEntries(DISPOSITIONS.map((d, i) => [d, Number((raw[i] / total * 100).toFixed(1))]));
    return { complaint, distribution };
  });
}

export function getDriftAlerts() {
  const trends = getComplaintTrends();
  return trends
    .filter(t => t.trending)
    .map(t => ({
      complaint: t.complaint,
      driftScore: t.driftScore,
      severity: t.driftScore > 40 ? "high" : t.driftScore > 25 ? "medium" : "low",
      message: `Volume drift of ${t.driftScore}% detected in last week`,
      timestamp: new Date().toISOString(),
    }));
}

export async function getPopulationSummary() {
  const trends = getComplaintTrends();
  const alerts = getDriftAlerts();
  const totalVolume = trends.reduce((s, t) => s + t.volumes[6], 0);
  const topComplaint = trends.sort((a, b) => b.volumes[6] - a.volumes[6])[0];
  return {
    totalVolume,
    activeAlerts: alerts.length,
    highSeverityAlerts: alerts.filter(a => a.severity === "high").length,
    topComplaint: topComplaint.complaint,
    topComplaintVolume: topComplaint.volumes[6],
  };
}

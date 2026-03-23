export interface TimelineState {
  timestamp: number;
  vitals: {
    temperature?: number;
    heartRate?: number;
    oxygenSaturation?: number;
    systolicBp?: number;
    respRate?: number;
  };
  symptoms: string[];
  riskScore: number;
  note?: string;
}

export interface TimelinePoint extends TimelineState {
  deltaRisk?: number;
  trend?: "improving" | "stable" | "worsening";
}

export function buildTimeline(history: TimelineState[]): TimelinePoint[] {
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);

  return sorted.map((state, i) => {
    const prev = sorted[i - 1];
    const deltaRisk = prev ? state.riskScore - prev.riskScore : 0;
    const trend: TimelinePoint["trend"] =
      deltaRisk > 0.05 ? "worsening"
      : deltaRisk < -0.05 ? "improving"
      : "stable";

    return { ...state, deltaRisk, trend };
  });
}

export function getTimelineRiskBand(points: TimelinePoint[]): "low" | "moderate" | "high" {
  if (!points.length) return "low";
  const latest = points[points.length - 1];
  return latest.riskScore >= 0.7 ? "high"
    : latest.riskScore >= 0.4 ? "moderate"
    : "low";
}

export function sampleTimeline(patient: { riskScore: number; vitals?: any; symptoms?: string[] }, count = 3): TimelineState[] {
  const now = Date.now();
  const states: TimelineState[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const jitter = (Math.random() - 0.5) * 0.1;
    states.push({
      timestamp: now - i * 3600000,
      vitals: patient.vitals ?? {},
      symptoms: patient.symptoms ?? [],
      riskScore: Math.min(1, Math.max(0, patient.riskScore - i * 0.05 + jitter)),
    });
  }

  return states;
}

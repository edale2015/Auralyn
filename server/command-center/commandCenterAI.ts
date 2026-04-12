/**
 * Command Center AI — multi-patient ranking with deterioration trend analysis
 * Scores patients like an ER attending: static vitals + trend trajectory + risk.
 */

export interface PatientTrend {
  hrTrend?:   number;    // +bpm/min = rising (bad)
  spo2Trend?: number;    // -pct/min = dropping (very bad)
  bpTrend?:   number;    // -mmHg/min = dropping (bad)
  tempTrend?: number;    // +°F/min = rising
}

export interface CommandCenterPatient {
  id:         string;
  name?:      string;
  riskScore:  number;   // 0–10 from triage engine
  vitals: {
    hr:     number;
    bpSys:  number;
    spo2:   number;
    temp:   number;     // °F
  };
  trend?:     PatientTrend;
  condition?: string;
}

export interface RankedPatient extends CommandCenterPatient {
  priorityScore:  number;
  trendFlags:     string[];
  urgency:        "routine" | "soon" | "urgent" | "immediate";
}

export function computePriorityScore(p: CommandCenterPatient): { score: number; trendFlags: string[] } {
  let score          = 0;
  const trendFlags:  string[] = [];

  // ── Base triage risk weight ────────────────────────────────────────────────
  score += p.riskScore * 2;

  // ── Static vital sign scoring ──────────────────────────────────────────────
  if (p.vitals.hr   > 120)  score += 3;
  if (p.vitals.hr   < 50)   score += 3;
  if (p.vitals.spo2 < 92)   score += 5;
  if (p.vitals.spo2 < 95)   score += 2;
  if (p.vitals.bpSys < 90)  score += 5;
  if (p.vitals.bpSys < 100) score += 2;
  if ((p.vitals.temp - 32) / 1.8 > 39) score += 2;

  // ── Trend-based deterioration (THIS IS HUGE — catches crashes early) ───────
  if (p.trend?.spo2Trend && p.trend.spo2Trend < -2) {
    score += 6;
    trendFlags.push(`SpO₂ dropping ${Math.abs(p.trend.spo2Trend).toFixed(1)}%/min`);
  }
  if (p.trend?.hrTrend && p.trend.hrTrend > 10) {
    score += 4;
    trendFlags.push(`HR rising ${p.trend.hrTrend.toFixed(0)}bpm/min`);
  }
  if (p.trend?.bpTrend && p.trend.bpTrend < -10) {
    score += 4;
    trendFlags.push(`BP dropping ${Math.abs(p.trend.bpTrend).toFixed(0)}mmHg/min`);
  }
  if (p.trend?.tempTrend && p.trend.tempTrend > 0.5) {
    score += 2;
    trendFlags.push(`Temp rising ${p.trend.tempTrend.toFixed(1)}°F/min`);
  }

  return { score, trendFlags };
}

function urgencyFromScore(score: number): RankedPatient["urgency"] {
  if (score >= 20) return "immediate";
  if (score >= 14) return "urgent";
  if (score >= 8)  return "soon";
  return "routine";
}

export function rankPatientsAI(patients: CommandCenterPatient[]): RankedPatient[] {
  return patients
    .map((p) => {
      const { score, trendFlags } = computePriorityScore(p);
      return {
        ...p,
        priorityScore: score,
        trendFlags,
        urgency:       urgencyFromScore(score),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function getTopPatients(patients: CommandCenterPatient[], n = 3): RankedPatient[] {
  return rankPatientsAI(patients).slice(0, n);
}

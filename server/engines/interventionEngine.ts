/**
 * Intervention Engine — converts vital signs → ordered clinical actions
 * Lab orders, medication suggestions, escalation logic.
 * Based on Surviving Sepsis Campaign + NEWS2 early warning criteria.
 */

export type InterventionType = "lab" | "med" | "escalation" | "monitor";

export interface Intervention {
  type:     InterventionType;
  action:   string;
  priority: "low" | "medium" | "high" | "critical";
  rationale:string;
}

export interface VitalSnapshot {
  hr:        number;
  spo2:      number;
  temp:      number;    // °F
  systolicBP:number;
  rr?:       number;    // respiratory rate (optional)
}

export interface InterventionResult {
  interventions:  Intervention[];
  newsScore:      number;
  riskLevel:      "low" | "medium" | "high" | "critical";
  sepsisCriteria: boolean;
  prediction:     string;
}

/** National Early Warning Score 2 (NEWS2) — simplified */
export function computeNEWS2(v: VitalSnapshot): number {
  let score = 0;

  // Respiratory Rate
  const rr = v.rr ?? 16;
  if (rr <= 8)  score += 3;
  else if (rr <= 11) score += 1;
  else if (rr >= 25) score += 3;
  else if (rr >= 21) score += 2;

  // SpO2
  if (v.spo2 <= 91)  score += 3;
  else if (v.spo2 <= 93) score += 2;
  else if (v.spo2 <= 95) score += 1;

  // Systolic BP
  if (v.systolicBP <= 90)  score += 3;
  else if (v.systolicBP <= 100) score += 2;
  else if (v.systolicBP <= 110) score += 1;
  else if (v.systolicBP >= 220) score += 3;

  // Heart Rate
  if (v.hr <= 40)  score += 3;
  else if (v.hr <= 50)  score += 1;
  else if (v.hr >= 131) score += 3;
  else if (v.hr >= 111) score += 2;
  else if (v.hr >= 91)  score += 1;

  // Temperature (convert °F → °C for NEWS2 thresholds)
  const tempC = (v.temp - 32) / 1.8;
  if (tempC <= 35.0)  score += 3;
  else if (tempC <= 36.0)  score += 1;
  else if (tempC >= 39.1)  score += 2;
  else if (tempC >= 38.1)  score += 1;

  return score;
}

function newsRisk(score: number): InterventionResult["riskLevel"] {
  if (score >= 7) return "critical";
  if (score >= 5) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function isSepsis(v: VitalSnapshot): boolean {
  const tempC = (v.temp - 32) / 1.8;
  const fever  = tempC > 38.3;
  const hypo   = tempC < 36;
  return (fever || hypo) && v.hr > 90 && v.systolicBP < 100;
}

export function generateInterventions(v: VitalSnapshot): InterventionResult {
  const interventions: Intervention[] = [];
  const newsScore   = computeNEWS2(v);
  const riskLevel   = newsRisk(newsScore);
  const sepsisCrit  = isSepsis(v);

  // ── SEPSIS BUNDLE ───────────────────────────────────────────────────────────
  if (sepsisCrit) {
    interventions.push({ type: "lab",       priority: "critical", action: "Order lactate, blood cultures ×2, CBC, CMP, procalcitonin",          rationale: "Sepsis screening per Surviving Sepsis Campaign" });
    interventions.push({ type: "med",       priority: "critical", action: "Start IV crystalloid bolus 30 mL/kg over 3 hours",                    rationale: "Sepsis resuscitation — fluid challenge" });
    interventions.push({ type: "escalation",priority: "critical", action: "Alert attending physician + activate rapid response team",            rationale: "SIRS + hypotension threshold met" });
    interventions.push({ type: "monitor",   priority: "critical", action: "Continuous cardiac monitor, hourly urine output, reassess q1h",       rationale: "Hemodynamic surveillance" });
  }

  // ── HYPOXIA ─────────────────────────────────────────────────────────────────
  if (v.spo2 < 92) {
    interventions.push({ type: "med",       priority: "critical", action: "Apply supplemental oxygen via non-rebreather mask at 15 L/min",       rationale: "Critical hypoxia — SpO₂ < 92%" });
    interventions.push({ type: "escalation",priority: "critical", action: "Prepare for possible intubation — alert anesthesia",                  rationale: "Refractory hypoxia risk" });
  } else if (v.spo2 < 95) {
    interventions.push({ type: "med",       priority: "high",     action: "Apply supplemental oxygen via nasal cannula at 2–4 L/min",           rationale: "Mild-moderate hypoxia" });
  }

  // ── TACHYCARDIA ─────────────────────────────────────────────────────────────
  if (v.hr >= 130) {
    interventions.push({ type: "lab",       priority: "high",     action: "Order troponin, BNP, TSH, CBC, electrolytes",                        rationale: "Severe tachycardia — rule out ACS, CHF, afib" });
    interventions.push({ type: "monitor",   priority: "high",     action: "12-lead ECG immediately",                                            rationale: "Evaluate rhythm" });
  } else if (v.hr >= 110) {
    interventions.push({ type: "lab",       priority: "medium",   action: "Order CBC, CMP, TSH",                                               rationale: "Tachycardia workup" });
  }

  // ── HYPOTENSION ─────────────────────────────────────────────────────────────
  if (v.systolicBP < 90 && !sepsisCrit) {
    interventions.push({ type: "med",       priority: "critical", action: "IV fluid challenge 500 mL over 15 minutes, reassess",                rationale: "Hypotension — non-sepsis etiology" });
    interventions.push({ type: "escalation",priority: "critical", action: "Notify physician — consider vasopressors",                           rationale: "SBP < 90 unresponsive" });
  }

  // ── FEVER ───────────────────────────────────────────────────────────────────
  const tempC = (v.temp - 32) / 1.8;
  if (tempC > 39.0) {
    interventions.push({ type: "med",       priority: "medium",   action: "Acetaminophen 1g PO/IV + blood cultures ×2 before antibiotics",      rationale: "Fever management + infection workup" });
  }

  // ── HIGH NEWS2 ───────────────────────────────────────────────────────────────
  if (newsScore >= 5 && interventions.length === 0) {
    interventions.push({ type: "monitor",   priority: "high",     action: "Continuous vital sign monitoring q15min + clinical review now",      rationale: `NEWS2 score ${newsScore} — high risk threshold` });
    interventions.push({ type: "escalation",priority: "high",     action: "Escalate to senior clinician for bedside assessment",               rationale: "NEWS2 ≥ 5 requires urgent clinical review" });
  }

  // ── STABLE MONITORING ───────────────────────────────────────────────────────
  if (interventions.length === 0) {
    interventions.push({ type: "monitor",   priority: "low",      action: "Continue routine monitoring every 4–8 hours",                       rationale: `NEWS2 score ${newsScore} — within normal parameters` });
  }

  const prediction =
    riskLevel === "critical" ? "Possible sepsis / shock — immediate intervention required" :
    riskLevel === "high"     ? "High risk of deterioration — urgent clinical review" :
    riskLevel === "medium"   ? "Monitor closely for deterioration" : "Stable — continue current care";

  return { interventions, newsScore, riskLevel, sepsisCriteria: sepsisCrit, prediction };
}

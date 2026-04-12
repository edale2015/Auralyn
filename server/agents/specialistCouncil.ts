/**
 * Specialist Council Engine
 * Three-specialist rule-based council: Cardiology / Infectious Disease / ICU.
 * Deterministic, auditable, no LLM dependency (complementary to debateCouncil.ts).
 */

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CouncilDecision = "ICU" | "ED" | "URGENT_CARE" | "OUTPATIENT";

export interface SpecialistVote {
  specialty: string;
  risk:      RiskLevel;
  action?:   string;
  rationale: string;
}

export interface CouncilResult {
  votes:         SpecialistVote[];
  finalDecision: CouncilDecision;
  riskSummary:   RiskLevel;
  agreementScore:number;
}

export class SpecialistCouncil {
  cardiologyAgent(p: { complaint?: string; symptoms?: string[]; vitals?: Record<string, number> }): SpecialistVote {
    const complaint = (p.complaint ?? "").toLowerCase();
    const symptoms  = (p.symptoms ?? []).map((s) => s.toLowerCase());
    const hr        = Number(p.vitals?.hr   ?? 72);
    const sbp       = Number(p.vitals?.systolicBP ?? 120);

    const hasChestPain = complaint.includes("chest") || symptoms.some((s) => s.includes("chest"));
    const hasPalpitations = symptoms.some((s) => s.includes("palpitat"));
    const hemodynamicInstability = sbp < 90 || hr > 130;

    if (hemodynamicInstability) {
      return { specialty: "cardiology", risk: "CRITICAL", action: "ICU", rationale: "Hemodynamic instability" };
    }
    if (hasChestPain) {
      return { specialty: "cardiology", risk: "HIGH", action: "ED", rationale: "Chest pain — ACS/PE must be ruled out" };
    }
    if (hasPalpitations) {
      return { specialty: "cardiology", risk: "MEDIUM", action: "monitoring", rationale: "Palpitations — rhythm evaluation needed" };
    }
    return { specialty: "cardiology", risk: "LOW", rationale: "No cardiac red flags" };
  }

  infectiousDiseaseAgent(p: { complaint?: string; symptoms?: string[]; vitals?: Record<string, number> }): SpecialistVote {
    const complaint = (p.complaint ?? "").toLowerCase();
    const symptoms  = (p.symptoms ?? []).map((s) => s.toLowerCase());
    const tempF     = Number(p.vitals?.tempF ?? 98.6);
    const hr        = Number(p.vitals?.hr    ?? 72);

    const hasFever  = tempF > 100.4 || symptoms.some((s) => s === "fever");
    const septicSigns = hasFever && hr > 110;

    if (septicSigns) {
      return { specialty: "ID", risk: "HIGH", action: "blood_cultures_broad_spectrum_abx", rationale: "Fever + tachycardia — sepsis screen" };
    }
    if (hasFever) {
      return { specialty: "ID", risk: "MEDIUM", action: "labs", rationale: "Fever — source localisation required" };
    }
    if (complaint.includes("sore throat") || symptoms.some((s) => s.includes("sore throat"))) {
      return { specialty: "ID", risk: "LOW", action: "rapid_strep", rationale: "Pharyngitis — strep testing" };
    }
    return { specialty: "ID", risk: "LOW", rationale: "No infectious red flags" };
  }

  icuAgent(p: { redFlags?: boolean | string[]; vitals?: Record<string, number> }): SpecialistVote {
    const hasRedFlags = p.redFlags === true || (Array.isArray(p.redFlags) && p.redFlags.length > 0);
    const spo2        = Number(p.vitals?.spo2 ?? 99);
    const sbp         = Number(p.vitals?.systolicBP ?? 120);

    if (hasRedFlags || spo2 < 88 || sbp < 80) {
      const reason = hasRedFlags
        ? `Red flags: ${JSON.stringify(p.redFlags)}`
        : `Critical vitals: SpO2 ${spo2}% SBP ${sbp}`;
      return { specialty: "ICU", risk: "CRITICAL", action: "ICU", rationale: reason };
    }
    if (spo2 < 92 || sbp < 90) {
      return { specialty: "ICU", risk: "HIGH", action: "step_down_unit", rationale: "Borderline oxygenation/perfusion" };
    }
    return { specialty: "ICU", risk: "LOW", rationale: "Vitals within acceptable range" };
  }

  consensus(votes: SpecialistVote[]): { decision: CouncilDecision; riskSummary: RiskLevel; agreementScore: number } {
    const risks: RiskLevel[] = votes.map((v) => v.risk);

    const riskOrder: Record<RiskLevel, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
    const maxRisk    = risks.reduce((max, r) => riskOrder[r] > riskOrder[max] ? r : max, "LOW" as RiskLevel);

    let decision: CouncilDecision;
    if (maxRisk === "CRITICAL")       decision = "ICU";
    else if (maxRisk === "HIGH")      decision = "ED";
    else if (maxRisk === "MEDIUM")    decision = "URGENT_CARE";
    else                              decision = "OUTPATIENT";

    // Agreement score: 1.0 = all same, 0.0 = all different
    const counts = Object.fromEntries([...new Set(risks)].map((r) => [r, risks.filter((x) => x === r).length]));
    const maxCount = Math.max(...Object.values(counts));
    const agreementScore = Number((maxCount / votes.length).toFixed(3));

    return { decision, riskSummary: maxRisk, agreementScore };
  }

  async evaluate(patient: {
    complaint?: string;
    symptoms?:  string[];
    vitals?:    Record<string, number>;
    redFlags?:  boolean | string[];
  }): Promise<CouncilResult> {
    const votes = [
      this.cardiologyAgent(patient),
      this.infectiousDiseaseAgent(patient),
      this.icuAgent(patient),
    ];

    const { decision, riskSummary, agreementScore } = this.consensus(votes);

    return { votes, finalDecision: decision, riskSummary, agreementScore };
  }
}

export const specialistCouncil = new SpecialistCouncil();

// ─────────────────────────────────────────────────────────────────────────────
// Token-based specialist council (used by fullPipeline.ts)
// Each specialist filters the token's posterior against its domain diagnoses.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClinicalTokenSet } from "../core/clinicalTokens";

interface TokenSpecialistVote {
  specialist: string;
  diagnoses:  string[];
  confidence: number;
  rationale:  string;
}

function filterDx(tokens: ClinicalTokenSet, allowed: string[]): string[] {
  return Object.keys(tokens.posterior).filter((dx) => allowed.includes(dx));
}

async function cardiologyTokenAgent(tokens: ClinicalTokenSet): Promise<TokenSpecialistVote> {
  const cardiac = ["acs", "mi", "arrhythmia", "chf", "pe", "pulmonary_embolism", "aortic_dissection"];
  const matches = filterDx(tokens, cardiac);
  const confidence = matches.length ? 0.85 : 0.60;
  return { specialist: "cardiology", diagnoses: matches, confidence, rationale: matches.length ? `Cardiac dx in posterior: ${matches.join(",")}` : "No cardiac flags in posterior" };
}

async function infectiousDiseaseTokenAgent(tokens: ClinicalTokenSet): Promise<TokenSpecialistVote> {
  const id = ["sepsis", "pneumonia", "viral_uri", "uti", "strep", "meningitis", "endocarditis"];
  const matches = filterDx(tokens, id);
  const confidence = matches.length ? 0.88 : 0.55;
  return { specialist: "infectious_disease", diagnoses: matches, confidence, rationale: matches.length ? `ID dx in posterior: ${matches.join(",")}` : "No infectious flags" };
}

async function icuTokenAgent(tokens: ClinicalTokenSet): Promise<TokenSpecialistVote> {
  const icu = ["shock", "respiratory_failure", "sepsis", "ards", "multi_organ_failure"];
  const matches = filterDx(tokens, icu);
  const confidence = tokens.riskLevel === "critical" ? 0.95 : 0.65;
  return { specialist: "icu", diagnoses: matches, confidence, rationale: `Risk ${tokens.riskLevel}, red flags: ${tokens.redFlags.join(",") || "none"}` };
}

function aggregateTokenVotes(votes: TokenSpecialistVote[]): string[] {
  const combined: Record<string, number> = {};
  for (const v of votes) {
    for (const dx of v.diagnoses) {
      combined[dx] = (combined[dx] ?? 0) + v.confidence;
    }
  }
  return Object.entries(combined)
    .sort((a, b) => b[1] - a[1])
    .map(([dx]) => dx);
}

export async function runSpecialistCouncil(tokens: ClinicalTokenSet): Promise<{ consensus: string[]; votes: TokenSpecialistVote[] }> {
  const votes = await Promise.all([
    cardiologyTokenAgent(tokens),
    infectiousDiseaseTokenAgent(tokens),
    icuTokenAgent(tokens),
  ]);
  return { consensus: aggregateTokenVotes(votes), votes };
}

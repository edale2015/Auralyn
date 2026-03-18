import { ParsedSymptomPack, ParsedModifierPack, ParsedClinicianAlgorithm, AnswerMap } from "../../shared/packRows";
import { evaluateSymptomPack } from "./symptomPackEvaluationEngine";

export interface SimulationCase {
  packId: string;
  packTitle: string;
  answers: AnswerMap;
  escalated: boolean;
  reviewed: boolean;
  disposition: string;
  redFlagsTriggered: string[];
  algorithmCount: number;
  riskDelta: number;
}

export interface SimulationSummary {
  totalRuns: number;
  escalationRate: number;
  reviewRate: number;
  underTriageCount: number;
  overTriageCount: number;
  dispositionBreakdown: Record<string, number>;
  perPack: PackSimSummary[];
  topFailures: string[];
  cases: SimulationCase[];
}

export interface PackSimSummary {
  packId: string;
  packTitle: string;
  runs: number;
  escalationRate: number;
  reviewRate: number;
  avgRedFlags: number;
  avgRiskDelta: number;
}

function randomYesNo(): string {
  return Math.random() < 0.5 ? "yes" : "no";
}

function generateRandomAnswers(pack: ParsedSymptomPack): AnswerMap {
  const answers: AnswerMap = {};
  for (const q of pack.questions) {
    if (q.type === "yes_no") {
      answers[q.id] = randomYesNo();
    } else if (q.type === "number" || q.type === "severity") {
      answers[q.id] = Math.floor(Math.random() * 10) + 1;
    } else if (q.type === "duration") {
      const durations = ["1 day", "3 days", "1 week", "2 weeks", "1 month"];
      answers[q.id] = durations[Math.floor(Math.random() * durations.length)];
    } else {
      answers[q.id] = "test_value";
    }
  }
  return answers;
}

export function runMassSimulation(
  symptomPacks: ParsedSymptomPack[],
  modifierPacks: ParsedModifierPack[],
  clinicianAlgorithms: ParsedClinicianAlgorithm[],
  n: number = 500
): SimulationSummary {
  const cases: SimulationCase[] = [];

  for (let i = 0; i < n; i++) {
    const pack = symptomPacks[Math.floor(Math.random() * symptomPacks.length)];
    const answers = generateRandomAnswers(pack);

    const result = evaluateSymptomPack(pack, modifierPacks, clinicianAlgorithms, answers);

    cases.push({
      packId: pack.id,
      packTitle: pack.title,
      answers,
      escalated: result.forceEscalation,
      reviewed: result.forceReview,
      disposition: result.finalDisposition,
      redFlagsTriggered: result.matchedRedFlags,
      algorithmCount: result.triggeredAlgorithms.length,
      riskDelta: result.modifierRiskDelta,
    });
  }

  if (cases.length === 0) {
    return {
      totalRuns: 0, escalationRate: 0, reviewRate: 0,
      underTriageCount: 0, overTriageCount: 0,
      dispositionBreakdown: {}, perPack: [], topFailures: [], cases: [],
    };
  }

  const escalationRate = cases.filter(c => c.escalated).length / cases.length;
  const reviewRate = cases.filter(c => c.reviewed).length / cases.length;

  const dispositionBreakdown: Record<string, number> = {};
  for (const c of cases) {
    dispositionBreakdown[c.disposition] = (dispositionBreakdown[c.disposition] || 0) + 1;
  }

  const erCases = cases.filter(c => c.disposition === "er_now");
  const selfCareCases = cases.filter(c => c.disposition === "self_care");
  const underTriageCount = selfCareCases.filter(c => c.redFlagsTriggered.length > 0).length;
  const overTriageCount = erCases.filter(c => c.redFlagsTriggered.length === 0 && c.riskDelta <= 0).length;

  const packMap: Record<string, SimulationCase[]> = {};
  for (const c of cases) {
    if (!packMap[c.packId]) packMap[c.packId] = [];
    packMap[c.packId].push(c);
  }

  const perPack: PackSimSummary[] = Object.entries(packMap).map(([packId, packCases]) => ({
    packId,
    packTitle: packCases[0].packTitle,
    runs: packCases.length,
    escalationRate: packCases.filter(c => c.escalated).length / packCases.length,
    reviewRate: packCases.filter(c => c.reviewed).length / packCases.length,
    avgRedFlags: packCases.reduce((sum, c) => sum + c.redFlagsTriggered.length, 0) / packCases.length,
    avgRiskDelta: packCases.reduce((sum, c) => sum + c.riskDelta, 0) / packCases.length,
  }));

  const topFailures = perPack
    .filter(p => p.escalationRate > 0.7)
    .sort((a, b) => b.escalationRate - a.escalationRate)
    .slice(0, 5)
    .map(p => `${p.packTitle}: ${(p.escalationRate * 100).toFixed(0)}% escalation`);

  return {
    totalRuns: n,
    escalationRate,
    reviewRate,
    underTriageCount,
    overTriageCount,
    dispositionBreakdown,
    perPack,
    topFailures,
    cases,
  };
}

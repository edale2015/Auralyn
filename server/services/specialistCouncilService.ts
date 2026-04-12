import type {
  ClinicalWorkflowState,
  SpecialistCouncilResult,
  SpecialistVote,
  RiskLevel,
} from "../types/clinical";

function cardiologyVote(state: ClinicalWorkflowState): SpecialistVote {
  const hr        = Number(state.vitals?.hr ?? 0);
  const sbp       = Number(state.vitals?.systolicBP ?? 120);
  const chestPain = Boolean(state.symptoms?.chestPain);
  const sob       = Boolean(state.symptoms?.sob);

  const cardiac = chestPain || sob || hr >= 120 || sbp < 90;

  return {
    specialty: "cardiology",
    recommendation: {
      diagnosis:   cardiac ? "Possible cardiac / cardiopulmonary event" : state.diagnosis,
      disposition: cardiac ? "ED now" : state.disposition,
      riskLevel:   cardiac ? "high" : (state.riskLevel ?? "low"),
    },
    confidence: cardiac ? 0.85 : 0.55,
    rationale:  cardiac
      ? ["Chest pain, SOB, tachycardia, or hypotension detected — cardiology flags for escalation"]
      : ["No cardiac red flag pattern identified"],
    redFlags: cardiac ? ["possible_cardiac_event"] : [],
  };
}

function infectiousDiseaseVote(state: ClinicalWorkflowState): SpecialistVote {
  const tempF     = Number(state.vitals?.tempF ?? 98.6);
  const hr        = Number(state.vitals?.hr ?? 0);
  const sbp       = Number(state.vitals?.systolicBP ?? 120);
  const confusion = Boolean(state.symptoms?.confusion);
  const chills    = Boolean(state.symptoms?.chills);

  const sepsisRisk = tempF >= 102.5 && (confusion || hr >= 120 || sbp < 90 || chills);

  return {
    specialty: "infectious_disease",
    recommendation: {
      diagnosis:   sepsisRisk ? "Possible sepsis / serious infection" : state.diagnosis,
      disposition: sepsisRisk ? "ED now" : state.disposition,
      riskLevel:   sepsisRisk ? "critical" : (state.riskLevel ?? "low"),
    },
    confidence: sepsisRisk ? 0.9 : 0.6,
    rationale:  sepsisRisk
      ? ["Fever plus hemodynamic instability / confusion increases infection severity concern"]
      : ["No infection-specific escalation pattern identified"],
    redFlags: sepsisRisk ? ["possible_sepsis"] : [],
  };
}

function icuVote(state: ClinicalWorkflowState): SpecialistVote {
  const spo2  = Number(state.vitals?.spo2 ?? 99);
  const rr    = Number(state.vitals?.rr ?? 16);
  const sbp   = Number(state.vitals?.systolicBP ?? 120);
  const critical = spo2 <= 90 || rr >= 30 || sbp < 90;

  return {
    specialty: "icu",
    recommendation: {
      diagnosis:   critical ? "Physiologic instability" : state.diagnosis,
      disposition: critical ? "ED now" : state.disposition,
      riskLevel:   critical ? "critical" : (state.riskLevel ?? "low"),
    },
    confidence: critical ? 0.92 : 0.55,
    rationale:  critical
      ? ["Vital sign instability suggests need for urgent escalation"]
      : ["No ICU-level physiologic instability detected"],
    redFlags: critical ? ["physiologic_instability"] : [],
  };
}

export function runSpecialistCouncil(
  state: ClinicalWorkflowState
): SpecialistCouncilResult {
  const votes = [cardiologyVote(state), infectiousDiseaseVote(state), icuVote(state)];

  const edVotes       = votes.filter((v) => v.recommendation.disposition === "ED now").length;
  const riskLevels    = votes.map((v) => v.recommendation.riskLevel ?? "low");
  const diagCounts    = new Map<string, number>();

  for (const vote of votes) {
    const dx = vote.recommendation.diagnosis ?? state.diagnosis ?? "Unknown";
    diagCounts.set(dx, (diagCounts.get(dx) ?? 0) + 1);
  }

  const consensusDiagnosis =
    [...diagCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? state.diagnosis;

  const consensusRisk: RiskLevel = riskLevels.includes("critical")
    ? "critical"
    : riskLevels.includes("high")
      ? "high"
      : riskLevels.includes("moderate")
        ? "moderate"
        : "low";

  const seen = new Set<string>();
  const disagreements: string[] = [];
  for (const vote of votes) {
    const label = `${vote.specialty}: ${vote.recommendation.diagnosis ?? "n/a"} / ${vote.recommendation.disposition ?? "n/a"}`;
    if (seen.has(label)) continue;
    seen.add(label);
    disagreements.push(label);
  }

  const avgConfidence = Number(
    (votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length).toFixed(2)
  );

  return {
    votes,
    consensus: {
      diagnosis:             consensusDiagnosis,
      disposition:           edVotes >= 2 ? "ED now" : (state.disposition ?? "Home care with follow-up"),
      riskLevel:             consensusRisk,
      confidence:            avgConfidence,
      disagreements:         disagreements.length > 1 ? disagreements : [],
      escalationRecommended: edVotes >= 2 || consensusRisk === "critical",
    },
  };
}

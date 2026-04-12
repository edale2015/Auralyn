import { runConsensus, weightedConsensus, type AgentOpinion, type ConsensusResult } from "../engines/consensusEngine";
import { applyDispositionGuardrail, type GuardrailInput, type GuardrailResult } from "../engines/dispositionGuardrail";
import { getNextBestQuestion, buildSoreThroatQuestions, type DiagnosisEntry } from "../engines/nextBestQuestion";
import { trackUsage } from "../monitoring/usageTracker";

export interface ClinicalAgentInput {
  complaint: string;
  features: Record<string, unknown>;
  riskScore?: number;
  redFlags?: string[];
  centorScore?: number;
  probability?: number;
}

export interface ClinicalConsensusOutput {
  consensus:         ConsensusResult;
  guardrail:         GuardrailResult;
  nextQuestion:      ReturnType<typeof getNextBestQuestion>;
  processingTimeMs:  number;
}

function syntheticAgentOpinions(input: ClinicalAgentInput): AgentOpinion[] {
  const { complaint, features } = input;
  const opinions: AgentOpinion[] = [];

  const hasfever    = Boolean(features.fever);
  const hasExudate  = Boolean(features.exudate || features.tonsillarExudate);
  const hasNodes    = Boolean(features.nodes || features.tenderAnteriorCervicalNodes);
  const hasCough    = Boolean(features.cough);
  const probability = input.probability ?? 0.3;

  const baseStrep = hasExudate && hasNodes ? "strep_pharyngitis" : "viral_pharyngitis";

  opinions.push({
    agent:     "infectious",
    diagnosis: hasExudate && hasNodes && !hasCough ? "strep_pharyngitis" : "viral_pharyngitis",
    confidence: probability,
    reasoning: "Centor criteria applied",
  });

  opinions.push({
    agent:     "general",
    diagnosis: hasExudate && hasNodes ? "strep_pharyngitis" : "viral_pharyngitis",
    confidence: probability * 0.9,
    reasoning: "General presentation assessment",
  });

  if (hasExudate && hasNodes && !hasCough) {
    opinions.push({
      agent:     "emergency",
      diagnosis: "strep_pharyngitis",
      confidence: Math.min(probability + 0.15, 0.95),
      reasoning: "Classic strep presentation",
    });
  }

  if (!hasExudate && !hasNodes && hasCough) {
    opinions.push({
      agent:     "pulmonary",
      diagnosis: "viral_pharyngitis",
      confidence: 0.85,
      reasoning: "Viral upper respiratory pattern",
    });
  }

  return opinions;
}

export async function runClinicalConsensus(
  input: ClinicalAgentInput
): Promise<ClinicalConsensusOutput> {
  const start = Date.now();

  const opinions = syntheticAgentOpinions(input);
  const consensus = runConsensus(opinions);

  trackUsage({
    model:         "consensus_engine",
    promptTokens:  opinions.length * 50,
    completionTokens: 100,
    endpoint:      "/consensus",
  });

  const guardrailInput: GuardrailInput = {
    diagnosis:      consensus.topDiagnosis ?? "unknown",
    riskScore:      input.riskScore ?? 0.3,
    redFlags:       input.redFlags ?? [],
    llmDisposition: "follow_up_primary_care",
    centorScore:    input.centorScore,
    probability:    input.probability,
  };

  const guardrail = applyDispositionGuardrail(guardrailInput);

  const differential: DiagnosisEntry[] = consensus.ranked.map((r) => ({
    diagnosis:   r.diagnosis,
    probability: r.normalizedScore,
  }));

  const questions = buildSoreThroatQuestions();
  const nextQuestion = getNextBestQuestion(differential, questions);

  return {
    consensus,
    guardrail,
    nextQuestion,
    processingTimeMs: Date.now() - start,
  };
}

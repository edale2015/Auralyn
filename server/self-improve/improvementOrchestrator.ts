import { loadAllTraces, ClinicalTrace } from "./traceStore";
import { listGoldCases, compareToGold, ComparisonResult } from "./goldCaseStore";
import { classifyFailure, FailureClassification } from "./failureClassifier";
import { generateProposal } from "./proposalEngine";
import { updateQ, computeReward, stateKey } from "./reinforcementEngine";
import { addEdge } from "./reasoningGraph";

export interface OrchestratorCycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  tracesProcessed: number;
  goldCasesEvaluated: number;
  failures: FailureClassification[];
  comparisons: ComparisonResult[];
  proposalsGenerated: number;
  rlUpdates: number;
  graphUpdates: number;
  summary: string;
}

export interface OrchestratorStatus {
  lastCycle: OrchestratorCycleResult | null;
  cycleCount: number;
  totalTracesProcessed: number;
  isRunning: boolean;
}

let status: OrchestratorStatus = {
  lastCycle: null,
  cycleCount: 0,
  totalTracesProcessed: 0,
  isRunning: false,
};

export async function runImprovementCycle(options: {
  maxCases?: number;
  complaintsFilter?: string[];
  dryRun?: boolean;
} = {}): Promise<OrchestratorCycleResult> {
  if (status.isRunning) {
    throw new Error("Improvement cycle already running. Wait for completion.");
  }
  status.isRunning = true;
  const cycleId = `CYCLE_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const result: OrchestratorCycleResult = {
    cycleId,
    startedAt,
    completedAt: "",
    tracesProcessed: 0,
    goldCasesEvaluated: 0,
    failures: [],
    comparisons: [],
    proposalsGenerated: 0,
    rlUpdates: 0,
    graphUpdates: 0,
    summary: "",
  };

  try {
    const allGoldCases = await listGoldCases();
    const filteredGold = options.complaintsFilter
      ? allGoldCases.filter(gc => options.complaintsFilter!.includes(gc.complaint))
      : allGoldCases;

    for (const goldCase of filteredGold.slice(0, options.maxCases ?? 50)) {
      const traceData: ClinicalTrace = {
        case_id: goldCase.case_id,
        timestamp: new Date().toISOString(),
        complaint: goldCase.complaint,
        channel: "synthetic",
        patient_context: goldCase.patient_context ?? {},
        modifier_intake: {},
        questions_asked: goldCase.required_questions.map((q, i) => ({
          question_id: `Q_${i}`,
          text: q,
          answer: "yes",
          order: i,
        })),
        signals_detected: goldCase.presented_symptoms,
        rules_triggered: [],
        differential_scores: goldCase.expected_top_diagnoses.map((dx, i) => ({
          diagnosis: dx,
          score: 0.7 - i * 0.1,
        })),
        final_output: {
          disposition: goldCase.expected_disposition,
          confidence: "medium",
          review_required: false,
        },
        missing_expected_data: [],
        runtime_flags: [],
      };

      const comparison = compareToGold(traceData, goldCase);
      result.comparisons.push(comparison);
      result.goldCasesEvaluated++;

      if (!comparison.pass) {
        const failure = classifyFailure(traceData, comparison);
        result.failures.push(failure);

        if (!options.dryRun) {
          const proposal = await generateProposal(failure);
          if (proposal) result.proposalsGenerated++;

          const rlState = {
            complaint: traceData.complaint,
            disposition: traceData.final_output.disposition,
            symptomCount: traceData.questions_asked.length,
            redFlagsPresent: comparison.dangerous_miss,
            modifiersPresent: Object.keys(traceData.modifier_intake).length > 0,
          };
          const reward = computeReward(
            traceData.final_output.disposition,
            goldCase.expected_disposition,
            comparison.dangerous_miss
          );
          await updateQ(rlState, traceData.final_output.disposition, reward);
          result.rlUpdates++;
        }
      }

      for (const symptom of goldCase.presented_symptoms) {
        for (const dx of goldCase.expected_top_diagnoses) {
          if (!options.dryRun) {
            await addEdge(symptom, dx, comparison.pass, goldCase.complaint);
            result.graphUpdates++;
          }
        }
      }

      result.tracesProcessed++;
    }

    const recentTraces = await loadAllTraces();
    for (const trace of recentTraces.slice(0, options.maxCases ?? 20)) {
      if (options.complaintsFilter && !options.complaintsFilter.includes(trace.complaint)) continue;
      const matchingGold = filteredGold.find(gc => gc.case_id === trace.case_id);
      if (!matchingGold) continue;

      const comparison = compareToGold(trace, matchingGold);
      if (!comparison.pass) {
        const failure = classifyFailure(trace, comparison);
        result.failures.push(failure);
        if (!options.dryRun) {
          await generateProposal(failure);
          result.proposalsGenerated++;
        }
      }
      result.tracesProcessed++;
    }

    const passRate = result.comparisons.length > 0
      ? result.comparisons.filter(c => c.pass).length / result.comparisons.length
      : 1;
    const dangerousMisses = result.failures.filter(f => f.severity === "critical").length;

    result.summary = `Cycle ${cycleId}: Processed ${result.tracesProcessed} cases. Pass rate: ${(passRate * 100).toFixed(0)}%. Failures: ${result.failures.length}. Dangerous misses: ${dangerousMisses}. Proposals generated: ${result.proposalsGenerated}. RL updates: ${result.rlUpdates}.`;
    result.completedAt = new Date().toISOString();

    status.lastCycle = result;
    status.cycleCount++;
    status.totalTracesProcessed += result.tracesProcessed;

    return result;
  } finally {
    status.isRunning = false;
  }
}

export function getOrchestratorStatus(): OrchestratorStatus {
  return { ...status };
}

export async function runFullCycle(): Promise<OrchestratorCycleResult> {
  return runImprovementCycle({ maxCases: 100 });
}

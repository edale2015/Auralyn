import type { AgentRunConfig, CaseState } from "../../shared/agentTypes";
import type { AgentRunResponse, NormalizedResult, TraceEvent, TraceStep } from "../../shared/testingTypes";
import { routeNextAction } from "./router";
import { executeAction, hashNormalized } from "./executors";

function nowISO() {
  return new Date().toISOString();
}

function getCommit(): string {
  return process.env.GIT_COMMIT_SHA || "dev";
}

export function buildAgentRunResponse(
  runId: string,
  sheetEnv: string,
  rulesetHash: string,
  state: CaseState,
  steps: TraceStep[],
  events: TraceEvent[]
): AgentRunResponse {
  const normalizedFinal: NormalizedResult = {
    disposition: state.disposition ?? "unknown",
    dx: state.diagnosisClusterIds ?? [],
    scores: state.scores ?? {},
    redFlags: state.redFlags ?? [],
  };

  return {
    runId,
    env: { sheetEnv, commit: getCommit(), rulesetHash },
    result: {
      disposition: state.disposition ?? "unknown",
      dispositionReasonCodes: state.dispositionReasonCodes ?? [],
      diagnosisClusterIds: state.diagnosisClusterIds ?? [],
      scores: state.scores ?? {},
      recommendedActions: (state.recommendedActions ?? []).map(a => ({
        type: a.type,
        priority: a.priority,
      })),
    },
    trace: { steps, events },
    normalized: {
      final: normalizedFinal,
      hash: hashNormalized(normalizedFinal),
    },
  };
}

export async function runAgentLoop(initial: CaseState, cfg: AgentRunConfig): Promise<{
  finalState: CaseState;
  steps: TraceStep[];
  events: TraceEvent[];
  stopReason: string;
}> {
  let state = { ...initial, updatedAt: nowISO() };
  const steps: TraceStep[] = [];
  const events: TraceEvent[] = [];

  let stopReason = "MAX_STEPS";

  for (let i = 1; i <= cfg.maxSteps; i++) {
    const next = routeNextAction(state, cfg);
    const exec = await executeAction(state, next.action, cfg, i);

    state = exec.state;
    if (exec.step) steps.push(exec.step);
    if (exec.events) events.push(...exec.events);

    if (exec.stop) {
      stopReason = exec.stop.reason;
      break;
    }
  }

  return { finalState: state, steps, events, stopReason };
}

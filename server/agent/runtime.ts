import type { AgentRunConfig, CaseState } from "../../shared/agentTypes";
import type { AgentRunResponse, NormalizedResult, TraceEvent, TraceStep } from "../../shared/testingTypes";
import { routeNextAction } from "./router";
import { executeAction, hashNormalized } from "./executors";
import { initializePipeline } from "./pipeline";
import {
  createAgentState,
  enforceAgentCaps,
  incrementStep,
  incrementLlmCall,
  HarnessCapExceeded,
} from "../harness/harnessEnforcer";

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

  const pipelineResult = await initializePipeline(state, cfg);
  state = pipelineResult.state;
  events.push(...pipelineResult.events);

  let stopReason = "MAX_STEPS";

  // ── Harness: initialise agent state for safety caps enforcement ───────────
  const caseId = (initial as any).caseId ?? (initial as any).sessionId ?? "unknown";
  let agentState = createAgentState(caseId);

  for (let i = 1; i <= cfg.maxSteps; i++) {
    // ── Harness: enforce caps at the top of every cycle (GP-01, AGENTS.md §SAFETY_CAPS) ──
    try {
      enforceAgentCaps(agentState);
    } catch (err) {
      if (err instanceof HarnessCapExceeded) {
        events.push({
          type: "HARNESS_CAP_EXCEEDED",
          severity: "error",
          message: err.message,
        } as any);
        stopReason = `HARNESS_CAP_EXCEEDED:${err.cap}`;
        break;
      }
      throw err;
    }

    const next = routeNextAction(state, cfg);
    const exec = await executeAction(state, next.action, cfg, i);

    state = exec.state;
    if (exec.step) steps.push(exec.step);
    if (exec.events) events.push(...exec.events);

    // ── Harness: increment counters after each cycle ──────────────────────
    agentState = incrementStep(incrementLlmCall(agentState, 0.02));

    if (exec.stop) {
      stopReason = exec.stop.reason;
      break;
    }
  }

  return { finalState: state, steps, events, stopReason };
}

import { compressContext }  from "../context/compression";
import { checkPermission }  from "../governance/permissionEngine";
import { dispatchTools }    from "../tools/dispatch";
import { bus }              from "../events/eventBus";
import type { ClinicalSession } from "../session/sessionManager";

const MAX_ITERATIONS = 20;

export interface LoopResult {
  session:    ClinicalSession;
  iterations: number;
  finalState: Record<string, unknown>;
  trace:      LoopStep[];
}

export interface LoopStep {
  iteration:  number;
  tool:       string;
  input:      Record<string, unknown>;
  output:     unknown;
  permitted:  boolean;
  blockedReason?: string;
}

export interface SyntheticResponse {
  stop_reason: "tool_use" | "end_turn";
  tool_calls:  Array<{ id: string; name: string; input: Record<string, unknown> }>;
  content:     string;
}

function buildSyntheticResponse(
  session: ClinicalSession,
  iteration: number
): SyntheticResponse {
  const state    = session.state;
  const features = (state.features as Record<string, unknown>) ?? {};

  if (iteration === 0) {
    return {
      stop_reason: "tool_use",
      content:     "Running red flag check first.",
      tool_calls:  [{ id: `tc-${iteration}-1`, name: "check_red_flags", input: { features } }],
    };
  }

  if (iteration === 1) {
    return {
      stop_reason: "tool_use",
      content:     "Calculating clinical score.",
      tool_calls:  [{
        id:    `tc-${iteration}-1`,
        name:  "calculate_score",
        input: { score_type: "full_clinical", features },
      }],
    };
  }

  return {
    stop_reason: "tool_use",
    content:     "Generating final disposition.",
    tool_calls:  [{
      id:    `tc-${iteration}-1`,
      name:  "generate_disposition",
      input: {
        diagnosis:            state.topDiagnosis ?? "unknown",
        risk_score:           state.riskScore    ?? 0.3,
        triggered_red_flags:  state.redFlags     ?? [],
        preferred_disposition: "follow_up_primary_care",
        centor_score:         (state.clinicalScore as any)?.centorScore,
        probability:          (state.clinicalScore as any)?.probability,
      },
    }],
  };
}

export async function clinicalAgentLoop(session: ClinicalSession): Promise<LoopResult> {
  bus.emit("session_start", { sessionId: session.id, complaint: session.complaint });

  const trace: LoopStep[] = [];
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    session.messages = compressContext(session.messages) as any;

    const response = buildSyntheticResponse(session, iterations);
    session.messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use" || response.tool_calls.length === 0) break;

    const toolResults: unknown[] = [];

    for (const toolCall of response.tool_calls) {
      bus.emit("pre_tool_use", { toolCall, sessionId: session.id });

      const permission = checkPermission(toolCall);
      const step: LoopStep = {
        iteration:  iterations,
        tool:       toolCall.name,
        input:      toolCall.input,
        output:     null,
        permitted:  permission.allowed,
        blockedReason: permission.reason ?? undefined,
      };

      if (!permission.allowed) {
        step.output = { blocked: true, reason: permission.reason };
        toolResults.push({ tool_use_id: toolCall.id, content: `Blocked: ${permission.reason}` });
        bus.emit("tool_blocked", { toolCall, reason: permission.reason });
      } else {
        const output  = await dispatchTools(toolCall);
        step.output   = output;

        if (toolCall.name === "check_red_flags" && typeof output === "object") {
          session.state.redFlagsResult = output;
          session.state.redFlags = (output as any).triggered ?? [];
        }
        if (toolCall.name === "calculate_score" && typeof output === "object") {
          session.state.clinicalScore = output;
        }
        if (toolCall.name === "generate_disposition" && typeof output === "object") {
          session.state.finalDisposition = (output as any).finalDisposition;
          session.state.dispositionResult = output;
        }

        toolResults.push({ tool_use_id: toolCall.id, content: output });
        bus.emit("post_tool_use", { toolCall, output, sessionId: session.id });
      }

      trace.push(step);
    }

    session.messages.push({ role: "tool", content: toolResults });
    iterations++;

    if (session.state.dispositionResult) break;
  }

  bus.emit("session_end", { sessionId: session.id, iterations, trace });

  return {
    session,
    iterations,
    finalState: session.state,
    trace,
  };
}

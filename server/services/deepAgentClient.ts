export type DeepAgentTaskType =
  | "research"
  | "kb_audit"
  | "code_review"
  | "workflow_upgrade"
  | "article_compare"
  | "general";

export interface DeepAgentMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

export interface DeepAgentRunRequest {
  session_id: string;
  task_type: DeepAgentTaskType;
  user_prompt: string;
  messages?: DeepAgentMessage[];
  attachments?: Record<string, string>;
  context?: Record<string, unknown>;
  write_artifacts?: boolean;
}

export interface DeepAgentRunResponse {
  ok: boolean;
  session_id: string;
  task_type: DeepAgentTaskType;
  final_text: string;
  artifacts: string[];
  structured_output: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface DeepAgentHealthResponse {
  ok: boolean;
  model: string;
  memory_dir: string;
  work_dir: string;
}

const DEEP_AGENT_URL = process.env.DEEP_AGENT_URL || "http://deep-agent-service:8081";

export async function checkDeepAgentHealth(): Promise<DeepAgentHealthResponse> {
  const res = await fetch(`${DEEP_AGENT_URL}/health`, {
    method: "GET",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`DeepAgent health check failed: ${res.status}`);
  }
  return (await res.json()) as DeepAgentHealthResponse;
}

export async function runDeepAgent(
  payload: DeepAgentRunRequest
): Promise<DeepAgentRunResponse> {
  const res = await fetch(`${DEEP_AGENT_URL}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepAgent request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as DeepAgentRunResponse;
}

export async function safeRunDeepAgent(
  payload: DeepAgentRunRequest
): Promise<DeepAgentRunResponse> {
  try {
    return await runDeepAgent(payload);
  } catch (err: any) {
    return {
      ok: false,
      session_id: payload.session_id,
      task_type: payload.task_type,
      final_text: "",
      artifacts: [],
      structured_output: {},
      raw: { error: err.message || "Deep Agent service unavailable" },
    };
  }
}

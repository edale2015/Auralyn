import { runDeepAgent, DeepAgentRunResponse } from "./deepAgentClient";

export interface UpgradeInput {
  articleText: string;
  moduleName: string;
  currentKbSummary: Record<string, unknown>;
  currentFlowSummary: Record<string, unknown>;
  currentArchitectureSummary: Record<string, unknown>;
}

export interface UpgradeOutput {
  summary: Record<string, unknown>;
  kb_changes: unknown[];
  workflow_changes: unknown[];
  api_changes: unknown[];
  dashboard_changes: unknown[];
  safety_notes: unknown[];
  rollout_plan: unknown[];
}

export function parseUpgradeOutput(res: DeepAgentRunResponse): UpgradeOutput {
  const s = res.structured_output as Partial<UpgradeOutput>;
  return {
    summary: s.summary ?? {},
    kb_changes: s.kb_changes ?? [],
    workflow_changes: s.workflow_changes ?? [],
    api_changes: s.api_changes ?? [],
    dashboard_changes: s.dashboard_changes ?? [],
    safety_notes: s.safety_notes ?? [],
    rollout_plan: s.rollout_plan ?? [],
  };
}

export async function runUploadedArticleUpgrade(
  input: UpgradeInput
): Promise<DeepAgentRunResponse> {
  return await runDeepAgent({
    session_id: `upgrade-${Date.now()}`,
    task_type: "kb_audit",
    user_prompt: `
You are reviewing uploaded source material for incorporation into our production medical platform.

Tasks:
1. extract the key capabilities or recommendations from the source
2. compare them to our current KB/workflow/architecture
3. identify gaps
4. propose exact KB changes
5. propose exact code/service/dashboard changes
6. assign priority, risk, and rollout order
7. save structured JSON outputs under /workspace/output/

Required JSON sections:
{
  "summary": {},
  "kb_changes": [],
  "workflow_changes": [],
  "api_changes": [],
  "dashboard_changes": [],
  "safety_notes": [],
  "rollout_plan": []
}
`,
    attachments: {
      "uploaded_source.txt": input.articleText,
      "kb_summary.json": JSON.stringify(input.currentKbSummary, null, 2),
      "flow_summary.json": JSON.stringify(input.currentFlowSummary, null, 2),
      "architecture_summary.json": JSON.stringify(
        input.currentArchitectureSummary,
        null,
        2
      ),
    },
    context: {
      moduleName: input.moduleName,
      platformType: "HIPAA/FDA-aware urgent care triage SaaS",
    },
    write_artifacts: true,
  });
}

export async function runKbAuditFromSource(opts: {
  sessionId?: string;
  sourceText: string;
  kbSnapshot?: Record<string, unknown>;
  complaintFlows?: Record<string, unknown>;
  rulesContext?: Record<string, unknown>;
  moduleName?: string;
}): Promise<DeepAgentRunResponse> {
  return await runDeepAgent({
    session_id: opts.sessionId || `kb-audit-${Date.now()}`,
    task_type: "kb_audit",
    user_prompt: `
Audit the supplied source against our KB and workflows.

Return:
- impacted complaints
- impacted KB tables
- exact suggested rules/questions/dispositions
- missing score thresholds
- recommended engine changes
- priority and risk level
- JSON patch proposal
`,
    attachments: {
      "source_material.txt": opts.sourceText || "",
      "kb_snapshot.json": JSON.stringify(opts.kbSnapshot || {}, null, 2),
      "complaint_flows.json": JSON.stringify(opts.complaintFlows || {}, null, 2),
    },
    context: {
      moduleName: opts.moduleName,
      rulesContext: opts.rulesContext,
    },
    write_artifacts: true,
  });
}

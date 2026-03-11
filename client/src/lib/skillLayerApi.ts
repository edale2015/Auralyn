export type SkillLayerRunRequest = {
  caseId?: string;
  rawText: string;
  modifiers?: Record<string, any>;
};

export type SkillLayerRunResponse = {
  ok: boolean;
  state: any;
};

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${url}`);
  }
  return res.json();
}

export const skillLayerApi = {
  runCase(payload: SkillLayerRunRequest) {
    return postJson<SkillLayerRunResponse>("/api/skill-layer/run", payload);
  },
  buildChartNote(context: any) {
    return postJson<{ ok: boolean; note: any }>("/api/skill-layer/chart-note", { context });
  },
  buildDischarge(context: any) {
    return postJson<{ ok: boolean; instructions: any }>("/api/skill-layer/discharge", { context });
  },
  getAuditTrace(context: any) {
    return postJson<{ ok: boolean; trace: any[] }>("/api/skill-layer/audit-trace", { context });
  },
  enqueueCallback(context: any) {
    return postJson<{ ok: boolean; queued: boolean; callback_id?: string }>(
      "/api/skill-layer/callback-queue",
      { context }
    );
  },
  getGraphTrace(context: any) {
    return postJson<{ ok: boolean; trace: any }>("/api/skill-layer/graph-trace", { context });
  },
  saveOutcome(payload: any) {
    return postJson<{ ok: boolean; result: any }>("/api/skill-layer/outcome", payload);
  },
  saveFollowUp(payload: any) {
    return postJson<{ ok: boolean; result: any }>("/api/skill-layer/followup", payload);
  },
};

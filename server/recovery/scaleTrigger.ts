import { emitEvent } from "../controlTower/eventBus";

export interface ScaleRequest {
  replicas: number;
  reason: string;
}

export async function scaleUp(replicas = 10, reason = "recovery"): Promise<boolean> {
  const endpoint = process.env.K8S_SCALE_ENDPOINT;
  if (!endpoint) {
    console.warn("[ScaleTrigger] K8S_SCALE_ENDPOINT not set — scale-up skipped");
    emitEvent({
      type: "ALERT",
      payload: { message: `K8s scale-up requested (${replicas} replicas) but endpoint not configured`, severity: "MEDIUM" },
      timestamp: Date.now(),
    });
    return false;
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.K8S_API_TOKEN ?? ""}` },
      body: JSON.stringify({ replicas, reason }),
      signal: AbortSignal.timeout(5000),
    });
    const ok = res.ok;
    emitEvent({
      type: ok ? "REGION_STATUS" : "ALERT",
      payload: { action: "k8s_scale_up", replicas, reason, status: ok ? "accepted" : `failed HTTP ${res.status}` },
      timestamp: Date.now(),
    });
    return ok;
  } catch (e: any) {
    console.error("[ScaleTrigger] Scale-up request failed:", e?.message);
    emitEvent({
      type: "ERROR",
      payload: { source: "scaleTrigger", error: e?.message, replicas, reason },
      timestamp: Date.now(),
    });
    return false;
  }
}

export async function scaleDown(replicas = 3, reason = "recovery-complete"): Promise<boolean> {
  return scaleUp(replicas, reason);
}

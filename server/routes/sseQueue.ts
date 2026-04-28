import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { firestoreCaseStore } from "../services/firestoreCaseStore";
import { classifyAndPersist } from "../services/caseTypeClassifier";
import { patchCaseDoc } from "../services/caseService";

export const sseQueueRouter = Router();

const SSE_HEARTBEAT_MS = 8000;
const SSE_QUEUE_PUSH_MS = 12000;

// ── Original review-queue SSE endpoint ────────────────────────────────────

sseQueueRouter.get("/api/sse/review-queue", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;

  const send = (event: string, data: unknown) => {
    if (!closed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if ((res as any).flush) (res as any).flush();
    }
  };

  const pushQueue = async () => {
    if (closed) return;
    try {
      const stateFilter = (req.query.state as string) || "NEEDS_REVIEW";
      const cases = await firestoreCaseStore.listCases({ status: stateFilter as any, limit: 100 });
      send("queue-update", { state: stateFilter, count: cases.length, cases });
    } catch (err: any) {
      send("error", { message: err?.message ?? "Failed to fetch queue" });
    }
  };

  send("connected", { message: "SSE stream connected", ts: new Date().toISOString() });
  pushQueue();

  const dataInterval = setInterval(pushQueue, SSE_QUEUE_PUSH_MS);
  const heartbeatInterval = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, SSE_HEARTBEAT_MS);

  req.on("close", () => {
    closed = true;
    clearInterval(dataInterval);
    clearInterval(heartbeatInterval);
    res.end();
  });
});

// ── Enhanced /api/sse/queue endpoint with severity bucketing ──────────────

const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "unknown"] as const;
type SeverityBucket = (typeof SEVERITY_ORDER)[number];

function getSeverityFromCase(c: any): SeverityBucket {
  const sev = c?.brainOutput?.severity?.severityLevel
    ?? c?.engineResult?.severity
    ?? c?.triage?.severity;
  if (SEVERITY_ORDER.includes(sev)) return sev as SeverityBucket;

  const disp = (c?.triage?.disposition ?? c?.engineResult?.recommendedDisposition ?? "").toLowerCase();
  if (disp === "er_now" || disp === "call_911" || disp === "er_send") return "critical";
  if (disp === "urgent_care" || disp === "ed_now") return "high";
  if (disp === "needs_workup") return "moderate";
  return "low";
}

function getPriorityLabel(sev: SeverityBucket): string {
  if (sev === "critical") return "P1";
  if (sev === "high") return "P2";
  if (sev === "moderate") return "P3";
  return "P4";
}

sseQueueRouter.get("/api/sse/queue", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;

  const send = (event: string, data: unknown) => {
    if (!closed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if ((res as any).flush) (res as any).flush();
    }
  };

  const pushQueue = async () => {
    if (closed) return;
    try {
      const stateFilter = (req.query.state as string) || "NEEDS_REVIEW";
      const raw = await firestoreCaseStore.listCases({ status: stateFilter as any, limit: 200 });

      // Annotate with severity + priority + caseType
      const annotated = raw.map((c: any) => {
        const severity = getSeverityFromCase(c);
        const withSev = { ...c, _severity: severity, _priority: getPriorityLabel(severity) };
        if (withSev.caseType) return { ...withSev, caseTypePending: false };
        classifyAndPersist(c.caseId, c, patchCaseDoc).catch(() => {});
        return { ...withSev, caseTypePending: true };
      });

      // Sort by severity order then by createdAt desc
      annotated.sort((a: any, b: any) => {
        const ia = SEVERITY_ORDER.indexOf(a._severity);
        const ib = SEVERITY_ORDER.indexOf(b._severity);
        if (ia !== ib) return ia - ib;
        return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      });

      // Build severity buckets
      const buckets: Record<SeverityBucket, number> = {
        critical: 0, high: 0, moderate: 0, low: 0, unknown: 0,
      };
      for (const c of annotated) buckets[c._severity as SeverityBucket] = (buckets[c._severity as SeverityBucket] || 0) + 1;

      send("queue-update", {
        state: stateFilter,
        count: annotated.length,
        cases: annotated,
        buckets,
        pushedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      send("error", { message: err?.message ?? "Failed to fetch queue" });
    }
  };

  send("connected", { message: "Enhanced SSE queue connected", ts: new Date().toISOString() });
  pushQueue();

  const dataInterval = setInterval(pushQueue, SSE_QUEUE_PUSH_MS);
  const heartbeatInterval = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, SSE_HEARTBEAT_MS);

  req.on("close", () => {
    closed = true;
    clearInterval(dataInterval);
    clearInterval(heartbeatInterval);
    res.end();
  });
});

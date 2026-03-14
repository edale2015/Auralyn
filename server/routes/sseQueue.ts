import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { firestoreCaseStore } from "../services/firestoreCaseStore";

export const sseQueueRouter = Router();

const SSE_HEARTBEAT_MS = 8000;
const SSE_QUEUE_PUSH_MS = 12000;

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

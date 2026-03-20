import { v4 as uuidv4 } from "uuid";
import { Request } from "express";

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentTraceId?: string;
}

export function createTraceContext(req?: Request): TraceContext {
  const parentTraceId = req?.headers?.["x-trace-id"] as string | undefined;
  const traceId = parentTraceId ?? uuidv4();
  const spanId = uuidv4().split("-")[0];
  return { traceId, spanId, parentTraceId };
}

export function traceMiddleware(req: any, res: any, next: () => void): void {
  const ctx = createTraceContext(req);
  req.traceContext = ctx;
  res.setHeader("x-trace-id", ctx.traceId);
  res.setHeader("x-span-id", ctx.spanId);
  next();
}

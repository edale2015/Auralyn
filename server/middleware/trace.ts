import { v4 as uuid } from "uuid";
import { runWithRequestContext } from "../monitoring/requestContext";

let otelApi: typeof import("@opentelemetry/api") | null = null;

async function loadOtel() {
  if (!otelApi) {
    try {
      otelApi = await import("@opentelemetry/api");
    } catch {
      otelApi = null;
    }
  }
  return otelApi;
}

export function traceMiddleware(req: any, res: any, next: any) {
  const incoming = req.headers["x-trace-id"];

  let traceId =
    (typeof incoming === "string" && incoming.trim()) ||
    uuid();

  try {
    const api = otelApi;
    if (api) {
      const activeSpan = api.trace.getSpan(api.context.active());
      const otelTraceId = activeSpan?.spanContext().traceId;
      if (otelTraceId) traceId = otelTraceId;
    }
  } catch {
  }

  req.traceId = traceId;
  res.setHeader("x-trace-id", traceId);

  runWithRequestContext(
    {
      traceId,
      clinicId: req.clinic?.id,
      userId: req.user?.id
    },
    () => next()
  );
}

loadOtel().catch(() => {});

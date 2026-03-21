import { recordEngineError, recordEngineSuccess } from "../repos/engineMetricsRepo";

export async function withEngineMetrics<T>(
  engineName: string,
  clinicId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    await recordEngineSuccess({
      clinicId,
      engineName,
      latencyMs: Date.now() - start
    });
    return result;
  } catch (err: any) {
    await recordEngineError({
      clinicId,
      engineName,
      latencyMs: Date.now() - start,
      error: err?.message || "Unknown engine error"
    });
    throw err;
  }
}

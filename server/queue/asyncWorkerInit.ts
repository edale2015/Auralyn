import { registerHandler, AsyncJob } from "./asyncWorker";
import { auditStep } from "../audit/auditLogger";
import { logEngineStatus } from "../monitoring/systemMonitor";
import { saveSnapshot } from "../snapshots/systemSnapshot";
import { saveFullSnapshot } from "../snapshots/fullSnapshot";
import { recordSample } from "../monitoring/dataDrift";
import { notifyOnCallPhysician } from "../notifications/notifier";

let initialized = false;

export function initAsyncWorkerHandlers(): void {
  if (initialized) return;
  initialized = true;

  registerHandler("audit", async (job: AsyncJob) => {
    const p = job.payload;
    if (p.step) {
      await auditStep({ traceId: p.traceId, step: p.step, input: p.input, output: p.output });
    } else if (p.engine) {
      await logEngineStatus(p.engine, p.status, p.latencyMs, p.error);
    }
  });

  registerHandler("snapshot", async (job: AsyncJob) => {
    const { state, meta, sample } = job.payload;
    await Promise.all([
      saveFullSnapshot({
        traceId: meta?.traceId ?? state?.traceId ?? "unknown",
        patientId: meta?.patientId,
        complaint: meta?.complaint,
        input: meta ?? {},
        weights: state?.weights,
        safetyLevel: state?.safety?.level,
        confidence: state?.confidence,
        autonomyMode: state?.autonomyMode,
      }).catch(() => saveSnapshot(state, meta).catch(() => {})),
      sample ? Promise.resolve(recordSample(sample)) : Promise.resolve(),
    ]);
  });

  registerHandler("learning", async (job: AsyncJob) => {
    const { complaint, scores, answers } = job.payload;
    const { recordOutcome, runLearningCycle } = await import("../engines/unifiedOutcomeLearning");
    await recordOutcome({
      predicted: scores?.primaryDiagnosis ?? complaint,
      actual: null,
      input: answers ?? {},
    });
    await runLearningCycle().catch((e: any) =>
      console.error("[AsyncWorker:learning] cycle failed:", e?.message)
    );
  });

  registerHandler("notification", async (job: AsyncJob) => {
    const { patientId, riskLevel, reasons, traceId } = job.payload;
    await notifyOnCallPhysician({ patientId, riskLevel, reasons, traceId });
  });

  registerHandler("postProcessing", async (job: AsyncJob) => {
    const { input, diagnosis, traceId } = job.payload;
    const { recordOutcome } = await import("../engines/unifiedOutcomeLearning");
    await recordOutcome({
      predicted: diagnosis ?? input?.complaint,
      actual: null,
      input: input?.answers ?? {},
    }).catch(() => {});
  });

  registerHandler("rpa", async (job: AsyncJob) => {
    console.log(`[AsyncWorker:rpa] Task queued:`, job.payload?.taskType ?? "unknown");
  });

  console.log("[AsyncWorker] Handlers registered: audit, snapshot, learning, notification, postProcessing, rpa");
}

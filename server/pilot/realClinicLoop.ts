import { runLivePilot } from "./livePilot";

export interface QueuedPatient {
  patientId: string;
  complaint: string;
  vitals?: Record<string, unknown>;
  insurance?: string;
  [key: string]: unknown;
}

const patientQueue: QueuedPatient[] = [];
let loopTimer: ReturnType<typeof setInterval> | null = null;
let processedCount = 0;
let errorCount = 0;

export function enqueuePatient(patient: QueuedPatient): void {
  patientQueue.push(patient);
}

export async function getNextPatient(): Promise<QueuedPatient | null> {
  return patientQueue.shift() ?? null;
}

export function getClinicLoopStatus(): {
  running: boolean;
  queueLength: number;
  processed: number;
  errors: number;
} {
  return {
    running: loopTimer !== null,
    queueLength: patientQueue.length,
    processed: processedCount,
    errors: errorCount,
  };
}

export function startClinicLoop(intervalMs = 2000): void {
  if (loopTimer) return;
  loopTimer = setInterval(async () => {
    const patient = await getNextPatient();
    if (!patient) return;
    try {
      const result = await runLivePilot(patient);
      processedCount++;
      console.log("[ClinicLoop] Processed:", result.disposition ?? "unknown");
    } catch (e) {
      errorCount++;
      console.error("[ClinicLoop] Pilot error:", e);
    }
  }, intervalMs);
}

export function stopClinicLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

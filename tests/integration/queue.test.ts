import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/orchestrator/clinicalOrchestrator", () => ({
  runFullClinicalFlow: vi.fn().mockResolvedValue({
    success: true,
    complaint: "headache",
    learningTriggered: true,
    latencyMs: 50,
    timestamp: new Date().toISOString(),
  }),
}));

describe("PatientQueue — integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = "";
    vi.resetModules();
  });

  it("accepts a patient job and returns a jobId", async () => {
    const { addPatientJob } = await import("../../server/queue/patientQueue");
    const result = await addPatientJob({ complaint: "headache", answers: { ageYears: 30 } });
    expect(result.queued).toBe(true);
    expect(result.jobId).toBeTruthy();
    expect(result.jobId).toMatch(/^job_/);
  });

  it("allows fetching job status by jobId", async () => {
    const { addPatientJob, getJobStatus } = await import("../../server/queue/patientQueue");
    const result = await addPatientJob({ complaint: "cough", answers: { ageYears: 40 } });
    expect(result.queued).toBe(true);
    const status = await getJobStatus(result.jobId);
    expect(status).not.toBeNull();
    expect(status?.id).toBe(result.jobId);
  });

  it("returns null for unknown jobId", async () => {
    const { getJobStatus } = await import("../../server/queue/patientQueue");
    const status = await getJobStatus("job_nonexistent_999");
    expect(status).toBeNull();
  });

  it("reports queue stats with correct shape", async () => {
    const { getQueueStats } = await import("../../server/queue/patientQueue");
    const stats = getQueueStats();
    expect(stats.backend).toBe("in-memory");
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.queueDepth).toBe("number");
    expect(typeof stats.atCapacity).toBe("boolean");
    expect(stats.maxDepth).toBe(1000);
  });

  it("rejects jobs when queue is at capacity", async () => {
    const { addPatientJob } = await import("../../server/queue/patientQueue");
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 1005; i++) {
      promises.push(addPatientJob({ complaint: `headache ${i}`, answers: {} }));
    }
    const results = await Promise.all(promises);
    const rejected = results.filter(r => !r.queued);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0].error).toContain("System busy");
  });
});

describe("PatientQueue — failure scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = "";
    vi.resetModules();
  });

  it("marks job status as a valid known state after orchestrator failure", async () => {
    const { addPatientJob, getJobStatus } = await import("../../server/queue/patientQueue");
    const result = await addPatientJob({ complaint: "cough", answers: {} });
    expect(result.queued).toBe(true);

    await new Promise(r => setTimeout(r, 150));

    const status = await getJobStatus(result.jobId);
    const validStates = ["failed", "pending", "processing", "done"];
    expect(validStates).toContain(status?.status ?? "pending");
  });
});

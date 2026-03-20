import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([]),
          limit: vi.fn().mockResolvedValue([]),
        })),
        orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock("../../server/orchestrator/clinicalOrchestrator", () => ({
  runFullClinicalFlow: vi.fn().mockResolvedValue({
    success: true,
    traceId: "trace-contract-001",
    complaint: "cough",
    disposition: "home_care",
    learningTriggered: false,
    latencyMs: 120,
    timestamp: new Date().toISOString(),
  }),
  getFlowLog: vi.fn().mockReturnValue([]),
}));

vi.mock("../../server/patient/sessionStorePg", () => ({
  createOrUpsertSession: vi.fn().mockResolvedValue({ id: "sess-001", status: "pending" }),
  getSessions: vi.fn().mockResolvedValue([]),
  getSessionById: vi.fn().mockResolvedValue(null),
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/auth/requirePhysician", () => ({
  requirePhysician: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../server/notifications/notifier", () => ({
  notifyOnCallPhysician: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/audit/approvalAudit", () => ({
  logApproval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/audit/auditLogger", () => ({
  createTraceId: vi.fn().mockReturnValue("trace-audit-001"),
}));

import { Router } from "express";
import express from "express";
import patientQueueRoutes from "../../server/patient/patientQueueRoutes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/patients", patientQueueRoutes);
  return app;
}

describe("Patient Queue API — contract shape", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  it("GET /api/patients/queue returns an array of sessions", async () => {
    const supertest = await import("supertest");
    const res = await supertest.default(app).get("/api/patients/queue");
    expect(res.status).toBeLessThan(500);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/patients/session returns {success, traceId}", async () => {
    const supertest = await import("supertest");
    const res = await supertest.default(app)
      .post("/api/patients/session")
      .send({ complaint: "cough", answers: {}, channel: "web" });
    expect(res.status).toBeLessThan(500);
    expect(res.body).toHaveProperty("success");
    expect(res.body).toHaveProperty("traceId");
  });
});

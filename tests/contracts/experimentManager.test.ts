import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/chaos/chaosEngine", () => ({
  isChaosActive: vi.fn(() => false),
  maybeDelay: vi.fn(),
}));

vi.mock("../../server/db/dbRouter", () => {
  const mockReturning = vi.fn(() => Promise.resolve([
    { id: 1, config: {}, metrics: {}, pass: false, createdAt: new Date() },
  ]));
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockLimit = vi.fn(() => Promise.resolve([]));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  return {
    getDb: vi.fn(() => ({
      insert: mockInsert,
      select: mockSelect,
    })),
    dbHealthCheck: vi.fn(() => Promise.resolve({ ok: true, latencyMs: 50, replica: false })),
  };
});

vi.mock("@shared/schema", async () => {
  const actual = await vi.importActual("@shared/schema");
  return { ...actual as any, fdaExperiments: { _: "fdaExperiments" } };
});

import { saveExperiment, listExperiments } from "../../server/fda/experimentManager";
import type { FDAMetrics } from "../../server/fda/metricsEngine";

const mockMetrics: FDAMetrics = {
  total: 8,
  truePositives: 6,
  falsePositives: 2,
  falseNegatives: 2,
  sensitivity: 0.75,
  precision: 0.75,
  accuracy: 0.75,
  f1Score: 0.75,
  passesThreshold: false,
  threshold: 0.8,
};

const mockConfig = {
  dataset: "built-in",
  threshold: 0.8,
  engineVersion: "1.0.0",
};

describe("Experiment Manager — saveExperiment", () => {
  it("returns a record on success", async () => {
    const result = await saveExperiment(mockConfig, mockMetrics);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("id");
  });

  it("returns null when db throws", async () => {
    const { getDb } = await import("../../server/db/dbRouter");
    vi.mocked(getDb).mockReturnValueOnce({
      insert: vi.fn(() => { throw new Error("DB_ERROR"); }),
    } as any);
    const result = await saveExperiment(mockConfig, mockMetrics);
    expect(result).toBeNull();
  });
});

describe("Experiment Manager — listExperiments", () => {
  it("returns an array", async () => {
    const results = await listExperiments(10);
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns empty array when db throws", async () => {
    const { getDb } = await import("../../server/db/dbRouter");
    vi.mocked(getDb).mockReturnValueOnce({
      select: vi.fn(() => { throw new Error("DB_ERROR"); }),
    } as any);
    const results = await listExperiments(10);
    expect(results).toEqual([]);
  });
});

describe("Experiment Manager — module exports", () => {
  it("exports saveExperiment function", () => {
    expect(typeof saveExperiment).toBe("function");
  });

  it("exports listExperiments function", () => {
    expect(typeof listExperiments).toBe("function");
  });
});

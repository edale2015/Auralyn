import { describe, it, expect, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      on: vi.fn((event: string, cb: Function) => {
        if (event === "close") setTimeout(cb, 0);
      }),
    })),
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 4096 })),
  },
  writeFileSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    on: vi.fn((event: string, cb: Function) => {
      if (event === "close") setTimeout(cb, 0);
    }),
  })),
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ size: 4096 })),
}));

vi.mock("archiver", () => ({
  default: vi.fn(() => ({
    pipe: vi.fn(),
    file: vi.fn(),
    append: vi.fn(),
    finalize: vi.fn(),
    on: vi.fn(),
  })),
}));

import { createSubmissionBundle } from "../../server/fda/submissionBundle";
import type { FDAReport } from "../../server/fda/reportGenerator";

const mockReport: FDAReport = {
  summary: "Auralyn Clinical AI — FDA SaMD Validation Report",
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  metrics: {
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
  },
  sampleResults: [],
  totalCases: 8,
  recommendation: "FAIL — requires remediation",
};

const mockStratified = {
  pediatric: { label: "Pediatric", count: 2, results: [], metrics: {} as any },
  adult: { label: "Adult", count: 6, results: [], metrics: {} as any },
  highRisk: { label: "High Risk", count: 1, results: [], metrics: {} as any },
  lowRisk: { label: "Low Risk", count: 7, results: [], metrics: {} as any },
  summary: { totalGroups: 4, groupsPassing: 3, worstGroup: "pediatric", bestGroup: "adult" },
};

describe("Submission Bundle — structure", () => {
  it("returns required fields", async () => {
    const result = await createSubmissionBundle(mockReport);
    expect(result).toHaveProperty("bundlePath");
    expect(result).toHaveProperty("files");
    expect(result).toHaveProperty("createdAt");
    expect(result).toHaveProperty("complianceStandards");
    expect(Array.isArray(result.files)).toBe(true);
    expect(Array.isArray(result.complianceStandards)).toBe(true);
  });

  it("includes all three FDA compliance standards", async () => {
    const result = await createSubmissionBundle(mockReport);
    expect(result.complianceStandards).toContain("FDA 21 CFR Part 11");
    expect(result.complianceStandards).toContain("ISO 13485");
    expect(result.complianceStandards).toContain("IEC 62304");
  });

  it("includes base files in bundle list", async () => {
    const result = await createSubmissionBundle(mockReport);
    expect(result.files).toContain("fda_report.json");
    expect(result.files).toContain("fda_manifest.json");
  });

  it("includes stratified_analysis.json when stratified data provided", async () => {
    const result = await createSubmissionBundle(mockReport, mockStratified as any);
    expect(result.files).toContain("stratified_analysis.json");
  });

  it("does not include stratified_analysis.json without stratified data", async () => {
    const result = await createSubmissionBundle(mockReport);
    expect(result.files).not.toContain("stratified_analysis.json");
  });

  it("createdAt is a valid ISO timestamp", async () => {
    const result = await createSubmissionBundle(mockReport);
    expect(typeof result.createdAt).toBe("string");
    expect(new Date(result.createdAt).getTime()).toBeGreaterThan(0);
  });

  it("returns sizeBytes from stat", async () => {
    const result = await createSubmissionBundle(mockReport);
    expect(result.sizeBytes).toBe(4096);
  });
});

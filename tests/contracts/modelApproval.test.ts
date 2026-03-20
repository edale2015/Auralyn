import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/controlTower/eventBus", () => ({
  emitEvent: vi.fn(),
  subscribeToTower: vi.fn(),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

import {
  requireApproval,
  proposeLearningUpdate,
  applyApprovedUpdate,
  rejectUpdate,
  getPendingModelApprovals,
  getModelApprovalStats,
} from "../../server/governance/modelApproval";

import { updateGovernanceStatus } from "../../server/governance/governanceQueue";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Model Approval — requireApproval", () => {
  it("auto-approves changes below 5% impact", () => {
    const result = requireApproval({ oldValue: 0.8, newValue: 0.83, impact: 0.03, source: "test" });
    expect(result.approved).toBe(true);
    expect(result.decision).toBe("AUTO_APPROVED");
    expect(result.requiresPhysician).toBe(false);
  });

  it("auto-approves exactly at 5% threshold", () => {
    const result = requireApproval({ oldValue: 0.8, newValue: 0.85, impact: 0.05, source: "test" });
    expect(result.approved).toBe(true);
    expect(result.decision).toBe("AUTO_APPROVED");
  });

  it("requires review for impact between 5% and 25%", () => {
    const result = requireApproval({ oldValue: 0.7, newValue: 0.85, impact: 0.15, source: "test" });
    expect(result.approved).toBe(false);
    expect(result.decision).toBe("PENDING_REVIEW");
    expect(result.requiresPhysician).toBe(true);
  });

  it("blocks changes >= 25% impact", () => {
    const result = requireApproval({ oldValue: 0.5, newValue: 0.8, impact: 0.3, source: "test" });
    expect(result.approved).toBe(false);
    expect(result.decision).toBe("BLOCKED");
    expect(result.requiresPhysician).toBe(true);
  });

  it("uses absolute value of impact for negative changes", () => {
    const result = requireApproval({ oldValue: 0.8, newValue: 0.6, impact: -0.2, source: "test" });
    expect(result.approved).toBe(false);
    expect(result.decision).toBe("PENDING_REVIEW");
  });

  it("reason includes impact percentage", () => {
    const result = requireApproval({ oldValue: 0.7, newValue: 0.85, impact: 0.15, source: "test" });
    expect(result.reason).toMatch(/15\.0%/);
  });

  it("impactPercent is always positive", () => {
    const result = requireApproval({ oldValue: 0.9, newValue: 0.7, impact: -0.2, source: "test" });
    expect(result.impactPercent).toBe(0.2);
  });
});

describe("Model Approval — proposeLearningUpdate", () => {
  it("auto-approves small accuracy changes", () => {
    const result = proposeLearningUpdate("ent-flu", 0.80, 0.82);
    expect(result.approved).toBe(true);
    expect(result.decision).toBe("AUTO_APPROVED");
    expect(result.governanceItemId).toBeUndefined();
  });

  it("queues large accuracy changes for review", () => {
    const result = proposeLearningUpdate("ent-flu", 0.70, 0.85);
    expect(result.approved).toBe(false);
    expect(result.decision).toBe("PENDING_REVIEW");
    expect(result.governanceItemId).toBeDefined();
  });

  it("blocks extreme accuracy swings", () => {
    const result = proposeLearningUpdate("ent-flu", 0.5, 0.8);
    expect(result.approved).toBe(false);
    expect(result.decision).toBe("BLOCKED");
  });

  it("assigns governanceItemId for non-approved changes", () => {
    const result = proposeLearningUpdate("ent-flu", 0.7, 0.85);
    expect(result.governanceItemId).toBe("test-uuid-1234");
  });
});

describe("Model Approval — applyApprovedUpdate / rejectUpdate", () => {
  it("returns false for non-existent item", () => {
    const ok = applyApprovedUpdate("non-existent-id");
    expect(ok).toBe(false);
  });

  it("returns false when rejecting non-existent item", () => {
    const ok = rejectUpdate("non-existent-id");
    expect(ok).toBe(false);
  });
});

describe("Model Approval — getPendingModelApprovals", () => {
  it("returns array", () => {
    const pending = getPendingModelApprovals();
    expect(Array.isArray(pending)).toBe(true);
  });

  it("returns only learning: prefixed items", () => {
    const pending = getPendingModelApprovals();
    for (const item of pending) {
      expect(item.sheet.startsWith("learning:")).toBe(true);
    }
  });
});

describe("Model Approval — getModelApprovalStats", () => {
  it("returns correct shape", () => {
    const stats = getModelApprovalStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("approved");
    expect(stats).toHaveProperty("rejected");
    expect(stats).toHaveProperty("blocked");
  });

  it("counts are non-negative integers", () => {
    const stats = getModelApprovalStats();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.pending).toBeGreaterThanOrEqual(0);
    expect(stats.approved).toBeGreaterThanOrEqual(0);
    expect(stats.rejected).toBeGreaterThanOrEqual(0);
  });

  it("total is sum of pending + approved + rejected", () => {
    const stats = getModelApprovalStats();
    expect(stats.total).toBe(stats.pending + stats.approved + stats.rejected);
  });
});

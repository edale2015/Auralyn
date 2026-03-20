import { describe, it, expect } from "vitest";
import { autonomyDecision } from "../../server/autonomy/autonomyEngine";
import type { SafetyGateResult } from "../../server/safety/safetyGate";

const lowSafety: SafetyGateResult = { allowed: true, level: "LOW", reasons: [] };
const medSafety: SafetyGateResult = { allowed: true, level: "MEDIUM", reasons: ["mild risk"] };
const highSafety: SafetyGateResult = { allowed: false, level: "HIGH", reasons: ["critical", "urgent", "severe"] };

describe("autonomyDecision", () => {
  it("returns AUTO when confidence is high, uncertainty is low, and safety is LOW", () => {
    const result = autonomyDecision({ safety: lowSafety, confidence: 0.95, uncertainty: 0.1 });
    expect(result.mode).toBe("AUTO");
    expect(result.reason).toMatch(/autonomous/i);
  });

  it("returns ESCALATE when safety level is HIGH", () => {
    const result = autonomyDecision({ safety: highSafety, confidence: 0.99, uncertainty: 0.01 });
    expect(result.mode).toBe("ESCALATE");
    expect(result.reason).toMatch(/HIGH/i);
  });

  it("returns ESCALATE when safety.allowed is false even with LOW level override", () => {
    const blocked: SafetyGateResult = { allowed: false, level: "LOW", reasons: ["manually blocked"] };
    const result = autonomyDecision({ safety: blocked, confidence: 0.99, uncertainty: 0.01 });
    expect(result.mode).toBe("ESCALATE");
  });

  it("returns REVIEW when uncertainty exceeds 0.2", () => {
    const result = autonomyDecision({ safety: lowSafety, confidence: 0.95, uncertainty: 0.25 });
    expect(result.mode).toBe("REVIEW");
    expect(result.reason).toMatch(/uncertainty/i);
  });

  it("returns REVIEW when confidence is below 0.9 threshold", () => {
    const result = autonomyDecision({ safety: lowSafety, confidence: 0.75, uncertainty: 0.1 });
    expect(result.mode).toBe("REVIEW");
    expect(result.reason).toMatch(/below auto-threshold/i);
  });

  it("returns REVIEW when safety is MEDIUM even with high confidence", () => {
    const result = autonomyDecision({ safety: medSafety, confidence: 0.97, uncertainty: 0.05 });
    expect(result.mode).toBe("REVIEW");
  });

  it("defaults uncertainty to 0 when not provided — still routes to REVIEW if confidence is low", () => {
    const result = autonomyDecision({ safety: lowSafety, confidence: 0.5 });
    expect(result.mode).toBe("REVIEW");
  });
});

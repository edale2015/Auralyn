import { describe, it, expect } from "vitest";
import { calibrateConfidence, calibrateConfidencePct } from "../../server/engines/confidenceCalibration";

describe("calibrateConfidence", () => {
  it("clips values above 1.0 to max 1.0 before calibrating", () => {
    expect(calibrateConfidence(1.5)).toBeLessThanOrEqual(1.0);
  });

  it("clips values below 0 to 0", () => {
    expect(calibrateConfidence(-0.1)).toBe(0);
  });

  it("applies dampening for values > 0.9 (prevents overconfidence)", () => {
    const raw = 0.95;
    const cal = calibrateConfidence(raw);
    expect(cal).toBeLessThan(raw);
    expect(cal).toBeGreaterThan(0.85);
  });

  it("applies dampening for values < 0.2 (reduces over-certainty at low end)", () => {
    const raw = 0.1;
    const cal = calibrateConfidence(raw);
    expect(cal).toBeLessThan(raw);
  });

  it("returns raw value unchanged for mid-range values (0.2 to 0.9)", () => {
    expect(calibrateConfidence(0.5)).toBeCloseTo(0.5);
    expect(calibrateConfidence(0.7)).toBeCloseTo(0.7);
  });

  it("calibrates exactly 1.0 to below 1.0", () => {
    expect(calibrateConfidence(1.0)).toBeLessThan(1.0);
  });
});

describe("calibrateConfidencePct", () => {
  it("converts percentage and calibrates", () => {
    const result = calibrateConfidencePct(95);
    expect(result).toBeLessThan(95);
    expect(result).toBeGreaterThan(80);
  });

  it("returns integer result", () => {
    const result = calibrateConfidencePct(80);
    expect(Number.isInteger(result)).toBe(true);
  });
});

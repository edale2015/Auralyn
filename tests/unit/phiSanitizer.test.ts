import { describe, it, expect } from "vitest";
import { sanitizeForLog, redactPhi } from "../../server/utils/phiSanitizer";

describe("sanitizeForLog", () => {
  it("redacts known PHI fields", () => {
    const obj = { name: "John Doe", age: 45, complaint: "chest pain", sessionId: "abc123" };
    const result = sanitizeForLog(obj) as any;
    expect(result.name).toBe("[REDACTED]");
    expect(result.complaint).toBe("[REDACTED]");
    expect(result.age).toBe(45);
    expect(result.sessionId).toBe("abc123");
  });

  it("handles nested objects", () => {
    const obj = { patient: { name: "Jane", score: 0.9 }, traceId: "xyz" };
    const result = sanitizeForLog(obj) as any;
    expect(result.patient.name).toBe("[REDACTED]");
    expect(result.patient.score).toBe(0.9);
    expect(result.traceId).toBe("xyz");
  });

  it("handles arrays (truncates to 10 items, sanitizes each)", () => {
    const arr = Array.from({ length: 15 }, (_, i) => ({ name: `Patient ${i}`, id: i }));
    const result = sanitizeForLog(arr) as any[];
    expect(result.length).toBe(10);
    expect(result[0].name).toBe("[REDACTED]");
    expect(result[0].id).toBe(0);
  });

  it("passes through primitives unchanged", () => {
    expect(sanitizeForLog("hello")).toBe("hello");
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });

  it("stops recursing at depth 5", () => {
    const deep = { a: { b: { c: { d: { e: { f: { name: "deep" } } } } } } };
    const result = sanitizeForLog(deep) as any;
    expect(result).toBeDefined();
  });

  it("redacts email field", () => {
    const obj = { email: "john@hospital.com", role: "physician" };
    const result = sanitizeForLog(obj) as any;
    expect(result.email).toBe("[REDACTED]");
    expect(result.role).toBe("physician");
  });

  it("redacts phone field", () => {
    const obj = { phone: "+1-800-555-0199", urgent: true };
    const result = sanitizeForLog(obj) as any;
    expect(result.phone).toBe("[REDACTED]");
    expect(result.urgent).toBe(true);
  });
});

describe("redactPhi", () => {
  it("redacts specified fields only", () => {
    const obj = { name: "Alice", diagnosis: "flu", sessionId: "s1" };
    const result = redactPhi(obj, ["name", "diagnosis"]);
    expect(result.name).toBe("[REDACTED]");
    expect(result.diagnosis).toBe("[REDACTED]");
    expect(result.sessionId).toBe("s1");
  });
});

import { describe, test, expect } from "vitest";

const ROUTES = {
  OPS: "/ops",
  CLINICAL: "/clinical",
  INTAKE: "/intake",
  SAFETY: "/safety",
  LEARNING: "/learning",
  SYSTEM: "/system",
  SETTINGS: "/settings",
  WORKERS: "/workers",
  CLINIC: "/clinic-health",
};

function validateRoutes(routes: Record<string, string>) {
  const paths = Object.values(routes);
  const unique = new Set(paths);
  if (unique.size !== paths.length) {
    throw new Error("❌ Duplicate routes detected");
  }
}

describe("Route Registry", () => {
  test("all core routes exist", () => {
    expect(ROUTES.OPS).toBeDefined();
    expect(ROUTES.CLINICAL).toBeDefined();
    expect(ROUTES.INTAKE).toBeDefined();
    expect(ROUTES.SAFETY).toBeDefined();
    expect(ROUTES.LEARNING).toBeDefined();
    expect(ROUTES.SYSTEM).toBeDefined();
    expect(ROUTES.SETTINGS).toBeDefined();
    expect(ROUTES.WORKERS).toBeDefined();
    expect(ROUTES.CLINIC).toBeDefined();
  });

  test("all routes are string paths starting with /", () => {
    for (const [key, value] of Object.entries(ROUTES)) {
      expect(typeof value, `ROUTES.${key} should be a string`).toBe("string");
      expect(value.startsWith("/"), `ROUTES.${key} should start with /`).toBe(true);
    }
  });

  test("no duplicate routes detected", () => {
    expect(() => validateRoutes(ROUTES)).not.toThrow();
  });

  test("7 core workbenches are all unique paths", () => {
    const core = [
      ROUTES.OPS,
      ROUTES.CLINICAL,
      ROUTES.INTAKE,
      ROUTES.SAFETY,
      ROUTES.LEARNING,
      ROUTES.SYSTEM,
      ROUTES.SETTINGS,
    ];
    const unique = new Set(core);
    expect(unique.size).toBe(core.length);
    expect(unique.size).toBe(7);
  });

  test("OPS is /ops", () => expect(ROUTES.OPS).toBe("/ops"));
  test("SYSTEM is /system", () => expect(ROUTES.SYSTEM).toBe("/system"));
  test("LEARNING is /learning", () => expect(ROUTES.LEARNING).toBe("/learning"));
  test("WORKERS is /workers", () => expect(ROUTES.WORKERS).toBe("/workers"));
  test("CLINIC is /clinic-health", () => expect(ROUTES.CLINIC).toBe("/clinic-health"));
});

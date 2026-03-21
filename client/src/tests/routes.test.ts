import { describe, test, expect } from "vitest";
import { ROUTES } from "../routes/routeRegistry";
import { validateRoutes } from "../utils/routeValidator";

describe("Route Registry", () => {
  test("all core routes are defined", () => {
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

  test("no duplicate routes", () => {
    expect(() => validateRoutes()).not.toThrow();
  });

  test("core workbenches are all unique paths", () => {
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
  });

  test("OPS is /ops", () => expect(ROUTES.OPS).toBe("/ops"));
  test("SYSTEM is /system", () => expect(ROUTES.SYSTEM).toBe("/system"));
  test("LEARNING is /learning", () => expect(ROUTES.LEARNING).toBe("/learning"));
  test("WORKERS is /workers", () => expect(ROUTES.WORKERS).toBe("/workers"));
  test("CLINIC is /clinic-health", () => expect(ROUTES.CLINIC).toBe("/clinic-health"));
});

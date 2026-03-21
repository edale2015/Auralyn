import { ENV } from "./env";

const BANNED_VALUES = new Set([
  "dev-secret",
  "dev-secret-change-in-prod",
  "dev-jwt-secret",
  "changeme",
  "password",
  "physician123",
  "admin123",
  "demo-password",
  "replace-with-a-long-random-secret",
  "replace-with-a-different-long-random-secret",
  "replace-with-a-strong-password",
]);

function assertRequired(name: string, value: string | undefined) {
  if (!value || value.trim() === "") {
    throw new Error(`❌ [STARTUP FATAL] Missing required production secret: ${name}`);
  }
}

function assertNotBanned(name: string, value: string | undefined) {
  if (!value) return;
  if (BANNED_VALUES.has(value)) {
    throw new Error(`❌ [STARTUP FATAL] Unsafe placeholder value detected for: ${name}`);
  }
}

export function assertProductionSafe() {
  if (ENV.NODE_ENV !== "production") return;

  assertRequired("JWT_SECRET", ENV.JWT_SECRET);
  assertRequired("SESSION_SECRET", ENV.SESSION_SECRET);
  assertRequired("MD_PASSWORD", ENV.MD_PASSWORD);
  assertRequired("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD);

  assertNotBanned("JWT_SECRET", ENV.JWT_SECRET);
  assertNotBanned("SESSION_SECRET", ENV.SESSION_SECRET);
  assertNotBanned("MD_PASSWORD", ENV.MD_PASSWORD);
  assertNotBanned("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD);

  if (process.env.DEMO_USERS === "true") {
    throw new Error("❌ [STARTUP FATAL] DEMO_USERS cannot be enabled in production");
  }
}

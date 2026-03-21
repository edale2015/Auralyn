import { ENV } from "./env";

export function validateConfig() {
  const errors: string[] = [];

  if (!["development", "test", "production"].includes(ENV.NODE_ENV)) {
    errors.push(`NODE_ENV invalid: ${ENV.NODE_ENV}`);
  }

  if (!Number.isInteger(ENV.PORT) || ENV.PORT <= 0) {
    errors.push("PORT must be a positive integer");
  }

  if (ENV.NODE_ENV === "production") {
    if (!ENV.DATABASE_URL) errors.push("DATABASE_URL is required in production");
    if (!ENV.JWT_SECRET) errors.push("JWT_SECRET is required in production");
    if (!ENV.SESSION_SECRET) errors.push("SESSION_SECRET is required in production");
    if (!ENV.MD_PASSWORD) errors.push("MD_PASSWORD is required in production");
    if (!ENV.CLINICIAN_PASSWORD) errors.push("CLINICIAN_PASSWORD is required in production");
  }

  if (errors.length > 0) {
    throw new Error(`❌ Config validation failed:\n- ${errors.join("\n- ")}`);
  }
}

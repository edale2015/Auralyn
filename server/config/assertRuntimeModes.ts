import { ENV } from "./env";

export function assertRuntimeModes() {
  if (ENV.NODE_ENV !== "production") return;

  const violations: string[] = [];

  if (ENV.REVIEW_AUTH_MODE === "off") {
    violations.push("REVIEW_AUTH_MODE=off is forbidden in production");
  }

  if (ENV.ENABLE_TEST_ROUTES) {
    violations.push("ENABLE_TEST_ROUTES=true is forbidden in production");
  }

  if (ENV.ALLOW_PROVIDER_KEY_FALLBACK) {
    violations.push("ALLOW_PROVIDER_KEY_FALLBACK=true is forbidden in production");
  }

  if (process.env.USE_MOCK_EHR === "true") {
    violations.push("USE_MOCK_EHR=true is forbidden in production");
  }

  if (process.env.USE_FAKE_QUEUE === "true") {
    violations.push("USE_FAKE_QUEUE=true is forbidden in production");
  }

  if (violations.length > 0) {
    throw new Error(`❌ [STARTUP FATAL] Unsafe production runtime flags:\n- ${violations.join("\n- ")}`);
  }
}

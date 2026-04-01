const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const PRODUCTION_FLAGS = {
  SHADOW_MODE_ENABLED: IS_PRODUCTION ? false : (process.env.SHADOW_MODE_ENABLED === "true"),
  CHAOS_ENGINEERING_ENABLED: IS_PRODUCTION ? false : (process.env.CHAOS_ENABLED === "true"),
  RLHF_AUTO_APPLY: IS_PRODUCTION ? false : true,
  RLHF_MIN_OUTCOME_THRESHOLD: IS_PRODUCTION ? 500 : 100,
  RLHF_MAX_DELTA_PER_CYCLE: 0.02,
  EHR_DEAD_LETTER_ALERT_MINUTES: 15,
  REQUIRE_PHYSICIAN_REVIEW_FOR_AI_RULES: true,
} as const;

export function getProductionFlags() {
  return { ...PRODUCTION_FLAGS, isProduction: IS_PRODUCTION };
}

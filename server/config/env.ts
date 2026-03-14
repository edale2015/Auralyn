export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 5000),
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-secret",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",

  DEEPL_API_KEY: process.env.DEEPL_API_KEY ?? "",
  GOOGLE_TRANSLATE_KEY: process.env.GOOGLE_TRANSLATE_KEY ?? "",

  EHR_ENDPOINT: process.env.EHR_ENDPOINT ?? "",
  EHR_API_KEY: process.env.EHR_API_KEY ?? "",
  EHR_RETRY_MAX: Number(process.env.EHR_RETRY_MAX ?? 3),
  EHR_DEAD_LETTER_TTL_HOURS: Number(process.env.EHR_DEAD_LETTER_TTL_HOURS ?? 48),

  STAGING: process.env.STAGING === "true",
  PRODUCTION_GUARD: process.env.PRODUCTION_GUARD !== "false",
} as const

export function isProduction() { return ENV.NODE_ENV === "production" }
export function isStaging() { return ENV.STAGING || ENV.NODE_ENV === "staging" }
export function isDevelopment() { return ENV.NODE_ENV === "development" }

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-secret",

  JWT_SECRET: process.env.JWT_SECRET ?? "",
  MD_PASSWORD: process.env.MD_PASSWORD ?? "",
  CLINICIAN_PASSWORD: process.env.CLINICIAN_PASSWORD ?? "",

  DATABASE_URL: process.env.DATABASE_URL_PRIMARY ?? process.env.DATABASE_URL ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "",

  REVIEW_AUTH_MODE: process.env.REVIEW_AUTH_MODE ?? "on",
  ENABLE_TEST_ROUTES: process.env.ENABLE_TEST_ROUTES === "true",
  ALLOW_PROVIDER_KEY_FALLBACK: process.env.ALLOW_PROVIDER_KEY_FALLBACK === "true",

  OPENAI_API_KEY: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  OPENAI_BASE_URL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",

  TWILIO_SID: process.env.TWILIO_ACCOUNT_SID ?? "",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "",
  TWILIO_NUMBER: process.env.TWILIO_FROM_NUMBER ?? "",
  TWILIO_WHATSAPP: process.env.TWILIO_WHATSAPP_NUMBER ?? "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",

  DEEPL_API_KEY: process.env.DEEPL_API_KEY ?? "",
  GOOGLE_TRANSLATE_KEY: process.env.GOOGLE_TRANSLATE_KEY ?? "",

  EHR_ENDPOINT: process.env.EHR_ENDPOINT ?? "",
  EHR_API_KEY: process.env.EHR_API_KEY ?? "",
  EHR_RETRY_MAX: Number(process.env.EHR_RETRY_MAX ?? 3),
  EHR_DEAD_LETTER_TTL_HOURS: Number(process.env.EHR_DEAD_LETTER_TTL_HOURS ?? 48),

  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "",
  CLEARINGHOUSE_URL: process.env.CLEARINGHOUSE_URL ?? "",
  CLEARINGHOUSE_TOKEN: process.env.CLEARINGHOUSE_TOKEN ?? "",
  PROVIDER_NPI: process.env.PROVIDER_NPI ?? "",

  FIREBASE_PROJECT: process.env.FIREBASE_PROJECT_ID ?? "",
  SHEETS_ID: process.env.GOOGLE_SHEET_ID ?? "",

  STAGING: process.env.STAGING === "true",
  PRODUCTION_GUARD: process.env.PRODUCTION_GUARD !== "false",
} as const;

export function isProduction() { return ENV.NODE_ENV === "production"; }
export function isStaging() { return ENV.STAGING || ENV.NODE_ENV === "staging"; }
export function isDevelopment() { return ENV.NODE_ENV === "development"; }

export function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`[ENV] Required environment variable missing: ${name}`);
  return val;
}

export function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function validateEnv(): { valid: boolean; missing: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const missing: string[] = [];

  if (!ENV.OPENAI_API_KEY) warnings.push("No OpenAI key — GPT clinical explanation features disabled");
  if (!ENV.TWILIO_SID) warnings.push("No Twilio SID — SMS/WhatsApp messaging disabled");
  if (!ENV.TWILIO_AUTH_TOKEN) warnings.push("No Twilio token — SMS/WhatsApp messaging disabled");
  if (!ENV.TELEGRAM_BOT_TOKEN) warnings.push("No Telegram token — Telegram bot disabled");
  if (!ENV.FIREBASE_PROJECT) warnings.push("No Firebase project — Firestore persistence disabled");
  if (!ENV.ENCRYPTION_KEY) warnings.push("No ENCRYPTION_KEY — PHI encryption fallback active");
  if (!ENV.SHEETS_ID) warnings.push("No Google Sheet ID — pack loading from sheets disabled");

  return { valid: missing.length === 0, missing, warnings };
}

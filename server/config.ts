import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.string().default("development"),
  STORAGE_DRIVER: z.enum(["sqlite", "firestore"]).default("firestore"),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  SHEETS_SPREADSHEET_ID: z.string().optional(),

  ENABLE_TWILIO: z.enum(["0", "1"]).default("1"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const cfg = ConfigSchema.parse(process.env);

  const errors: string[] = [];

  if (cfg.STORAGE_DRIVER === "firestore") {
    if (!cfg.FIREBASE_PROJECT_ID) errors.push("FIREBASE_PROJECT_ID is required when STORAGE_DRIVER=firestore");
    if (!cfg.GOOGLE_SERVICE_ACCOUNT_JSON) errors.push("GOOGLE_SERVICE_ACCOUNT_JSON is required when STORAGE_DRIVER=firestore");
  }

  if (cfg.ENABLE_TWILIO === "1") {
    if (!cfg.TWILIO_ACCOUNT_SID) errors.push("TWILIO_ACCOUNT_SID is required when ENABLE_TWILIO=1");
    if (!cfg.TWILIO_AUTH_TOKEN) errors.push("TWILIO_AUTH_TOKEN is required when ENABLE_TWILIO=1");
    if (!cfg.TWILIO_WHATSAPP_FROM) errors.push("TWILIO_WHATSAPP_FROM is required when ENABLE_TWILIO=1");
  }

  if (errors.length > 0) {
    console.error("[Config] Validation errors:");
    errors.forEach(e => console.error(`  - ${e}`));
    throw new Error(`Config validation failed:\n${errors.join("\n")}`);
  }

  console.log(`[Config] STORAGE_DRIVER=${cfg.STORAGE_DRIVER}, TWILIO=${cfg.ENABLE_TWILIO === "1" ? "on" : "off"}, SHEETS=${cfg.SHEETS_SPREADSHEET_ID ? "configured" : "not set"}`);

  return cfg;
}

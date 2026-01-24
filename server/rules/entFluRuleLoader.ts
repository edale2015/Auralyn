import { google } from "googleapis";

type CacheEntry = { expiresAt: number; value: Record<string, any> };
let CACHE: CacheEntry = { expiresAt: 0, value: {} };
const TTL_MS = 5 * 60 * 1000;

const EXPECTED_TYPES: Record<string, string> = {
  TAMIFLU_MAX_DAYS: "number",
  TAMIFLU_REQUIRE_FEVER: "boolean",
  TAMIFLU_REQUIRE_ACHES: "boolean",
  RED_FLAG_DISPOSITION: "text",
  NON_RED_FLAG_DISPOSITION: "text",
  PROPOSE_COVID_TEST: "boolean",
  PROPOSE_FLU_TEST_IF_TAMIFLU: "boolean",
  RULES_VERSION: "text",
};

const DEFAULTS: Record<string, any> = {
  TAMIFLU_MAX_DAYS: 2,
  TAMIFLU_REQUIRE_FEVER: true,
  TAMIFLU_REQUIRE_ACHES: true,
  RED_FLAG_DISPOSITION: "urgent_or_ed",
  NON_RED_FLAG_DISPOSITION: "self_care_with_precautions",
  PROPOSE_COVID_TEST: true,
  PROPOSE_FLU_TEST_IF_TAMIFLU: true,
  RULES_VERSION: "default",
};

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function parseValue(valueType: string, raw: any): any {
  const t = String(valueType || "").trim().toLowerCase();
  const s = String(raw ?? "").trim();

  if (t === "number") {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (t === "boolean") return s.toLowerCase() === "true";
  if (t === "json") {
    try { return JSON.parse(s); } catch { return null; }
  }
  return s;
}

function validateRule(key: string, value: any, rawValue: any): any {
  const expectedType = EXPECTED_TYPES[key];
  if (!expectedType) return value;

  if (expectedType === "number" && value === null) {
    console.warn(`[EntFluRules] Invalid value for ${key}: "${rawValue}" (expected number). Using default ${DEFAULTS[key]}.`);
    return DEFAULTS[key];
  }
  if (expectedType === "boolean" && typeof value !== "boolean") {
    console.warn(`[EntFluRules] Invalid value for ${key}: "${rawValue}" (expected boolean). Using default ${DEFAULTS[key]}.`);
    return DEFAULTS[key];
  }
  if (expectedType === "text" && (value === null || value === "")) {
    console.warn(`[EntFluRules] Empty value for ${key}. Using default "${DEFAULTS[key]}".`);
    return DEFAULTS[key];
  }
  return value;
}

export async function getEntFluRules(): Promise<Record<string, any>> {
  const now = Date.now();
  if (CACHE.expiresAt > now) {
    console.log(`[EntFluRules] Cache HIT (${Object.keys(CACHE.value).length} rules, expires in ${Math.round((CACHE.expiresAt - now) / 1000)}s)`);
    return CACHE.value;
  }

  console.log(`[EntFluRules] Cache MISS, loading from Sheets...`);

  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    keyFile: credsPath || undefined,
  });

  const sheets = google.sheets({ version: "v4", auth });
  const range = `CLINICAL_RULES!A1:H500`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = resp.data.values || [];
  if (values.length < 2) throw new Error("CLINICAL_RULES is empty or missing.");

  const header = values[0].map((h) => String(h ?? "").trim());
  const idx = (name: string) => header.indexOf(name);

  const iKey = idx("rule_key");
  const iType = idx("value_type");
  const iVal = idx("value");
  const iActive = idx("active");

  if ([iKey, iType, iVal, iActive].some((n) => n < 0)) {
    throw new Error("CLINICAL_RULES missing required headers: rule_key, value_type, value, active");
  }

  const rules: Record<string, any> = {};
  for (const row of values.slice(1)) {
    const active = String(row[iActive] ?? "").trim().toUpperCase() === "Y";
    if (!active) continue;

    const key = String(row[iKey] ?? "").trim();
    if (!key) continue;

    const type = String(row[iType] ?? "").trim();
    const rawValue = row[iVal];
    const parsed = parseValue(type, rawValue);
    rules[key] = validateRule(key, parsed, rawValue);
  }

  CACHE = { expiresAt: now + TTL_MS, value: rules };
  
  const ruleCount = Object.keys(rules).length;
  if (ruleCount === 0) {
    console.warn(`[EntFluRules] WARNING: No active rules found in CLINICAL_RULES sheet. Check that:
  - active column is "Y" for rules you want to include
  - rule_key is not empty
  Defaults will be used for all clinical rules.`);
  } else {
    console.log(`[EntFluRules] Loaded ${ruleCount} rules from Google Sheets (cached for 5 min)`);
  }
  
  return rules;
}

export function invalidateEntFluRulesCache() {
  console.log(`[EntFluRules] Invalidating cache`);
  CACHE = { expiresAt: 0, value: {} };
}

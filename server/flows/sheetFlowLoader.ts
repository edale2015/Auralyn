import { google } from "googleapis";

export type FlowQuestion = {
  id: string;
  text: string;
  type: "yesno" | "number" | "text" | "choice";
  required: boolean;
  min?: number | null;
  max?: number | null;
  choices?: string[] | null;
  helpText?: string | null;
};

type CacheEntry = { expiresAt: number; value: FlowQuestion[] };

const CACHE: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function toBoolYN(v: any): boolean {
  return String(v ?? "").trim().toUpperCase() === "Y";
}

function toNumOrNull(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitChoices(v: any): string[] | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normType(v: any): FlowQuestion["type"] {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yesno" || s === "number" || s === "text" || s === "choice") return s;
  return "text";
}

export async function getFlowQuestionsFromSheet(flowId: string): Promise<FlowQuestion[]> {
  const cached = CACHE[flowId];
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    console.log(`[SheetFlowLoader] Cache HIT for ${flowId} (${cached.value.length} questions, expires in ${Math.round((cached.expiresAt - now) / 1000)}s)`);
    return cached.value;
  }
  console.log(`[SheetFlowLoader] Cache MISS for ${flowId}, loading from Sheets...`);

  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
  
  // Use service account credentials from the existing GOOGLE_SERVICE_ACCOUNT_JSON secret
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let auth;
  
  if (credsJson) {
    const credentials = JSON.parse(credsJson);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  } else {
    auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  const sheets = google.sheets({ version: "v4", auth });
  const range = `CLINICAL_QUESTIONS!A1:N1000`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = resp.data.values || [];
  if (values.length < 2) {
    throw new Error(`CLINICAL_QUESTIONS appears empty or missing rows (range ${range})`);
  }

  const header = values[0].map((h) => String(h ?? "").trim());
  const idx = (name: string) => header.findIndex((h) => h === name);

  const iFlow = idx("flow_id");
  const iOrder = idx("order");
  const iQid = idx("question_id");
  const iText = idx("question_text");
  const iType = idx("answer_type");
  const iReq = idx("required");
  const iMin = idx("min");
  const iMax = idx("max");
  const iChoices = idx("choices");
  const iHelp = idx("help_text");
  const iActive = idx("active");

  const requiredCols = [
    ["flow_id", iFlow],
    ["order", iOrder],
    ["question_id", iQid],
    ["question_text", iText],
    ["answer_type", iType],
    ["required", iReq],
    ["active", iActive],
  ] as const;

  const missing = requiredCols.filter(([, n]) => n < 0).map(([k]) => k);
  if (missing.length) {
    throw new Error(`CLINICAL_QUESTIONS missing required headers: ${missing.join(", ")}`);
  }

  const rows = values.slice(1);

  const questions: any[] = rows
    .map((row) => {
      const rowFlow = String(row[iFlow] ?? "").trim();
      if (rowFlow !== flowId) return null;

      const active = String(row[iActive] ?? "").trim().toUpperCase() === "Y";
      if (!active) return null;

      const orderRaw = String(row[iOrder] ?? "").trim();
      const orderNum = Number(orderRaw);
      if (!Number.isFinite(orderNum)) return null;

      const qid = String(row[iQid] ?? "").trim();
      const qtext = String(row[iText] ?? "").trim();
      if (!qid || !qtext) return null;

      const type = normType(row[iType]);
      const required = toBoolYN(row[iReq]);

      const min = iMin >= 0 ? toNumOrNull(row[iMin]) : null;
      const max = iMax >= 0 ? toNumOrNull(row[iMax]) : null;
      const choices = iChoices >= 0 ? splitChoices(row[iChoices]) : null;
      const helpText = iHelp >= 0 ? String(row[iHelp] ?? "").trim() || null : null;

      return {
        _order: orderNum,
        id: qid,
        text: qtext,
        type,
        required,
        min,
        max,
        choices,
        helpText,
      };
    })
    .filter(Boolean);

  questions.sort((a: any, b: any) => a._order - b._order);

  const cleaned: FlowQuestion[] = questions.map((q: any) => {
    const { _order, ...rest } = q;
    if (rest.choices && rest.choices.length === 0) rest.choices = null;
    return rest;
  });

  // Warn if no questions found - this might indicate a configuration issue
  if (cleaned.length === 0) {
    console.warn(`[SheetFlowLoader] WARNING: No active questions found for flow_id="${flowId}" in sheet. Check that:
  - flow_id column matches exactly (case-sensitive)
  - active column is "Y" for questions you want to include
  - question_id and question_text are not empty`);
  }

  CACHE[flowId] = { expiresAt: now + CACHE_TTL_MS, value: cleaned };

  console.log(`[SheetFlowLoader] Loaded ${cleaned.length} questions for flow ${flowId} from Google Sheets (cached for 5 min)`);
  return cleaned;
}

export function invalidateFlowCache(flowId: string) {
  console.log(`[SheetFlowLoader] Invalidating cache for flow: ${flowId}`);
  delete CACHE[flowId];
}

export function invalidateAllFlowCache() {
  const count = Object.keys(CACHE).length;
  console.log(`[SheetFlowLoader] Invalidating all ${count} cached flows`);
  Object.keys(CACHE).forEach(key => delete CACHE[key]);
}

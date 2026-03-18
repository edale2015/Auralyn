import { google } from "googleapis";

export type CanonicalTabName =
  | "Symptom_Packs"
  | "Pack_Questions"
  | "Modifier_Packs"
  | "Clinician_Algorithms"
  | "Plan_Templates"
  | "Pack_Audit_Log"
  | "Import_Mapping_Log"
  | "Import_Errors";

export interface MigrationSources {
  symptomPackTab?: string;
  questionTab?: string;
  modifierTab?: string;
  algorithmTab?: string;
  planTemplateTab?: string;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  sheet: string;
  rowNumber?: number;
  message: string;
}

const CANONICAL_HEADERS: Record<CanonicalTabName, string[]> = {
  Symptom_Packs: [
    "id","system","title","isActive","version","tags","aliases","likelyDisposition","questionsJson","redFlags","autoEscalateRules","autoReviewRules","planTemplateKey"
  ],
  Pack_Questions: [
    "id","packId","questionId","prompt","type","priority","required","optionsJson","helpText","isActive","version"
  ],
  Modifier_Packs: [
    "id","system","title","isActive","version","tags","appliesToSymptoms","triggers","riskAdjustmentsJson"
  ],
  Clinician_Algorithms: [
    "id","system","title","isActive","version","tags","entryCriteria","requiredInputs","outputActions","notes"
  ],
  Plan_Templates: [
    "key","diagnosisLabel","defaultDisposition","summary","homeCare","medsJson","followUp","returnPrecautions","patientMessage"
  ],
  Pack_Audit_Log: [
    "id","entityType","entityId","action","actorId","actorName","at","beforeJson","afterJson","validationOk","validationIssuesJson","notes"
  ],
  Import_Mapping_Log: [
    "id","at","sourceTab","targetTab","status","detailsJson"
  ],
  Import_Errors: [
    "id","at","sourceTab","rowNumber","severity","message","rawJson"
  ],
};

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function getSpreadsheetId(): string {
  const id = process.env.PACKS_SPREADSHEET_ID;
  if (!id) throw new Error("Missing PACKS_SPREADSHEET_ID");
  return id;
}

function splitPipe(value: string | undefined): string[] {
  if (!value) return [];
  return value.split("|").map(x => x.trim()).filter(Boolean);
}

function isLikelyCanonicalHeader(actual: string[], expected: string[]): boolean {
  const normalized = actual.map(x => x.trim().toLowerCase());
  const exp = expected.map(x => x.trim().toLowerCase());
  return exp.every((h, idx) => normalized[idx] === h);
}

export async function ensureCanonicalTabs(): Promise<{ created: string[]; existing: string[] }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = new Set((meta.data.sheets || []).map(s => s.properties?.title || ""));

  const created: string[] = [];
  const existing: string[] = [];
  const requests: any[] = [];

  for (const tab of Object.keys(CANONICAL_HEADERS) as CanonicalTabName[]) {
    if (existingSheets.has(tab)) {
      existing.push(tab);
      continue;
    }
    created.push(tab);
    requests.push({ addSheet: { properties: { title: tab } } });
  }

  if (requests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  for (const tab of Object.keys(CANONICAL_HEADERS) as CanonicalTabName[]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1:Z1`,
      valueInputOption: "RAW",
      requestBody: { values: [CANONICAL_HEADERS[tab]] },
    });
  }

  return { created, existing };
}

export async function verifyCanonicalTabs(): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const issues: ValidationIssue[] = [];

  for (const tab of Object.keys(CANONICAL_HEADERS) as CanonicalTabName[]) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` });
    const header = (res.data.values?.[0] || []) as string[];
    if (!header.length) {
      issues.push({ severity: "error", sheet: tab, message: "Missing header row" });
      continue;
    }
    if (!isLikelyCanonicalHeader(header, CANONICAL_HEADERS[tab])) {
      issues.push({ severity: "error", sheet: tab, message: `Header mismatch for ${tab}` });
    }
  }

  return { ok: !issues.some(x => x.severity === "error"), issues };
}

export async function dryRunMigration(sources: MigrationSources): Promise<{ ok: boolean; issues: ValidationIssue[]; counts: Record<string, number> }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const issues: ValidationIssue[] = [];
  const counts: Record<string, number> = {};

  const sourceMap: Array<[string, string | undefined]> = [
    ["Symptom_Packs", sources.symptomPackTab],
    ["Pack_Questions", sources.questionTab],
    ["Modifier_Packs", sources.modifierTab],
    ["Clinician_Algorithms", sources.algorithmTab],
    ["Plan_Templates", sources.planTemplateTab],
  ];

  for (const [targetTab, sourceTab] of sourceMap) {
    if (!sourceTab) continue;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sourceTab}!A:Z` });
    const rows = res.data.values || [];
    counts[sourceTab] = Math.max(0, rows.length - 1);
    if (!rows.length) {
      issues.push({ severity: "warning", sheet: sourceTab, message: `Source tab ${sourceTab} is empty` });
      continue;
    }
    issues.push({ severity: "warning", sheet: sourceTab, message: `Dry run mapped ${sourceTab} -> ${targetTab} with ${Math.max(0, rows.length - 1)} data rows` });
  }

  return { ok: true, issues, counts };
}

export async function applyMigration(sources: MigrationSources): Promise<{ ok: boolean; migrated: Record<string, number>; issues: ValidationIssue[] }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const migrated: Record<string, number> = {};
  const issues: ValidationIssue[] = [];

  const sourceMap: Array<[CanonicalTabName, string | undefined]> = [
    ["Symptom_Packs", sources.symptomPackTab],
    ["Pack_Questions", sources.questionTab],
    ["Modifier_Packs", sources.modifierTab],
    ["Clinician_Algorithms", sources.algorithmTab],
    ["Plan_Templates", sources.planTemplateTab],
  ];

  for (const [targetTab, sourceTab] of sourceMap) {
    if (!sourceTab) continue;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sourceTab}!A:Z` });
    const rows = res.data.values || [];
    if (!rows.length) {
      issues.push({ severity: "warning", sheet: sourceTab, message: `Skipped empty source tab ${sourceTab}` });
      continue;
    }

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${targetTab}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${targetTab}!A1:Z${rows.length}`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });

    migrated[targetTab] = Math.max(0, rows.length - 1);
    await appendImportLog(sourceTab, targetTab, "applied", { rowCount: migrated[targetTab] });
  }

  return { ok: !issues.some(x => x.severity === "error"), migrated, issues };
}

async function appendImportLog(sourceTab: string, targetTab: string, status: string, details: any) {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `Import_Mapping_Log!A:E`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, new Date().toISOString(), sourceTab, targetTab, status, JSON.stringify(details)]],
    },
  });
}

export async function runQaChecks(): Promise<{ ok: boolean; issues: ValidationIssue[]; summary: Record<string, number> }> {
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const issues: ValidationIssue[] = [];
  const summary: Record<string, number> = {};

  const symptomRows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `Symptom_Packs!A:Z` })).data.values || [];
  const questionRows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `Pack_Questions!A:Z` })).data.values || [];
  const modifierRows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `Modifier_Packs!A:Z` })).data.values || [];
  const algoRows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `Clinician_Algorithms!A:Z` })).data.values || [];

  summary.symptomPacks = Math.max(0, symptomRows.length - 1);
  summary.questions = Math.max(0, questionRows.length - 1);
  summary.modifiers = Math.max(0, modifierRows.length - 1);
  summary.algorithms = Math.max(0, algoRows.length - 1);

  const packIds = new Set(symptomRows.slice(1).map(r => r[0]).filter(Boolean));
  for (const [idx, row] of questionRows.slice(1).entries()) {
    const packId = row[1];
    if (packId && !packIds.has(packId)) {
      issues.push({ severity: "error", sheet: "Pack_Questions", rowNumber: idx + 2, message: `Question references unknown packId ${packId}` });
    }
  }

  for (const [idx, row] of modifierRows.slice(1).entries()) {
    const applies = splitPipe(row[6]);
    for (const packId of applies) {
      if (!packIds.has(packId)) {
        issues.push({ severity: "warning", sheet: "Modifier_Packs", rowNumber: idx + 2, message: `Modifier references unknown packId ${packId}` });
      }
    }
  }

  for (const issue of issues) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `Import_Errors!A:G`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[`${Date.now()}_${Math.random().toString(36).slice(2,6)}`, new Date().toISOString(), issue.sheet, String(issue.rowNumber || ""), issue.severity, issue.message, ""]],
      },
    });
  }

  return { ok: !issues.some(x => x.severity === "error"), issues, summary };
}

export async function cutoverToCanonicalOnly(): Promise<{ ok: true; status: { canonicalOnly: boolean; driver: string } }> {
  return {
    ok: true,
    status: {
      canonicalOnly: true,
      driver: process.env.PACK_REPO_DRIVER || "memory",
    },
  };
}

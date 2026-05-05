import fs from "fs";
import path from "path";
import { getTable } from "../data/registry";
import {
  assertCoreQuestionsNotCorrupt,
  assertRedFlagRulesNotCorrupt,
  assertDispositionRulesNotCorrupt,
  assertOutputTemplatesNotCorrupt,
  assertClusterScoringRulesNotCorrupt,
} from "../data/corruptionGuard";

export type SheetRow = Record<string, any>;

export interface ComplaintRegistryEntry {
  ccId: string;
  system: string;
  label: string;
  version: number;
  coreQuestionsVersion: number;
  redFlagSetId: string;
  scoringId: string;
  dispositionSetId: string;
  outputTemplateSetId: string;
  defaultCluster: string;
  scoringModule: string;
  graphId: string;
  enabled: boolean;
  engineType: "LEGACY" | "GENERIC_V1";
  aliases: string[];
}

export interface WorldBRow extends Record<string, any> {
  __sourceTable?: string;
}

export interface LoadComplaintConfigOptions {
  /**
   * Default true. Set false for admin/pipeline visualization so partially
   * populated Google Sheet bundles show their gaps instead of throwing.
   */
  strict?: boolean;
}

export interface CoreQuestion {
  ccId: string;
  version: number;
  qId: string;
  askOrder: number;
  questionText: string;
  answerType: string;
  required: boolean;
  askIf: string;
  category: string;
}

export interface RedFlagRule {
  ccId: string;
  rfId: string;
  label: string;
  triggerExpr: string;
  severity: "HARD" | "SOFT";
  action: string;
  immediateActions: string;
  rationale: string;
}

export interface ScoringDef {
  ccId: string;
  scoreId: string;
  label: string;
  module: string;
  inputs: string[];
  thresholds: Record<string, string>;
  notes: string;
}

export interface DispositionRule {
  ccId: string;
  dispRuleId: string;
  priority: number;
  whenExpr: string;
  dispositionLevel: string;
  rationaleTemplateId: string;
  confidenceHint: string;
}

export interface OutputTemplate {
  ccId: string;
  templateId: string;
  label: string;
  channel: string;
  body: string;
}

export interface ClusterScoringRule {
  ccId: string;
  clusterId: string;
  ruleId: string;
  points: number;
  whenExpr: string;
  evidenceLabel: string;
}

export interface DxCandidateRow {
  CC_ID: string;
  DX_ID: string;
  DX_LABEL: string;
  BEST_CLUSTER_ID: string;
  BASE_POINTS: number;
  CLUSTER_PRIORITY: number;
  BASE_SCORE: number;
  RANK: number;
}

export interface ComplaintConfig {
  registry: ComplaintRegistryEntry;
  coreQuestions: CoreQuestion[];
  redFlagRules: RedFlagRule[];
  scoringDefs: ScoringDef[];
  dispositionRules: DispositionRule[];
  outputTemplates: OutputTemplate[];
  clusterScoringRules: ClusterScoringRule[];
  dxCandidates: DxCandidateRow[];

  // World B normalized Google Sheets layers
  modifiers: WorldBRow[];
  scoringSystems: WorldBRow[];
  globalSecondary: WorldBRow[];
  globalClusterMaster: WorldBRow[];
  clusterPrimaryDiagnosis: WorldBRow[];
  redFlagsMaster: WorldBRow[];
  globalMedicationsMaster: WorldBRow[];
  urgentCareSpotInterventions: WorldBRow[];
  medConditionIntelligenceRules: WorldBRow[];
}

interface CachedConfig {
  config: ComplaintConfig;
  expiresAt: number;
}

const CONFIG_CACHE = new Map<string, CachedConfig>();
const CONFIG_TTL_MS = 60_000;

function norm(s: any): string {
  return String(s ?? "").trim();
}

function normLower(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function parseBoolean(s: any): boolean {
  const v = normLower(s);
  return v === "true" || v === "yes" || v === "1";
}

function parseNumber(s: any, fallback: number = 0): number {
  const n = Number(s);
  return isNaN(n) ? fallback : n;
}

function parseCsvList(s: any): string[] {
  return String(s ?? "").split(",").map(x => x.trim()).filter(Boolean);
}

function firstPresent(row: SheetRow, keys: string[]): any {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return undefined;
}

function normalizeKey(s: any): string {
  return String(s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseSheetVersion(row: SheetRow): number {
  return parseNumber(firstPresent(row, ["VERSION", "CORE_QUESTIONS_VERSION", "QUESTION_VERSION"]), 1);
}

function withSource(tableName: string, rows: SheetRow[]): WorldBRow[] {
  return rows.map(row => ({ ...row, __sourceTable: tableName }));
}

function directComplaintValue(row: SheetRow): string {
  return normalizeKey(firstPresent(row, [
    "CC_ID", "COMPLAINT_ID", "complaint_id", "ccId",
    "COMPLAINT", "CHIEF_COMPLAINT", "chief_complaint",
  ]));
}

function rowMentionsComplaint(row: SheetRow, ccId: string, registry: ComplaintRegistryEntry): boolean {
  const direct = directComplaintValue(row);
  if (direct) return direct === ccId || registry.aliases.includes(direct);

  const system = normalizeKey(registry.system);
  const aliases = new Set([ccId, system, ...registry.aliases].filter(Boolean));
  const haystack = Object.values(row)
    .map(v => String(v ?? "").toLowerCase().replace(/[\s-]+/g, "_"))
    .join(" ");
  for (const alias of aliases) {
    if (alias && haystack.includes(alias)) return true;
  }
  return false;
}

function rowsForComplaint(
  tableName: string,
  rows: SheetRow[],
  ccId: string,
  registry: ComplaintRegistryEntry,
  options: { includeGlobalRowsWithoutComplaint?: boolean } = {},
): WorldBRow[] {
  const scoped = rows.filter(row => {
    if (rowMentionsComplaint(row, ccId, registry)) return true;
    if (!options.includeGlobalRowsWithoutComplaint) return false;
    return directComplaintValue(row) === "";
  });
  return withSource(tableName, scoped);
}

function parseThresholds(s: any): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = String(s ?? "").split(";").map(x => x.trim()).filter(Boolean);
  for (const part of parts) {
    const [range, label] = part.split(":").map(x => x.trim());
    if (range && label) result[range] = label;
  }
  return result;
}

function rowToRegistry(row: SheetRow): ComplaintRegistryEntry | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  if (!ccId) return null;
  const aliases = String(firstPresent(row, ["ALIASES", "ALIAS", "SYNONYMS"]) ?? "")
    .split(/[;,]/)
    .map(a => normalizeKey(a))
    .filter(Boolean);
  const version = parseSheetVersion(row);
  return {
    ccId,
    system: norm(firstPresent(row, ["SYSTEM", "DOMAIN", "SPECIALTY"])),
    label: norm(firstPresent(row, ["LABEL", "CC_LABEL", "COMPLAINT_LABEL", "DISPLAY_NAME"])),
    version,
    coreQuestionsVersion: version,
    redFlagSetId: norm(firstPresent(row, ["RED_FLAG_SET_ID", "RF_SET_ID"])),
    scoringId: norm(firstPresent(row, ["SCORING_ID", "SCORING_SYSTEM_ID"])),
    dispositionSetId: norm(firstPresent(row, ["DISPOSITION_SET_ID", "DISP_SET_ID"])),
    outputTemplateSetId: norm(firstPresent(row, ["OUTPUT_TEMPLATE_SET_ID", "TEMPLATE_SET_ID"])),
    defaultCluster: norm(firstPresent(row, ["DEFAULT_CLUSTER", "DEFAULT_CLUSTER_ID"])),
    scoringModule: norm(firstPresent(row, ["SCORING_MODULE", "MODULE"])),
    graphId: norm(firstPresent(row, ["GRAPH_ID", "GRAPH"])),
    enabled: parseBoolean(firstPresent(row, ["ENABLED", "ACTIVE"])),
    engineType: norm(firstPresent(row, ["ENGINE_TYPE", "ENGINE"])).toUpperCase() === "GENERIC_V1" ? "GENERIC_V1" : "LEGACY",
    aliases,
  };
}

function rowToCoreQuestion(row: SheetRow): CoreQuestion | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const qId = norm(firstPresent(row, ["Q_ID", "QUESTION_ID", "question_id"]));
  if (!ccId || !qId) return null;
  return {
    ccId,
    version: parseSheetVersion(row),
    qId,
    askOrder: parseNumber(firstPresent(row, ["ASK_ORDER", "ORDER", "QUESTION_ORDER", "SEQUENCE"]), 0),
    questionText: norm(firstPresent(row, ["QUESTION_TEXT", "QUESTION", "PROMPT"])),
    answerType: normLower(firstPresent(row, ["ANSWER_TYPE", "TYPE"])) || "tri",
    required: parseBoolean(firstPresent(row, ["REQUIRED", "IS_REQUIRED"])),
    askIf: norm(firstPresent(row, ["ASK_IF", "WHEN_EXPR", "CONDITION"])) || "true",
    category: normLower(firstPresent(row, ["CATEGORY", "QUESTION_CATEGORY"])) || "general",
  };
}

function rowToRedFlagRule(row: SheetRow): RedFlagRule | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const rfId = norm(firstPresent(row, ["RF_ID", "RULE_ID", "RED_FLAG_ID"]));
  if (!ccId || !rfId) return null;
  return {
    ccId,
    rfId,
    label: norm(firstPresent(row, ["LABEL", "DESCRIPTION", "RED_FLAG_LABEL"])),
    triggerExpr: norm(firstPresent(row, ["TRIGGER_EXPR", "WHEN_EXPR", "CONDITION", "RULE_EXPR"])),
    severity: norm(firstPresent(row, ["SEVERITY", "RISK_LEVEL"])).toUpperCase() === "HARD" ? "HARD" : "SOFT",
    action: norm(firstPresent(row, ["ACTION", "IMMEDIATE_ACTION", "GATE_RESULT"])),
    immediateActions: norm(firstPresent(row, ["IMMEDIATE_ACTIONS", "IMMEDIATE_ACTION", "ACTIONS"])),
    rationale: norm(firstPresent(row, ["RATIONALE", "REASON", "CLINICAL_RATIONALE"])),
  };
}

function rowToScoringDef(row: SheetRow): ScoringDef | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const scoreId = norm(firstPresent(row, ["SCORE_ID", "SCORING_ID", "ID"]));
  if (!ccId || !scoreId) return null;
  return {
    ccId,
    scoreId,
    label: norm(firstPresent(row, ["LABEL", "NAME"])),
    module: norm(firstPresent(row, ["MODULE", "SCORING_MODULE"])),
    inputs: parseCsvList(firstPresent(row, ["INPUTS", "INPUT_FIELDS"])),
    thresholds: parseThresholds(firstPresent(row, ["THRESHOLDS", "THRESHOLD_MAP"])),
    notes: norm(firstPresent(row, ["NOTES", "RATIONALE"])),
  };
}

function rowToDispositionRule(row: SheetRow): DispositionRule | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const dispRuleId = norm(firstPresent(row, ["DISP_RULE_ID", "RULE_ID", "DISPOSITION_RULE_ID"]));
  if (!ccId || !dispRuleId) return null;
  return {
    ccId,
    dispRuleId,
    priority: parseNumber(firstPresent(row, ["PRIORITY", "SORT_ORDER"]), 99),
    whenExpr: norm(firstPresent(row, ["WHEN_EXPR", "CONDITION", "TRIGGER_EXPR"])) || "true",
    dispositionLevel: normLower(firstPresent(row, ["DISPOSITION_LEVEL", "DISPOSITION", "LEVEL"])) || "routine",
    rationaleTemplateId: norm(firstPresent(row, ["RATIONALE_TEMPLATE_ID", "TEMPLATE_ID", "PLAN_TEMPLATE_ID"])),
    confidenceHint: norm(firstPresent(row, ["CONFIDENCE_HINT", "CONFIDENCE"])) || "LOW",
  };
}

function rowToOutputTemplate(row: SheetRow): OutputTemplate | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const templateId = norm(firstPresent(row, ["TEMPLATE_ID", "PLAN_TEMPLATE_ID", "RATIONALE_TEMPLATE_ID"]));
  if (!ccId || !templateId) return null;
  return {
    ccId,
    templateId,
    label: norm(firstPresent(row, ["LABEL", "TITLE", "TEMPLATE_LABEL"])),
    channel: normLower(firstPresent(row, ["CHANNEL", "AUDIENCE"])) || "all",
    body: norm(firstPresent(row, ["BODY", "TEMPLATE_BODY", "TEXT", "PLAN_TEXT"])),
  };
}

function rowToClusterScoringRule(row: SheetRow): ClusterScoringRule | null {
  const ccId = normalizeKey(firstPresent(row, ["CC_ID", "COMPLAINT_ID", "complaint_id", "ccId"]));
  const clusterId = norm(firstPresent(row, ["CLUSTER_ID", "CLUSTER", "DX_CLUSTER_ID"]));
  const ruleId = norm(firstPresent(row, ["RULE_ID", "SCORING_RULE_ID"]));
  if (!ccId || !clusterId || !ruleId) return null;
  return {
    ccId,
    clusterId,
    ruleId,
    points: parseNumber(firstPresent(row, ["POINTS", "SCORE", "WEIGHT"]), 0),
    whenExpr: norm(firstPresent(row, ["WHEN_EXPR", "CONDITION", "TRIGGER_EXPR"])) || "false",
    evidenceLabel: norm(firstPresent(row, ["EVIDENCE_LABEL", "LABEL", "RATIONALE"])) || ruleId,
  };
}

export type BundleIssue = {
  level: "ERROR" | "WARN";
  code: string;
  message: string;
};

function isTruthyExpr(expr: string | null | undefined): boolean {
  if (!expr) return false;
  const s = expr.trim().toLowerCase();
  return s === "true" || s === "1" || s === "always";
}

export function validateComplaintBundle(cfg: ComplaintConfig): BundleIssue[] {
  const issues: BundleIssue[] = [];

  if (!cfg.registry) {
    issues.push({ level: "ERROR", code: "REGISTRY_MISSING", message: "Missing registry entry." });
    return issues;
  }
  if (!cfg.registry.ccId) {
    issues.push({ level: "ERROR", code: "CC_ID_MISSING", message: "Registry ccId missing." });
  }
  if (!cfg.registry.engineType) {
    issues.push({ level: "ERROR", code: "ENGINE_TYPE_MISSING", message: "Registry engineType missing." });
  }

  if (!Array.isArray(cfg.coreQuestions) || cfg.coreQuestions.length === 0) {
    issues.push({ level: "ERROR", code: "QUESTIONS_MISSING", message: "No questions defined." });
  }

  const templates = Array.isArray(cfg.outputTemplates) ? cfg.outputTemplates : [];
  if (templates.length === 0) {
    issues.push({ level: "ERROR", code: "TEMPLATES_MISSING", message: "No output templates defined." });
  }

  const disp = Array.isArray(cfg.dispositionRules) ? cfg.dispositionRules : [];
  if (disp.length === 0) {
    issues.push({ level: "ERROR", code: "DISP_RULES_MISSING", message: "No disposition rules defined." });
  } else {
    const defaults = disp.filter(r => isTruthyExpr(r.whenExpr));
    if (defaults.length === 0) {
      issues.push({
        level: "WARN",
        code: "DISP_NO_DEFAULT",
        message: "No default catch-all disposition rule (whenExpr=true). Engine will fall back to 'routine'.",
      });
    } else if (defaults.length > 1) {
      issues.push({
        level: "WARN",
        code: "DISP_MULTIPLE_DEFAULTS",
        message: `Multiple default disposition rules (whenExpr=true). Found: ${defaults.length}. Only the first (by priority) will fire.`,
      });
    }

    const hasEscalation = disp.some(r => {
      const level = r.dispositionLevel.toUpperCase();
      return (
        level.includes("ER") ||
        level.includes("EMERG") ||
        level === "ER_SEND"
      );
    });
    if (!hasEscalation) {
      issues.push({
        level: "WARN",
        code: "DISP_NO_ESCALATION",
        message: "No escalation disposition rule found (er_send or emergency level).",
      });
    }
  }

  if (cfg.registry.engineType === "GENERIC_V1") {
    const csr = Array.isArray(cfg.clusterScoringRules) ? cfg.clusterScoringRules : [];
    if (csr.length === 0) {
      issues.push({ level: "ERROR", code: "CSR_MISSING", message: "No cluster scoring rules for GENERIC_V1 engine." });
    } else {
      const hasPrimary = csr.some(r => r.clusterId.toUpperCase().includes("PRIMARY"));
      if (!hasPrimary) {
        issues.push({
          level: "WARN",
          code: "CSR_NO_PRIMARY",
          message: "No PRIMARY cluster scoring rules found.",
        });
      }
    }

    const rfRules = Array.isArray(cfg.redFlagRules) ? cfg.redFlagRules : [];
    if (rfRules.length === 0) {
      issues.push({
        level: "WARN",
        code: "RF_RULES_MISSING",
        message: "No red flag rules defined for GENERIC_V1 engine.",
      });
    }
  }

  return issues;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const DX_CANDIDATES_PATH = path.join(process.cwd(), "server", "data", "csv", "DX_CANDIDATES.csv");
let _dxCandidatesCache: Map<string, DxCandidateRow[]> | null = null;
let _dxCandidatesMtimeMs: number | null = null;

function loadDxCandidatesTable(): Map<string, DxCandidateRow[]> {
  if (!fs.existsSync(DX_CANDIDATES_PATH)) return new Map();

  const stat = fs.statSync(DX_CANDIDATES_PATH);
  if (_dxCandidatesCache && _dxCandidatesMtimeMs === stat.mtimeMs) return _dxCandidatesCache;

  const raw = fs.readFileSync(DX_CANDIDATES_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const headers = splitCsvLine(lines[0]);
  const idx = (name: string) => headers.indexOf(name);

  const iCC = idx("CC_ID");
  const iDxId = idx("DX_ID");
  const iDxLabel = idx("DX_LABEL");
  const iCl = idx("BEST_CLUSTER_ID");
  const iPts = idx("BASE_POINTS");
  const iPr = idx("CLUSTER_PRIORITY");
  const iScore = idx("BASE_SCORE");
  const iRank = idx("RANK");

  if ([iCC, iDxId, iDxLabel, iCl, iPts, iPr, iScore, iRank].some((x) => x < 0)) {
    console.warn("[DX_CANDIDATES] Missing expected headers:", headers.join(","));
    return new Map();
  }

  const out = new Map<string, DxCandidateRow[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const cc = (cols[iCC] ?? "").trim();
    if (!cc) continue;

    const row: DxCandidateRow = {
      CC_ID: cc,
      DX_ID: (cols[iDxId] ?? "").trim(),
      DX_LABEL: (cols[iDxLabel] ?? "").trim(),
      BEST_CLUSTER_ID: (cols[iCl] ?? "").trim(),
      BASE_POINTS: Number((cols[iPts] ?? "0").trim()) || 0,
      CLUSTER_PRIORITY: Number((cols[iPr] ?? "0").trim()) || 0,
      BASE_SCORE: Number((cols[iScore] ?? "0").trim()) || 0,
      RANK: Number((cols[iRank] ?? "0").trim()) || 0,
    };

    if (!out.has(cc)) out.set(cc, []);
    out.get(cc)!.push(row);
  }

  for (const [, arr] of out.entries()) {
    arr.sort((a, b) => (a.RANK - b.RANK) || (b.BASE_SCORE - a.BASE_SCORE));
  }

  _dxCandidatesCache = out;
  _dxCandidatesMtimeMs = stat.mtimeMs;
  return out;
}

export async function loadComplaintConfig(ccId: string, options: LoadComplaintConfigOptions = {}): Promise<ComplaintConfig | null> {
  const key = ccId.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const now = Date.now();

  const cached = CONFIG_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.config;

  const registryRows = await getTable("COMPLAINT_REGISTRY");
  const allEntries = registryRows.map(rowToRegistry).filter((e): e is ComplaintRegistryEntry => e !== null && e.enabled);
  let regEntry = allEntries.find(e => e.ccId === key);
  if (!regEntry) {
    regEntry = allEntries.find(e => e.aliases.includes(key));
  }

  if (!regEntry) return null;
  const canonicalKey = regEntry.ccId;

  let qRows: SheetRow[], rfRows: SheetRow[], sRows: SheetRow[],
      dRows: SheetRow[], tRows: SheetRow[], csrRows: SheetRow[],
      modifiersRows: SheetRow[], globalModifiersRows: SheetRow[], globalModifiersCleanRows: SheetRow[],
      cardsModifierRows: SheetRow[], scoringSystemsRows: SheetRow[], globalSecondaryRows: SheetRow[],
      globalClusterRows: SheetRow[], clusterPrimaryDiagnosisRows: SheetRow[], redFlagsMasterRows: SheetRow[],
      globalMedicationRows: SheetRow[], urgentCareSpotRows: SheetRow[], medConditionRows: SheetRow[];

  try {
    [
      qRows, rfRows, sRows, dRows, tRows, csrRows,
      modifiersRows, globalModifiersRows, globalModifiersCleanRows, cardsModifierRows,
      scoringSystemsRows, globalSecondaryRows, globalClusterRows, clusterPrimaryDiagnosisRows,
      redFlagsMasterRows, globalMedicationRows, urgentCareSpotRows, medConditionRows,
    ] = await Promise.all([
      getTable("CORE_QUESTIONS"),
      getTable("RED_FLAG_RULES"),
      getTable("SCORING_DEFS"),
      getTable("DISPOSITION_RULES"),
      getTable("OUTPUT_TEMPLATES"),
      getTable("CLUSTER_SCORING_RULES"),
      getTable("MODIFIERS"),
      getTable("GLOBAL_MODIFIERS"),
      getTable("GLOBAL_MODIFIERS_CLEAN"),
      getTable("CARDS_MODIFIER_MASTER"),
      getTable("SCORING_SYSTEMS"),
      getTable("GLOBAL_SECONDARY"),
      getTable("GLOBAL_CLUSTER_MASTER"),
      getTable("CLUSTER_PRIMARY_DIAGNOSIS"),
      getTable("RED_FLAGS_MASTER"),
      getTable("GLOBAL_MEDICATIONS_MASTER"),
      getTable("URGENT_CARE_SPOT_INTERVENTIONS"),
      getTable("MED_CONDITION_INTELLIGENCE_RULES"),
    ]);

    assertCoreQuestionsNotCorrupt(qRows);
    assertRedFlagRulesNotCorrupt(rfRows);
    assertDispositionRulesNotCorrupt(dRows);
    assertOutputTemplatesNotCorrupt(tRows);
    assertClusterScoringRulesNotCorrupt(csrRows);
  } catch (loadErr) {
    if (cached) {
      console.warn(
        `[ComplaintConfig] Load/corruption-guard failed for "${key}" — using last-known-good stale config`,
        loadErr
      );
      return cached.config;
    }
    throw loadErr;
  }

  const version = regEntry.coreQuestionsVersion || regEntry.version;

  const coreQuestions = qRows
    .map(rowToCoreQuestion)
    .filter((q): q is CoreQuestion => q !== null && q.ccId === canonicalKey && q.version === version)
    .sort((a, b) => a.askOrder - b.askOrder);

  const redFlagRules = rfRows
    .map(rowToRedFlagRule)
    .filter((r): r is RedFlagRule => r !== null && r.ccId === canonicalKey);

  const scoringDefs = sRows
    .map(rowToScoringDef)
    .filter((s): s is ScoringDef => s !== null && s.ccId === canonicalKey);

  const dispositionRules = dRows
    .map(rowToDispositionRule)
    .filter((d): d is DispositionRule => d !== null && d.ccId === canonicalKey)
    .sort((a, b) => a.priority - b.priority);

  const outputTemplates = tRows
    .map(rowToOutputTemplate)
    .filter((t): t is OutputTemplate => t !== null && t.ccId === canonicalKey);

  const clusterScoringRules = csrRows
    .map(rowToClusterScoringRule)
    .filter((r): r is ClusterScoringRule => r !== null && r.ccId === canonicalKey);

  const dxCandidatesByCc = loadDxCandidatesTable();
  const dxCandidates = dxCandidatesByCc.get(canonicalKey) ?? [];

  const modifiers = [
    ...rowsForComplaint("MODIFIERS", modifiersRows, canonicalKey, regEntry, { includeGlobalRowsWithoutComplaint: true }),
    ...rowsForComplaint("GLOBAL_MODIFIERS", globalModifiersRows, canonicalKey, regEntry, { includeGlobalRowsWithoutComplaint: true }),
    ...rowsForComplaint("GLOBAL_MODIFIERS_CLEAN", globalModifiersCleanRows, canonicalKey, regEntry, { includeGlobalRowsWithoutComplaint: true }),
    ...rowsForComplaint("CARDS_MODIFIER_MASTER", cardsModifierRows, canonicalKey, regEntry, { includeGlobalRowsWithoutComplaint: true }),
  ];
  const scoringSystems    = rowsForComplaint("SCORING_SYSTEMS", scoringSystemsRows, canonicalKey, regEntry);
  const globalSecondary   = rowsForComplaint("GLOBAL_SECONDARY", globalSecondaryRows, canonicalKey, regEntry, { includeGlobalRowsWithoutComplaint: true });
  const globalClusterMaster = rowsForComplaint("GLOBAL_CLUSTER_MASTER", globalClusterRows, canonicalKey, regEntry);
  const clusterPrimaryDiagnosis = rowsForComplaint("CLUSTER_PRIMARY_DIAGNOSIS", clusterPrimaryDiagnosisRows, canonicalKey, regEntry);
  const redFlagsMaster    = rowsForComplaint("RED_FLAGS_MASTER", redFlagsMasterRows, canonicalKey, regEntry);
  const globalMedicationsMaster = rowsForComplaint("GLOBAL_MEDICATIONS_MASTER", globalMedicationRows, canonicalKey, regEntry);
  const urgentCareSpotInterventions = rowsForComplaint("URGENT_CARE_SPOT_INTERVENTIONS", urgentCareSpotRows, canonicalKey, regEntry);
  const medConditionIntelligenceRules = rowsForComplaint("MED_CONDITION_INTELLIGENCE_RULES", medConditionRows, canonicalKey, regEntry);

  const config: ComplaintConfig = {
    registry: regEntry,
    coreQuestions,
    redFlagRules,
    scoringDefs,
    dispositionRules,
    outputTemplates,
    clusterScoringRules,
    dxCandidates,
    modifiers,
    scoringSystems,
    globalSecondary,
    globalClusterMaster,
    clusterPrimaryDiagnosis,
    redFlagsMaster,
    globalMedicationsMaster,
    urgentCareSpotInterventions,
    medConditionIntelligenceRules,
  };

  const issues = validateComplaintBundle(config);
  const errors = issues.filter(i => i.level === "ERROR");
  if (errors.length) {
    const msg = errors.map(e => `${e.code}: ${e.message}`).join(" | ");
    if (options.strict !== false) {
      throw new Error(`Complaint bundle invalid for CC_ID=${canonicalKey}: ${msg}`);
    }
    console.warn(`[ComplaintBundleValidator] CC_ID=${canonicalKey} non-strict load with ERROR gaps: ${msg}`);
  }
  const warns = issues.filter(i => i.level === "WARN");
  if (warns.length) {
    console.warn(
      `[ComplaintBundleValidator] CC_ID=${canonicalKey} WARN: ` +
        warns.map(w => `${w.code}: ${w.message}`).join(", ")
    );
  }

  CONFIG_CACHE.set(key, { config, expiresAt: now + CONFIG_TTL_MS });
  if (key !== canonicalKey) {
    CONFIG_CACHE.set(canonicalKey, { config, expiresAt: now + CONFIG_TTL_MS });
  }
  console.log(`[ComplaintConfig] Loaded config for ${key}: ${coreQuestions.length} questions, ${modifiers.length} modifiers, ${redFlagRules.length} RF rules, ${clusterScoringRules.length} cluster rules, ${dispositionRules.length} disposition rules, ${outputTemplates.length} templates`);
  return config;
}

export function invalidateComplaintConfigCache(ccId?: string): void {
  if (ccId) {
    CONFIG_CACHE.delete(ccId.toLowerCase().trim());
  } else {
    CONFIG_CACHE.clear();
  }
}

export async function listAvailableComplaints(): Promise<ComplaintRegistryEntry[]> {
  const rows = await getTable("COMPLAINT_REGISTRY");
  return rows.map(rowToRegistry).filter((e): e is ComplaintRegistryEntry => e !== null && e.enabled);
}

// ── Background config refresh ─────────────────────────────────────────────────
//
// Proactively re-loads configs that are in-cache before they expire.
// Runs every 60 seconds; failures are logged but never thrown — the runner
// continues with stale data rather than crashing the process.
// Timer is unref'd so it does not block test process exit.

const BACKGROUND_REFRESH_INTERVAL_MS = 60_000;

let _backgroundRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function startComplaintConfigBackgroundRefresh(): void {
  if (_backgroundRefreshTimer) return; // idempotent
  _backgroundRefreshTimer = setInterval(async () => {
    const keys = Array.from(CONFIG_CACHE.keys());
    for (const key of keys) {
      try {
        await loadComplaintConfig(key);
      } catch (err) {
        console.warn(`[ComplaintConfig] Background refresh failed for "${key}":`, err);
      }
    }
  }, BACKGROUND_REFRESH_INTERVAL_MS).unref();
}

export function stopComplaintConfigBackgroundRefresh(): void {
  if (_backgroundRefreshTimer) {
    clearInterval(_backgroundRefreshTimer);
    _backgroundRefreshTimer = null;
  }
}

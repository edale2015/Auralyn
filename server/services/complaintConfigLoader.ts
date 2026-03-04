import { getTable, getTableFiltered } from "../data/registry";
import {
  assertCoreQuestionsNotCorrupt,
  assertRedFlagRulesNotCorrupt,
  assertDispositionRulesNotCorrupt,
  assertOutputTemplatesNotCorrupt,
} from "../data/corruptionGuard";

type SheetRow = Record<string, any>;

export interface ComplaintRegistryEntry {
  ccId: string;
  system: string;
  label: string;
  version: number;
  defaultCluster: string;
  scoringModule: string;
  graphId: string;
  enabled: boolean;
  engineType: "LEGACY" | "GENERIC_V1";
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

export interface ComplaintConfig {
  registry: ComplaintRegistryEntry;
  coreQuestions: CoreQuestion[];
  redFlagRules: RedFlagRule[];
  scoringDefs: ScoringDef[];
  dispositionRules: DispositionRule[];
  outputTemplates: OutputTemplate[];
  clusterScoringRules: ClusterScoringRule[];
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

function parseThresholds(s: any): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = String(s ?? "").split(";").map(x => x.trim()).filter(Boolean);
  for (const part of parts) {
    const [range, label] = part.split(":").map(x => x.trim());
    if (range && label) result[range] = label;
  }
  return result;
}

function rowToRegistry(row: SheetRow): ComplaintRegistryEntry & { aliases: string[] } | null {
  const ccId = normLower(row.CC_ID);
  if (!ccId) return null;
  const aliases = String(row.ALIASES ?? "").split(";").map(a => a.trim().toLowerCase().replace(/[\s-]+/g, "_")).filter(Boolean);
  return {
    ccId,
    system: norm(row.SYSTEM),
    label: norm(row.LABEL),
    version: parseNumber(row.VERSION, 1),
    defaultCluster: norm(row.DEFAULT_CLUSTER),
    scoringModule: norm(row.SCORING_MODULE),
    graphId: norm(row.GRAPH_ID),
    enabled: parseBoolean(row.ENABLED),
    engineType: norm(row.ENGINE_TYPE).toUpperCase() === "GENERIC_V1" ? "GENERIC_V1" : "LEGACY",
    aliases,
  };
}

function rowToCoreQuestion(row: SheetRow): CoreQuestion | null {
  const ccId = normLower(row.CC_ID);
  const qId = norm(row.Q_ID);
  if (!ccId || !qId) return null;
  return {
    ccId,
    version: parseNumber(row.VERSION, 1),
    qId,
    askOrder: parseNumber(row.ASK_ORDER, 0),
    questionText: norm(row.QUESTION_TEXT),
    answerType: normLower(row.ANSWER_TYPE) || "tri",
    required: parseBoolean(row.REQUIRED),
    askIf: norm(row.ASK_IF) || "true",
    category: normLower(row.CATEGORY) || "general",
  };
}

function rowToRedFlagRule(row: SheetRow): RedFlagRule | null {
  const ccId = normLower(row.CC_ID);
  const rfId = norm(row.RF_ID);
  if (!ccId || !rfId) return null;
  return {
    ccId,
    rfId,
    label: norm(row.LABEL),
    triggerExpr: norm(row.TRIGGER_EXPR),
    severity: norm(row.SEVERITY).toUpperCase() === "HARD" ? "HARD" : "SOFT",
    action: norm(row.ACTION),
    immediateActions: norm(row.IMMEDIATE_ACTIONS),
    rationale: norm(row.RATIONALE),
  };
}

function rowToScoringDef(row: SheetRow): ScoringDef | null {
  const ccId = normLower(row.CC_ID);
  const scoreId = norm(row.SCORE_ID);
  if (!ccId || !scoreId) return null;
  return {
    ccId,
    scoreId,
    label: norm(row.LABEL),
    module: norm(row.MODULE),
    inputs: parseCsvList(row.INPUTS),
    thresholds: parseThresholds(row.THRESHOLDS),
    notes: norm(row.NOTES),
  };
}

function rowToDispositionRule(row: SheetRow): DispositionRule | null {
  const ccId = normLower(row.CC_ID);
  const dispRuleId = norm(row.DISP_RULE_ID);
  if (!ccId || !dispRuleId) return null;
  return {
    ccId,
    dispRuleId,
    priority: parseNumber(row.PRIORITY, 99),
    whenExpr: norm(row.WHEN_EXPR) || "true",
    dispositionLevel: normLower(row.DISPOSITION_LEVEL) || "routine",
    rationaleTemplateId: norm(row.RATIONALE_TEMPLATE_ID),
    confidenceHint: norm(row.CONFIDENCE_HINT) || "LOW",
  };
}

function rowToOutputTemplate(row: SheetRow): OutputTemplate | null {
  const ccId = normLower(row.CC_ID);
  const templateId = norm(row.TEMPLATE_ID);
  if (!ccId || !templateId) return null;
  return {
    ccId,
    templateId,
    label: norm(row.LABEL),
    channel: normLower(row.CHANNEL) || "all",
    body: norm(row.BODY),
  };
}

function rowToClusterScoringRule(row: SheetRow): ClusterScoringRule | null {
  const ccId = normLower(row.CC_ID);
  const clusterId = norm(row.CLUSTER_ID);
  const ruleId = norm(row.RULE_ID);
  if (!ccId || !clusterId || !ruleId) return null;
  return {
    ccId,
    clusterId,
    ruleId,
    points: parseNumber(row.POINTS, 0),
    whenExpr: norm(row.WHEN_EXPR) || "false",
    evidenceLabel: norm(row.EVIDENCE_LABEL) || ruleId,
  };
}

type BundleIssue = {
  level: "ERROR" | "WARN";
  code: string;
  message: string;
};

function isTruthyExpr(expr: string | null | undefined): boolean {
  if (!expr) return false;
  const s = expr.trim().toLowerCase();
  return s === "true" || s === "1" || s === "always";
}

function validateComplaintBundle(cfg: ComplaintConfig): BundleIssue[] {
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

export async function loadComplaintConfig(ccId: string): Promise<ComplaintConfig | null> {
  const key = ccId.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const now = Date.now();

  const cached = CONFIG_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached.config;

  const registryRows = await getTable("COMPLAINT_REGISTRY");
  const allEntries = registryRows.map(rowToRegistry).filter((e): e is NonNullable<typeof e> => e !== null && e.enabled);
  let regEntry = allEntries.find(e => e.ccId === key);
  if (!regEntry) {
    regEntry = allEntries.find(e => e.aliases.includes(key));
  }

  if (!regEntry) return null;
  const canonicalKey = regEntry.ccId;

  const [qRows, rfRows, sRows, dRows, tRows, csrRows] = await Promise.all([
    getTable("CORE_QUESTIONS"),
    getTable("RED_FLAG_RULES"),
    getTable("SCORING_DEFS"),
    getTable("DISPOSITION_RULES"),
    getTable("OUTPUT_TEMPLATES"),
    getTable("CLUSTER_SCORING_RULES"),
  ]);

  assertCoreQuestionsNotCorrupt(qRows);
  assertRedFlagRulesNotCorrupt(rfRows);
  assertDispositionRulesNotCorrupt(dRows);
  assertOutputTemplatesNotCorrupt(tRows);

  const version = regEntry.version;

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

  const config: ComplaintConfig = {
    registry: regEntry,
    coreQuestions,
    redFlagRules,
    scoringDefs,
    dispositionRules,
    outputTemplates,
    clusterScoringRules,
  };

  const issues = validateComplaintBundle(config);
  const errors = issues.filter(i => i.level === "ERROR");
  if (errors.length) {
    const msg = errors.map(e => `${e.code}: ${e.message}`).join(" | ");
    throw new Error(`Complaint bundle invalid for CC_ID=${canonicalKey}: ${msg}`);
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
  console.log(`[ComplaintConfig] Loaded config for ${key}: ${coreQuestions.length} questions, ${redFlagRules.length} RF rules, ${dispositionRules.length} disposition rules, ${outputTemplates.length} templates`);
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

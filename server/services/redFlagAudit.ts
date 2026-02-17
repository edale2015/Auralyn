import { getTable } from "../data/registry";
import { DEFAULT_RED_FLAG_ROWS, type RedFlagMasterRow } from "./redFlagsMaster";

export interface AuditIssue {
  severity: "error" | "warn" | "info";
  category: string;
  message: string;
  details?: Record<string, any>;
}

export interface RedFlagAuditReport {
  timestamp: string;
  totalChecks: number;
  issues: AuditIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    redFlagCount: number;
    ruleRfReferences: number;
    ucRfReferences: number;
    missingIds: number;
    duplicateIds: number;
    overlappingRules: number;
    channelGaps: number;
  };
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function normId(s: any): string {
  return String(s ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function splitRfIds(s: any): string[] {
  return String(s ?? "").split(/[;,]/).map(x => x.trim().toUpperCase()).filter(x => x.startsWith("RF_"));
}

export async function runRedFlagAudit(): Promise<RedFlagAuditReport> {
  const issues: AuditIssue[] = [];
  let totalChecks = 0;

  let rfRows: Record<string, any>[] = [];
  let parsedRfRows: RedFlagMasterRow[] = [];
  let rfSource = "built_in_defaults";

  try {
    rfRows = await getTable("RED_FLAGS_MASTER");
    if (rfRows.length > 0) {
      rfSource = "RED_FLAGS_MASTER";
      parsedRfRows = rfRows.map(row => {
        const flagId = String(row.Flag_ID ?? row.flagId ?? "").trim();
        if (!flagId) return null;
        return {
          flagId,
          label: String(row.Label ?? row.label ?? "").trim(),
          system: norm(row.System),
          triggerType: norm(row.Trigger_Type ?? row.triggerType),
          triggerCondition: String(row.Trigger_Condition ?? row.triggerCondition ?? "").trim(),
          severity: (norm(row.Severity) || "high") as RedFlagMasterRow["severity"],
          action: norm(row.Action) || "er_send",
          immediateActions: String(row.Immediate_Actions ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean),
          reasons: String(row.Reasons ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean),
          channelMessage: String(row.Channel_Message ?? "").trim(),
        };
      }).filter((r): r is RedFlagMasterRow => r !== null);
    }
  } catch {
    issues.push({ severity: "warn", category: "table_load", message: "RED_FLAGS_MASTER table not available, using built-in defaults" });
  }

  if (parsedRfRows.length === 0) {
    parsedRfRows = DEFAULT_RED_FLAG_ROWS;
    rfSource = "built_in_defaults";
  }

  const rfIdSet = new Set(parsedRfRows.map(r => r.flagId));

  totalChecks++;
  const idCounts = new Map<string, number>();
  for (const row of parsedRfRows) {
    idCounts.set(row.flagId, (idCounts.get(row.flagId) || 0) + 1);
  }
  let duplicateIdCount = 0;
  for (const [id, count] of idCounts) {
    if (count > 1) {
      duplicateIdCount++;
      const dupes = parsedRfRows.filter(r => r.flagId === id);
      const severities = [...new Set(dupes.map(d => d.severity))];
      const actions = [...new Set(dupes.map(d => d.action))];
      if (severities.length > 1 || actions.length > 1) {
        issues.push({
          severity: "error",
          category: "duplicate_conflicting",
          message: `${id} appears ${count}x with conflicting severity (${severities.join(", ")}) or actions (${actions.join(", ")})`,
          details: { flagId: id, severities, actions, count },
        });
      } else {
        issues.push({
          severity: "warn",
          category: "duplicate_id",
          message: `${id} appears ${count}x with same severity/action — consider deduplicating`,
          details: { flagId: id, count },
        });
      }
    }
  }

  let ruleRfRefCount = 0;
  let missingFromRules = 0;
  totalChecks++;
  try {
    const ruleRows = await getTable("MED_CONDITION_INTELLIGENCE_RULES");
    for (const row of ruleRows) {
      const rfIds = splitRfIds(row.Related_RedFlag_IDs ?? row.related_redflag_ids);
      for (const rfId of rfIds) {
        ruleRfRefCount++;
        if (!rfIdSet.has(rfId)) {
          missingFromRules++;
          issues.push({
            severity: "error",
            category: "missing_rf_reference",
            message: `MED_CONDITION_INTELLIGENCE_RULES references ${rfId} but it does not exist in RED_FLAGS_MASTER`,
            details: { ruleId: String(row.Rule_ID ?? "").trim(), referencedFlag: rfId, table: "MED_CONDITION_INTELLIGENCE_RULES" },
          });
        }
      }
    }
  } catch {
    issues.push({ severity: "info", category: "table_load", message: "MED_CONDITION_INTELLIGENCE_RULES not available for RF reference check" });
  }

  let ucRfRefCount = 0;
  let missingFromUC = 0;
  totalChecks++;
  try {
    const ucRows = await getTable("URGENT_CARE_SPOT_INTERVENTIONS");
    for (const row of ucRows) {
      const rfIds = splitRfIds(row.Related_RedFlag_IDs ?? row.related_redflag_ids);
      for (const rfId of rfIds) {
        ucRfRefCount++;
        if (!rfIdSet.has(rfId)) {
          missingFromUC++;
          issues.push({
            severity: "error",
            category: "missing_rf_reference",
            message: `URGENT_CARE_SPOT_INTERVENTIONS references ${rfId} but it does not exist in RED_FLAGS_MASTER`,
            details: { interventionId: String(row.Intervention_ID ?? "").trim(), referencedFlag: rfId, table: "URGENT_CARE_SPOT_INTERVENTIONS" },
          });
        }
      }
    }
  } catch {
    issues.push({ severity: "info", category: "table_load", message: "URGENT_CARE_SPOT_INTERVENTIONS not available for RF reference check" });
  }

  let overlappingCount = 0;
  totalChecks++;
  const contextMap = new Map<string, RedFlagMasterRow[]>();
  for (const row of parsedRfRows) {
    const key = `${row.triggerType}::${row.triggerCondition}`;
    if (!contextMap.has(key)) contextMap.set(key, []);
    contextMap.get(key)!.push(row);
  }
  for (const [key, rows] of contextMap) {
    if (rows.length > 1) {
      const severities = [...new Set(rows.map(r => r.severity))];
      const actions = [...new Set(rows.map(r => r.action))];
      if (severities.length > 1 || actions.length > 1) {
        overlappingCount++;
        issues.push({
          severity: "warn",
          category: "overlapping_rules",
          message: `Overlapping trigger condition "${key}" has ${rows.length} rules with different severity/action`,
          details: { triggerKey: key, flags: rows.map(r => ({ id: r.flagId, severity: r.severity, action: r.action })) },
        });
      }
    }
  }

  const VALID_STATE_FIELDS = [
    "Q_SHORTNESS_OF_BREATH", "Q_CHEST_PAIN", "Q_STRIDOR", "Q_UNABLE_TO_SWALLOW_SALIVA",
    "Q_HTN_NEURO_DEFICIT", "Q_DM_ALTERED_MENTAL_STATUS", "Q_DM_PERSISTENT_VOMITING",
    "Q_DM_DEHYDRATION", "Q_DM_KUSSMAUL", "Q_DM_SEVERE_HYPO", "Q_DM_FRUITY_BREATH",
    "Q_VOMITING", "Q_DIARRHEA", "Q_FEVER", "Q_SNORING",
    "htn.endOrganSymptoms.critical", "dm.ketoneRisk",
  ];
  totalChecks++;
  for (const row of parsedRfRows) {
    if (row.triggerType === "answer" || row.triggerType === "") {
      const refFields = row.triggerCondition.match(/\b(Q_\w+)/g) ?? [];
      for (const field of refFields) {
        if (!VALID_STATE_FIELDS.includes(field)) {
          issues.push({
            severity: "warn",
            category: "unreachable_rule",
            message: `${row.flagId} references field "${field}" which may not exist in CaseState.answers`,
            details: { flagId: row.flagId, field, triggerCondition: row.triggerCondition },
          });
        }
      }
    }
  }

  let channelGapCount = 0;
  totalChecks++;
  for (const row of parsedRfRows) {
    if (row.action === "er_send" || row.severity === "critical") {
      if (!row.immediateActions || row.immediateActions.length === 0) {
        channelGapCount++;
        issues.push({
          severity: "warn",
          category: "channel_rendering",
          message: `${row.flagId} is ER_SEND/critical but has no immediateActions text for channel rendering`,
          details: { flagId: row.flagId, action: row.action, severity: row.severity },
        });
      }
      if (!row.label) {
        channelGapCount++;
        issues.push({
          severity: "warn",
          category: "channel_rendering",
          message: `${row.flagId} is ER_SEND/critical but has no label for display`,
          details: { flagId: row.flagId },
        });
      }
    }
  }

  const errorCount = issues.filter(i => i.severity === "error").length;
  const warnCount = issues.filter(i => i.severity === "warn").length;
  const infoCount = issues.filter(i => i.severity === "info").length;

  return {
    timestamp: new Date().toISOString(),
    totalChecks,
    issues,
    summary: {
      errors: errorCount,
      warnings: warnCount,
      info: infoCount,
      redFlagCount: parsedRfRows.length,
      ruleRfReferences: ruleRfRefCount,
      ucRfReferences: ucRfRefCount,
      missingIds: missingFromRules + missingFromUC,
      duplicateIds: duplicateIdCount,
      overlappingRules: overlappingCount,
      channelGaps: channelGapCount,
    },
  };
}

import { pool } from "../db/pool";
import { appendAuditEvent } from "../governance/audit";

// FIXED: Updated idColumn to use each table's natural text key (rule_id / complaint_id)
// and replaced the non-existent entity_id column with entity_key throughout all joins.

interface ConsistencyCheck {
  name: string;
  domainTable: string;
  entityType: string;
  idColumn: string;  // Required — must be the natural text key, not the serial PK
}

const CHECKS: ConsistencyCheck[] = [
  { name: "complaint_packs",  domainTable: "kb_complaint_packs",    entityType: "complaint_pack",  idColumn: "complaint_id" },
  { name: "red_flags",        domainTable: "kb_red_flag_rules",     entityType: "red_flag",        idColumn: "rule_id" },
  { name: "diagnoses",        domainTable: "kb_diagnosis_rules",    entityType: "diagnosis_rule",  idColumn: "rule_id" },
  { name: "treatment_rules",  domainTable: "kb_treatment_rules",    entityType: "treatment_rule",  idColumn: "rule_id" },
];

export interface CheckResult {
  name: string;
  missingFromEntityStore: number;
  orphanedInEntityStore: number;
  missingSample: string[];
  orphanedSample: string[];
}

export interface KbConsistencyReport {
  severity: "ok" | "alert";
  checks: CheckResult[];
  runAt: string;
}

export async function runKbConsistencyAudit(): Promise<KbConsistencyReport> {
  const results: CheckResult[] = [];
  const runAt = new Date().toISOString();

  for (const check of CHECKS) {
    const idCol = check.idColumn;

    try {
      // FIXED: Join on k.entity_key (the natural text domain key) not k.entity_id
      // (which doesn't exist in kb_entity_store — the columns are id serial and entity_key text).
      const missing = await pool.query(
        `SELECT d.${idCol}::text AS id
         FROM ${check.domainTable} d
         LEFT JOIN kb_entity_store k
           ON k.entity_type = $1 AND k.entity_key = d.${idCol}::text
         WHERE k.entity_key IS NULL
         LIMIT 500`,
        [check.entityType]
      );

      const orphaned = await pool.query(
        `SELECT k.entity_key
         FROM kb_entity_store k
         LEFT JOIN ${check.domainTable} d
           ON d.${idCol}::text = k.entity_key
         WHERE k.entity_type = $1 AND d.${idCol} IS NULL
         LIMIT 500`,
        [check.entityType]
      );

      results.push({
        name: check.name,
        missingFromEntityStore: missing.rowCount ?? 0,
        orphanedInEntityStore: orphaned.rowCount ?? 0,
        missingSample: missing.rows.slice(0, 20).map((r: any) => r.id),
        orphanedSample: orphaned.rows.slice(0, 20).map((r: any) => r.entity_key),
      });
    } catch (e: any) {
      results.push({
        name: check.name,
        missingFromEntityStore: -1,
        orphanedInEntityStore: -1,
        missingSample: [],
        orphanedSample: [`ERROR: ${e?.message}`],
      });
    }
  }

  const severity: "ok" | "alert" = results.some(
    r => r.missingFromEntityStore > 0 || r.orphanedInEntityStore > 0 || r.missingFromEntityStore === -1
  ) ? "alert" : "ok";

  await appendAuditEvent({
    tenantId: null,
    actorId: "system",
    action: "KB_CONSISTENCY_AUDIT_COMPLETED",
    entityType: "kb_entity_store",
    payload: { severity, runAt, checkCount: results.length, results },
  });

  if (severity === "alert") {
    console.warn("[KbConsistencyAudit] Inconsistencies detected:", JSON.stringify(results, null, 2));
  } else {
    console.log("[KbConsistencyAudit] All checks passed — KB is consistent");
  }

  return { severity, checks: results, runAt };
}

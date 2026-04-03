import { pool } from "../db/pool";
import { appendAuditEvent } from "../governance/audit";

interface ConsistencyCheck {
  name: string;
  domainTable: string;
  entityType: string;
  idColumn?: string;
}

const CHECKS: ConsistencyCheck[] = [
  { name: "complaint_packs", domainTable: "kb_complaint_packs", entityType: "complaint_pack" },
  { name: "red_flags", domainTable: "kb_red_flag_rules", entityType: "red_flag" },
  { name: "diagnoses", domainTable: "kb_diagnosis_rules", entityType: "diagnosis_rule" },
  { name: "treatment_rules", domainTable: "kb_treatment_rules", entityType: "treatment_rule" },
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
    try {
      const idCol = check.idColumn ?? "id";

      const missing = await pool.query(
        `SELECT d.${idCol}::text AS id
         FROM ${check.domainTable} d
         LEFT JOIN kb_entity_store k
           ON k.entity_type = $1 AND k.entity_id = d.${idCol}::text
         WHERE k.entity_id IS NULL
         LIMIT 500`,
        [check.entityType]
      );

      const orphaned = await pool.query(
        `SELECT k.entity_id
         FROM kb_entity_store k
         LEFT JOIN ${check.domainTable} d
           ON d.${idCol}::text = k.entity_id
         WHERE k.entity_type = $1 AND d.${idCol} IS NULL
         LIMIT 500`,
        [check.entityType]
      );

      results.push({
        name: check.name,
        missingFromEntityStore: missing.rowCount ?? 0,
        orphanedInEntityStore: orphaned.rowCount ?? 0,
        missingSample: missing.rows.slice(0, 20).map((r: any) => r.id),
        orphanedSample: orphaned.rows.slice(0, 20).map((r: any) => r.entity_id),
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

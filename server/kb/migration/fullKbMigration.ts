import { db } from "../../db";
import {
  kbComplaints, kbRedFlagRules, kbWorkupRules, kbDiagnosisRules,
  kbTreatmentRules, kbDispositionRules, kbPlanTemplates, kbFeatureModels, kbEngineRouting,
} from "@shared/schema";
import { upsertKbSource, upsertKbEntity } from "../kbRepository";
import { logger } from "../../utils/logger";

interface MigrationResult {
  source: string;
  total: number;
  migrated: number;
  errors: number;
}

async function migrateTable<T extends Record<string, unknown>>(
  tableName: string,
  entityType: string,
  keyField: string,
  titleField: string,
  sourceKey: string,
  rows: T[]
): Promise<MigrationResult> {
  let migrated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const entityKey = String(row[keyField] ?? "").toLowerCase().replace(/\s+/g, "_");
      if (!entityKey) continue;

      await upsertKbEntity({
        entityType: entityType as any,
        entityKey,
        title: String(row[titleField] ?? entityKey),
        content: row,
        sourceKey,
        changedBy: "full_kb_migration",
        changeSummary: `Migrated from ${tableName}`,
      });
      migrated++;
    } catch (e: any) {
      errors++;
      logger.warn(`[KbMigration] Error migrating row from ${tableName}`, { message: e?.message });
    }
  }

  return { source: tableName, total: rows.length, migrated, errors };
}

export async function runFullKbMigration(): Promise<{
  results: MigrationResult[];
  totalMigrated: number;
  totalErrors: number;
  durationMs: number;
}> {
  const start = Date.now();
  logger.info("[KbMigration] Starting full KB migration to entity store");

  await upsertKbSource({
    sourceKey: "domain_kb_tables",
    sourceType: "system",
    name: "Domain KB Tables",
    description: "Auto-migrated from existing domain-specific KB tables",
    isAuthoritative: true,
  });

  const [
    complaints, redFlags, workups, diagnoses, treatments, dispositions, planTemplates, featureModels, engineRouting,
  ] = await Promise.all([
    db.select().from(kbComplaints),
    db.select().from(kbRedFlagRules),
    db.select().from(kbWorkupRules),
    db.select().from(kbDiagnosisRules),
    db.select().from(kbTreatmentRules),
    db.select().from(kbDispositionRules),
    db.select().from(kbPlanTemplates),
    db.select().from(kbFeatureModels),
    db.select().from(kbEngineRouting),
  ]);

  const results = await Promise.all([
    migrateTable("kb_complaints", "complaint", "complaintId", "displayName", "domain_kb_tables", complaints as any[]),
    migrateTable("kb_red_flag_rules", "red_flag_rule", "ruleId", "description", "domain_kb_tables", redFlags as any[]),
    migrateTable("kb_workup_rules", "workup_rule", "ruleId", "test", "domain_kb_tables", workups as any[]),
    migrateTable("kb_diagnosis_rules", "diagnosis_rule", "ruleId", "diagnosis", "domain_kb_tables", diagnoses as any[]),
    migrateTable("kb_treatment_rules", "treatment_rule", "ruleId", "treatment", "domain_kb_tables", treatments as any[]),
    migrateTable("kb_disposition_rules", "disposition_rule", "ruleId", "disposition", "domain_kb_tables", dispositions as any[]),
    migrateTable("kb_plan_templates", "plan_template", "templateId", "title", "domain_kb_tables", planTemplates as any[]),
    migrateTable("kb_feature_models", "feature_model", "modelId", "name", "domain_kb_tables", featureModels as any[]),
    migrateTable("kb_engine_routing", "engine_routing", "complaintId", "engineType", "domain_kb_tables", engineRouting as any[]),
  ]);

  const totalMigrated = results.reduce((s, r) => s + r.migrated, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const durationMs = Date.now() - start;

  logger.info("[KbMigration] Complete", { totalMigrated, totalErrors, durationMs });
  return { results, totalMigrated, totalErrors, durationMs };
}

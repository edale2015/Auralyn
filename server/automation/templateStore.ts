/**
 * Template Store — Packet 20 improvements
 *
 * Changes from baseline:
 *
 * 1. Rollback preservation
 *    Problem: ON CONFLICT DO UPDATE blindly overwrites the stored definition
 *    with no record of what was there before.
 *    Fix: Before the upsert, a CTE copies the current row's definition into
 *    `automation_template_history` (one INSERT per overwrite). This creates
 *    an append-only audit log — every version is preserved and can be rolled
 *    back with `rollbackTemplate()`.
 *
 * 2. New functions
 *    - getTemplateHistory(key, limit?)  — fetch N most recent archived versions
 *    - rollbackTemplate(key, historyId) — restore a specific historical version
 *    - deleteStoredTemplate(key)        — hard-delete (also purges history)
 */

import { query } from "../db";
import type { AutomationTemplate } from "./types";

// ── Save (with history preservation) ─────────────────────────────────────────

export async function saveRecordedTemplate(
  template: AutomationTemplate,
  archivedBy?: string
) {
  // Step 1: archive current version (if it exists) before overwriting
  await query(
    `INSERT INTO automation_template_history (template_key, name, definition, archived_at, archived_by)
     SELECT template_key, name, definition, NOW(), $2
     FROM automation_templates
     WHERE template_key = $1`,
    [template.templateKey, archivedBy ?? null]
  );

  // Step 2: upsert the new version
  const result = await query(
    `INSERT INTO automation_templates
       (template_key, name, description, target_type, start_url, login_url, definition, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (template_key)
     DO UPDATE SET
       name        = EXCLUDED.name,
       description = EXCLUDED.description,
       target_type = EXCLUDED.target_type,
       start_url   = EXCLUDED.start_url,
       login_url   = EXCLUDED.login_url,
       definition  = EXCLUDED.definition,
       updated_at  = NOW()
     RETURNING *`,
    [
      template.templateKey,
      template.name,
      template.description ?? null,
      template.targetType,
      template.startUrl,
      template.loginUrl ?? null,
      template,
    ]
  );

  return result.rows[0];
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listStoredTemplates() {
  const result = await query(
    `SELECT * FROM automation_templates ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getStoredTemplate(templateKey: string) {
  const result = await query(
    `SELECT * FROM automation_templates WHERE template_key = $1 LIMIT 1`,
    [templateKey]
  );
  return result.rows[0] ?? null;
}

// ── History + rollback ────────────────────────────────────────────────────────

/**
 * Returns up to `limit` (default 10) historical versions of a template,
 * newest first.
 */
export async function getTemplateHistory(templateKey: string, limit = 10) {
  const result = await query(
    `SELECT id, template_key, name, definition, archived_at, archived_by
     FROM automation_template_history
     WHERE template_key = $1
     ORDER BY archived_at DESC
     LIMIT $2`,
    [templateKey, limit]
  );
  return result.rows;
}

/**
 * Restores the template definition from a specific history entry.
 * The current live version is itself archived before the rollback.
 * Returns the restored template row.
 */
export async function rollbackTemplate(
  templateKey: string,
  historyId: string,
  rolledBackBy?: string
): Promise<Record<string, unknown> | null> {
  // Fetch the historical version
  const histResult = await query(
    `SELECT * FROM automation_template_history WHERE id = $1 AND template_key = $2`,
    [historyId, templateKey]
  );
  const historicalRow = histResult.rows[0];
  if (!historicalRow) return null;

  // Archive the current version before rollback
  await query(
    `INSERT INTO automation_template_history (template_key, name, definition, archived_at, archived_by)
     SELECT template_key, name, definition, NOW(), $2
     FROM automation_templates
     WHERE template_key = $1`,
    [templateKey, rolledBackBy ?? "system/rollback"]
  );

  // Restore the historical definition
  const result = await query(
    `UPDATE automation_templates
     SET definition = $2, name = $3, updated_at = NOW()
     WHERE template_key = $1
     RETURNING *`,
    [templateKey, historicalRow.definition, historicalRow.name]
  );

  return result.rows[0] ?? null;
}

/**
 * Hard-deletes a template and all its history. Use with care.
 */
export async function deleteStoredTemplate(templateKey: string) {
  await query(
    `DELETE FROM automation_template_history WHERE template_key = $1`,
    [templateKey]
  );
  await query(
    `DELETE FROM automation_templates WHERE template_key = $1`,
    [templateKey]
  );
}

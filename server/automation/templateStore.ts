import { query } from "../db";
import type { AutomationTemplate } from "./types";

export async function saveRecordedTemplate(template: AutomationTemplate) {
  const result = await query(
    `INSERT INTO automation_templates (template_key, name, description, target_type, start_url, login_url, definition, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (template_key)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       target_type = EXCLUDED.target_type,
       start_url = EXCLUDED.start_url,
       login_url = EXCLUDED.login_url,
       definition = EXCLUDED.definition,
       updated_at = NOW()
     RETURNING *`,
    [
      template.templateKey,
      template.name,
      template.description || null,
      template.targetType,
      template.startUrl,
      template.loginUrl || null,
      template,
    ]
  );

  return result.rows[0];
}

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

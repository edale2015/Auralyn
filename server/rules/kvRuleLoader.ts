import { getSheetRows } from "../sheets/sheetHelper";
import { getSheetRowsWithSpreadsheetId } from "../sheets/getSheetRowsWithSpreadsheetId";

export async function getRulesForFlow(
  flowId: string,
  spreadsheetIdOverride?: string
): Promise<Record<string, string>> {

  const loader = spreadsheetIdOverride
    ? await getSheetRowsWithSpreadsheetId("CLINICAL_RULES", spreadsheetIdOverride)
    : await getSheetRows("CLINICAL_RULES");

  const { rowsAsObjects } = loader;

  const out: Record<string, string> = {};

  for (const r of rowsAsObjects) {
    const fid = String((r as any).flow_id || "").trim();
    if (fid !== flowId) continue;

    const active = String((r as any).active || "Y").trim().toUpperCase();
    if (active === "N") continue;

    const key = String((r as any).rule_key || "").trim();
    if (!key) continue;

    // First wins - prevent later duplicate rows from silently overriding
    if (!(key in out)) {
      out[key] = String((r as any).value ?? "").trim();
    }
  }

  return out;
}

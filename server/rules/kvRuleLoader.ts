import { getSheetRows } from "../sheets/sheetHelper";

export async function getRulesForFlow(flowId: string): Promise<Record<string, string>> {
  const { rowsAsObjects } = await getSheetRows("CLINICAL_RULES");

  const out: Record<string, string> = {};

  for (const r of rowsAsObjects) {
    const fid = String(r.flow_id || "").trim();
    if (fid !== flowId) continue;

    const active = String(r.active || "Y").trim().toUpperCase();
    if (active === "N") continue;

    const key = String(r.rule_key || "").trim();
    if (!key) continue;

    out[key] = String(r.value ?? "").trim();
  }

  return out;
}

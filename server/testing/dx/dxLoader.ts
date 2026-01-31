import { getSheetRows } from "../../sheets/sheetHelper";

function norm(x: any) { return String(x ?? "").trim(); }

export async function loadAllowedDiagnosisIdsBySystem(system: string): Promise<Set<string>> {
  const { rowsAsObjects } = await getSheetRows("CLINICAL_DIAGNOSES");
  const out = new Set<string>();

  for (const r of rowsAsObjects) {
    if (norm((r as any).System).toUpperCase() !== system.toUpperCase()) continue;
    const id = norm((r as any)["Diagnosis ID"]);
    if (id) out.add(id);
  }
  return out;
}

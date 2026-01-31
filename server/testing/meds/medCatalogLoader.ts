import { getSheetRows } from "../../sheets/sheetHelper";

export type MedRow = Record<string, any>;

function norm(x: any) {
  return String(x ?? "").trim();
}

function extractRowKey(notes: string): string | null {
  const m = (notes || "").match(/ROW_KEY=([^\s;]+)/);
  return m ? m[1].trim() : null;
}

export async function loadMedCatalogByRowKey(): Promise<Map<string, MedRow>> {
  const { rowsAsObjects } = await getSheetRows("CLINICAL_MEDICATIONS");
  const m = new Map<string, MedRow>();

  for (const r of rowsAsObjects) {
    const notes = norm((r as any).Notes);
    const rk = extractRowKey(notes);
    if (rk) m.set(rk, r as any);
  }
  return m;
}

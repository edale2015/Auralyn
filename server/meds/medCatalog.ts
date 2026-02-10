import { getSheetsClient } from "../sheets/sheetsClient";

export type MedRow = {
  Diagnosis_ID?: string;
  System?: string;
  Medication_Name: string;
  Medication_Group?: string;
  Indications_Cluster?: string;
  Adult_Dose?: string;
  Adult_Max_Dose?: string;
  Pediatric_Dose?: string;
  Pregnancy_Considerations?: string;
  Contraindications?: string;
  Key_Interactions?: string;
  Common_Side_Effects?: string;
  Route?: string;
  Renal_Adjust?: string;
  Hepatic_Adjust?: string;
  Notes?: string;
  Active?: string;
};

type CacheEntry = {
  expiresAt: number;
  byName: Map<string, MedRow[]>;
  byDiagnosisId: Map<string, MedRow[]>;
  byIndicationCluster: Map<string, MedRow[]>;
};
let CACHE: CacheEntry = {
  expiresAt: 0,
  byName: new Map(),
  byDiagnosisId: new Map(),
  byIndicationCluster: new Map(),
};
const TTL_MS = 5 * 60 * 1000;

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

export function isFirstLine(row: MedRow): boolean {
  const v =
    (row as any)["First_Line?"] ??
    (row as any)["First_Line"] ??
    (row as any)["first_line"] ??
    "";
  return String(v).trim().toLowerCase() === "yes";
}

function authSheets() {
  return getSheetsClient();
}

function rowToObj(headers: string[], row: any[]): MedRow {
  const obj: any = {};
  headers.forEach((h, i) => {
    obj[h] = row[i] ?? "";
  });
  return obj as MedRow;
}

export async function getMedicationCatalog() {
  const now = Date.now();
  if (CACHE.expiresAt > now) return CACHE;

  const spreadsheetId = envOrThrow("SHEETS_SPREADSHEET_ID");
  const sheets = authSheets();
  const range = `CLINICAL_MEDICATIONS!A1:ZZ5000`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values: any[][] = resp.data.values || [];
  if (values.length < 2) {
    CACHE = {
      expiresAt: now + TTL_MS,
      byName: new Map(),
      byDiagnosisId: new Map(),
      byIndicationCluster: new Map(),
    };
    return CACHE;
  }

  const headers = values[0].map((h) => String(h ?? "").trim());
  const rows = values.slice(1);

  const byName = new Map<string, MedRow[]>();
  const byDiagnosisId = new Map<string, MedRow[]>();
  const byIndicationCluster = new Map<string, MedRow[]>();

  const nameIdx = headers.indexOf("Medication_Name");
  if (nameIdx < 0) {
    throw new Error("CLINICAL_MEDICATIONS missing header Medication_Name");
  }
  const dxIdx = headers.indexOf("Diagnosis_ID");
  const indIdx = headers.indexOf("Indications_Cluster");

  for (const r of rows) {
    const name = norm(r[nameIdx]);
    if (!name) continue;
    const obj = rowToObj(headers, r);
    const active = norm((obj as any).Active || (obj as any).active);
    if (active && active !== "y" && active !== "yes" && active !== "true" && active !== "") {
      continue;
    }
    const list = byName.get(name) || [];
    list.push(obj);
    byName.set(name, list);

    if (dxIdx >= 0) {
      const dx = norm((obj as any)["Diagnosis_ID"]);
      if (dx) {
        const l2 = byDiagnosisId.get(dx) || [];
        l2.push(obj);
        byDiagnosisId.set(dx, l2);
      }
    }

    if (indIdx >= 0) {
      const ind = norm((obj as any)["Indications_Cluster"]);
      if (ind) {
        const l3 = byIndicationCluster.get(ind) || [];
        l3.push(obj);
        byIndicationCluster.set(ind, l3);
      }
    }
  }

  console.log(`[MedCatalog] Loaded ${byName.size} meds, ${byDiagnosisId.size} diagnosis keys, ${byIndicationCluster.size} cluster keys (cached 5 min)`);
  CACHE = { expiresAt: now + TTL_MS, byName, byDiagnosisId, byIndicationCluster };
  return CACHE;
}

export function pickBestMed(rows: MedRow[], preferredRoute?: string): MedRow {
  if (!rows.length) throw new Error("No rows");
  if (preferredRoute) {
    const match = rows.find((r) => norm(r.Route) === norm(preferredRoute));
    if (match) return match;
  }
  return rows[0];
}

export function medMatchesAllergy(medName: string, allergies: string[]): boolean {
  const n = norm(medName);
  for (const a of allergies) {
    const al = norm(a);
    if (!al) continue;
    if (n.includes(al) || al.includes(n)) return true;
  }
  return false;
}

export function shouldAvoidMedByModifiers(medName: string, modifiers: any): string | null {
  const n = norm(medName);
  if (modifiers?.pregnant) {
    if (n.includes("ibuprofen") || n.includes("naproxen") || n.includes("nsaid")) {
      return "Pregnancy: avoid NSAIDs unless physician-directed.";
    }
  }
  if (modifiers?.htn || modifiers?.anxiety) {
    if (n.includes("pseudoephedrine") || n.includes("phenylephrine")) {
      return "HTN/anxiety: avoid oral decongestants (pseudoephedrine/phenylephrine).";
    }
  }
  if (modifiers?.ssri_snri) {
    if (n.includes("dextromethorphan")) {
      return "SSRI/SNRI: avoid dextromethorphan (serotonergic risk).";
    }
  }
  return null;
}

export function getMedsForDiagnoses(
  catalog: { byDiagnosisId: Map<string, MedRow[]>; byIndicationCluster: Map<string, MedRow[]> },
  diagnosisIds: string[],
  indicationClusters: string[]
): MedRow[] {
  const out: MedRow[] = [];

  for (const dx of diagnosisIds || []) {
    const key = norm(dx);
    const rows = catalog.byDiagnosisId.get(key);
    if (rows?.length) out.push(...rows);
  }

  for (const ic of indicationClusters || []) {
    const key = norm(ic);
    const rows = catalog.byIndicationCluster.get(key);
    if (rows?.length) out.push(...rows);
  }

  const seen = new Set<string>();
  const deduped: MedRow[] = [];
  for (const r of out) {
    const k = `${norm(r.Medication_Name)}||${norm(r.Route)}||${norm(r.Adult_Dose)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }

  deduped.sort((a, b) => {
    const fa = isFirstLine(a) ? 1 : 0;
    const fb = isFirstLine(b) ? 1 : 0;
    if (fb !== fa) return fb - fa;
    return norm(a.Medication_Name).localeCompare(norm(b.Medication_Name));
  });

  return deduped;
}

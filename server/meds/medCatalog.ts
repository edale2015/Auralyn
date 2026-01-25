import { google } from "googleapis";

export type MedRow = {
  System?: string;
  Medication_Name: string;
  Medication_Group?: string;
  Indications_Cluster?: string;
  First_Line?: string;
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

type CacheEntry = { expiresAt: number; byName: Map<string, MedRow[]> };
let CACHE: CacheEntry = { expiresAt: 0, byName: new Map() };
const TTL_MS = 5 * 60 * 1000;

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function authSheets() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  return google.sheets({ version: "v4", auth });
}

function rowToObj(headers: string[], row: any[]): MedRow {
  const obj: any = {};
  headers.forEach((h, i) => {
    obj[h] = row[i] ?? "";
  });
  return obj as MedRow;
}

export async function getMedicationCatalog(): Promise<Map<string, MedRow[]>> {
  const now = Date.now();
  if (CACHE.expiresAt > now) return CACHE.byName;

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
    CACHE = { expiresAt: now + TTL_MS, byName: new Map() };
    return CACHE.byName;
  }

  const headers = values[0].map((h) => String(h ?? "").trim());
  const rows = values.slice(1);

  const byName = new Map<string, MedRow[]>();
  const nameIdx = headers.indexOf("Medication_Name");
  if (nameIdx < 0) {
    throw new Error("CLINICAL_MEDICATIONS missing header Medication_Name");
  }

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
  }

  console.log(`[MedCatalog] Loaded ${byName.size} unique medications from CLINICAL_MEDICATIONS (cached for 5 min)`);
  CACHE = { expiresAt: now + TTL_MS, byName };
  return byName;
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

// Map diagnosis IDs to Indications_Cluster values
const DIAGNOSIS_TO_CLUSTER: Record<string, string[]> = {
  "ent_flu_like_tamiflu_eligible": ["flu", "influenza", "viral uri", "flu-like"],
  "ent_pharyngitis": ["pharyngitis", "sore throat", "strep"],
  "ent_acute_bronchitis": ["bronchitis", "cough", "acute bronchitis"],
  "ent_viral_uri": ["viral uri", "uri", "common cold", "upper respiratory"],
  "ent_rhinosinusitis": ["sinusitis", "rhinosinusitis", "congestion", "sinus"],
  "ent_red_flag": ["urgent", "red flag"],
  "ent_covid_positive": ["covid", "covid-19", "sars-cov-2"],
};

export type MedPickResult = {
  name: string;
  source: "catalog" | "fallback";
  firstLine: boolean;
  indication: string;
  row?: MedRow;
  avoidReason?: string;
};

export async function getMedsForDiagnoses(
  diagnosisIds: string[],
  modifiers: any,
  allergies: string[]
): Promise<{ recommended: MedPickResult[]; avoid: MedPickResult[] }> {
  const catalog = await getMedicationCatalog();
  const recommended: MedPickResult[] = [];
  const avoid: MedPickResult[] = [];
  const seenMeds = new Set<string>();

  // Collect all matching clusters for the diagnoses
  const targetClusters: string[] = [];
  for (const dxId of diagnosisIds) {
    const clusters = DIAGNOSIS_TO_CLUSTER[norm(dxId)] || [];
    targetClusters.push(...clusters);
  }

  // Search through all medications for matching clusters
  for (const [medName, rows] of catalog.entries()) {
    for (const row of rows) {
      const cluster = norm(row.Indications_Cluster || "");
      const matchesCluster = targetClusters.some(tc => cluster.includes(tc) || tc.includes(cluster));
      
      if (!matchesCluster) continue;
      if (seenMeds.has(medName)) continue;
      seenMeds.add(medName);

      const firstLine = norm(row.First_Line || "") === "yes" || norm(row.First_Line || "") === "y";

      // Check for allergy match
      if (medMatchesAllergy(row.Medication_Name, allergies)) {
        avoid.push({
          name: row.Medication_Name,
          source: "catalog",
          firstLine,
          indication: row.Indications_Cluster || "",
          row,
          avoidReason: "Allergy match",
        });
        continue;
      }

      // Check for modifier-based avoidance
      const avoidReason = shouldAvoidMedByModifiers(row.Medication_Name, modifiers);
      if (avoidReason) {
        avoid.push({
          name: row.Medication_Name,
          source: "catalog",
          firstLine,
          indication: row.Indications_Cluster || "",
          row,
          avoidReason,
        });
        continue;
      }

      recommended.push({
        name: row.Medication_Name,
        source: "catalog",
        firstLine,
        indication: row.Indications_Cluster || "",
        row,
      });
    }
  }

  // Sort recommended: first-line first, then alphabetically
  recommended.sort((a, b) => {
    if (a.firstLine && !b.firstLine) return -1;
    if (!a.firstLine && b.firstLine) return 1;
    return a.name.localeCompare(b.name);
  });

  return { recommended, avoid };
}

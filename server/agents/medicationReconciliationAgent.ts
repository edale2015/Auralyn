export type Medication = {
  name:   string;
  dose?:  string;
  route?: string;
};

export type ReconciliationResult = {
  duplicates:    string[];
  interactions:  string[];
  missing:       string[];
  riskLevel:     "none" | "low" | "moderate" | "high";
  summary:       string;
};

const INTERACTION_DB: Record<string, string[]> = {
  warfarin:       ["ibuprofen", "aspirin", "naproxen", "clopidogrel", "amiodarone", "fluconazole"],
  lisinopril:     ["spironolactone", "potassium", "enalapril", "ramipril"],
  metformin:      ["contrast_dye"],
  metoprolol:     ["verapamil", "diltiazem"],
  amoxicillin:    ["warfarin"],
  ciprofloxacin:  ["warfarin", "tizanidine", "theophylline"],
  sertraline:     ["tramadol", "linezolid", "phenelzine"],
  sildenafil:     ["nitroglycerin", "isosorbide"],
  simvastatin:    ["amiodarone", "clarithromycin", "itraconazole"],
  clarithromycin: ["simvastatin", "warfarin", "colchicine"],
};

function computeRisk(result: Omit<ReconciliationResult, "riskLevel" | "summary">): ReconciliationResult["riskLevel"] {
  if (result.interactions.length >= 2) return "high";
  if (result.interactions.length === 1) return "moderate";
  if (result.missing.length > 0)       return "low";
  return "none";
}

export function reconcileMeds(
  reported: Medication[],
  history:  Medication[]
): ReconciliationResult {
  const reportedNames = new Set(reported.map(m => m.name.toLowerCase().replace(/\s+/g, "_")));
  const historyNames  = new Set(history.map(m => m.name.toLowerCase().replace(/\s+/g, "_")));

  const duplicates:   string[] = [];
  const interactions: string[] = [];
  const missing:      string[] = [];

  for (const m of reportedNames) {
    if (historyNames.has(m)) duplicates.push(m);
  }

  for (const m of historyNames) {
    if (!reportedNames.has(m)) missing.push(m);
  }

  const seen = new Set<string>();
  for (const m of reportedNames) {
    const list = INTERACTION_DB[m] ?? [];
    for (const other of list) {
      if (reportedNames.has(other)) {
        const key = [m, other].sort().join("+");
        if (!seen.has(key)) {
          seen.add(key);
          interactions.push(`${m} + ${other}`);
        }
      }
    }
  }

  const riskLevel = computeRisk({ duplicates, interactions, missing });
  const parts: string[] = [];
  if (duplicates.length)   parts.push(`${duplicates.length} duplicate(s)`);
  if (interactions.length) parts.push(`${interactions.length} interaction(s)`);
  if (missing.length)      parts.push(`${missing.length} omitted from current list`);
  const summary = parts.length ? `Reconciliation flags: ${parts.join(", ")}.` : "No medication discrepancies detected.";

  return { duplicates, interactions, missing, riskLevel, summary };
}

import { Scenario, SystemOutput, Score } from "./types";
import { loadMedCatalogByRowKey } from "./meds/medCatalogLoader";

function norm(x: any) { return String(x ?? "").trim(); }
function yn(x: any) { return norm(x).toUpperCase(); }

function extractRowKeysFromAnything(out: any): string[] {
  const keys: string[] = [];

  const proposal = out?.raw?.proposal;
  const medPack = proposal?.rulePacks?.medPack || proposal?.medPack || proposal?.med_pack;

  if (typeof medPack === "string" && medPack.includes("ROW_KEY=")) {
    const parts = medPack.split(/[;,]+/).map(s => s.trim());
    for (const p of parts) {
      const m = p.match(/ROW_KEY=([^|]+?\|[^"'\s]+)/) || p.match(/ROW_KEY=([^\s]+)/);
      if (m) keys.push(m[1].trim());
    }
  }

  const arrs = [
    proposal?.medIds,
    proposal?.med_ids,
    proposal?.medications,
    proposal?.meds,
  ].filter(Boolean);

  for (const a of arrs) {
    if (Array.isArray(a)) {
      for (const item of a) {
        const s = norm(item);
        if (s.includes("ROW_KEY=")) {
          const m = s.match(/ROW_KEY=([^\s;]+)/);
          if (m) keys.push(m[1].trim());
        }
      }
    }
  }

  return Array.from(new Set(keys));
}

export async function applyMedicationContraindicationChecks(
  scenario: Scenario,
  out: SystemOutput,
  score: Score
): Promise<Score> {
  const modifiers = scenario.modifiers || {};
  const pregnant = Boolean(modifiers.pregnant || modifiers.pregnancy_possible || modifiers.pregnancy === true);
  const postBari = Boolean(modifiers.post_bariatric_surgery);
  const renal = Boolean(modifiers.renal_impairment || modifiers.ckd);

  const penAllergy = Boolean(modifiers.penicillin_allergy);
  const sulfaAllergy = Boolean(modifiers.sulfa_allergy);

  const rowKeyMap = await loadMedCatalogByRowKey();
  const rowKeys = extractRowKeysFromAnything(out);

  if (!rowKeys.length) return score;

  const issues = [...score.issues];
  let severity = score.severity;

  for (const rk of rowKeys) {
    const row = rowKeyMap.get(rk);
    if (!row) continue;

    const medName = norm((row as any).Medication_Name) || rk;
    const pregNotes = norm((row as any).Pregnancy_Considerations);
    const contra = norm((row as any).Contraindications);
    const renalAdj = yn((row as any)["Renal_Adjust?"]);

    if (pregnant && (pregNotes.toLowerCase().includes("avoid") || contra.toLowerCase().includes("preg"))) {
      severity += 6;
      issues.push({
        code: "MED_PREGNANCY_CONTRA",
        message: `Pregnancy modifier set but med may be contraindicated: ${medName} (${rk})`,
      });
    }

    if (postBari && medName.toLowerCase().includes("ibuprofen")) {
      severity += 4;
      issues.push({
        code: "MED_BARIATRIC_NSAID",
        message: `Post-bariatric modifier set; avoid NSAIDs (detected ${medName})`,
      });
    }

    if (renal && renalAdj === "YES") {
      severity += 2;
      issues.push({
        code: "MED_RENAL_ADJUST",
        message: `Renal impairment set; med notes renal adjust: ${medName}`,
      });
    }

    if (penAllergy && medName.toLowerCase().includes("amoxicillin")) {
      severity += 5;
      issues.push({ code: "MED_ALLERGY_PEN", message: `Penicillin allergy set; med includes penicillin class: ${medName}` });
    }
    if (sulfaAllergy && medName.toLowerCase().includes("trimethoprim")) {
      severity += 5;
      issues.push({ code: "MED_ALLERGY_SULFA", message: `Sulfa allergy set; med may be sulfa: ${medName}` });
    }
  }

  return { ...score, pass: severity === 0, severity, issues };
}

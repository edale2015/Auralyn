import { runAdvancedDiagnosis, AdvancedDiagnosisInput } from "../kb/kbAdvancedDiagnosisEngine";
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface CounterfactualSuggestion {
  feature: string;
  featureType: string;
  currentValue: unknown;
  proposedChange: unknown;
  currentTopDx: string;
  newTopDx: string;
  impact: "diagnosis_flip" | "rank_change" | "score_change";
  posteriorShift: number;
}

function extractRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

export async function generateCounterfactuals(
  input: AdvancedDiagnosisInput,
  baseResults: Array<{ diagnosis?: string; diagnosisId?: string; diagnosisLabel?: string; score: number; posterior: number }>
): Promise<CounterfactualSuggestion[]> {
  const top = baseResults[0];
  if (!top) return [];

  const topDxId = (top as any).ruleId ?? (top as any).diagnosisId ?? "";
  const topDxLabel = (top as any).diagnosisLabel ?? (top as any).diagnosis ?? "unknown";

  let features: any[] = [];
  try {
    const rows = extractRows(await db.execute(sql`
      SELECT feature_key, feature_type, p_present, p_absent, mean, std_dev, min_value, max_value
      FROM kb_feature_models
      WHERE rule_id = ${topDxId}
        AND active = true
      LIMIT 30
    `));
    features = rows;
  } catch { return []; }

  const suggestions: CounterfactualSuggestion[] = [];
  const answers = { ...(input.answers ?? {}) };
  const symptoms = [...(input.symptoms ?? [])];

  for (const f of features) {
    const fkey = f.feature_key as string;
    const ftype = f.feature_type as string;
    const currentVal = answers[fkey] ?? (symptoms.includes(fkey) ? true : undefined);

    try {
      if (ftype === "boolean") {
        const flipped = !currentVal;
        const newInput: AdvancedDiagnosisInput = {
          symptoms: flipped ? [...symptoms, fkey] : symptoms.filter(s => s !== fkey),
          answers: { ...answers, [fkey]: flipped },
          complaintId: input.complaintId,
        };
        const newRes = await runAdvancedDiagnosis(newInput);
        const newTop = newRes.results[0];
        if (!newTop) continue;

        const posteriorShift = Math.abs((newTop.posterior ?? 0) - top.posterior);

        if (newTop.diagnosisLabel !== topDxLabel) {
          suggestions.push({
            feature: fkey,
            featureType: ftype,
            currentValue: currentVal ?? false,
            proposedChange: flipped,
            currentTopDx: topDxLabel,
            newTopDx: newTop.diagnosisLabel,
            impact: "diagnosis_flip",
            posteriorShift,
          });
        }
      } else if (ftype === "numeric" && typeof currentVal === "number") {
        const delta = Number(f.std_dev ?? 10);
        const newInput: AdvancedDiagnosisInput = {
          symptoms,
          answers: { ...answers, [fkey]: currentVal + delta },
          complaintId: input.complaintId,
        };
        const newRes = await runAdvancedDiagnosis(newInput);
        const newTop = newRes.results[0];
        if (!newTop) continue;

        const posteriorShift = Math.abs((newTop.posterior ?? 0) - top.posterior);
        if (newTop.diagnosisLabel !== topDxLabel) {
          suggestions.push({
            feature: fkey,
            featureType: ftype,
            currentValue: currentVal,
            proposedChange: `+${delta}`,
            currentTopDx: topDxLabel,
            newTopDx: newTop.diagnosisLabel,
            impact: "diagnosis_flip",
            posteriorShift,
          });
        }
      }
    } catch { continue; }

    if (suggestions.length >= 5) break;
  }

  return suggestions.sort((a, b) => b.posteriorShift - a.posteriorShift).slice(0, 5);
}

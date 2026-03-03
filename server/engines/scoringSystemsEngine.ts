import type { CaseState } from "../../shared/agentTypes";
import { evaluateExpr } from "../services/exprEval";
import { getTable } from "../data/registry";

export type ScoringSystemResult = {
  scoreId: string;
  name: string;
  total: number;
  category?: string;
  criteriaFired: { criterionId: string; points: number }[];
  templateId?: string;
};

interface ScoringRow {
  Score_ID: string;
  Name: string;
  Applies_To_Complaint: string;
  Criterion_ID: string;
  Logic: string;
  Points: string | number;
  Threshold_JSON?: string;
  Output_Template_ID?: string;
}

function normalizeLogicToExpr(logic: string, state: CaseState): boolean {
  const trimmed = logic.trim();
  const eqMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
  if (eqMatch) {
    const [, key, val] = eqMatch;
    const answer = (state.answers as Record<string, any>)?.[key!];
    if (val === "true") return answer === true || answer === "yes" || answer === "true";
    if (val === "false") return answer === false || answer === "no" || answer === "false";
    return String(answer) === val;
  }
  return evaluateExpr(trimmed, state);
}

function resolveCategory(total: number, thresholdJson: string): string | undefined {
  try {
    const t = JSON.parse(thresholdJson);
    if ("pass_min" in t) {
      return total >= t.pass_min ? "pass" : "fail";
    }
    if ("pe_unlikely_max" in t && "pe_likely_min" in t) {
      if (total <= t.pe_unlikely_max) return "pe_unlikely";
      if (total >= t.pe_likely_min) return "pe_likely";
      return "intermediate";
    }
    if ("low_max" in t && "high_min" in t) {
      if (total <= t.low_max) return "low";
      if (total >= t.high_min) return "high";
      if ("mid_max" in t && total <= t.mid_max) return "moderate";
      return "moderate";
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function computeScoringSystems(
  complaintSlug: string,
  state: CaseState,
): Promise<ScoringSystemResult[]> {
  const allRows = await getTable("SCORING_SYSTEMS") as unknown as ScoringRow[];
  const rows = allRows.filter(
    (r) => {
      const applies = String(r.Applies_To_Complaint ?? "").trim().toLowerCase();
      return applies === complaintSlug.toLowerCase() || applies === "*";
    }
  );

  if (rows.length === 0) return [];

  const grouped = new Map<string, ScoringRow[]>();
  for (const r of rows) {
    const id = String(r.Score_ID ?? "").trim();
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(r);
  }

  const results: ScoringSystemResult[] = [];

  for (const [scoreId, criteria] of grouped) {
    const criteriaFired: { criterionId: string; points: number }[] = [];
    let total = 0;
    let thresholdJson: string | undefined;
    let templateId: string | undefined;
    let name = "";

    for (const c of criteria) {
      name = String(c.Name ?? "");
      if (c.Threshold_JSON && String(c.Threshold_JSON).trim()) {
        thresholdJson = String(c.Threshold_JSON).trim();
      }
      if (c.Output_Template_ID && String(c.Output_Template_ID).trim()) {
        templateId = String(c.Output_Template_ID).trim();
      }

      const logic = String(c.Logic ?? "").trim();
      if (!logic) continue;

      const points = Number(c.Points ?? 0);
      const fired = normalizeLogicToExpr(logic, state);
      if (fired) {
        total += points;
        criteriaFired.push({
          criterionId: String(c.Criterion_ID ?? ""),
          points,
        });
      }
    }

    const category = thresholdJson ? resolveCategory(total, thresholdJson) : undefined;

    results.push({
      scoreId,
      name,
      total,
      category,
      criteriaFired,
      templateId,
    });
  }

  return results;
}

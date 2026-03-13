import * as fs from "fs/promises";
import * as path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export type RuleSuggestion = {
  complaint: string;
  failureType: string;
  suggestedCondition: string;
  suggestedEffect: string;
  confidence: number;
  supportingFailures: number;
  exampleCaseIds: string[];
  generatedAt: string;
};

export async function generateFailureDrivenRuleSuggestions(): Promise<RuleSuggestion[]> {
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");
  const skillRuns = await loadNdjson("skill_run_log.ndjson");

  const byComplaintFailure: Record<
    string,
    {
      complaint: string;
      failureType: string;
      caseIds: string[];
      predictedDispositions: string[];
      actualDispositions: string[];
      safetyMisses: number;
    }
  > = {};

  for (const rec of reconciliations) {
    if (rec.top_prediction_match && rec.disposition_match && !rec.safety_miss_flag) continue;

    const complaint =
      rec.predictedComplaint ?? rec.complaintId ?? rec.complaint_id ?? "unknown";
    const caseId = rec.case_id ?? rec.caseId ?? "";

    const failureType = rec.safety_miss_flag
      ? "safety_miss"
      : !rec.top_prediction_match
      ? "diagnosis_mismatch"
      : "disposition_mismatch";

    const key = `${complaint}::${failureType}`;
    if (!byComplaintFailure[key]) {
      byComplaintFailure[key] = {
        complaint,
        failureType,
        caseIds: [],
        predictedDispositions: [],
        actualDispositions: [],
        safetyMisses: 0,
      };
    }

    byComplaintFailure[key].caseIds.push(caseId);
    if (rec.predictedDisposition)
      byComplaintFailure[key].predictedDispositions.push(rec.predictedDisposition);
    if (rec.actualDisposition)
      byComplaintFailure[key].actualDispositions.push(rec.actualDisposition);
    if (rec.safety_miss_flag) byComplaintFailure[key].safetyMisses += 1;
  }

  const suggestions: RuleSuggestion[] = [];

  for (const [, group] of Object.entries(byComplaintFailure)) {
    if (group.caseIds.length < 1) continue;

    const mostCommonActual =
      group.actualDispositions.length > 0
        ? group.actualDispositions
            .sort(
              (a, b) =>
                group.actualDispositions.filter((x) => x === b).length -
                group.actualDispositions.filter((x) => x === a).length
            )
            .slice(-1)[0]
        : "";

    let suggestedCondition = "";
    let suggestedEffect = "";

    if (group.failureType === "safety_miss") {
      suggestedCondition = `IF red_flag_detected=yes AND complaint=${group.complaint}`;
      suggestedEffect = `THEN disposition = er_now (safety override)`;
    } else if (group.failureType === "disposition_mismatch" && mostCommonActual) {
      suggestedCondition = `IF complaint=${group.complaint} AND current_disposition != ${mostCommonActual}`;
      suggestedEffect = `THEN reconsider disposition → ${mostCommonActual}`;
    } else {
      suggestedCondition = `IF complaint=${group.complaint} AND diagnosis_confidence < 0.6`;
      suggestedEffect = `THEN boost differential scoring for top cluster`;
    }

    const confidence = Math.min(
      0.95,
      0.5 + group.caseIds.length * 0.05 + group.safetyMisses * 0.1
    );

    suggestions.push({
      complaint: group.complaint,
      failureType: group.failureType,
      suggestedCondition,
      suggestedEffect,
      confidence: Math.round(confidence * 100) / 100,
      supportingFailures: group.caseIds.length,
      exampleCaseIds: group.caseIds.slice(0, 3),
      generatedAt: new Date().toISOString(),
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

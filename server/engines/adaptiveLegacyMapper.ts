import { analyzeWorkbook, TabAnalysis } from "./workbookIntelligenceEngine";

export interface AdaptiveMappingResult {
  symptomRows: { id: string; title: string }[];
  questionRows: { id: string; prompt: string }[];
  modifierRows: { id: string; text: string }[];
  algorithmRows: { id: string; text: string }[];
  mappingReport: TabAnalysis[];
}

export function adaptiveMapWorkbook(
  workbook: Record<string, string[][]>
): AdaptiveMappingResult {
  const analysis = analyzeWorkbook(workbook);

  const result: AdaptiveMappingResult = {
    symptomRows: [],
    questionRows: [],
    modifierRows: [],
    algorithmRows: [],
    mappingReport: analysis,
  };

  for (const tab of analysis) {
    const rows = workbook[tab.tabName];
    if (!rows || rows.length < 2) continue;

    const getColIndex = (guess: string) =>
      tab.columnMappings.findIndex((c) => c.guess === guess);

    const complaintIdx = getColIndex("complaint");
    const questionIdx = getColIndex("question");
    const ruleIdx = getColIndex("rule");
    const modifierIdx = getColIndex("modifier");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (tab.detectedType === "symptom" && complaintIdx >= 0 && row[complaintIdx]) {
        result.symptomRows.push({
          id: `auto_${row[complaintIdx].replace(/\s+/g, "_").toLowerCase()}`,
          title: row[complaintIdx],
        });
      }

      if (tab.detectedType === "question" && questionIdx >= 0 && row[questionIdx]) {
        result.questionRows.push({
          id: `auto_q_${i}`,
          prompt: row[questionIdx],
        });
      }

      if (tab.detectedType === "modifier" && modifierIdx >= 0 && row[modifierIdx]) {
        result.modifierRows.push({
          id: `auto_mod_${i}`,
          text: row[modifierIdx],
        });
      }

      if (tab.detectedType === "algorithm" && ruleIdx >= 0 && row[ruleIdx]) {
        result.algorithmRows.push({
          id: `auto_alg_${i}`,
          text: row[ruleIdx],
        });
      }
    }
  }

  return result;
}

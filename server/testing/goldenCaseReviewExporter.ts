import * as fs from "fs/promises";
import * as path from "path";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { compareGoldenCase } from "./goldenCaseComparator";
import { tagFailures } from "./goldenCaseFailureTagger";
import { SkillContext } from "../skills/shared/skillTypes";

type GoldenCase = {
  id: string;
  input: {
    rawText: string;
    modifiers?: Record<string, any>;
  };
  expected: Record<string, any>;
};

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toPipeList(value: any[]): string {
  return Array.isArray(value) ? value.map(String).join("|") : "";
}

function extractActualResult(state: any) {
  return {
    complaint_id:
      state.skillResults?.identify_chief_complaint?.result?.complaint_id ?? "",
    disposition:
      state.skillResults?.determine_disposition?.result?.disposition ?? "",
    clinical_score_name:
      state.skillResults?.apply_clinical_score?.result?.score_name ?? "",
    clinical_score_value:
      state.skillResults?.apply_clinical_score?.result?.score_value ?? "",
    red_flag_hits:
      (state.skillResults?.detect_red_flags?.result?.red_flag_hits ?? []).map(
        (r: any) => r.label ?? r.id ?? String(r)
      ),
    top_differential:
      (state.skillResults?.generate_differential?.result?.differential_list ?? [])
        .slice(0, 3)
        .map((d: any) => d.diagnosis ?? String(d)),
    affirmed_symptoms:
      state.skillResults?.normalize_patient_story?.result?.associated_symptoms ?? [],
    negated_symptoms:
      state.skillResults?.normalize_patient_story?.result?.negated_symptoms ?? [],
  };
}

async function loadGoldenCases(fileName: string): Promise<GoldenCase[]> {
  const fullPath = path.resolve(process.cwd(), "server/testing", fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw) as GoldenCase[];
}

export async function exportGoldenCaseReviewWorksheet(
  inputFile = "goldenCases.sample.json",
  outputFile = "goldenCaseReview.csv"
) {
  const cases = await loadGoldenCases(inputFile);
  const orchestrator = new ClinicalSkillOrchestrator();

  const headers = [
    "id",
    "raw_text",
    "expected_complaint_id",
    "actual_complaint_id",
    "expected_disposition",
    "actual_disposition",
    "expected_clinical_score_name",
    "actual_clinical_score_name",
    "actual_clinical_score_value",
    "expected_red_flags",
    "actual_red_flags",
    "expected_top_differential",
    "actual_top_differential",
    "expected_affirmed_symptoms",
    "actual_affirmed_symptoms",
    "expected_negated_symptoms",
    "actual_negated_symptoms",
    "pass_fail",
    "failure_tags",
    "failure_details",
    "review_status",
    "reviewer",
    "review_notes",
  ];

  const rows: string[] = [headers.join(",")];

  for (const testCase of cases) {
    const context: SkillContext = {
      caseId: `REVIEW_${testCase.id}`,
      rawText: testCase.input.rawText,
      modifiers: testCase.input.modifiers ?? {},
      knownFacts: {},
      priorSkillOutputs: {},
      config: {
        strictMode: true,
        enableAudit: true,
      },
    };

    const state = await orchestrator.run(context);
    const actual = extractActualResult(state);
    const comparison = compareGoldenCase({
      actual,
      expected: testCase.expected,
    });
    const failureTags = tagFailures(comparison.failures);

    const row = [
      testCase.id,
      testCase.input.rawText,
      testCase.expected.complaint_id ?? "",
      actual.complaint_id,
      testCase.expected.disposition ?? "",
      actual.disposition,
      testCase.expected.clinical_score_name ?? "",
      actual.clinical_score_name,
      actual.clinical_score_value,
      toPipeList(testCase.expected.red_flag_hits_contains ?? []),
      toPipeList(actual.red_flag_hits ?? []),
      toPipeList(testCase.expected.top_differential_contains ?? []),
      toPipeList(actual.top_differential ?? []),
      toPipeList(testCase.expected.affirmed_symptoms_contains ?? []),
      toPipeList(actual.affirmed_symptoms ?? []),
      toPipeList(testCase.expected.negated_symptoms_contains ?? []),
      toPipeList(actual.negated_symptoms ?? []),
      comparison.passed ? "PASS" : "FAIL",
      toPipeList(failureTags),
      toPipeList(comparison.failures),
      "pending",
      "",
      "",
    ].map(csvEscape);

    rows.push(row.join(","));
  }

  const outPath = path.resolve(process.cwd(), "server/testing", outputFile);
  await fs.writeFile(outPath, rows.join("\n"), "utf8");

  console.log(`Exported golden case review worksheet -> ${outputFile}`);
  return { outputFile, count: cases.length };
}

const isMainModule = typeof process !== "undefined" && process.argv[1]?.includes("goldenCaseReviewExporter");
if (isMainModule) {
  exportGoldenCaseReviewWorksheet().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

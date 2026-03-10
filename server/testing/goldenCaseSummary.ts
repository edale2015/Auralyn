import * as fs from "fs/promises";
import * as path from "path";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { compareGoldenCase } from "./goldenCaseComparator";
import { SkillContext } from "../skills/shared/skillTypes";

type GoldenCase = {
  id: string;
  input: {
    rawText: string;
    modifiers?: Record<string, any>;
  };
  expected: Record<string, any>;
};

function extractActualResult(state: any) {
  return {
    complaint_id:
      state.skillResults?.identify_chief_complaint?.result?.complaint_id ?? "",
    disposition:
      state.skillResults?.determine_disposition?.result?.disposition ?? "",
    clinical_score_name:
      state.skillResults?.apply_clinical_score?.result?.score_name ?? "",
    clinical_score_value:
      state.skillResults?.apply_clinical_score?.result?.score_value ?? null,
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

type ComplaintStats = {
  total: number;
  passed: number;
  failed: number;
};

export async function runGoldenCaseSummary(fileName = "goldenCases.sample.json") {
  const cases = await loadGoldenCases(fileName);
  const orchestrator = new ClinicalSkillOrchestrator();

  const complaintStats = new Map<string, ComplaintStats>();
  const dispositionCounts = new Map<string, number>();
  const scoreCounts = new Map<string, number>();
  const failureCounts = new Map<string, number>();

  let passed = 0;
  let failed = 0;

  for (const testCase of cases) {
    const context: SkillContext = {
      caseId: `SUMMARY_${testCase.id}`,
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

    const complaintId = actual.complaint_id || "unknown";
    const disposition = actual.disposition || "unknown";
    const scoreName = actual.clinical_score_name || "none";

    complaintStats.set(complaintId, complaintStats.get(complaintId) ?? {
      total: 0,
      passed: 0,
      failed: 0,
    });
    const c = complaintStats.get(complaintId)!;
    c.total += 1;

    dispositionCounts.set(disposition, (dispositionCounts.get(disposition) ?? 0) + 1);
    scoreCounts.set(scoreName, (scoreCounts.get(scoreName) ?? 0) + 1);

    const comparison = compareGoldenCase({
      actual,
      expected: testCase.expected,
    });

    if (comparison.passed) {
      passed += 1;
      c.passed += 1;
    } else {
      failed += 1;
      c.failed += 1;

      for (const failure of comparison.failures) {
        const shortKey = failure.split(" expected ")[0];
        failureCounts.set(shortKey, (failureCounts.get(shortKey) ?? 0) + 1);
      }
    }
  }

  console.log("\n=== GOLDEN CASE SUMMARY ===");
  console.log(`Total: ${cases.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  console.log("\nBy complaint:");
  for (const [complaint, stats] of [...complaintStats.entries()].sort()) {
    console.log(
      `- ${complaint}: total=${stats.total}, passed=${stats.passed}, failed=${stats.failed}`
    );
  }

  console.log("\nDisposition distribution:");
  for (const [disp, count] of [...dispositionCounts.entries()].sort()) {
    console.log(`- ${disp}: ${count}`);
  }

  console.log("\nClinical score usage:");
  for (const [score, count] of [...scoreCounts.entries()].sort()) {
    console.log(`- ${score}: ${count}`);
  }

  console.log("\nFailure categories:");
  if (failureCounts.size === 0) {
    console.log("- none");
  } else {
    for (const [failure, count] of [...failureCounts.entries()].sort()) {
      console.log(`- ${failure}: ${count}`);
    }
  }

  return {
    total: cases.length,
    passed,
    failed,
    complaintStats: Object.fromEntries(complaintStats),
    dispositionCounts: Object.fromEntries(dispositionCounts),
    scoreCounts: Object.fromEntries(scoreCounts),
    failureCounts: Object.fromEntries(failureCounts),
  };
}

const isMainModule = typeof process !== "undefined" && process.argv[1]?.includes("goldenCaseSummary");
if (isMainModule) {
  runGoldenCaseSummary().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

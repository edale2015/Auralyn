import * as fs from "fs/promises";
import * as path from "path";
import { ClinicalSkillOrchestrator } from "../orchestrator/clinicalSkillOrchestrator";
import { SkillContext } from "../skills/shared/skillTypes";

type GoldenCase = {
  id: string;
  input: {
    rawText: string;
    modifiers?: Record<string, any>;
  };
  expected?: Record<string, any>;
};

function extractComparable(state: any) {
  return {
    complaint_id:
      state.skillResults?.identify_chief_complaint?.result?.complaint_id ?? "",
    disposition:
      state.skillResults?.determine_disposition?.result?.disposition ?? "",
    clinical_score_name:
      state.skillResults?.apply_clinical_score?.result?.score_name ?? "",
    clinical_score_value:
      state.skillResults?.apply_clinical_score?.result?.score_value ?? null,
    red_flag_hits: (
      state.skillResults?.detect_red_flags?.result?.red_flag_hits ?? []
    ).map((r: any) => r.label ?? r.id ?? String(r)),
    top_differential: (
      state.skillResults?.generate_differential?.result?.differential_list ?? []
    )
      .slice(0, 3)
      .map((d: any) => d.diagnosis ?? String(d)),
    completed_skills: state.completedSkills ?? [],
    finalDisposition: state.finalDisposition ?? "",
    totalEstimatedCostUsd: Object.values(state.skillResults ?? {}).reduce(
      (sum: number, r: any) => sum + Number(r?.audit?.estimatedCostUsd ?? 0),
      0
    ),
    totalLatencyMs: Object.values(state.skillResults ?? {}).reduce(
      (sum: number, r: any) => sum + Number(r?.audit?.latencyMs ?? 0),
      0
    ),
  };
}

function diffObjects(a: any, b: any) {
  const diffs: Array<{ field: string; sequential: any; graph: any }> = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of keys) {
    if (key === "totalLatencyMs") continue;
    const av = JSON.stringify(a[key]);
    const bv = JSON.stringify(b[key]);
    if (av !== bv) {
      diffs.push({ field: key, sequential: a[key], graph: b[key] });
    }
  }

  return diffs;
}

async function loadGoldenCases(fileName: string): Promise<GoldenCase[]> {
  const fullPath = path.resolve(process.cwd(), "server/testing", fileName);
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw) as GoldenCase[];
}

export async function runGraphComparison(fileName = "goldenCases.sample.json") {
  const cases = await loadGoldenCases(fileName);
  const orchestrator = new ClinicalSkillOrchestrator();
  const results: any[] = [];

  for (const testCase of cases) {
    const baseContext: SkillContext = {
      caseId: `COMPARE_${testCase.id}`,
      rawText: testCase.input.rawText,
      modifiers: testCase.input.modifiers ?? {},
      knownFacts: {},
      priorSkillOutputs: {},
      config: { strictMode: true, enableAudit: true },
    };

    const sequentialState = await orchestrator.run({
      ...baseContext,
      config: { ...baseContext.config, orchestrationMode: "sequential" },
    });

    const graphState = await orchestrator.run({
      ...baseContext,
      config: { ...baseContext.config, orchestrationMode: "graph" },
    });

    const sequential = extractComparable(sequentialState);
    const graph = extractComparable(graphState);
    const diffs = diffObjects(sequential, graph);

    results.push({ id: testCase.id, same: diffs.length === 0, diffs, sequential, graph });
  }

  const outPath = path.resolve(
    process.cwd(),
    "server/testing",
    "graphComparisonResults.json"
  );
  await fs.writeFile(outPath, JSON.stringify(results, null, 2), "utf8");

  const sameCount = results.filter((r) => r.same).length;
  const diffCount = results.length - sameCount;

  console.log(`Graph comparison complete: ${sameCount} matched, ${diffCount} differed.`);
  console.log(`Saved -> server/testing/graphComparisonResults.json`);

  return { total: results.length, same: sameCount, different: diffCount, results };
}

import * as fs from "fs/promises";
import * as path from "path";

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");
const TEST_DIR = path.resolve(process.cwd(), "server/testing");

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

async function loadGeneratedGoldenCases(): Promise<any[]> {
  try {
    const raw = await fs.readFile(
      path.join(TEST_DIR, "goldenCases.generated.json"),
      "utf8"
    );
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateGoldenCasesFromReconciliations(): Promise<{
  generated: number;
  total: number;
  cases: any[];
}> {
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");
  const skillRuns = await loadNdjson("skill_run_log.ndjson");
  const existing = await loadGeneratedGoldenCases();

  const existingIds = new Set(existing.map((e: any) => e.id));
  const newCases: any[] = [];

  for (const rec of reconciliations) {
    if (
      rec.top_prediction_match &&
      rec.disposition_match &&
      !rec.safety_miss_flag
    )
      continue;

    const caseId = rec.case_id ?? rec.caseId;
    if (!caseId) continue;

    const goldenId = `AUTO_${caseId}`;
    if (existingIds.has(goldenId)) continue;

    const intakeRun = skillRuns.find(
      (r) =>
        r.caseId === caseId && r.skillName === "identify_chief_complaint"
    );

    let rawText = rec.rawText ?? rec.patientInput ?? "";

    if (!rawText && intakeRun) {
      try {
        const input = JSON.parse(intakeRun.inputSummary ?? "{}");
        rawText = input.rawText ?? "";
      } catch {
        rawText = "";
      }
    }

    if (!rawText) continue;

    const goldenCase = {
      id: goldenId,
      source: "reconciliation_failure",
      originalCaseId: caseId,
      input: { rawText },
      expected: {
        complaint_id: rec.predictedComplaint ?? rec.complaint_id ?? "",
        disposition: rec.actualDisposition ?? rec.disposition ?? "",
        top_differential_contains: rec.actualFinalDiagnosis
          ? [rec.actualFinalDiagnosis]
          : [],
      },
      failure: {
        predicted: {
          diagnosis: rec.predictedTop ?? "",
          disposition: rec.predictedDisposition ?? "",
        },
        actual: {
          diagnosis: rec.actualFinalDiagnosis ?? "",
          disposition: rec.actualDisposition ?? "",
        },
        safetyMiss: rec.safety_miss_flag ?? false,
      },
      generatedAt: new Date().toISOString(),
    };

    newCases.push(goldenCase);
    existingIds.add(goldenId);
  }

  const merged = [...existing, ...newCases];

  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(
    path.join(TEST_DIR, "goldenCases.generated.json"),
    JSON.stringify(merged, null, 2),
    "utf8"
  );

  return { generated: newCases.length, total: merged.length, cases: newCases };
}

export async function listGeneratedGoldenCases(): Promise<any[]> {
  return loadGeneratedGoldenCases();
}

import fs from "fs";
import path from "path";
import archiver from "archiver";
import type { FDAReport } from "./reportGenerator";
import type { StratifiedAnalysis } from "./stratifiedAnalysis";

export interface SubmissionBundleResult {
  bundlePath: string;
  files: string[];
  sizeBytes: number | null;
  createdAt: string;
  complianceStandards: string[];
}

function ensureFile(filePath: string, fallback: object): string {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
  return filePath;
}

export async function createSubmissionBundle(
  report: FDAReport,
  stratified?: StratifiedAnalysis
): Promise<SubmissionBundleResult> {
  const createdAt = new Date().toISOString();
  const cwd = process.cwd();

  const reportPath = path.join(cwd, "fda_report.json");
  const manifestPath = path.join(cwd, "fda_manifest.json");
  const bundlePath = path.join(cwd, "fda_submission.zip");

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const manifest = {
    bundleType: "FDA SaMD Validation Submission",
    generatedAt: createdAt,
    systemName: "Auralyn Clinical AI (ENT Flu Slice)",
    systemVersion: "1.0.0",
    engineCount: 100,
    complianceStandards: ["FDA 21 CFR Part 11", "ISO 13485", "IEC 62304"],
    validationSummary: {
      totalCases: report.totalCases,
      accuracy: report.metrics.accuracy,
      f1Score: report.metrics.f1Score,
      passesThreshold: report.metrics.passesThreshold,
      recommendation: report.recommendation,
    },
    stratifiedGroups: stratified ? Object.keys(stratified).filter((k) => k !== "summary") : [],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const complianceStandards = manifest.complianceStandards;
  const files: string[] = ["fda_report.json", "fda_manifest.json"];

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(bundlePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    archive.file(reportPath, { name: "report.json" });
    archive.file(manifestPath, { name: "manifest.json" });

    archive.append(
      JSON.stringify({ compliance: complianceStandards, generatedAt: createdAt }, null, 2),
      { name: "compliance.json" }
    );

    if (stratified) {
      archive.append(JSON.stringify(stratified, null, 2), { name: "stratified_analysis.json" });
      files.push("stratified_analysis.json");
    }

    files.push("compliance.json");
    archive.finalize();
  });

  let sizeBytes: number | null = null;
  try {
    sizeBytes = fs.statSync(bundlePath).size;
  } catch {}

  return { bundlePath, files, sizeBytes, createdAt, complianceStandards };
}

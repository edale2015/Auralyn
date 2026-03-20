import fs from "fs";
import path from "path";
import type { FDAReport } from "./reportGenerator";

export interface ExportBundle {
  report: FDAReport;
  exportedAt: string;
  files: string[];
  bundlePath: string | null;
}

export function exportFDABundle(report: FDAReport): ExportBundle {
  const exportedAt = new Date().toISOString();
  const files: string[] = [];
  let bundlePath: string | null = null;

  try {
    const reportPath = path.join(process.cwd(), "fda_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    files.push("fda_report.json");

    const manifest = {
      bundleType: "FDA SaMD Validation Bundle",
      createdAt: exportedAt,
      files,
      systemVersion: "1.0.0",
      engineCount: 7,
      complianceStandards: ["FDA 21 CFR Part 11", "ISO 13485", "IEC 62304"],
    };
    const manifestPath = path.join(process.cwd(), "fda_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    files.push("fda_manifest.json");
    bundlePath = process.cwd();
  } catch {
  }

  return { report, exportedAt, files, bundlePath };
}

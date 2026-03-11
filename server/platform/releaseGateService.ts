import * as fs from "fs/promises";
import * as path from "path";
import { getPlatformConfig } from "./platformConfig";
import { ReleaseGateResult } from "./platformTypes";

const TEST_DIR = path.resolve(process.cwd(), "server/testing");
const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime");

async function loadJson(filePath: string): Promise<any> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadNdjson(fileName: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(path.join(RUNTIME_DIR, fileName), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export async function evaluateReleaseGate(
  complaint: string,
  siteId = "default"
): Promise<ReleaseGateResult> {
  const cfg = getPlatformConfig(siteId);

  const graphComparison = await loadJson(
    path.join(TEST_DIR, "graphComparisonResults.json")
  );
  const reconciliations = await loadNdjson("case_reconciliation.ndjson");

  const relevantGraphRows = Array.isArray(graphComparison)
    ? graphComparison.filter((r: any) =>
        JSON.stringify(r).toLowerCase().includes(complaint.toLowerCase())
      )
    : [];

  const graphAgreement =
    relevantGraphRows.length === 0
      ? 1
      : relevantGraphRows.filter((r: any) => r.same).length /
        relevantGraphRows.length;

  const safetyMisses = reconciliations.filter((r: any) => {
    const complaintGuess = String(
      r.case_id ?? r.caseId ?? ""
    ).toLowerCase();
    return (
      complaintGuess.includes(complaint.toLowerCase()) && r.safety_miss_flag
    );
  }).length;

  const checks = [
    {
      check: "complaint_enabled",
      passed: cfg.enabledComplaints.includes(complaint),
      value: cfg.enabledComplaints.includes(complaint) as boolean,
    },
    {
      check: "graph_agreement_rate",
      passed: graphAgreement >= cfg.requireGoldenPassRate,
      value: Number(graphAgreement.toFixed(3)),
    },
    {
      check: "no_safety_miss_flags",
      passed: safetyMisses === 0,
      value: safetyMisses,
    },
    {
      check: "require_reasoning_summary",
      passed: cfg.requireReasoningSummary,
      value: cfg.requireReasoningSummary,
    },
  ];

  const passed = checks.every((c) => c.passed);
  const score = checks.filter((c) => c.passed).length / checks.length;

  return { complaint, siteId, passed, score, checks };
}

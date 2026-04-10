import fs from "fs";
import path from "path";

export interface SystemMetrics {
  patients:           number;
  erRate:             number;
  safetyMismatchRate: number;
  p50Latency:         number;
  p95Latency:         number;
  accuracy:           number;
  automationFailRate: number;
  goldenCasesTotal:   number;
  uptime:             number;
}

export interface ExecBrief {
  headline:    string;
  traction:    string;
  safety:      string;
  performance: string;
  moat:        string;
  generatedAt: string;
}

export interface FdaPack {
  device:          string;
  intendedUse:     string;
  version:         string;
  generatedAt:     string;
  validation:      { goldenCases: number; accuracy: number; safetyMismatches: number };
  riskControls:    string[];
  auditability:    string[];
  regulatoryClass: string;
}

export function generateExecBrief(metrics: SystemMetrics): ExecBrief {
  return {
    headline:    "Auralyn — AI-Governed Clinical Operating System",
    traction:    `Patients/day: ${metrics.patients.toLocaleString()} | ER rate: ${(metrics.erRate * 100).toFixed(1)}%`,
    safety:      `Safety mismatch rate: ${(metrics.safetyMismatchRate * 100).toFixed(2)}% | P95 latency: ${metrics.p95Latency}ms`,
    performance: `Accuracy: ${(metrics.accuracy * 100).toFixed(1)}% | P50: ${metrics.p50Latency}ms | Uptime: ${(metrics.uptime * 100).toFixed(2)}%`,
    moat:        "66-layer KB + Golden cases + RLHF-gated + Multi-agent reasoning + Federated architecture",
    generatedAt: new Date().toISOString(),
  };
}

export function buildFdaPack(metrics: SystemMetrics, goldenCaseTests: unknown[]): FdaPack {
  return {
    device:       "Clinical Decision Support System (CDSS)",
    intendedUse:  "AI-augmented triage support with mandatory physician oversight; not intended to replace physician judgment",
    version:      "1.0.0",
    generatedAt:  new Date().toISOString(),
    validation: {
      goldenCases:      goldenCaseTests.length,
      accuracy:         metrics.accuracy,
      safetyMismatches: metrics.safetyMismatchRate,
    },
    riskControls: [
      "Hard safety gate — ER_NOW escalation always synchronous and blocking",
      "RLHF improvement proposals require physician approval before activation",
      "Immutable SHA-256-anchored audit log for every clinical decision",
      "Global safety kill switch at 2% mismatch rate",
      "PHI scrubbed from all logs and external telemetry",
    ],
    auditability: [
      "Every clinical decision captured with traceId, actor, action, and inputs",
      "Golden case regression runs on every deployment",
      "Oversight agent reviews all AI proposals before activation",
      "Full Prometheus metrics export for independent monitoring",
    ],
    regulatoryClass: "Class II — Software as Medical Device (SaMD) — Decision Support",
  };
}

export function exportFdaPack(pack: FdaPack, outDir = process.cwd()): string {
  const outPath = path.join(outDir, `fda_validation_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(pack, null, 2), "utf-8");
  return outPath;
}

export function buildPitchDeck(metrics: SystemMetrics): string {
  return `# Auralyn Clinical Brain

## Problem
Fragmented triage, missed risk, ER overload — costing lives and billions annually.

## Solution
A self-monitoring, self-improving, globally deployable clinical intelligence system.

## Traction
- Patients/day: ${metrics.patients.toLocaleString()}
- ER escalation rate: ${(metrics.erRate * 100).toFixed(1)}%
- Clinical accuracy: ${(metrics.accuracy * 100).toFixed(1)}%

## Safety Architecture
- Hard safety gate (ER_NOW) — always synchronous, never bypassed
- RLHF requires physician approval
- Immutable audit chain
- Global kill switch at 2% mismatch rate

## Moat
66-layer clinical KB + Golden cases + Multi-agent reasoning + Meta-learning + Federated architecture

## Go-To-Market
NYC urgent care → Telemed platforms → Regional health systems → Enterprise clinics

## Ask
Series A — Scale deployment, EHR partnerships, FDA clearance pathway
`;
}

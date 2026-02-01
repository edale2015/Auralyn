import * as fs from "fs";
import * as path from "path";

export type GateMetrics = {
  runs: number;
  fails: number;
  failRate: number;      // 0..1
  avgSeverity: number;
};

export type GateDecision = {
  result: "OK" | "REGRESSION";
  reasons: string[];
  before: GateMetrics;
  after: GateMetrics;
  thresholds: {
    maxFailIncrease: number;
    maxFailRateIncrease: number;    // absolute (e.g., 0.02 = +2%)
    maxAvgSeverityIncrease: number; // absolute
  };
};

function readFile(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function parseDigest(mdPath: string): GateMetrics {
  const txt = readFile(mdPath);

  // Expect lines like:
  // **Runs:** 123
  // **Fails:** 10  (**Fail rate:** 8.1%)
  // **Avg severity:** 0.42

  const runs = Number((txt.match(/\*\*Runs:\*\*\s+(\d+)/) || [])[1] || 0);
  const fails = Number((txt.match(/\*\*Fails:\*\*\s+(\d+)/) || [])[1] || 0);

  // Fail rate in percent in markdown
  const frPct = Number((txt.match(/\*\*Fail rate:\*\*\s+([0-9.]+)%/) || [])[1] || 0);
  const failRate = frPct / 100;

  const avgSeverity = Number((txt.match(/\*\*Avg severity:\*\*\s+([0-9.]+)/) || [])[1] || 0);

  if (!runs) {
    throw new Error(`Could not parse runs from digest: ${mdPath}`);
  }

  return { runs, fails, failRate, avgSeverity };
}

export function gateFromDigests(beforeMd: string, afterMd: string): GateDecision {
  const before = parseDigest(beforeMd);
  const after = parseDigest(afterMd);

  const thresholds = {
    maxFailIncrease: Number(process.env.GATE_MAX_FAIL_INCREASE || 1),
    maxFailRateIncrease: Number(process.env.GATE_MAX_FAILRATE_INCREASE || 0.02),
    maxAvgSeverityIncrease: Number(process.env.GATE_MAX_AVGSEV_INCREASE || 0.5),
  };

  const reasons: string[] = [];

  const failInc = after.fails - before.fails;
  const frInc = after.failRate - before.failRate;
  const sevInc = after.avgSeverity - before.avgSeverity;

  if (failInc > thresholds.maxFailIncrease) {
    reasons.push(`Fails increased by ${failInc} (threshold ${thresholds.maxFailIncrease})`);
  }
  if (frInc > thresholds.maxFailRateIncrease) {
    reasons.push(`Fail rate increased by ${(frInc * 100).toFixed(2)}% (threshold ${(thresholds.maxFailRateIncrease * 100).toFixed(2)}%)`);
  }
  if (sevInc > thresholds.maxAvgSeverityIncrease) {
    reasons.push(`Avg severity increased by ${sevInc.toFixed(2)} (threshold ${thresholds.maxAvgSeverityIncrease})`);
  }

  const result: "OK" | "REGRESSION" = reasons.length ? "REGRESSION" : "OK";

  return { result, reasons, before, after, thresholds };
}

export function writeGateArtifacts(outDir: string, decision: GateDecision) {
  const jsonPath = path.join(outDir, "staging_gate.json");
  fs.writeFileSync(jsonPath, JSON.stringify(decision, null, 2), "utf8");
  return { jsonPath };
}

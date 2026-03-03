import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

type StepResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
};

type GateReport = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  steps: StepResult[];
  summary: {
    harnessPass?: boolean;
    stress?: {
      n: number;
      dispCounts?: Record<string, number>;
      topHotspots?: Array<{ complaint: string; total: number; emerg: number; emergRate: number }>;
      outputFile?: string;
    };
    drift?: {
      ok: boolean;
      issues: Array<{ kind: string; detail: string }>;
    };
  };
  env: {
    rulesetVersion: string;
    dxPriorityVersion: string;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function tail(s: string, max = 2500) {
  if (!s) return "";
  return s.length <= max ? s : s.slice(-max);
}

function runStep(name: string, cmd: string, env?: Record<string, string>): StepResult {
  const start = Date.now();
  try {
    const stdout = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(env ?? {}) },
      timeout: 300_000,
    });
    const end = Date.now();
    return { name, ok: true, durationMs: end - start, stdoutTail: tail(stdout), stderrTail: "" };
  } catch (e: any) {
    const end = Date.now();
    const stdout = e?.stdout ? String(e.stdout) : "";
    const stderr = e?.stderr ? String(e.stderr) : "";
    return { name, ok: false, durationMs: end - start, stdoutTail: tail(stdout), stderrTail: tail(stderr) };
  }
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function tryReadJson(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const ART_DIR = "artifacts";
  ensureDir(ART_DIR);

  const report: GateReport = {
    startedAt: nowIso(),
    finishedAt: "",
    ok: false,
    steps: [],
    summary: { drift: { ok: true, issues: [] } },
    env: {
      rulesetVersion: process.env.RULESET_VERSION ?? "local",
      dxPriorityVersion: process.env.DX_PRIORITY_VERSION ?? "local",
    },
  };

  const CMD_CORRUPTION = process.env.GATE_CORRUPTION_CMD ?? "npx tsx scripts/corruption-check.ts";
  const CMD_HARNESS = process.env.GATE_HARNESS_CMD ?? "HARNESS_MODE=1 npx tsx scripts/run_harness.ts --all";
  const STRESS_N = Number(process.env.STRESS_N ?? "200");
  const CMD_STRESS = process.env.GATE_STRESS_CMD ?? `N=${STRESS_N} HARNESS_MODE=1 npx tsx scripts/simulate-stress.ts`;
  const CMD_DRIFT = process.env.GATE_DRIFT_CMD ?? "npx tsx scripts/drift-audit.ts";

  console.log("=== gate:prod starting ===\n");

  report.steps.push(runStep("corruption_guard", CMD_CORRUPTION));

  report.steps.push(runStep("harness", CMD_HARNESS));

  report.steps.push(runStep("stress_smoke", CMD_STRESS));

  report.steps.push(runStep("drift_audit", CMD_DRIFT));

  const allOk = report.steps.every((s) => s.ok);
  report.ok = allOk;
  report.finishedAt = nowIso();

  const stressJson = tryReadJson("stress_results.json");
  if (stressJson) {
    const dispCounts = stressJson.dispCounts ?? stressJson.dispositionDistribution ?? {};
    const hotspots = stressJson.hotspots ?? [];
    report.summary.stress = {
      n: stressJson.N ?? stressJson.n ?? STRESS_N,
      dispCounts,
      topHotspots: hotspots.length > 0
        ? hotspots.slice(0, 10).map((h: any) => ({
            complaint: h.complaint ?? h.slug ?? "",
            total: h.total ?? 0,
            emerg: h.emerg ?? h.er_send ?? 0,
            emergRate: h.emergRate ?? 0,
          }))
        : (() => {
            const byC = stressJson.byComplaint ?? {};
            const list = Object.keys(byC).map((complaint) => {
              const m = byC[complaint];
              const total = Object.values(m).reduce((a: number, b: any) => a + Number(b), 0);
              const emerg = Number(m["er_send"] ?? m["EMERG"] ?? 0);
              return { complaint, total, emerg, emergRate: total ? emerg / total : 0 };
            });
            list.sort((a, b) => b.emergRate - a.emergRate);
            return list.slice(0, 10);
          })(),
      outputFile: "stress_results.json",
    };
  }

  const driftJson = tryReadJson("artifacts/drift_report.json") ?? tryReadJson("drift_report.json");
  if (driftJson) {
    report.summary.drift = {
      ok: !!driftJson.ok,
      issues: Array.isArray(driftJson.issues) ? driftJson.issues : [],
    };
  }

  const outPath = path.join(ART_DIR, "gate_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\n=== gate:prod ${report.ok ? "PASS" : "FAIL"} ===`);
  for (const s of report.steps) {
    console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.name}  (${(s.durationMs / 1000).toFixed(1)}s)`);
    if (!s.ok && s.stderrTail) {
      console.log(`  stderr: ${s.stderrTail.slice(0, 200)}`);
    }
  }
  if (report.summary.stress?.dispCounts) {
    console.log("\nStress disposition counts:", report.summary.stress.dispCounts);
    if (report.summary.stress.topHotspots?.length) {
      console.log("Top ER_SEND-rate hotspots:", report.summary.stress.topHotspots.slice(0, 5));
    }
  }
  if (report.summary.drift?.issues?.length) {
    console.log("\nDrift issues:");
    for (const i of report.summary.drift.issues.slice(0, 20)) {
      console.log(`- ${i.kind}: ${i.detail}`);
    }
  }

  console.log(`\nWrote ${outPath}\n`);
  process.exit(report.ok ? 0 : 1);
}

main();

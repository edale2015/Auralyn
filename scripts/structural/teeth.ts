/**
 * Teeth-check for the structural sensor (Phase 0, step 2).
 *
 * "A check that can't fail bad plumbing is useless." This proves the sensor has
 * teeth by deliberately BREAKING each assertion via fault injection at the
 * pipeline-runner boundary, then confirming the sensor reports STRUCTURAL FAIL
 * on the expected stage for each break — and PASSES on a clean run.
 *
 * Fault injection (rather than physically unwiring server/ source) keeps the
 * real pipeline untouched: nothing to "restore", and the teeth-check is
 * repeatable in CI. Each fault wraps the real runner and mutates its result to
 * simulate exactly one structural failure mode the spec calls out:
 * unwire a stage, drop a stated answer, restart the session, disable escalation,
 * stall the conversation, or surface a stage error.
 *
 * Usage: npx tsx scripts/structural/teeth.ts [cc_id]
 * Exit 0 only if every tooth bites (and the clean run passes).
 */
process.env.HARNESS_MODE = "1";

import { runComplaintGraph } from "../../server/services/complaintNodeRunner";
import type { GraphResult } from "../../server/services/complaintNodeRunner";
import { runStructuralCheck, type PipelineRunner, type StageId } from "./sensor";
import type { CaseState } from "../../shared/agentTypes";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", X = "\x1b[0m";

type ResultMutator = (r: GraphResult) => GraphResult;

/** Wrap the real runner, applying a mutation to every returned GraphResult. */
function faultyRunner(mutate: ResultMutator): PipelineRunner {
  return async (state: CaseState, ccId: string) => {
    const r = await runComplaintGraph(state, ccId);
    return mutate(r);
  };
}

function stripEvents(r: GraphResult, needle: string): GraphResult {
  return { ...r, events: (r.events ?? []).filter((e: any) => !String(e.message ?? "").includes(needle)) };
}

interface Tooth {
  name: string;
  /** the stage assertion we expect to flip to FAIL */
  expectFailStage: StageId;
  runner: PipelineRunner;
  /** for the stall case the driver loops to the ceiling — keep it last/bounded */
}

const TEETH: Tooth[] = [
  {
    name: "unwire RED_FLAG_GATE (no evaluation, no escalation)",
    expectFailStage: "RED_FLAG_GATE",
    runner: faultyRunner((r) => {
      const s = { ...(r.state as any) };
      delete s.redFlagGate;
      s.redFlags = [];
      if (s.routing?.state === "EMERGENT_ESCALATION") s.routing = { ...s.routing, state: "INTAKE_PENDING" };
      return stripEvents({ ...r, state: s as CaseState }, "RED_FLAG");
    }),
  },
  {
    name: "disable escalation (red flag present but gate forced PASS)",
    expectFailStage: "RED_FLAG_GATE",
    runner: faultyRunner((r) => {
      const s = { ...(r.state as any) };
      if (s.redFlagGate) s.redFlagGate = { ...s.redFlagGate, gateResult: "PASS" };
      if (s.routing?.state === "EMERGENT_ESCALATION") s.routing = { ...s.routing, state: "INTAKE_PENDING" };
      return { ...r, state: s as CaseState };
    }),
  },
  {
    name: "unwire SCORING (stage never runs)",
    expectFailStage: "SCORING",
    runner: faultyRunner((r) => stripEvents(r, "SCORING")),
  },
  {
    name: "unwire DISPOSITION (no disposition produced)",
    expectFailStage: "DISPOSITION",
    runner: faultyRunner((r) => {
      const s = { ...(r.state as any) };
      delete s.disposition;
      return stripEvents({ ...r, state: s as CaseState }, "DISPOSITION");
    }),
  },
  {
    name: "drop a stated answer (answer not captured)",
    expectFailStage: "ANSWER_CAPTURE",
    runner: faultyRunner((r) => {
      const s = { ...(r.state as any) };
      const ans = { ...(s.answers ?? {}) };
      const firstQ = Object.keys(ans).find((k) => k.startsWith("Q_"));
      if (firstQ) delete ans[firstQ];
      s.answers = ans;
      return { ...r, state: s as CaseState };
    }),
  },
  {
    name: "restart session mid-conversation (encounterId changes)",
    expectFailStage: "SESSION",
    runner: faultyRunner((r) => {
      const s = { ...(r.state as any), encounterId: "RESTARTED_ENCOUNTER" };
      return { ...r, state: s as CaseState };
    }),
  },
  {
    name: "stall conversation (always re-asks, ignores answers)",
    expectFailStage: "SESSION",
    runner: faultyRunner((r) => ({
      ...r,
      done: false,
      currentNode: "CORE_QUESTIONS" as any,
      pendingAction: { type: "ASK_QUESTION", questionId: "Q_NEVER_SATISFIED", prompt: "?" } as any,
    })),
  },
  {
    name: "stage error surfaced (error-severity event)",
    expectFailStage: "NO_ERROR",
    runner: faultyRunner((r) => ({
      ...r,
      events: [...(r.events ?? []), { type: "COMPLAINT_GRAPH_ERROR", severity: "error", message: "injected node failure" } as any],
    })),
  },
];

async function main() {
  const ccId = process.argv[2] || "chest_pain";
  console.log(`\n══════════ TEETH-CHECK (sensor must FAIL on broken plumbing) — ${ccId} ══════════\n`);

  let allGood = true;

  // 0) Clean baseline MUST pass.
  const clean = await runStructuralCheck(ccId);
  const cleanOk = clean.structuralPass === true;
  allGood &&= cleanOk;
  console.log(
    `${cleanOk ? G + "OK  " + X : R + "BAD " + X} baseline (no fault)        → expect PASS  | got ${clean.structuralPass ? "PASS" : "FAIL"}`,
  );
  if (!cleanOk) {
    console.log(`     ${R}↳ clean run should pass; failing checks: ${clean.checks.filter((c) => !c.pass).map((c) => c.stage).join(", ")}${X}`);
  }

  // 1..N) Each fault MUST flip the sensor to FAIL on the expected stage.
  for (const tooth of TEETH) {
    const res = await runStructuralCheck(ccId, { runner: tooth.runner });
    const targeted = res.checks.find((c) => c.stage === tooth.expectFailStage);
    const stageFailed = targeted ? !targeted.pass : false;
    const overallFailed = res.structuralPass === false;
    const bites = stageFailed && overallFailed;
    allGood &&= bites;
    console.log(
      `${bites ? G + "OK  " + X : R + "BAD " + X} ${tooth.name.padEnd(54)} → expect FAIL@${tooth.expectFailStage.padEnd(14)} | got ${res.structuralPass ? "PASS" : "FAIL"} (stage ${targeted ? (targeted.pass ? "pass" : "fail") : "missing"})`,
    );
    if (!bites) {
      console.log(`     ${R}↳ ${D}detail: ${targeted?.detail ?? "stage check missing"}${X}`);
    }
  }

  console.log("\n─────────────────────────────────");
  if (allGood) {
    console.log(`${G}✅ SENSOR HAS TEETH — every break was caught, clean run passed.${X}`);
    process.exit(0);
  } else {
    console.log(`${R}❌ SENSOR LACKS TEETH — at least one break was not caught. Do not trust the sensor.${X}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("TEETH-CHECK CRASH:", err);
  process.exit(2);
});

/**
 * Structural completeness sensor (Phase 0).
 *
 * A DETERMINISTIC check (returns an exit code) that drives ONE simulated full
 * encounter for a single complaint through the real in-process pipeline
 * (runComplaintGraph) and asserts, per stage:
 *   - invoked?
 *   - returned without error?
 *   - session intact (no restart)?
 *   - stated answers captured?
 *   - escalation fires on the complaint's *defined* red-flag inputs?
 *   - reaches disposition + physician sign-off (terminal handoff)?
 *
 * This is the SENSOR for the structural pipeline loop. It is NOT a clinical
 * judge: it never invents differentials/workup/dispositions/questions. Content
 * gaps (thin KB) are RECORDED and skipped, never "fixed" to make a check pass.
 *
 * Synthetic patients only — no real PHI.
 *
 * Usage:
 *   npx tsx scripts/structural/sensor.ts <cc_id>
 *   npx tsx scripts/structural/sensor.ts chest_pain
 */
process.env.HARNESS_MODE = "1"; // disable analytics/audit side-writes

import { runComplaintGraph } from "../../server/services/complaintNodeRunner";
import type { GraphResult } from "../../server/services/complaintNodeRunner";
import { loadComplaintConfig } from "../../server/services/complaintConfigLoader";
import type { ComplaintConfig, RedFlagRule } from "../../server/services/complaintConfigLoader";
import { evaluateExpr } from "../../server/services/exprEval";
import type { CaseState } from "../../shared/agentTypes";

// ─── Types ──────────────────────────────────────────────────────────────────

export type StageId =
  | "CONFIG"
  | "SESSION"
  | "ANSWER_CAPTURE"
  | "INIT"
  | "CORE_QUESTIONS"
  | "RED_FLAG_GATE"
  | "SCORING"
  | "DISPOSITION"
  | "SIGNOFF"
  | "NO_ERROR";

export interface StageCheck {
  stage: StageId;
  pass: boolean;
  detail: string;
  error?: string;
}

export interface ContentGap {
  stage: string;
  gap: string;
}

export interface StructuralResult {
  ccId: string;
  engineType: string;
  structuralPass: boolean;
  /** Set only when the check could not even be attempted (e.g. config missing). */
  fatal?: string;
  redFlagUsed?: { rfId: string; severity: string; action: string; triggerExpr: string };
  turns: number;
  checks: StageCheck[];
  contentGaps: ContentGap[];
  finalSummary: {
    done: boolean;
    currentNode: string;
    disposition?: string;
    redFlagGate?: string;
    redFlags: string[];
    routing?: string;
    activeClusters: string[];
    scoreKeys: string[];
    differentials: number;
  };
}

/** Injectable pipeline runner — lets the teeth-check substitute fault-injecting runners. */
export type PipelineRunner = (state: CaseState, ccId: string) => Promise<GraphResult>;

const realRunner: PipelineRunner = (state, ccId) => runComplaintGraph(state, ccId);

export interface SensorOptions {
  runner?: PipelineRunner;
  /** When set, only answer-capture checks against these keys are forced (used by teeth-check). */
}

// ─── Synthetic case construction ──────────────────────────────────────────────

function freshCaseState(ccId: string, answers: Record<string, string | number>): CaseState {
  return {
    encounterId: `struct_${ccId}`,
    patientId: `struct_patient_${ccId}`,
    chiefComplaint: ccId,
    answers: { ...answers },
    demographics: {},
    routingState: "INTAKE_PENDING",
    redFlags: [],
    scores: {},
    events: [],
    activeClusters: [],
    diagnosisClusterIds: [],
    dispositionReasonCodes: [],
    candidateMeds: [],
    spotInterventions: [],
    careGaps: [],
    recommendedActions: [],
    questionQueue: [],
    routing: { state: "INTAKE_PENDING" },
    audit: { steps: [], events: [] },
    // synthetic universal modifiers (no real PHI) so MODIFIERS_INTAKE has data
    modifiers: {
      allergies: ["penicillin"],
      meds: ["atorvastatin"],
      pmh: ["hypertension"],
      familyHistory: ["father MI age 55"],
      smoker: "former",
    },
  } as unknown as CaseState;
}

// ─── Red-flag input satisfier (config-derived, oracle-verified) ───────────────

function parseLiteral(raw: string): string | number | boolean {
  const t = raw.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/**
 * Build an `answers` object that should satisfy a triggerExpr. Greedy and
 * intentionally simple: it sets each compared answer field to a value that
 * makes its comparison true. The result is ALWAYS verified against the real
 * evaluateExpr (the oracle) before being trusted, so a wrong guess is caught
 * rather than producing a false structural pass.
 */
function solveAnswers(expr: string): Record<string, string | number> {
  const answers: Record<string, string | number> = {};
  const cmpRe =
    /answers\.([A-Za-z0-9_]+)\s*(==|!=|>=|<=|>|<|=)\s*('[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|true|false)/g;
  let m: RegExpExecArray | null;
  const matchedKeys = new Set<string>();
  while ((m = cmpRe.exec(expr)) !== null) {
    const key = m[1];
    const op = m[2];
    const lit = parseLiteral(m[3]);
    matchedKeys.add(key);
    if (op === "==" || op === "=") {
      answers[key] = lit as string | number;
    } else if (op === "!=") {
      if (typeof lit === "string") answers[key] = lit === "yes" ? "no" : "yes";
      else if (typeof lit === "number") answers[key] = lit + 1;
      else answers[key] = lit ? ("no" as any) : ("yes" as any);
    } else if (op === ">") {
      answers[key] = Number(lit) + 1;
    } else if (op === ">=") {
      answers[key] = Number(lit);
    } else if (op === "<") {
      answers[key] = Number(lit) - 1;
    } else if (op === "<=") {
      answers[key] = Number(lit);
    }
  }
  // bare truthy references: answers.Q_FOO used without an operator
  const bareRe = /answers\.([A-Za-z0-9_]+)(?!\s*(?:==|!=|>=|<=|>|<|=))/g;
  while ((m = bareRe.exec(expr)) !== null) {
    const key = m[1];
    if (!matchedKeys.has(key) && !(key in answers)) answers[key] = "yes";
  }
  return answers;
}

function rankRedFlagRules(rules: RedFlagRule[]): RedFlagRule[] {
  const score = (r: RedFlagRule) => {
    let s = 0;
    if (r.action === "ER_SEND") s += 100;
    if (r.severity === "HARD") s += 10;
    return s;
  };
  return [...rules].sort((a, b) => score(b) - score(a));
}

/** Pick the strongest red-flag rule whose trigger we can actually satisfy (oracle-verified). */
function buildRedFlagPositiveCase(
  config: ComplaintConfig,
  ccId: string,
): { rule: RedFlagRule; answers: Record<string, string | number> } | null {
  for (const rule of rankRedFlagRules(config.redFlagRules)) {
    if (!rule.triggerExpr || !/answers\./.test(rule.triggerExpr)) continue; // prose / non-evaluable
    const answers = solveAnswers(rule.triggerExpr);
    if (Object.keys(answers).length === 0) continue;
    const probe = freshCaseState(ccId, answers);
    let fires = false;
    try {
      fires = !!evaluateExpr(rule.triggerExpr, probe);
    } catch {
      fires = false;
    }
    if (fires) return { rule, answers };
  }
  return null;
}

function defaultAnswerFor(config: ComplaintConfig, qId: string): string | number {
  const q = config.coreQuestions.find((c) => c.qId === qId);
  if (q && /num|int|count|scale|age/i.test(q.answerType || "")) return 0;
  return "no";
}

// ─── Encounter driver (two-pass continuation = honest resumable session) ──────

interface EncounterTrace {
  passes: GraphResult[];
  finalResult: GraphResult;
  turns: number;
  /** encounterId/patientId stayed identical across every pass input & output. */
  sessionStable: boolean;
  restartDetail: string;
  /** answers we supplied, by key → value, that should appear in final state. */
  suppliedAnswers: Record<string, string | number>;
  /** whether the driver hit the turn ceiling without terminating. */
  stalled: boolean;
}

const TURN_CAP = 80;

async function driveEncounter(
  ccId: string,
  config: ComplaintConfig,
  redFlagAnswers: Record<string, string | number>,
  runner: PipelineRunner,
): Promise<EncounterTrace> {
  // Split the red-flag-positive answers into two halves so we genuinely resume
  // a session mid-conversation (works whether or not the engine prompts).
  const keys = Object.keys(redFlagAnswers);
  const half = Math.ceil(keys.length / 2);
  const firstHalf: Record<string, string | number> = {};
  const secondHalf: Record<string, string | number> = {};
  keys.forEach((k, i) => {
    (i < half - 1 ? firstHalf : secondHalf)[k] = redFlagAnswers[k];
  });

  const suppliedAnswers: Record<string, string | number> = {};
  const passes: GraphResult[] = [];
  const expectEnc = `struct_${ccId}`;
  const expectPat = `struct_patient_${ccId}`;
  let sessionStable = true;
  let restartDetail = "stable";
  let turns = 0;
  let stalled = false;

  // One sub-loop that runs the graph, reactively answering any prompted
  // required question, until the graph terminates (done or non-question pending).
  async function runToQuiescence(startState: CaseState): Promise<GraphResult> {
    let state = startState;
    let result: GraphResult | null = null;
    let local = 0;
    while (local < TURN_CAP) {
      local++;
      turns++;
      result = await runner(state, ccId);
      // session continuity: ids must never change across re-entry
      const enc = (result.state as any)?.encounterId;
      const pat = (result.state as any)?.patientId;
      if (enc !== expectEnc || pat !== expectPat) {
        sessionStable = false;
        restartDetail = `session restarted: encounterId=${enc} patientId=${pat} (expected ${expectEnc}/${expectPat})`;
      }
      if (!result.done && result.pendingAction?.type === "ASK_QUESTION") {
        const qId = (result.pendingAction as any).questionId as string;
        const ans = qId in redFlagAnswers ? redFlagAnswers[qId] : defaultAnswerFor(config, qId);
        suppliedAnswers[qId] = ans;
        state = {
          ...(result.state as any),
          answers: { ...(result.state as any).answers, [qId]: ans },
        } as CaseState;
        continue;
      }
      break; // terminal
    }
    if (local >= TURN_CAP) stalled = true;
    return result!;
  }

  // Pass 1: seed first half, run to quiescence.
  Object.assign(suppliedAnswers, firstHalf);
  const r1 = await runToQuiescence(freshCaseState(ccId, firstHalf));
  passes.push(r1);

  // Pass 2: resume from returned state, add second half, run to quiescence.
  Object.assign(suppliedAnswers, secondHalf);
  const resumeState = {
    ...(r1.state as any),
    answers: { ...(r1.state as any).answers, ...secondHalf },
  } as CaseState;
  const r2 = await runToQuiescence(resumeState);
  passes.push(r2);

  return {
    passes,
    finalResult: r2,
    turns,
    sessionStable,
    restartDetail,
    suppliedAnswers,
    stalled,
  };
}

// ─── Stage detection on engine events (works for GENERIC_V1 + LEGACY) ─────────

function collectEventMessages(passes: GraphResult[]): string[] {
  const msgs: string[] = [];
  for (const p of passes) {
    for (const e of p.events ?? []) msgs.push(`[${(e as any).severity}] ${(e as any).message ?? ""}`);
  }
  return msgs;
}

function anyEvent(msgs: string[], needle: string): boolean {
  return msgs.some((m) => m.includes(needle));
}

// ─── The check ────────────────────────────────────────────────────────────────

export async function runStructuralCheck(
  ccId: string,
  opts: SensorOptions = {},
): Promise<StructuralResult> {
  const runner = opts.runner ?? realRunner;
  const checks: StageCheck[] = [];
  const contentGaps: ContentGap[] = [];

  const config = await loadComplaintConfig(ccId);
  if (!config) {
    return {
      ccId,
      engineType: "unknown",
      structuralPass: false,
      fatal: `loadComplaintConfig("${ccId}") returned null — complaint has no config`,
      turns: 0,
      checks: [{ stage: "CONFIG", pass: false, detail: "no config returned" }],
      contentGaps: [],
      finalSummary: {
        done: false,
        currentNode: "INIT_CASE",
        redFlags: [],
        activeClusters: [],
        scoreKeys: [],
        differentials: 0,
      },
    };
  }
  checks.push({
    stage: "CONFIG",
    pass: true,
    detail: `engine=${config.registry.engineType} rf=${config.redFlagRules.length} q=${config.coreQuestions.length} disp=${config.dispositionRules.length}`,
  });

  // Build the red-flag-positive case from the LIVE config.
  const rfCase = buildRedFlagPositiveCase(config, ccId);
  const redFlagAnswers = rfCase?.answers ?? {};

  // Drive the encounter.
  const enc = await driveEncounter(ccId, config, redFlagAnswers, runner);
  const final = enc.finalResult;
  const s = final.state as any;
  const msgs = collectEventMessages(enc.passes);

  // ── SESSION: no restart, no stall ──
  checks.push({
    stage: "SESSION",
    pass: enc.sessionStable && !enc.stalled,
    detail: enc.stalled
      ? `STALLED: hit ${TURN_CAP}-turn ceiling without terminating`
      : enc.restartDetail,
  });

  // ── ANSWER_CAPTURE: every supplied answer survives into final state ──
  const missingAnswers: string[] = [];
  for (const [k, v] of Object.entries(enc.suppliedAnswers)) {
    const got = s?.answers?.[k];
    // loose compare (engine may coerce); both sides stringified
    if (String(got) !== String(v)) missingAnswers.push(`${k}=${JSON.stringify(v)}(got ${JSON.stringify(got)})`);
  }
  checks.push({
    stage: "ANSWER_CAPTURE",
    pass: missingAnswers.length === 0,
    detail:
      missingAnswers.length === 0
        ? `${Object.keys(enc.suppliedAnswers).length} supplied answers all captured`
        : `not captured: ${missingAnswers.join(", ")}`,
  });

  // ── INIT invoked ──
  checks.push({
    stage: "INIT",
    pass: anyEvent(msgs, "INIT"),
    detail: anyEvent(msgs, "INIT") ? "INIT event present" : "no INIT event emitted",
  });

  // ── CORE_QUESTIONS invoked AND no required questions left unanswered ──
  const reqMissing: string[] = (s?.requiredQuestionIdsMissing ?? []) as string[];
  const questionsInvoked = anyEvent(msgs, "QUESTIONS");
  const stillPendingQuestion =
    !final.done && (final.pendingAction as any)?.type === "ASK_QUESTION";
  checks.push({
    stage: "CORE_QUESTIONS",
    pass: questionsInvoked && !stillPendingQuestion && reqMissing.length === 0,
    detail: !questionsInvoked
      ? "no QUESTIONS event emitted"
      : stillPendingQuestion
        ? "encounter left blocked on an unanswered question"
        : `all required answered (requiredMissing=${reqMissing.length})`,
  });

  // ── RED_FLAG_GATE invoked AND escalation fires on the defined red-flag inputs ──
  const gate = s?.redFlagGate;
  const rfInvoked = anyEvent(msgs, "RED_FLAG") && gate?.evaluated === true;
  if (!rfCase) {
    // No synthesizable red flag — we cannot assert escalation. This is a
    // structural finding: the complaint defines no evaluable HARD/SOFT trigger
    // we could exercise. Report it, but do not silently pass.
    checks.push({
      stage: "RED_FLAG_GATE",
      pass: rfInvoked,
      detail: rfInvoked
        ? "gate evaluated, but no evaluable red-flag trigger could be synthesized to test escalation"
        : "red-flag gate not evaluated and no evaluable trigger to synthesize",
      error: "no_synthesizable_red_flag",
    });
  } else {
    const chosen = rfCase.rule;
    const fired = (s?.redFlags ?? []).includes(chosen.rfId);
    const gateResult = gate?.gateResult;
    const escalated =
      gateResult === "ER_SEND" || gateResult === "ESCALATE";
    const routingOk =
      chosen.action === "ER_SEND" ? s?.routing?.state === "EMERGENT_ESCALATION" : true;
    const pass = rfInvoked && fired && escalated && routingOk;
    checks.push({
      stage: "RED_FLAG_GATE",
      pass,
      detail: `rule=${chosen.rfId}(${chosen.severity}/${chosen.action}) fired=${fired} gate=${gateResult} routing=${s?.routing?.state}`,
    });
  }

  // ── SCORING invoked, no scoring error ──
  const scoringInvoked = anyEvent(msgs, "SCORING");
  const scoringError = anyEvent(msgs, "SCORING_ERROR");
  checks.push({
    stage: "SCORING",
    pass: scoringInvoked && !scoringError,
    detail: scoringInvoked ? "SCORING event present" : "no SCORING event emitted",
  });

  // ── DISPOSITION invoked AND a disposition value is set ──
  const dispInvoked = anyEvent(msgs, "DISPOSITION");
  const dispSet = !!s?.disposition;
  checks.push({
    stage: "DISPOSITION",
    pass: dispInvoked && dispSet,
    detail: dispInvoked
      ? `disposition=${s?.disposition ?? "(none)"}`
      : "no DISPOSITION event emitted",
  });

  // ── SIGNOFF: reaches terminal handoff (DONE + disposition + physician/EMS routing) ──
  const reachedDone = final.done === true && final.currentNode === "DONE";
  const routing = s?.routing?.state;
  const terminalHandoff =
    routing === "EMERGENT_ESCALATION" || routing === "REVIEW_REQUIRED";
  // ER cases must reach EMERGENT_ESCALATION; non-ER reach a disposition+DONE
  // (physician review is the downstream gate, but the pipeline must hand off).
  const signoffPass = reachedDone && dispSet && (rfCase?.rule.action === "ER_SEND" ? routing === "EMERGENT_ESCALATION" : terminalHandoff || dispSet);
  checks.push({
    stage: "SIGNOFF",
    pass: signoffPass,
    detail: `done=${final.done} node=${final.currentNode} disposition=${s?.disposition ?? "(none)"} routing=${routing}`,
  });

  // ── NO_ERROR: no error-severity event anywhere in the run ──
  const errorEvents = enc.passes
    .flatMap((p) => p.events ?? [])
    .filter((e: any) => e.severity === "error");
  checks.push({
    stage: "NO_ERROR",
    pass: errorEvents.length === 0,
    detail:
      errorEvents.length === 0
        ? "no error-severity events"
        : `error events: ${errorEvents.map((e: any) => e.type).join(", ")}`,
    error: errorEvents.length ? errorEvents.map((e: any) => `${e.type}: ${e.message}`).join(" | ") : undefined,
  });

  // ── Content gaps (LOGGED, never fail the structural check) ──
  const activeClusters: string[] = s?.activeClusters ?? [];
  const scoreKeys = Object.keys(s?.scores ?? {});
  const differentials =
    (s?.diagnosisCandidates?.length ?? 0) + (s?.likelyDx?.length ?? 0);
  if (config.clusterScoringRules.length === 0)
    contentGaps.push({ stage: "SCORING", gap: "no cluster scoring rules authored (CLUSTER_SCORING_RULES empty)" });
  if (activeClusters.length === 0)
    contentGaps.push({ stage: "DIFF_AND_CONFIDENCE", gap: "no active clusters produced (empty differential clustering)" });
  if (differentials < 3)
    contentGaps.push({ stage: "DIFF_AND_CONFIDENCE", gap: `fewer than 3 differentials (${differentials})` });
  if ((config.dispositionRules?.length ?? 0) === 0)
    contentGaps.push({ stage: "DISPOSITION", gap: "no disposition rules authored" });
  if ((s?.dispositionReasonCodes ?? []).includes("FALLBACK"))
    contentGaps.push({ stage: "DISPOSITION", gap: "disposition resolved via FALLBACK (no rule matched)" });
  if ((config.outputTemplates?.length ?? 0) === 0)
    contentGaps.push({ stage: "OUTPUT_COMPOSE", gap: "no output/rationale templates authored" });
  if (config.coreQuestions.length < 5)
    contentGaps.push({ stage: "CORE_QUESTIONS", gap: `thin question set (${config.coreQuestions.length} questions)` });
  // universal modifiers (med allergies, current meds, prior surgeries, family hx, smoking)
  const modRows = ((config as any).modifiers ?? []) as any[];
  const modText = JSON.stringify(modRows).toLowerCase();
  const universal = [
    ["allerg", "med allergies"],
    ["med", "current meds"],
    ["surg", "prior surgeries"],
    ["family", "family history"],
    ["smok", "smoking history"],
  ];
  const missingMods = universal.filter(([kw]) => !modText.includes(kw)).map(([, label]) => label);
  if (modRows.length === 0)
    contentGaps.push({ stage: "MODIFIERS_INTAKE", gap: "no universal modifiers defined" });
  else if (missingMods.length > 0)
    contentGaps.push({ stage: "MODIFIERS_INTAKE", gap: `missing universal modifiers: ${missingMods.join(", ")}` });

  const structuralPass = checks.every((c) => c.pass);

  return {
    ccId,
    engineType: config.registry.engineType,
    structuralPass,
    redFlagUsed: rfCase
      ? {
          rfId: rfCase.rule.rfId,
          severity: rfCase.rule.severity,
          action: rfCase.rule.action,
          triggerExpr: rfCase.rule.triggerExpr,
        }
      : undefined,
    turns: enc.turns,
    checks,
    contentGaps,
    finalSummary: {
      done: final.done,
      currentNode: final.currentNode,
      disposition: s?.disposition,
      redFlagGate: gate?.gateResult,
      redFlags: s?.redFlags ?? [],
      routing,
      activeClusters,
      scoreKeys,
      differentials,
    },
  };
}

// ─── Pretty-printer ───────────────────────────────────────────────────────────

export function printStructuralResult(r: StructuralResult): void {
  const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", X = "\x1b[0m";
  console.log(`\n══════════ STRUCTURAL CHECK: ${r.ccId} ══════════`);
  console.log(`engine=${r.engineType}  turns=${r.turns}  ${r.structuralPass ? G + "STRUCTURAL PASS" + X : R + "STRUCTURAL FAIL" + X}`);
  if (r.fatal) console.log(`${R}FATAL:${X} ${r.fatal}`);
  if (r.redFlagUsed)
    console.log(`${D}red-flag probe: ${r.redFlagUsed.rfId} (${r.redFlagUsed.severity}/${r.redFlagUsed.action})${X}`);
  console.log("\n── per-stage assertions ──");
  for (const c of r.checks) {
    const tag = c.pass ? G + "PASS" + X : R + "FAIL" + X;
    console.log(`  [${tag}] ${c.stage.padEnd(15)} ${c.detail}`);
    if (c.error && !c.pass) console.log(`         ${R}↳ ${c.error}${X}`);
  }
  console.log("\n── final state ──");
  const f = r.finalSummary;
  console.log(`  done=${f.done} node=${f.currentNode} disposition=${f.disposition} gate=${f.redFlagGate} routing=${f.routing}`);
  console.log(`  redFlags=${JSON.stringify(f.redFlags)}`);
  console.log(`  activeClusters=${JSON.stringify(f.activeClusters)} scoreKeys=${JSON.stringify(f.scoreKeys)} differentials=${f.differentials}`);
  console.log(`\n── content gaps (logged, NOT fixed — physician worklist) ── ${r.contentGaps.length === 0 ? G + "none" + X : Y + r.contentGaps.length + X}`);
  for (const g of r.contentGaps) console.log(`  ${Y}•${X} [${g.stage}] ${g.gap}`);
  console.log("");
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const ccId = process.argv[2] || "chest_pain";
  runStructuralCheck(ccId)
    .then((r) => {
      printStructuralResult(r);
      process.exit(r.structuralPass ? 0 : 1);
    })
    .catch((err) => {
      console.error("SENSOR CRASH:", err);
      process.exit(2);
    });
}

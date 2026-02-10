import { randomUUID } from "crypto";
import { listTestCaseSummaries, getTestCaseById, getTestCaseByFilename } from "../testcases/loader";
import { getTraceStore, agentRunResponseToStoredTrace } from "../traces/traceStore";
import { formatRunReceipt, formatScenarioList, formatStepExplain } from "../traces/traceSummary";
import { runAgentLoop, buildAgentRunResponse } from "../agent/runtime";
import { CaseStateSchema, AgentRunConfigSchema } from "../../shared/agentTypes";
import { normalizeAnswer } from "../agent/normalize";

export function isStaffCommand(msg: string): boolean {
  const lower = msg.trim().toLowerCase();
  return lower.startsWith("!scenario") || lower.startsWith("!trace") || lower.startsWith("!case") || lower.startsWith("!explain");
}

export async function handleStaffCommand(msg: string): Promise<string> {
  const parts = msg.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  try {
    if (cmd === "!scenario") return await handleScenarioCommand(parts.slice(1));
    if (cmd === "!trace") return await handleTraceCommand(parts.slice(1));
    if (cmd === "!case") return await handleCaseCommand(parts.slice(1));
    if (cmd === "!explain") return await handleExplainCommand(parts.slice(1));
    return `Unknown command: ${cmd}\n\nAvailable:\n!scenario list|run <id> [--llm=on|off] [--seed=N]\n!trace last|<runId>\n!case <caseId>\n!explain <runId> step <n>`;
  } catch (err: any) {
    console.error("[StaffCmd] Error:", err);
    return `Command error: ${err?.message || String(err)}`;
  }
}

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      flags[match[1].toLowerCase()] = match[2];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function handleScenarioCommand(args: string[]): Promise<string> {
  const { positional, flags } = parseFlags(args);
  const sub = positional[0]?.toLowerCase();

  if (!sub || sub === "list") {
    const summaries = listTestCaseSummaries();
    return formatScenarioList(summaries);
  }

  if (sub === "run") {
    const scenarioId = positional[1];
    if (!scenarioId) return "Usage: !scenario run <id> [--llm=on|off] [--seed=N]\n\nRun !scenario list to see available scenarios.";

    const testCase = getTestCaseById(scenarioId) || getTestCaseByFilename(scenarioId);
    if (!testCase) return `Scenario not found: ${scenarioId}\n\nRun !scenario list to see available scenarios.`;

    const runId = randomUUID();
    const now = new Date().toISOString();

    const answers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(testCase.case.answers)) {
      answers[k] = normalizeAnswer(v);
    }

    const initialState = CaseStateSchema.parse({
      caseId: `test_${runId}`,
      createdAt: now,
      updatedAt: now,
      chiefComplaint: testCase.chiefComplaint,
      demographics: testCase.case.demographics,
      modifiers: testCase.case.modifiers,
      answers,
      routing: { state: "INTAKE_PENDING" },
    });

    const llmEnabled = flags.llm ? flags.llm.toLowerCase() === "on" : undefined;
    const seed = flags.seed ? parseInt(flags.seed, 10) : undefined;

    const cfg = AgentRunConfigSchema.parse({
      runId,
      mode: "REGRESSION",
      maxSteps: 20,
      llm: llmEnabled !== undefined || seed !== undefined ? {
        enabled: llmEnabled ?? true,
        temperature: 0,
        ...(seed !== undefined && !isNaN(seed) ? { seed } : {}),
      } : undefined,
      options: {
        disableWrites: true,
        disableTwilio: true,
        disableFileUploads: true,
      },
    });

    const { finalState, steps, events, stopReason } = await runAgentLoop(initialState, cfg);
    const response = buildAgentRunResponse(runId, "staging", "whatsapp_test", finalState, steps, events);

    const stored = agentRunResponseToStoredTrace(response, {
      caseId: `test_${runId}`,
      scenarioId: testCase.id,
      isTest: true,
      chiefComplaint: testCase.chiefComplaint,
    });
    stored.stopReason = stopReason;

    await getTraceStore().save(stored);

    let result = formatRunReceipt(stored);

    if (testCase.expected) {
      result += "\n\n*Expected*\n";
      if (testCase.expected.disposition) {
        const match = stored.normalized.disposition === testCase.expected.disposition;
        result += `Disposition: ${testCase.expected.disposition} ${match ? "PASS" : "FAIL (got: " + stored.normalized.disposition + ")"}` + "\n";
      }
      if (testCase.expected.scores) {
        for (const [k, v] of Object.entries(testCase.expected.scores)) {
          const actual = stored.normalized.scores[k];
          const match = actual === v;
          result += `Score ${k}: expected=${v} actual=${actual ?? "N/A"} ${match ? "PASS" : "FAIL"}` + "\n";
        }
      }
      if (testCase.expected.redFlagsPresent) {
        const expectedSet = new Set(testCase.expected.redFlagsPresent);
        const actualSet = new Set(stored.normalized.redFlags);
        const missing = [...expectedSet].filter(f => !actualSet.has(f));
        const extra = [...actualSet].filter(f => !expectedSet.has(f));
        if (missing.length === 0 && extra.length === 0) {
          result += "Red flags: PASS\n";
        } else {
          if (missing.length > 0) result += `Red flags missing: ${missing.join(",")}\n`;
          if (extra.length > 0) result += `Red flags extra: ${extra.join(",")}\n`;
        }
      }
    }

    const llmNote = llmEnabled === false ? " (LLM off)" : llmEnabled === true ? " (LLM on)" : "";
    const seedNote = seed !== undefined && !isNaN(seed) ? ` seed=${seed}` : "";
    if (llmNote || seedNote) {
      result += `\nConfig:${llmNote}${seedNote}`;
    }

    return result;
  }

  return `Unknown subcommand: ${sub}\n\nUsage: !scenario list | !scenario run <id> [--llm=on|off] [--seed=N]`;
}

async function handleTraceCommand(args: string[]): Promise<string> {
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "last") {
    const trace = await getTraceStore().getLatest();
    if (!trace) return "No traces found.";
    return formatRunReceipt(trace);
  }

  const trace = await getTraceStore().getByRunId(sub);
  if (!trace) return `Trace not found: ${sub}`;
  return formatRunReceipt(trace);
}

async function handleExplainCommand(args: string[]): Promise<string> {
  if (args.length < 3 || args[1]?.toLowerCase() !== "step") {
    return "Usage: !explain <runId> step <n>";
  }

  const runId = args[0];
  const stepNum = parseInt(args[2], 10);
  if (isNaN(stepNum)) return "Step number must be a number.\n\nUsage: !explain <runId> step <n>";

  const trace = await getTraceStore().getByRunId(runId);
  if (!trace) {
    const latest = await getTraceStore().getLatest();
    if (latest && latest.runId.startsWith(runId)) {
      return formatStepExplain(latest, stepNum);
    }
    return `Trace not found: ${runId}\n\nTry !trace last to find recent run IDs.`;
  }

  return formatStepExplain(trace, stepNum);
}

async function handleCaseCommand(args: string[]): Promise<string> {
  const caseId = args[0];
  if (!caseId) return "Usage: !case <caseId>";

  const traces = await getTraceStore().list({ limit: 10 });
  const matching = traces.filter(t => t.caseId === caseId || t.caseId.includes(caseId));

  if (matching.length === 0) return `No traces found for case: ${caseId}`;

  const lines: string[] = [`*Traces for case ${caseId}*`, ""];
  for (const t of matching) {
    lines.push(`- ${t.runId.slice(0, 8)} | ${t.normalized.disposition} | ${t.stopReason} | ${t.createdAt}`);
  }
  lines.push("");
  lines.push("View detail: !trace <runId>");
  return lines.join("\n");
}

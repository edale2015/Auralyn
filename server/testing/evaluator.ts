import { Expected, Score, Scenario, SystemOutput } from "./types";
import { FlowSpec } from "./specs";
import { normalizeDisposition } from "./dispositionNormalizer";

export function expectedFromRules(spec: FlowSpec, s: Scenario): Expected {
  const yesRf = spec.redFlagYesQuestionIds.filter(qid => s.answers[qid] === "Yes");
  if (yesRf.length) {
    return { expectedDisposition: "urgent_or_ed", reasons: yesRf.map(q => `rf_yes:${q}`) };
  }
  return { expectedDisposition: "routine_or_supportive", reasons: ["no_rf_yes"] };
}

export function scoreRun(expected: Expected, out: SystemOutput): Score {
  const issues: { code: string; message: string }[] = [];
  let severity = 0;

  const normDisp = normalizeDisposition(out.disposition);
  const isUrgent = normDisp === "urgent";
  const isRoutine = normDisp === "routine";

  if (expected.expectedDisposition === "urgent_or_ed" && !isUrgent) {
    severity += 10;
    issues.push({ code: "DISPOSITION_UNDERSHOOT", message: `Expected urgent/ED, got disposition="${out.disposition}" (normalized: ${normDisp})` });
  }
  if (expected.expectedDisposition === "routine_or_supportive" && isUrgent) {
    severity += 4;
    issues.push({ code: "DISPOSITION_OVERSHOOT", message: `Expected routine/supportive, got disposition="${out.disposition}" (normalized: ${normDisp})` });
  }

  if (expected.expectedDisposition === "urgent_or_ed" && out.redFlag !== true) {
    severity += 3;
    issues.push({ code: "REDFLAG_FALSE", message: "Expected redFlag=true for urgent case but got false" });
  }

  const pass = severity === 0;
  return { pass, severity, issues };
}

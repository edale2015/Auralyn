import crypto from "crypto";
import { Scenario, Tri } from "./types";
import { FlowSpec } from "./specs";
import { getFlowQuestions } from "../flows/sheetFlowLoader";

function rid() {
  return crypto.randomBytes(8).toString("hex");
}

function pickTri(pYes: number, pNo: number): Tri {
  const r = Math.random();
  if (r < pYes) return "Yes";
  if (r < pYes + pNo) return "No";
  return "Not sure";
}

export async function generateScenariosForFlow(spec: FlowSpec, n: number): Promise<Scenario[]> {
  const qs: any[] = await getFlowQuestions(spec.flowId);
  const qids = qs.map(q => String(q.questionId || q.question_id || q.id).trim()).filter(Boolean);

  if (!qids.length) throw new Error(`No question IDs found for flow ${spec.flowId}`);

  const scenarios: Scenario[] = [];

  for (let i = 0; i < n; i++) {
    const runId = `${spec.flowId}-${rid()}`;
    const ts = Date.now();

    const baseAnswers: Record<string, Tri> = {};
    for (const qid of qids) baseAnswers[qid] = pickTri(0.06, 0.78);

    const redCase = Math.random() < 0.2;
    const reasons: string[] = [];

    if (redCase && spec.redFlagYesQuestionIds.length) {
      const rf = [...spec.redFlagYesQuestionIds].sort(() => Math.random() - 0.5);
      const k = Math.random() < 0.6 ? 1 : 2;
      for (const qid of rf.slice(0, k)) {
        baseAnswers[qid] = "Yes";
        reasons.push(`rf_yes:${qid}`);
      }
    }

    const routerText = redCase
      ? `${spec.chiefComplaint} severe`
      : `${spec.chiefComplaint} mild`;

    scenarios.push({
      runId,
      ts,
      system: spec.system,
      flowId: spec.flowId,
      chiefComplaint: spec.chiefComplaint,
      routerText,
      answers: baseAnswers,
      modifiers: {},
      tags: [...(spec.tags || []), ...(redCase ? ["red_case"] : ["routine_case"]), ...reasons],
    });
  }

  return scenarios;
}

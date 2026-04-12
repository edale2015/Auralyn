/**
 * Multi-Agent Specialist Debate Council
 * Three specialists debate in parallel, a synthesis LLM/rule resolves.
 */

import { CardiologyLLMAgent } from "../agents/cardiologyLLMAgent";
import { PulmonaryLLMAgent }  from "../agents/pulmonaryLLMAgent";
import { runDebate } from "../debate/debateEngine";
import { getRelatedDiseases } from "../graph/queries";

let _openai: any = null;
function getOpenAI() {
  if (!_openai) { const { default: OpenAI } = require("openai"); _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }
  return _openai;
}

export interface DebateCouncilResult {
  final_diagnosis:    string;
  disagreementScore:  number;
  most_dangerous_miss:string;
  confidence:         number;
  opinions:           Array<{ specialist: string; diagnosis: string; confidence: number; reasoning: string }>;
  graphCandidates:    Array<{ disease: string; score: number }>;
}

async function idSpecialistFallback(ctx: Record<string, unknown>) {
  const symptoms = (ctx.symptoms as Record<string, boolean>) ?? {};
  const vitals   = (ctx.vitals   as Record<string, number>)  ?? {};
  const tempF    = Number(vitals.tempF ?? 98.6);
  const hasFever = tempF > 100.4 || symptoms.fever;

  if (hasFever) {
    return { specialist: "InfectiousDisease", diagnosis: "Bacterial or viral infection — culture & treat", confidence: 0.65, reasoning: "Fever pattern consistent with infectious aetiology" };
  }
  return { specialist: "InfectiousDisease", diagnosis: "Low infectious risk", confidence: 0.2, reasoning: "Afebrile, no clear infectious source" };
}

export async function runSpecialistDebate(
  caseData:    Record<string, unknown>,
  baseResult?: Record<string, unknown>
): Promise<DebateCouncilResult> {
  // Knowledge-graph-powered candidate list
  const symptoms = Array.isArray(caseData.symptoms)
    ? (caseData.symptoms as string[])
    : Object.keys((caseData.symptoms as Record<string, boolean>) ?? {}).filter((k) => (caseData.symptoms as any)[k]);

  const graphCandidates = getRelatedDiseases(symptoms).slice(0, 5);

  const ctx = { ...caseData, graphCandidates };

  // Run debate via existing engine + ID fallback
  const debate = await runDebate([new CardiologyLLMAgent(), new PulmonaryLLMAgent()], ctx);
  const idOp   = await idSpecialistFallback(ctx);

  const allOpinions = [...debate.opinions, idOp];

  // Rescore with ID included
  const scores = new Map<string, number>();
  for (const o of allOpinions) {
    scores.set(o.diagnosis, (scores.get(o.diagnosis) ?? 0) + o.confidence);
  }
  const sorted      = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topDx       = sorted[0];
  const secondDx    = sorted[1];
  const totalScore  = allOpinions.reduce((s, o) => s + o.confidence, 0);
  const disagreementScore = secondDx ? Number((secondDx[1] / topDx[1]).toFixed(3)) : 0;
  const confidence = topDx ? Number((topDx[1] / totalScore).toFixed(3)) : 0;

  const most_dangerous_miss = graphCandidates
    .find((c) => c.disease === "PE" || c.disease === "ACS" || c.disease === "Sepsis")
    ?.disease ?? (graphCandidates[0]?.disease ?? "none");

  return {
    final_diagnosis:     topDx?.[0] ?? "Undetermined",
    disagreementScore,
    most_dangerous_miss,
    confidence,
    opinions: allOpinions,
    graphCandidates,
  };
}

/**
 * Iterative Triage Graph — LangGraph-style stateful loop
 * Loops: ask clarifying questions → evaluate risk → decide disposition
 * "Keep asking until safe" — up to MAX_ITERATIONS rounds.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

export const TriageState = Annotation.Root({
  symptoms:       Annotation<string>({ reducer: (_, b) => b }),
  riskScore:      Annotation<number>({ reducer: (_, b) => b }),
  questionsAsked: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  answers:        Annotation<Record<string, string>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  disposition:    Annotation<string | undefined>({ reducer: (_, b) => b }),
  flags:          Annotation<string[]>({
    reducer: (a, b) => [...new Set([...a, ...b])],
    default: () => [],
  }),
  iteration:      Annotation<number>({ reducer: (_, b) => b }),
});

export type TriageStateType = typeof TriageState.State;

const MAX_ITERATIONS = 5;

// Red-flag question bank — mirrors our clinical KB
const RED_FLAG_QUESTIONS: Record<number, string> = {
  0: "Is there any chest pain, pressure, or tightness?",
  1: "Any shortness of breath or difficulty breathing?",
  2: "Any high fever, chills, or severe sweating?",
  3: "Any sudden confusion, altered mental status, or loss of consciousness?",
  4: "Any severe headache described as 'worst of life'?",
};

// ── Node: Ask next clarifying red-flag question ───────────────────────────────
async function askQuestion(state: TriageStateType): Promise<Partial<TriageStateType>> {
  const q = RED_FLAG_QUESTIONS[state.iteration] ?? "Any other concerning symptoms?";
  return {
    questionsAsked: [q],
    iteration:      state.iteration + 1,
  };
}

// ── Node: Evaluate risk from accumulated context ──────────────────────────────
async function evaluateRisk(state: TriageStateType): Promise<Partial<TriageStateType>> {
  const symptoms = state.symptoms.toLowerCase();
  const asked    = state.questionsAsked.join(" ").toLowerCase();
  let score      = 2; // baseline

  // Keyword risk escalation (mirrors our Bayesian engine weights)
  if (symptoms.includes("chest pain") || asked.includes("chest"))  score += 4;
  if (symptoms.includes("shortness") || asked.includes("breath"))  score += 3;
  if (symptoms.includes("fever") && symptoms.includes("confusion")) score += 4;
  if (symptoms.includes("confusion") || symptoms.includes("altered")) score += 3;
  if (symptoms.includes("sepsis") || symptoms.includes("hypoten"))  score += 5;
  if (symptoms.includes("headache") && symptoms.includes("worst"))  score += 4;
  if (symptoms.includes("syncope") || symptoms.includes("faint"))   score += 2;

  const flags: string[] = [];
  if (score >= 7) flags.push("HIGH_RISK_ESCALATION");
  if (score >= 5) flags.push("URGENT_REVIEW");

  return { riskScore: Math.min(score, 10), flags };
}

// ── Node: Compute final disposition ──────────────────────────────────────────
async function finalDisposition(state: TriageStateType): Promise<Partial<TriageStateType>> {
  let disposition = "home";
  if (state.riskScore >= 8)      disposition = "ICU";
  else if (state.riskScore >= 6) disposition = "ER";
  else if (state.riskScore >= 4) disposition = "UrgentCare";
  return { disposition };
}

// ── Conditional edge: continue loop or finalize ───────────────────────────────
function shouldContinue(state: TriageStateType): typeof END | "ask" | "final" {
  if (state.iteration >= MAX_ITERATIONS) return "final";
  if (state.riskScore >= 8)             return "final";   // critical — stop immediately
  if (state.riskScore < 4)              return "final";   // clearly safe — stop
  return "ask";                                           // uncertain — keep asking
}

// ── Build and compile the graph ───────────────────────────────────────────────
const graph = new StateGraph(TriageState)
  .addNode("ask",      askQuestion)
  .addNode("evaluate", evaluateRisk)
  .addNode("final",    finalDisposition)
  .addEdge(START,       "ask")
  .addEdge("ask",       "evaluate")
  .addConditionalEdges("evaluate", shouldContinue, { ask: "ask", final: "final", [END]: END })
  .addEdge("final",    END);

export const triageGraph = graph.compile();

export interface TriageGraphResult {
  disposition:    string;
  riskScore:      number;
  questionsAsked: string[];
  flags:          string[];
  iterations:     number;
}

export async function runTriageGraph(symptoms: string): Promise<TriageGraphResult> {
  const result = await triageGraph.invoke({
    symptoms,
    riskScore:      0,
    questionsAsked: [],
    answers:        {},
    flags:          [],
    iteration:      0,
  });

  return {
    disposition:    result.disposition ?? "home",
    riskScore:      result.riskScore,
    questionsAsked: result.questionsAsked,
    flags:          result.flags,
    iterations:     result.iteration,
  };
}

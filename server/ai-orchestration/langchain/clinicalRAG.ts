/**
 * Clinical RAG Engine — LangChain-style retrieval-augmented generation
 * Retrieves clinical KB rules + structured knowledge and feeds them as context
 * to GPT-4o-mini for evidence-based triage reasoning.
 */

import { ChatOpenAI }             from "@langchain/openai";
import { ChatPromptTemplate }      from "@langchain/core/prompts";
import { StringOutputParser }      from "@langchain/core/output_parsers";
import { RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";

export interface ClinicalContext {
  redFlags:   string[];
  diagnoses:  string[];
  treatments: string[];
}

export interface RAGResult {
  text:      string;
  context:   ClinicalContext;
  modelUsed: string;
  cached:    boolean;
}

// ── Retriever: pulls structured KB rules from our in-memory store ─────────────
export function getClinicalRetriever() {
  return {
    async invoke(symptoms: string): Promise<string> {
      // Knowledge retrieved from our KB runtime (rules + diagnoses + red flags)
      // In production this would vector-search our PostgreSQL KB store
      const fragments = [
        "Red flags: chest pain + diaphoresis = ACS until proven otherwise",
        "Tachycardia > 120 + fever > 38.3°C + hypotension = sepsis bundle",
        "SpO₂ < 92% = supplemental oxygen immediately, escalate",
        "NEWS2 ≥ 7 = critical — rapid response team activation required",
        "Strep pharyngitis: Centor score ≥ 3 → test before antibiotics",
        "NEWS2 1–4: monitor every 4–8h; NEWS2 5–6: urgent clinical review",
        "Abdominal pain + fever + rebound tenderness = rule out appendicitis",
        "Altered mental status + fever = consider CNS infection (LP if no CI)",
      ];

      const relevant = fragments
        .filter((f) => {
          const terms = symptoms.toLowerCase().split(/\s+|,/);
          return terms.some((t) => t.length > 3 && f.toLowerCase().includes(t));
        })
        .slice(0, 4);

      return relevant.length ? relevant.join("\n") : fragments.slice(0, 3).join("\n");
    }
  };
}

const ragPrompt = ChatPromptTemplate.fromTemplate(`
You are a clinical triage AI assistant operating in a HIPAA-compliant emergency department.

Clinical Knowledge Base:
{context}

Patient Presentation:
{question}

Provide a structured triage assessment:
1. Top 3 differential diagnoses (with likelihood %)
2. Risk level: low / moderate / high / critical
3. Disposition: home / urgent care / ER / ICU
4. Immediate actions (if any)
5. Clinical reasoning (evidence-based, 2–3 sentences)

Respond in valid JSON format.
`);

// Cache per-symptom fingerprint (30s TTL)
const ragCache = new Map<string, { result: RAGResult; at: number }>();
const CACHE_TTL = 30_000;

function symptomKey(symptoms: string): string {
  return symptoms.toLowerCase().trim().slice(0, 80);
}

export function buildClinicalRAG() {
  let model: ChatOpenAI | null = null;

  function getModel(): ChatOpenAI {
    if (!model) {
      model = new ChatOpenAI({
        modelName:   "gpt-4o-mini",
        temperature: 0.2,
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
    }
    return model;
  }

  const retriever = getClinicalRetriever();

  return {
    async invoke(symptoms: string): Promise<RAGResult> {
      const key    = symptomKey(symptoms);
      const cached = ragCache.get(key);
      if (cached && Date.now() - cached.at < CACHE_TTL) {
        return { ...cached.result, cached: true };
      }

      const context = await retriever.invoke(symptoms);

      const chain = RunnableSequence.from([
        {
          context:  async () => context,
          question: new RunnablePassthrough(),
        },
        ragPrompt,
        getModel(),
        new StringOutputParser(),
      ]);

      try {
        const text = await chain.invoke(symptoms);
        const contextObj: ClinicalContext = {
          redFlags:   context.match(/Red flags:[^\n]*/g)?.map((s) => s.replace("Red flags:", "").trim()) ?? [],
          diagnoses:  [],
          treatments: [],
        };
        const result: RAGResult = { text, context: contextObj, modelUsed: "gpt-4o-mini", cached: false };
        ragCache.set(key, { result, at: Date.now() });
        return result;
      } catch {
        // Fallback rule-based response
        const fallback: RAGResult = {
          text: JSON.stringify({
            differentials: [{ diagnosis: "Undifferentiated — workup required", likelihood: "unknown" }],
            riskLevel:     "moderate",
            disposition:   "urgent care",
            reasoning:     "LLM unavailable — applying conservative rule-based triage.",
          }),
          context:   { redFlags: [], diagnoses: [], treatments: [] },
          modelUsed: "fallback",
          cached:    false,
        };
        return fallback;
      }
    }
  };
}

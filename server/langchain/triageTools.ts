import { listTools, executeTool } from "../services/agents/toolRegistry";
import { runClinicalReasoning } from "../services/agents/msClinicalReasoningAgent";
import { firestoreCaseStore } from "../services/firestoreCaseStore";

export interface LangChainTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface LangChainRunInput {
  tool: string;
  input: Record<string, unknown>;
}

export interface LangChainRunOutput {
  tool: string;
  output: unknown;
  error?: string;
  latencyMs: number;
}

export interface LangChainChainResult {
  steps: LangChainRunOutput[];
  finalAnswer: unknown;
  totalLatencyMs: number;
}

export function getLangChainTools(): LangChainTool[] {
  const agentTools = listTools().map((t) => ({
    name: t.id,
    description: t.description,
    input_schema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Tool input or query" },
      },
    },
  }));

  const builtinTools: LangChainTool[] = [
    {
      name: "clinical_reasoning",
      description: "Run clinical reasoning on a set of symptoms to generate differential diagnoses and next steps",
      input_schema: {
        type: "object",
        properties: {
          symptoms: { type: "string", description: "Comma-separated list of symptoms" },
          history: { type: "string", description: "Comma-separated patient history items" },
        },
        required: ["symptoms"],
      },
    },
    {
      name: "get_case_summary",
      description: "Get a clinical summary for a specific case ID",
      input_schema: {
        type: "object",
        properties: {
          caseId: { type: "string", description: "The case ID to look up" },
        },
        required: ["caseId"],
      },
    },
    {
      name: "list_recent_cases",
      description: "List the most recent triage cases",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "string", description: "Number of cases to return (default 10)" },
          complaintId: { type: "string", description: "Filter by complaint type" },
        },
      },
    },
    {
      name: "analyze_complaint",
      description: "Analyze a clinical complaint to generate diagnostic candidates and recommended questions",
      input_schema: {
        type: "object",
        properties: {
          complaint: { type: "string", description: "Complaint identifier e.g. sore_throat, chest_pain" },
          answers: { type: "string", description: "JSON string of current answers" },
        },
        required: ["complaint"],
      },
    },
  ];

  return [...builtinTools, ...agentTools];
}

export async function executeLangChainTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const t0 = Date.now();

  switch (name) {
    case "clinical_reasoning": {
      const symptoms = String(input.symptoms || "").split(",").map((s) => s.trim()).filter(Boolean);
      const history = String(input.history || "").split(",").map((s) => s.trim()).filter(Boolean);
      return runClinicalReasoning(symptoms, history);
    }

    case "get_case_summary": {
      const caseId = String(input.caseId || "");
      if (!caseId) throw new Error("caseId is required");
      const c = await firestoreCaseStore.getCase(caseId);
      if (!c) throw new Error(`Case not found: ${caseId}`);
      return {
        caseId: c.caseId,
        complaint: c.complaintId,
        status: c.status,
        disposition: c.engineResult?.recommendedDisposition,
        topDx: c.engineResult?.dxCandidates?.[0],
        redFlags: c.engineResult?.triggeredRedFlags,
        answers: c.answers,
      };
    }

    case "list_recent_cases": {
      const limit = Math.min(parseInt(String(input.limit || "10")), 50);
      const cases = await firestoreCaseStore.listCases({ limit });
      return cases.map((c) => ({
        caseId: c.caseId,
        complaint: c.complaintId,
        status: c.status,
        createdAt: c.createdAt,
      }));
    }

    case "analyze_complaint": {
      const complaint = String(input.complaint || "");
      if (!complaint) throw new Error("complaint is required");
      return {
        complaint,
        analysis: `Complaint '${complaint}' identified. Standard clinical pathway should include symptom onset, severity, associated symptoms, and red flag screening.`,
        suggestedQuestions: ["When did symptoms start?", "Severity 0-10?", "Associated fever?", "Any red flags?"],
        timestamp: new Date().toISOString(),
      };
    }

    default: {
      return executeTool(name, input);
    }
  }
}

export async function runLangChainSequence(steps: LangChainRunInput[]): Promise<LangChainChainResult> {
  const totalStart = Date.now();
  const results: LangChainRunOutput[] = [];

  for (const step of steps) {
    const t0 = Date.now();
    try {
      const output = await executeLangChainTool(step.tool, step.input);
      results.push({ tool: step.tool, output, latencyMs: Date.now() - t0 });
    } catch (err: any) {
      results.push({ tool: step.tool, output: null, error: err?.message, latencyMs: Date.now() - t0 });
    }
  }

  const finalAnswer = results.length > 0 ? results[results.length - 1].output : null;
  return { steps: results, finalAnswer, totalLatencyMs: Date.now() - totalStart };
}

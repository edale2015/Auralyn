export interface ToolDefinition {
  name:         string;
  description:  string;
  input_schema: {
    type:       string;
    properties: Record<string, { type: string; description?: string }>;
    required?:  string[];
  };
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name:        "ask_question",
    description: "Ask the patient a structured clinical question",
    input_schema: {
      type: "object",
      properties: {
        question_id: { type: "string", description: "Unique question identifier from KB" },
      },
      required: ["question_id"],
    },
  },
  {
    name:        "record_answer",
    description: "Store a structured patient response",
    input_schema: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        answer:      { type: "string" },
      },
      required: ["question_id", "answer"],
    },
  },
  {
    name:        "check_red_flags",
    description: "Evaluate all red flag conditions for current session state",
    input_schema: {
      type:       "object",
      properties: {},
    },
  },
  {
    name:        "calculate_score",
    description: "Run a clinical scoring system (Centor, Bayesian, etc.)",
    input_schema: {
      type: "object",
      properties: {
        score_type: { type: "string", description: "e.g. centor | bayesian_strep | wells" },
      },
    },
  },
  {
    name:        "generate_disposition",
    description: "Determine final patient disposition and management plan",
    input_schema: {
      type: "object",
      properties: {
        red_flags_present:       { type: "boolean" },
        bacterial_criteria_met:  { type: "boolean" },
      },
    },
  },
  {
    name:        "prescribe_antibiotic",
    description: "Generate an antibiotic prescription (requires bacterial criteria)",
    input_schema: {
      type: "object",
      properties: {
        bacterial_criteria_met: { type: "boolean" },
        medication_key:         { type: "string" },
      },
      required: ["bacterial_criteria_met", "medication_key"],
    },
  },
  {
    name:        "escalate_to_physician",
    description: "Flag case for mandatory physician review",
    input_schema: {
      type: "object",
      properties: {
        reason:    { type: "string" },
        urgency:   { type: "string", description: "immediate | urgent | routine" },
      },
      required: ["reason"],
    },
  },
  {
    name:        "summarize_visit",
    description: "Generate a structured clinical summary of the visit",
    input_schema: {
      type:       "object",
      properties: {},
    },
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export function getToolNames(): string[] {
  return TOOL_REGISTRY.map((t) => t.name);
}

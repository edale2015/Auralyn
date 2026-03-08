export interface PromptTemplate {
  id: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
}

const templates: Record<string, PromptTemplate> = {
  clinical_reasoning: {
    id: "clinical_reasoning",
    name: "Clinical Reasoning",
    systemPrompt: "You are a clinical reasoning assistant. Analyze the provided patient data and provide differential diagnoses with reasoning. Always note that this is AI-assisted and requires physician review.",
    userPromptTemplate: "Patient presents with: {{symptoms}}. History: {{history}}. Please provide differential diagnoses with reasoning.",
  },
  note_enhancement: {
    id: "note_enhancement",
    name: "Note Enhancement",
    systemPrompt: "You are a medical documentation assistant. Enhance clinical notes for clarity and completeness while preserving clinical accuracy.",
    userPromptTemplate: "Please enhance this clinical note: {{note}}",
  },
  patient_education: {
    id: "patient_education",
    name: "Patient Education",
    systemPrompt: "You are a patient education specialist. Explain medical conditions and treatments in simple, clear language suitable for patients.",
    userPromptTemplate: "Explain the following to a patient in simple terms: {{topic}}",
  },
};

export function getTemplate(id: string): PromptTemplate | undefined { return templates[id]; }
export function listTemplates(): PromptTemplate[] { return Object.values(templates); }

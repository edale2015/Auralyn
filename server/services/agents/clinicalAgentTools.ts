import { registerTool } from "./toolRegistry";
import { firestoreCaseStore } from "../firestoreCaseStore";

export function registerClinicalTools(): void {
  registerTool({
    id: "get_case",
    name: "Get Case",
    description: "Retrieve a case by ID",
    category: "data",
    handler: async (params) => {
      const caseId = params.caseId as string;
      return firestoreCaseStore.getCase(caseId);
    },
  });

  registerTool({
    id: "list_cases",
    name: "List Cases",
    description: "List recent cases",
    category: "data",
    handler: async (params) => {
      const limit = (params.limit as number) || 20;
      return firestoreCaseStore.listCases({ limit });
    },
  });

  registerTool({
    id: "analyze_symptoms",
    name: "Analyze Symptoms",
    description: "Analyze a set of symptoms for potential diagnoses",
    category: "clinical",
    handler: async (params) => {
      const symptoms = params.symptoms as string[];
      return { symptoms, analysis: "Symptom analysis requires engine evaluation", timestamp: new Date().toISOString() };
    },
  });
}

import { scenarioTemplates } from "./scenarioTemplates";
import { generateScenarioVariables, ScenarioVariables } from "./scenarioRandomizer";

export interface ClinicalScenario {
  complaint: string;
  narrative: string;
  variables: ScenarioVariables;
}

export function generateClinicalScenario(complaint: string): ClinicalScenario | null {
  const templates = scenarioTemplates[complaint];
  if (!templates || templates.length === 0) return null;

  const template = templates[Math.floor(Math.random() * templates.length)];
  const vars = generateScenarioVariables();

  let narrative = template;
  Object.entries(vars).forEach(([k, v]) => {
    narrative = narrative.replace(`{${k}}`, String(v));
  });

  return { complaint, narrative, variables: vars };
}

export function generateScenarioBatch(complaint: string, count: number): ClinicalScenario[] {
  const results: ClinicalScenario[] = [];
  const actual = Math.min(count, 100);

  for (let i = 0; i < actual; i++) {
    const scenario = generateClinicalScenario(complaint);
    if (scenario) results.push(scenario);
  }

  return results;
}

export function getAvailableComplaints(): string[] {
  return Object.keys(scenarioTemplates);
}

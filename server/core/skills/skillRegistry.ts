import fs from 'node:fs';
import path from 'node:path';

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  category: 'clinical' | 'diagnostic' | 'therapeutic' | 'administrative' | 'integration' | 'simulation';
  inputs: string[];
  outputs: string[];
  engineDeps: string[];
  enabled: boolean;
  addedAt: string;
  tags: string[];
}

const REGISTRY_FILE = path.join(process.cwd(), 'skill_registry.ndjson');

const BUILTIN_SKILLS: Skill[] = [
  { id: 'ekg_interpretation', name: 'ECG Interpretation', version: '1.0', description: 'Acquire and interpret 12-lead ECG', category: 'diagnostic', inputs: ['complaint', 'vitals'], outputs: ['EKGResult'], engineDeps: ['ekgDevice', 'severityScoring'], enabled: true, addedAt: '2026-01-01', tags: ['cardiology', 'telepresence'] },
  { id: 'chest_xray_review', name: 'Chest X-Ray Review', version: '1.0', description: 'Capture and analyze chest X-ray', category: 'diagnostic', inputs: ['complaint'], outputs: ['XRayResult'], engineDeps: ['guidelineEngine'], enabled: true, addedAt: '2026-01-01', tags: ['pulmonology', 'imaging', 'telepresence'] },
  { id: 'urinalysis_interpretation', name: 'Urinalysis', version: '1.0', description: 'Dipstick UA with automated interpretation', category: 'diagnostic', inputs: ['symptoms'], outputs: ['UAResult'], engineDeps: ['bayesianDiff'], enabled: true, addedAt: '2026-01-01', tags: ['urology', 'uti'] },
  { id: 'rapid_strep', name: 'Rapid Strep Test', version: '1.0', description: 'Point-of-care strep antigen with Centor scoring', category: 'diagnostic', inputs: ['answers', 'symptoms'], outputs: ['StrepResult', 'CentorScore'], engineDeps: ['guidelineEngine'], enabled: true, addedAt: '2026-01-01', tags: ['ent', 'pharyngitis'] },
  { id: 'flu_covid_panel', name: 'Flu/COVID Rapid Panel', version: '1.0', description: 'Combined influenza A/B + COVID-19 antigen test', category: 'diagnostic', inputs: ['symptoms', 'duration'], outputs: ['PanelResult'], engineDeps: ['temporalReasoning'], enabled: true, addedAt: '2026-01-01', tags: ['respiratory', 'infectious'] },
  { id: 'centor_scoring', name: 'Centor Score Calculator', version: '1.1', description: 'Modified Centor/McIsaac score for strep pharyngitis', category: 'clinical', inputs: ['answers', 'profile'], outputs: ['CentorScore', 'antibioticRecommendation'], engineDeps: ['guidelineEngine'], enabled: true, addedAt: '2026-01-01', tags: ['ent', 'scoring'] },
  { id: 'wells_pe', name: 'Wells PE Score', version: '1.0', description: 'Wells criteria for pulmonary embolism pre-test probability', category: 'clinical', inputs: ['symptoms', 'answers'], outputs: ['WellsScore', 'PE_probability'], engineDeps: ['guidelineEngine'], enabled: true, addedAt: '2026-01-01', tags: ['pulmonology', 'scoring', 'pe'] },
  { id: 'curb65', name: 'CURB-65 Score', version: '1.0', description: 'Pneumonia severity scoring for admission decision', category: 'clinical', inputs: ['vitals', 'profile', 'labs'], outputs: ['CURB65_score', 'admissionRecommendation'], engineDeps: ['guidelineEngine', 'severityScoring'], enabled: true, addedAt: '2026-01-01', tags: ['pulmonology', 'scoring', 'pneumonia'] },
  { id: 'outcome_prediction', name: 'Outcome Prediction', version: '1.0', description: 'Predict hospitalization and ICU risk', category: 'clinical', inputs: ['differentials', 'profile', 'severity', 'disposition'], outputs: ['OutcomePrediction'], engineDeps: ['outcomePrediction', 'patientRiskForecast'], enabled: true, addedAt: '2026-01-01', tags: ['predictive', 'risk'] },
  { id: 'multi_agent_debate', name: 'Multi-Agent Diagnostic Debate', version: '1.0', description: 'Run 5 specialty AI agents to debate differentials', category: 'clinical', inputs: ['caseInput', 'differentials'], outputs: ['DebateResult'], engineDeps: ['multiAgentDebate'], enabled: true, addedAt: '2026-01-01', tags: ['advanced', 'reasoning'] },
  { id: 'copilot_note', name: 'Physician Assist Copilot', version: '1.0', description: 'Auto-generate clinical notes with ICD-10 codes', category: 'administrative', inputs: ['caseInput', 'differentials', 'disposition'], outputs: ['CopilotNote'], engineDeps: ['physicianAssistCopilot'], enabled: true, addedAt: '2026-01-01', tags: ['documentation', 'copilot'] },
  { id: 'mass_simulation', name: 'Mass Simulation', version: '1.0', description: 'Batch test 1000+ scenarios through clinical brain', category: 'simulation', inputs: ['count'], outputs: ['SimulationSummary'], engineDeps: ['massSimulation', 'scenarioGenerator'], enabled: true, addedAt: '2026-01-01', tags: ['testing', 'qa'] },
];

function loadCustomSkills(): Skill[] {
  if (!fs.existsSync(REGISTRY_FILE)) return [];
  return fs.readFileSync(REGISTRY_FILE, 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => JSON.parse(l) as Skill);
}

export function getAllSkills(): Skill[] {
  const custom = loadCustomSkills();
  const builtinIds = new Set(BUILTIN_SKILLS.map((s) => s.id));
  return [...BUILTIN_SKILLS, ...custom.filter((s) => !builtinIds.has(s.id))];
}

export function getSkillById(id: string): Skill | undefined {
  return getAllSkills().find((s) => s.id === id);
}

export function addSkill(skill: Omit<Skill, 'addedAt'>): Skill {
  const entry: Skill = { ...skill, addedAt: new Date().toISOString() };
  fs.appendFileSync(REGISTRY_FILE, JSON.stringify(entry) + '\n');
  return entry;
}

export function toggleSkill(id: string, enabled: boolean): boolean {
  const skills = loadCustomSkills();
  const existing = skills.find((s) => s.id === id);
  if (existing) {
    existing.enabled = enabled;
    fs.writeFileSync(REGISTRY_FILE, skills.map((s) => JSON.stringify(s)).join('\n') + '\n');
    return true;
  }
  return false;
}

export function getSkillsByCategory(category: Skill['category']): Skill[] {
  return getAllSkills().filter((s) => s.category === category);
}

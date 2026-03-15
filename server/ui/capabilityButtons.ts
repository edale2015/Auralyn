export type CapabilityAction =
  | 'runClinicalBrain'
  | 'runMetaClinicalController'
  | 'visualizePath'
  | 'importPath'
  | 'runSimulation'
  | 'createGoldenCase'
  | 'viewGoldenCases'
  | 'devicePlan'
  | 'knowledgeImport'
  | 'viewEngineRegistry'
  | 'viewArchitectureDiagram'
  | 'runGuidelines'
  | 'longitudinalAnalysis'
  | 'exportData'
  | 'runSelfImprovement'
  | 'viewPhysicianAnalytics';

export interface CapabilityButton {
  id: string;
  label: string;
  action: CapabilityAction;
  description: string;
  category: 'clinical' | 'analytics' | 'architecture' | 'simulation' | 'administration';
  route?: string;
  apiEndpoint?: string;
  icon: string;
  requiresRole: ('admin' | 'physician')[];
  badgeText?: string;
}

export const CAPABILITY_BUTTONS: CapabilityButton[] = [
  // ── Clinical ──────────────────────────────────────────────────────────────
  { id: 'run_brain', label: 'Run Clinical Brain', action: 'runClinicalBrain', description: 'Execute the full 20-step multi-brain diagnostic pipeline on a case', category: 'clinical', apiEndpoint: '/api/brain/run', icon: 'Brain', requiresRole: ['admin', 'physician'] },
  { id: 'run_meta', label: 'Meta-Clinical Analysis', action: 'runMetaClinicalController', description: 'Run meta-intelligence + guidelines + longitudinal + telepresence planning in one call', category: 'clinical', apiEndpoint: '/api/meta-clinical/analyze', icon: 'Sparkles', requiresRole: ['admin', 'physician'], badgeText: 'NEW' },
  { id: 'device_plan', label: 'Telepresence Device Plan', action: 'devicePlan', description: 'Generate device activation commands for a telepresence session', category: 'clinical', apiEndpoint: '/api/meta-clinical/device-plan', icon: 'Monitor', requiresRole: ['admin', 'physician'] },
  { id: 'run_guidelines', label: 'Run Guideline Scores', action: 'runGuidelines', description: 'Compute Centor, CURB-65, Wells PE, and other clinical scores', category: 'clinical', apiEndpoint: '/api/meta-clinical/guidelines', icon: 'ClipboardCheck', requiresRole: ['admin', 'physician'] },
  { id: 'longitudinal', label: 'Longitudinal Analysis', action: 'longitudinalAnalysis', description: 'Track patient progression and worsening trend across visits', category: 'clinical', apiEndpoint: '/api/meta-clinical/longitudinal', icon: 'TrendingUp', requiresRole: ['admin', 'physician'] },

  // ── Analytics ─────────────────────────────────────────────────────────────
  { id: 'physician_analytics', label: 'Physician Analytics', action: 'viewPhysicianAnalytics', description: 'Review physician response times and override patterns', category: 'analytics', route: '/physician-analytics', icon: 'BarChart3', requiresRole: ['admin', 'physician'] },
  { id: 'self_improve', label: 'Improvement Engine', action: 'runSelfImprovement', description: 'View AI self-improvement events and calibration log', category: 'analytics', route: '/self-improve', icon: 'Activity', requiresRole: ['admin'] },
  { id: 'export', label: 'Export Data', action: 'exportData', description: 'Export cases, gold reviews, or audit data', category: 'analytics', route: '/gold-reviews', icon: 'Download', requiresRole: ['admin', 'physician'] },

  // ── Architecture ──────────────────────────────────────────────────────────
  { id: 'engine_registry', label: 'Engine Registry', action: 'viewEngineRegistry', description: 'Browse all 65+ engines across 12 architecture layers', category: 'architecture', route: '/engine-registry', icon: 'Cpu', requiresRole: ['admin', 'physician'] },
  { id: 'architecture_diagram', label: 'Architecture Diagram', action: 'viewArchitectureDiagram', description: 'Generate live Mermaid, ASCII, or DOT diagram of the architecture', category: 'architecture', apiEndpoint: '/api/meta-clinical/diagram', icon: 'Layers', requiresRole: ['admin', 'physician'], badgeText: 'NEW' },
  { id: 'visualize_path', label: 'Visualize Clinical Path', action: 'visualizePath', description: 'Generate node-edge graph from symptoms through diagnosis to disposition', category: 'architecture', apiEndpoint: '/api/meta-clinical/path', icon: 'GitBranch', requiresRole: ['admin', 'physician'] },
  { id: 'import_path', label: 'Import Clinical Path', action: 'importPath', description: 'Parse clinical pathway text (A -> B format) into graph edges', category: 'architecture', apiEndpoint: '/api/meta-clinical/import-path', icon: 'FileInput', requiresRole: ['admin'] },
  { id: 'knowledge_import', label: 'Clinical Knowledge Import', action: 'knowledgeImport', description: 'Extract graph edges from free-text clinical guidelines', category: 'architecture', apiEndpoint: '/api/meta-clinical/extract-knowledge', icon: 'Database', requiresRole: ['admin'] },

  // ── Simulation ────────────────────────────────────────────────────────────
  { id: 'run_simulation', label: 'Run Mass Simulation', action: 'runSimulation', description: 'Batch-run 100–1000 synthetic cases through the full brain pipeline', category: 'simulation', route: '/synthetic-testing', icon: 'FlaskConical', requiresRole: ['admin'] },
  { id: 'golden_cases', label: 'Manage Golden Cases', action: 'viewGoldenCases', description: 'Create, view, and validate expert-labeled test cases per complaint', category: 'simulation', route: '/golden-cases', icon: 'Target', requiresRole: ['admin', 'physician'] },
  { id: 'create_golden', label: 'Generate Golden Case', action: 'createGoldenCase', description: 'Build a new clinical validation case with complaint-specific fields', category: 'simulation', route: '/golden-cases', icon: 'PlusCircle', requiresRole: ['admin', 'physician'], badgeText: 'NEW' },

  // ── Administration ────────────────────────────────────────────────────────
  { id: 'admin_console', label: 'Admin Dashboard', action: 'exportData', description: 'System administration, organizations, and audit reports', category: 'administration', route: '/admin', icon: 'Shield', requiresRole: ['admin'] },
];

export function getButtonsByCategory(category: CapabilityButton['category']): CapabilityButton[] {
  return CAPABILITY_BUTTONS.filter((b) => b.category === category);
}

export function getButtonsForRole(role: 'admin' | 'physician'): CapabilityButton[] {
  return CAPABILITY_BUTTONS.filter((b) => b.requiresRole.includes(role));
}

export function getButtonById(id: string): CapabilityButton | undefined {
  return CAPABILITY_BUTTONS.find((b) => b.id === id);
}

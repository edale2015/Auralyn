import { getAllEngines, getEngineCounts } from './engineRegistry';

export const SystemModules = [
  'telemedicine_ui',
  'clinical_brain',
  'safety_layer',
  'diagnostic_layer',
  'conversation_layer',
  'physician_control',
  'learning_system',
  'data_layer',
  'integrations',
] as const;

export type SystemModule = typeof SystemModules[number];

export interface SystemReviewSuggestion {
  module: SystemModule | string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  suggestion: string;
  rationale: string;
  effort: 'small' | 'medium' | 'large';
  status: 'pending' | 'in_progress' | 'done';
}

export interface SystemReviewResult {
  reviewedAt: string;
  engineCounts: ReturnType<typeof getEngineCounts>;
  totalEngines: number;
  activeEngines: number;
  stubEngines: number;
  plannedEngines: number;
  suggestions: SystemReviewSuggestion[];
  nextPriorityModule: string;
  healthScore: number;
}

const STANDING_SUGGESTIONS: SystemReviewSuggestion[] = [
  { module: 'diagnostic_layer',   priority: 'high',   suggestion: 'Implement temporal symptom progression model',            rationale: 'Cases with changing symptom trajectory need time-series analysis beyond current snapshot scoring',     effort: 'large',  status: 'pending' },
  { module: 'diagnostic_layer',   priority: 'high',   suggestion: 'Add rare disease detection engine',                       rationale: 'Current Bayesian priors underweight low-prevalence conditions; zebra detection needs explicit module',  effort: 'medium', status: 'pending' },
  { module: 'conversation_layer', priority: 'medium', suggestion: 'Improve WhatsApp question compression',                   rationale: 'Multi-question turns reduce completion rate; compression engine reduces average turns by ~30%',       effort: 'small',  status: 'in_progress' },
  { module: 'conversation_layer', priority: 'medium', suggestion: 'Add conversation misunderstanding detector',              rationale: 'Contradictory patient answers are currently passed through without reconciliation',                   effort: 'medium', status: 'pending' },
  { module: 'learning_system',    priority: 'high',   suggestion: 'Connect physician corrections to Bayesian prior updates', rationale: 'PhysicianLearningEngine logs corrections but does not yet propagate them to differential priors',      effort: 'large',  status: 'pending' },
  { module: 'safety_layer',       priority: 'high',   suggestion: 'Complete pediatric safety engine',                        rationale: 'Under-5 triage requires different thresholds; current engine is stubbed',                            effort: 'medium', status: 'pending' },
  { module: 'data_layer',         priority: 'medium', suggestion: 'Add Firestore composite indexes for triage queries',      rationale: 'List queries with complaintId + severity filter are performing full table scans',                    effort: 'small',  status: 'pending' },
  { module: 'integrations',       priority: 'medium', suggestion: 'Cache OpenAI explanation responses',                      rationale: 'LLM explanation engine has avg 1.8s latency; similar complaints reuse the same explanation',         effort: 'small',  status: 'pending' },
  { module: 'diagnostic_layer',   priority: 'low',    suggestion: 'Add guideline compliance scoring overlay',                rationale: 'Currently checks guidelines but does not output a compliance % for physician review',                effort: 'medium', status: 'pending' },
  { module: 'learning_system',    priority: 'high',   suggestion: 'Build bias detection engine',                             rationale: 'Audit of dispositions by age/sex/ethnicity required for MHRA/FDA AI compliance',                    effort: 'large',  status: 'planned' },
  { module: 'clinical_brain',     priority: 'medium', suggestion: 'Implement performance monitor engine (P95 latency per engine)', rationale: 'No per-engine latency tracking in production; needed to identify bottlenecks',               effort: 'small',  status: 'pending' },
  { module: 'telemedicine_ui',    priority: 'low',    suggestion: 'Add Telegram Mini App real-form batching',                rationale: 'Current Telegram intake is sequential messages; Mini App can batch all questions into one form',      effort: 'medium', status: 'pending' },
];

export function runSystemReview(): SystemReviewResult {
  const counts = getEngineCounts();
  const all = getAllEngines();
  const active = all.filter((e) => e.status === 'active').length;
  const stub = all.filter((e) => e.status === 'stub').length;
  const planned = all.filter((e) => e.status === 'planned').length;

  const activePct = active / all.length;
  const healthScore = Math.round(activePct * 100);

  const criticalSuggestions = STANDING_SUGGESTIONS.filter((s) => s.priority === 'critical').length;
  const highSuggestions = STANDING_SUGGESTIONS.filter((s) => s.priority === 'high').length;

  const sortedSuggestions = [...STANDING_SUGGESTIONS].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });

  const nextModule = sortedSuggestions.find((s) => s.status === 'pending')?.module ?? 'learning_system';

  return {
    reviewedAt: new Date().toISOString(),
    engineCounts: counts,
    totalEngines: all.length,
    activeEngines: active,
    stubEngines: stub,
    plannedEngines: planned,
    suggestions: sortedSuggestions,
    nextPriorityModule: nextModule,
    healthScore,
  };
}

export function getModuleSuggestions(module: string): SystemReviewSuggestion[] {
  return STANDING_SUGGESTIONS.filter((s) => s.module === module);
}

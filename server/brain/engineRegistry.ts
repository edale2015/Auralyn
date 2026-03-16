export interface EngineDescriptor {
  name: string;
  description: string;
  status: 'active' | 'stub' | 'planned';
  filePath?: string;
  avgDurationMs?: number;
  layer: string;
}

export type EngineLevel = 'Safety' | 'Diagnostic' | 'Conversation' | 'PhysicianControl' | 'Learning' | 'SystemIntelligence';

export const EngineRegistry: Record<EngineLevel, EngineDescriptor[]> = {
  Safety: [
    { name: 'redFlagEngine',             description: 'Detects clinical red flags requiring immediate escalation',         status: 'active',  filePath: 'server/core/redFlagEngine.ts',            avgDurationMs: 12  },
    { name: 'riskThresholdEngine',        description: 'Evaluates composite risk score against disposition thresholds',     status: 'active',  filePath: 'server/core/riskThresholdEngine.ts',       avgDurationMs: 18  },
    { name: 'dispositionSafetyEngine',    description: 'Final safety gate before disposition is issued to patient',        status: 'active',  filePath: 'server/core/dispositionEngine.ts',         avgDurationMs: 8   },
    { name: 'sepsisAlertEngine',          description: 'SIRS/qSOFA screening for sepsis risk',                             status: 'active',  filePath: 'server/core/sepsisAlertEngine.ts',         avgDurationMs: 15  },
    { name: 'strokeAlertEngine',          description: 'FAST + Cincinnati stroke screen',                                  status: 'active',  filePath: 'server/core/strokeAlertEngine.ts',         avgDurationMs: 10  },
    { name: 'miAlertEngine',              description: 'Chest pain → ACS risk pathway (HEART score)',                      status: 'active',  filePath: 'server/core/miAlertEngine.ts',             avgDurationMs: 14  },
    { name: 'anaphylaxisAlertEngine',     description: 'Allergy + trigger + symptom triad detection',                      status: 'active',  filePath: 'server/core/anaphylaxisAlertEngine.ts',    avgDurationMs: 9   },
    { name: 'pediatricSafetyEngine',      description: 'Age-adjusted safety thresholds for paediatric patients',           status: 'stub',    filePath: 'server/core/pediatricSafetyEngine.ts',     avgDurationMs: 11  },
    { name: 'drugInteractionSafetyEngine',description: 'Cross-checks patient meds against known dangerous interactions',   status: 'stub',    avgDurationMs: 22 },
    { name: 'pregnancySafetyEngine',      description: 'Pregnancy-specific contraindications and escalation rules',        status: 'stub',    avgDurationMs: 13 },
  ],

  Diagnostic: [
    { name: 'bayesianDifferentialEngine', description: 'Prior + likelihood ratio → posterior probability for each Dx',     status: 'active',  filePath: 'server/core/bayesianDifferentialEngine.ts', avgDurationMs: 85  },
    { name: 'caseSimilarityEngine',       description: 'Embedding-space nearest-neighbour search across historical cases', status: 'active',  filePath: 'server/core/caseSimilarityEngine.ts',      avgDurationMs: 120 },
    { name: 'clusterScoringEngine',       description: 'Symptom cluster patterns matched to complaint archetypes',         status: 'active',  filePath: 'server/core/clusterScoringEngine.ts',      avgDurationMs: 45  },
    { name: 'guidelineComplianceEngine',  description: 'Scores differential against current CDC/NICE/UpToDate guidelines', status: 'active',  filePath: 'server/core/guidelineComplianceEngine.ts', avgDurationMs: 30  },
    { name: 'rareDiseaseEngine',          description: 'Flags low-prevalence conditions the standard pipeline may miss',   status: 'stub',    avgDurationMs: 55 },
    { name: 'temporalSymptomEngine',      description: 'Onset pattern + progression → acute vs subacute vs chronic',       status: 'active',  filePath: 'server/core/temporalAnalysisEngine.ts',    avgDurationMs: 25  },
    { name: 'symptomInteractionEngine',   description: 'Detects clinically meaningful symptom co-occurrence patterns',     status: 'active',  filePath: 'server/core/symptomInteractionEngine.ts',  avgDurationMs: 35  },
    { name: 'labProbabilityEngine',       description: 'Estimates pre-test probability to guide lab ordering',             status: 'stub',    avgDurationMs: 40 },
    { name: 'riskFactorEngine',           description: 'Demographic + comorbidity risk factor adjustment',                 status: 'active',  filePath: 'server/core/riskFactorEngine.ts',          avgDurationMs: 20  },
    { name: 'demographicAdjustmentEngine',description: 'Age + sex + BMI adjustments to disease probability priors',        status: 'active',  avgDurationMs: 12 },
    { name: 'comorbidityEngine',          description: 'Charlson comorbidity index + condition-specific risk weighting',   status: 'active',  avgDurationMs: 18 },
    { name: 'symptomWeightingEngine',     description: 'Information-gain weighting per symptom for the current complaint', status: 'active',  avgDurationMs: 22 },
    { name: 'epidemiologyAdjustmentEngine',description: 'Seasonal + geographic prevalence adjustment (flu season, etc.)', status: 'active',  filePath: 'server/core/epidemiologyEngine.ts',        avgDurationMs: 28  },
    { name: 'severityEstimatorEngine',    description: 'Composite severity score 0-100 from symptoms + vitals',            status: 'active',  avgDurationMs: 16 },
    { name: 'diseaseProgressionEngine',   description: 'Time-series modelling of symptom trajectory',                      status: 'stub',    avgDurationMs: 60 },
    { name: 'treatmentResponseEngine',    description: 'Prior treatments tried → differential probability adjustment',     status: 'stub',    avgDurationMs: 35 },
    { name: 'diagnosisConfidenceEngine',  description: 'Ensemble confidence from Bayes + similarity + cluster scores',     status: 'active',  avgDurationMs: 30 },
    { name: 'differentialPruningEngine',  description: 'Removes Dx candidates with <2% posterior probability',            status: 'active',  avgDurationMs: 8  },
    { name: 'diagnosticCoverageEngine',   description: 'Detects symptom domains not yet explored in the conversation',     status: 'active',  avgDurationMs: 22 },
    { name: 'edgeCaseDetector',           description: 'Flags unusual symptom combinations for physician attention',       status: 'stub',    avgDurationMs: 45 },
  ],

  Conversation: [
    { name: 'toneStrategyEngine',         description: 'Selects response tone from 6 strategies based on anxiety+severity', status: 'active', filePath: 'server/engines/toneStrategyEngine.ts',    avgDurationMs: 5  },
    { name: 'nextBestQuestionEngine',     description: 'Information-gain ranked next question selection',                  status: 'active', filePath: 'server/core/conversationNextBestQuestion.ts', avgDurationMs: 15 },
    { name: 'conversationPacingEngine',   description: 'Controls turn density and question frequency',                     status: 'stub',   avgDurationMs: 8  },
    { name: 'conversationCompressionEngine', description: 'Merges related questions into single multi-choice turns',      status: 'active', filePath: 'server/engines/conversationCompressionEngine.ts', avgDurationMs: 5 },
    { name: 'empathyEngine',              description: 'Injects empathetic language calibrated to patient state',          status: 'active', filePath: 'server/core/deEscalationEngine.ts',       avgDurationMs: 10 },
    { name: 'anxietyDetectionEngine',     description: 'Detects patient anxiety level from message sentiment + language',  status: 'active', avgDurationMs: 12 },
    { name: 'misunderstandingDetector',   description: 'Identifies confused or contradictory patient responses',           status: 'stub',   avgDurationMs: 18 },
    { name: 'clarificationEngine',        description: 'Generates targeted clarification requests for ambiguous answers',  status: 'stub',   avgDurationMs: 15 },
    { name: 'languageSimplifier',         description: 'Rewrites clinical language to plain patient-facing English',       status: 'active', avgDurationMs: 8  },
    { name: 'languageTranslator',         description: 'Real-time multilingual translation for non-English patients',      status: 'active', filePath: 'server/services/translationAdapter.ts',   avgDurationMs: 200},
    { name: 'conversationStateTracker',   description: 'Tracks which domains have been covered in the conversation',       status: 'active', filePath: 'server/channels/conversationState.ts',    avgDurationMs: 5  },
    { name: 'intentDetectionEngine',      description: 'Classifies patient intent (report symptom, ask question, etc.)',   status: 'stub',   avgDurationMs: 35 },
    { name: 'patientEducationEngine',     description: 'Generates condition-appropriate education snippets',               status: 'stub',   avgDurationMs: 40 },
    { name: 'summaryEngine',              description: 'Generates end-of-session symptom summary for physician',           status: 'active', avgDurationMs: 55 },
    { name: 'followUpQuestionEngine',     description: 'Schedules follow-up questions based on previous answers',          status: 'active', avgDurationMs: 12 },
  ],

  PhysicianControl: [
    { name: 'goldenCaseTrainer',          description: 'Saves physician-approved cases as AI training benchmarks',         status: 'active', filePath: 'server/services/goldenConversationBuilder.ts', avgDurationMs: 5  },
    { name: 'conversationAuditEngine',    description: 'Grades conversations A-F on empathy, completeness, safety',        status: 'active', filePath: 'server/core/conversationAuditEngine.ts',   avgDurationMs: 25 },
    { name: 'physicianOverrideEngine',    description: 'Injects physician note/question/tone into live AI session',        status: 'active', filePath: 'server/engines/physicianPromptOverrideEngine.ts', avgDurationMs: 3 },
    { name: 'manualDispositionOverride',  description: 'Physician sets final disposition directly overriding AI',          status: 'active', filePath: 'server/routes/review.ts',                 avgDurationMs: 2  },
    { name: 'physicianPromptOverride',    description: 'Augments AI system prompt with physician clinical context',        status: 'active', avgDurationMs: 3  },
    { name: 'physicianFeedbackCapture',   description: 'Records structured physician feedback per case decision',          status: 'active', filePath: 'server/services/reviewQueueService.ts',   avgDurationMs: 8  },
    { name: 'auditTrailEngine',           description: 'Immutable audit log of all AI decisions and physician actions',    status: 'active', filePath: 'server/services/engineRuntimeAuditLogger.ts', avgDurationMs: 5 },
    { name: 'legalComplianceEngine',      description: 'Validates all decisions against medicolegal documentation rules',  status: 'stub',   avgDurationMs: 15 },
    { name: 'clinicalExplanationEngine',  description: 'GPT-4o plain-language explanation of AI reasoning to physicians',  status: 'active', avgDurationMs: 1800},
    { name: 'physicianApprovalEngine',    description: 'Sign-off workflow with auto-expiry and reminder escalation',       status: 'active', filePath: 'server/services/signoffService.ts',        avgDurationMs: 5  },
  ],

  Learning: [
    { name: 'outcomeReinforcementEngine', description: 'RL reward signal from confirmed diagnosis + patient outcome',      status: 'active', filePath: 'server/services/outcomeMonitoring/',       avgDurationMs: 30 },
    { name: 'temporalPatternLearning',    description: 'Learns complaint-to-outcome patterns over time',                   status: 'stub',   avgDurationMs: 120},
    { name: 'conversationSuccessScoring', description: 'Scores conversations by downstream clinical accuracy',             status: 'active', avgDurationMs: 25 },
    { name: 'misdiagnosisDetector',       description: 'Flags cases where AI disposition differed from final Dx',          status: 'stub',   avgDurationMs: 45 },
    { name: 'questionImpactLearning',     description: 'Measures each question\'s diagnostic information gain',            status: 'active', filePath: 'server/routes/questionImpactDebug.ts',     avgDurationMs: 20 },
    { name: 'protocolImprovementEngine',  description: 'Suggests guideline updates based on aggregate case outcomes',      status: 'stub',   avgDurationMs: 60 },
    { name: 'physicianCorrectionLearning',description: 'Updates priors when physician corrects AI disposition',            status: 'active', filePath: 'server/engines/physicianLearningEngine.ts',avgDurationMs: 15 },
    { name: 'reinforcementRewardEngine',  description: 'Bandit-style reward propagation for conversation strategies',      status: 'stub',   avgDurationMs: 50 },
    { name: 'caseEmbeddingEngine',        description: 'Encodes case features into vector space (Pinecone)',               status: 'active', avgDurationMs: 180},
    { name: 'clusterLearningEngine',      description: 'Updates symptom cluster centroids from new cases',                 status: 'stub',   avgDurationMs: 90 },
    { name: 'adaptiveConfidenceEngine',   description: 'Recalibrates model confidence based on empirical accuracy',        status: 'stub',   avgDurationMs: 35 },
    { name: 'caseDriftDetection',         description: 'Detects when case distributions shift from training data',          status: 'stub',   avgDurationMs: 45 },
    { name: 'feedbackLoopEngine',         description: 'Closes the loop: patient outcome → model update',                  status: 'stub',   avgDurationMs: 60 },
    { name: 'rareOutcomeLearning',        description: 'Amplifies signal from rare but critical clinical outcomes',         status: 'stub',   avgDurationMs: 80 },
    { name: 'clinicalMemoryEngine',       description: 'Persistent cross-session patient memory for chronic conditions',   status: 'stub',   avgDurationMs: 25 },
  ],

  SystemIntelligence: [
    { name: 'clinicalSkillEngine',        description: 'Resolves required medical skills for a complaint',                 status: 'active', filePath: 'server/engines/clinicalSkillEngine.ts',    avgDurationMs: 5  },
    { name: 'protocolSelectionEngine',    description: 'Maps complaint to CDC/NICE/ACEP guideline protocol',               status: 'active', filePath: 'server/engines/protocolSelectionEngine.ts',avgDurationMs: 3  },
    { name: 'confidenceCalibrationEngine',description: 'Dampens over-confidence and lifts under-confidence scores',        status: 'active', filePath: 'server/engines/confidenceCalibrationEngine.ts', avgDurationMs: 3 },
    { name: 'clinicalSimulationEngine',   description: 'Generates synthetic cases for regression and load testing',        status: 'active', filePath: 'server/engines/clinicalSimulationEngine.ts',avgDurationMs: 8  },
    { name: 'physicianLearningEngine',    description: 'Applies physician corrections to future case priors',              status: 'active', filePath: 'server/engines/physicianLearningEngine.ts',avgDurationMs: 5  },
    { name: 'systemReviewEngine',         description: 'Periodic architecture self-review and improvement suggestion',     status: 'active', filePath: 'server/brain/systemReviewEngine.ts',       avgDurationMs: 15 },
    { name: 'engineTraceLogger',          description: 'Ring-buffer trace log of all engine calls with timing',            status: 'active', filePath: 'server/engines/engineTraceLogger.ts',      avgDurationMs: 1  },
    { name: 'engineRegistryManager',      description: 'Runtime registry of all 100 engines with status + metadata',      status: 'active', filePath: 'server/brain/engineRegistry.ts',           avgDurationMs: 2  },
    { name: 'clinicalBrainOrchestrator',  description: 'Plugin pipeline orchestrator: registers and sequences engines',    status: 'active', filePath: 'server/brain/clinicalBrain.ts',            avgDurationMs: 5  },
    { name: 'skillGraphEngine',           description: 'Graph of skills required per complaint for engine selection',      status: 'active', filePath: 'server/brain/skillGraph.ts',               avgDurationMs: 3  },
    { name: 'protocolComplianceEngine',   description: 'Validates each case run against selected guideline requirements',  status: 'stub',   avgDurationMs: 20 },
    { name: 'performanceMonitorEngine',   description: 'Tracks P50/P95/P99 latency per engine in production',              status: 'stub',   avgDurationMs: 5  },
    { name: 'loadBalancerEngine',         description: 'Distributes concurrent case load across available workers',         status: 'planned',avgDurationMs: 2  },
    { name: 'caseReplayEngine',           description: 'Reconstructs per-step decision trace for any historical case',     status: 'active', filePath: 'server/engines/decisionReplayEngine.ts',   avgDurationMs: 30 },
    { name: 'decisionGraphEngine',        description: 'React Flow directed graph of a case replay',                       status: 'active', filePath: 'client/src/components/DecisionGraph.tsx',  avgDurationMs: 0  },
    { name: 'questionImpactAnalyzer',     description: 'Ranks questions by information gain per complaint',                status: 'active', filePath: 'server/routes/questionImpactDebug.ts',     avgDurationMs: 8  },
    { name: 'trainingDatasetBuilder',     description: 'Exports golden cases as structured ML training datasets',          status: 'stub',   avgDurationMs: 120},
    { name: 'modelEvaluationEngine',      description: 'Offline evaluation of AI model accuracy on holdout set',           status: 'stub',   avgDurationMs: 5000},
    { name: 'deploymentSafetyEngine',     description: 'Pre-deployment regression + smoke tests before release',           status: 'active', filePath: 'server/services/workflowSmokeTestService.ts',avgDurationMs: 2000},
    { name: 'apiHealthMonitor',           description: 'Monitors external API availability (OpenAI, Twilio, Sheets)',       status: 'active', filePath: 'server/services/healthcheckService.ts',    avgDurationMs: 300},
    { name: 'dataIntegrityEngine',        description: 'Cross-validates Firestore records for consistency',                status: 'stub',   avgDurationMs: 180},
    { name: 'securityAuditEngine',        description: 'Logs auth events, role violations, and suspicious access',         status: 'active', avgDurationMs: 2  },
    { name: 'latencyMonitorEngine',       description: 'End-to-end latency tracking for each channel + pipeline',          status: 'stub',   avgDurationMs: 5  },
    { name: 'clinicalBenchmarkEngine',    description: 'Benchmarks AI against published clinical decision tools',          status: 'stub',   avgDurationMs: 500},
    { name: 'biasDetectionEngine',        description: 'Detects demographic bias in dispositions across age/sex/ethnicity', status: 'stub',  avgDurationMs: 90 },
    { name: 'systemImprovementEngine',    description: 'GPT-4o generated improvement suggestions from usage patterns',     status: 'active', avgDurationMs: 2000},
    { name: 'architectureReviewEngine',   description: 'Periodic full architecture review with priority recommendations',  status: 'active', filePath: 'server/brain/systemReviewEngine.ts',       avgDurationMs: 15 },
    { name: 'knowledgeBaseEngine',        description: 'PubMed + UpToDate knowledge ingestion pipeline',                   status: 'active', filePath: 'server/research/researchPipelineController.ts', avgDurationMs: 3000},
    { name: 'agentCoordinationEngine',    description: 'MS Agent Framework multi-agent coordination layer',                status: 'active', filePath: 'server/services/agents/',                  avgDurationMs: 25 },
    { name: 'crossModuleConsistencyEngine',description: 'Validates that engine outputs are consistent across modules',     status: 'stub',   avgDurationMs: 40 },
  ],
};

export function getAllEngines(): EngineDescriptor[] {
  return Object.values(EngineRegistry).flat();
}

export function getEnginesByLevel(level: EngineLevel): EngineDescriptor[] {
  return EngineRegistry[level] ?? [];
}

export function getEngineByName(name: string): EngineDescriptor | null {
  return getAllEngines().find((e) => e.name === name) ?? null;
}

export function getEngineCounts(): Record<EngineLevel, { total: number; active: number; stub: number; planned: number }> {
  const result = {} as any;
  for (const [level, engines] of Object.entries(EngineRegistry)) {
    result[level] = {
      total: engines.length,
      active: engines.filter((e) => e.status === 'active').length,
      stub: engines.filter((e) => e.status === 'stub').length,
      planned: engines.filter((e) => e.status === 'planned').length,
    };
  }
  return result;
}

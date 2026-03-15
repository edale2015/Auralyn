export type EngineLayer =
  | 'input'
  | 'integrity'
  | 'evidence'
  | 'hypothesis'
  | 'reasoning'
  | 'planning'
  | 'governance'
  | 'action'
  | 'learning'
  | 'simulation'
  | 'advanced'
  | 'coordination';

export interface EngineEntry {
  id: string;
  label: string;
  layer: EngineLayer;
  file: string;
  exportedFn: string;
  description: string;
  status: 'live' | 'stub' | 'planned';
  inputTypes: string[];
  outputTypes: string[];
  dependencies: string[];
}

export const ENGINE_REGISTRY: EngineEntry[] = [
  // ─── Input Layer ─────────────────────────────────────────────────────────
  { id: 'symptomNormalization', label: 'Symptom Normalization', layer: 'input', file: 'server/core/symptomNormalizationEngine.ts', exportedFn: 'normalizeSymptoms', description: 'Maps raw symptom text to canonical terms', status: 'live', inputTypes: ['string[]'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'symptomOntology', label: 'Symptom Ontology', layer: 'input', file: 'server/core/symptomOntologyEngine.ts', exportedFn: 'symptomOntology.normalizeList', description: 'OOP ontology with synonym expansion for medical concepts', status: 'live', inputTypes: ['string[]'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'complaintAlias', label: 'Complaint Alias Registry', layer: 'input', file: 'server/skills/reasoning/generateDifferential.ts', exportedFn: 'buildComplaintAliases', description: 'Multi-language complaint alias matching', status: 'live', inputTypes: ['string'], outputTypes: ['Set<string>'], dependencies: [] },
  { id: 'enginesNormalization', label: 'Engines Symptom Normalizer', layer: 'input', file: 'server/core/engines/symptomNormalizationEngine.ts', exportedFn: 'normalizeSymptoms', description: 'Superbrain symptom normalizer with extended synonym map', status: 'live', inputTypes: ['string[]'], outputTypes: ['string[]'], dependencies: [] },

  // ─── Integrity Layer ──────────────────────────────────────────────────────
  { id: 'contradiction', label: 'Contradiction Engine', layer: 'integrity', file: 'server/core/contradictionEngine.ts', exportedFn: 'runContradictionEngine', description: 'Detects logically inconsistent symptom combinations', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['ContradictionFinding[]'], dependencies: [] },
  { id: 'complaintCompleteness', label: 'Complaint Completeness', layer: 'integrity', file: 'server/core/complaintCompletenessEngine.ts', exportedFn: 'runComplaintCompletenessEngine', description: 'Checks if all required questions have been answered', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['CompletenessResult'], dependencies: [] },
  { id: 'brainContradiction', label: 'Brain Contradiction Engine', layer: 'integrity', file: 'server/core/brain/contradictionEngine.ts', exportedFn: 'runContradictionEngine', description: 'Brain-namespace contradiction detector with RankedItem output', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['RankedItem[]'], dependencies: [] },

  // ─── Evidence Layer ───────────────────────────────────────────────────────
  { id: 'clinicalGraph', label: 'Clinical Graph Engine', layer: 'evidence', file: 'server/core/clinicalGraphEngine.ts', exportedFn: 'runKnowledgeGraphEngine', description: 'OOP graph engine for symptom→diagnosis relationship traversal', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['DifferentialScore[]'], dependencies: ['clinicalKnowledgeGraph'] },
  { id: 'knowledgeGraph', label: 'Knowledge Graph Engine', layer: 'evidence', file: 'server/core/knowledgeGraphEngine.ts', exportedFn: 'runKnowledgeGraphEngine', description: 'Knowledge graph differential scoring from symptoms', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['GraphResult'], dependencies: [] },
  { id: 'bayesianDiff', label: 'Bayesian Differential', layer: 'evidence', file: 'server/core/differentialProbabilityEngine.ts', exportedFn: 'runBayesianDifferentialEngine', description: 'Bayesian posterior probability for diagnoses given symptoms', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['BayesianResult'], dependencies: [] },
  { id: 'caseSimilarity', label: 'Case Similarity Engine', layer: 'evidence', file: 'server/core/caseSimilarityEngine.ts', exportedFn: 'runCaseSimilarityEngine', description: 'Jaccard similarity against historical case memory', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['SimilarityResult'], dependencies: ['clinicalMemory'] },
  { id: 'literatureEvidence', label: 'Literature Evidence Engine', layer: 'evidence', file: 'server/core/engines/literatureEvidenceEngine.ts', exportedFn: 'literatureEvidenceEngine', description: 'Evidence-based literature symptom→diagnosis mapping', status: 'live', inputTypes: ['string[]'], outputTypes: ['EngineScore[]'], dependencies: [] },
  { id: 'enginesBayesian', label: 'Engines Bayesian', layer: 'evidence', file: 'server/core/engines/bayesianEngine.ts', exportedFn: 'bayesianEngine', description: 'Superbrain Bayesian engine with ranked symptom-dx map', status: 'live', inputTypes: ['string[]'], outputTypes: ['EngineScore[]'], dependencies: [] },

  // ─── Hypothesis Layer ─────────────────────────────────────────────────────
  { id: 'evidenceAggregator', label: 'Evidence Aggregator', layer: 'hypothesis', file: 'server/core/evidenceAggregatorEngine.ts', exportedFn: 'runEvidenceAggregatorEngine', description: 'Weighted merge of Bayesian, similarity, and graph scores', status: 'live', inputTypes: ['BayesianResult', 'SimilarityResult', 'GraphResult'], outputTypes: ['DifferentialScore[]'], dependencies: [] },
  { id: 'diffExpansion', label: 'Differential Expansion', layer: 'hypothesis', file: 'server/core/engines/differentialExpansionEngine.ts', exportedFn: 'differentialExpansionEngine', description: 'Expands primary differentials to related diagnoses', status: 'live', inputTypes: ['EngineScore[]'], outputTypes: ['EngineScore[]'], dependencies: [] },
  { id: 'coverageGap', label: 'Coverage Gap Engine', layer: 'hypothesis', file: 'server/core/coverageGapEngine.ts', exportedFn: 'runCoverageGapEngine', description: 'Identifies gaps in differential coverage', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'diagnosticEvidence', label: 'Diagnostic Evidence Engine', layer: 'hypothesis', file: 'server/core/diagnosticEvidenceEngine.ts', exportedFn: 'runDiagnosticEvidenceEngine', description: 'Aggregates multi-source diagnostic evidence', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['RankedItem[]'], dependencies: [] },

  // ─── Reasoning Layer ──────────────────────────────────────────────────────
  { id: 'uncertainty', label: 'Uncertainty Engine', layer: 'reasoning', file: 'server/core/uncertaintyEngine.ts', exportedFn: 'runUncertaintyEngine', description: 'Shannon entropy over differential distribution', status: 'live', inputTypes: ['DifferentialScore[]'], outputTypes: ['UncertaintyResult'], dependencies: [] },
  { id: 'temporalProgression', label: 'Temporal Progression', layer: 'reasoning', file: 'server/core/temporalProgressionEngine.ts', exportedFn: 'runTemporalProgressionEngine', description: 'Timeline analysis of symptom progression', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['TemporalResult'], dependencies: [] },
  { id: 'temporalReasoning', label: 'Temporal Reasoning Engine', layer: 'reasoning', file: 'server/core/temporalReasoningEngine.ts', exportedFn: 'temporalReasoningEngine', description: 'Hyperacute/acute/subacute/chronic pattern classification with urgency boost', status: 'live', inputTypes: ['CaseData'], outputTypes: ['TemporalResult'], dependencies: [] },
  { id: 'diagnosticCalibration', label: 'Diagnostic Calibration Engine', layer: 'reasoning', file: 'server/core/diagnosticCalibrationEngine.ts', exportedFn: 'diagnosticCalibrationEngine', description: 'Prevents overconfidence via score normalization + softmax', status: 'live', inputTypes: ['DifferentialScore[]'], outputTypes: ['CalibratedDifferential[]'], dependencies: [] },
  { id: 'diagConfidenceCalibration', label: 'Confidence Calibration Engine', layer: 'reasoning', file: 'server/core/diagnosticConfidenceCalibrationEngine.ts', exportedFn: 'calibrateDiagnosticConfidence', description: 'Caps scores above 85% to prevent overconfidence', status: 'live', inputTypes: ['DifferentialScore[]'], outputTypes: ['DifferentialScore[]'], dependencies: [] },
  { id: 'engineConfidence', label: 'Engines Confidence Engine', layer: 'reasoning', file: 'server/core/engines/diagnosticConfidenceEngine.ts', exportedFn: 'diagnosticConfidenceEngine', description: 'High/moderate/low confidence classification', status: 'live', inputTypes: ['EngineScore[]', 'number'], outputTypes: ['string'], dependencies: [] },
  { id: 'metaReasoning', label: 'Meta-Reasoning Engine', layer: 'reasoning', file: 'server/core/engines/metaReasoningEngine.ts', exportedFn: 'metaReasoningEngine', description: 'Identifies system-level reasoning gaps (no tests, high entropy)', status: 'live', inputTypes: ['ReasoningState'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'diagnosticDrift', label: 'Diagnostic Drift Engine', layer: 'reasoning', file: 'server/core/diagnosticDriftEngine.ts', exportedFn: 'runDiagnosticDriftEngine', description: 'Detects divergence from prior session differentials', status: 'live', inputTypes: ['DifferentialScore[]', 'DifferentialScore[]'], outputTypes: ['DriftResult'], dependencies: [] },
  { id: 'multiAgentDebate', label: 'Multi-Agent Diagnostic Debate', layer: 'reasoning', file: 'server/core/multiAgentDiagnosticDebateEngine.ts', exportedFn: 'runMultiAgentDiagnosticDebateEngine', description: '5 specialty agents vote and debate differential hypotheses', status: 'live', inputTypes: ['BrainCaseInput', 'DifferentialScore[]'], outputTypes: ['DebateResult'], dependencies: [] },

  // ─── Planning Layer ───────────────────────────────────────────────────────
  { id: 'nextBestQuestion', label: 'Next Best Question Engine', layer: 'planning', file: 'server/core/nextBestQuestionEngine.ts', exportedFn: 'runNextBestQuestionEngine', description: 'Prioritizes unanswered questions by diagnostic value', status: 'live', inputTypes: ['BrainCaseInput', 'DifferentialScore[]'], outputTypes: ['QuestionScore[]'], dependencies: [] },
  { id: 'testRecommendation', label: 'Test Recommendation Engine', layer: 'planning', file: 'server/core/testRecommendationEngine.ts', exportedFn: 'runTestRecommendationEngine', description: 'Recommends diagnostic tests for top differentials', status: 'live', inputTypes: ['string[]'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'testYield', label: 'Test Yield Engine', layer: 'planning', file: 'server/core/testYieldEngine.ts', exportedFn: 'runTestYieldEngine', description: 'Scores diagnostic yield vs cost for test ordering', status: 'live', inputTypes: ['BrainCaseInput', 'string[]'], outputTypes: ['RankedItem[]'], dependencies: [] },
  { id: 'treatmentRecommendation', label: 'Treatment Recommendation', layer: 'planning', file: 'server/core/treatmentRecommendationEngine.ts', exportedFn: 'runTreatmentRecommendationEngine', description: 'Maps diagnoses to first-line treatments', status: 'live', inputTypes: ['string[]'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'returnPrecaution', label: 'Return Precaution Engine', layer: 'planning', file: 'server/core/returnPrecautionEngine.ts', exportedFn: 'runReturnPrecautionEngine', description: 'Generates return precaution instructions per diagnosis', status: 'live', inputTypes: ['string[]'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'actionPlanning', label: 'Action Planning Engine', layer: 'planning', file: 'server/core/engines/actionPlanningEngine.ts', exportedFn: 'actionPlanningEngine', description: 'Generates tests + treatments + precautions action plan', status: 'live', inputTypes: ['string'], outputTypes: ['ActionPlan'], dependencies: [] },
  { id: 'telepresencePlanning', label: 'Telepresence Planning', layer: 'planning', file: 'server/services/telepresence/telepresenceOrchestrator.ts', exportedFn: 'buildTelepresenceSessionPlan', description: 'Selects devices and checklist for telepresence session', status: 'live', inputTypes: ['string'], outputTypes: ['TelepresenceSessionPlan'], dependencies: [] },
  { id: 'physicianAssistCopilot', label: 'Physician Assist Copilot', layer: 'planning', file: 'server/core/physicianAssistCopilotEngine.ts', exportedFn: 'runPhysicianAssistCopilotEngine', description: 'Auto-generates HPI, A/P, and clinical note with ICD-10 codes', status: 'live', inputTypes: ['BrainCaseInput', 'DifferentialScore[]', 'Disposition'], outputTypes: ['CopilotNote'], dependencies: [] },

  // ─── Governance Layer ─────────────────────────────────────────────────────
  { id: 'safetyGuard', label: 'Clinical Safety Guard', layer: 'governance', file: 'server/core/clinicalSafetyGuard.ts', exportedFn: 'runClinicalSafetyGuard', description: 'Hard rule-based safety triggers for life-threatening presentations', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['SafetyGuardResult'], dependencies: [] },
  { id: 'severityScoring', label: 'Severity Scoring Engine', layer: 'governance', file: 'server/core/severityScoringEngine.ts', exportedFn: 'runSeverityScoringEngine', description: 'Multi-factor severity score from vitals and symptoms', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['SeverityScoreResult'], dependencies: [] },
  { id: 'protocolVariance', label: 'Protocol Variance Engine', layer: 'governance', file: 'server/core/protocolVarianceEngine.ts', exportedFn: 'runProtocolVarianceEngine', description: 'Detects deviations from standard care protocols', status: 'live', inputTypes: ['string', 'string[]', 'Disposition'], outputTypes: ['VarianceResult'], dependencies: [] },
  { id: 'supervisor', label: 'Supervisor Engine', layer: 'governance', file: 'server/core/supervisorEngine.ts', exportedFn: 'runSupervisorEngine', description: 'PASS/ESCALATE/BLOCK decision based on BrainOutput', status: 'live', inputTypes: ['BrainOutput'], outputTypes: ['SupervisorDecision'], dependencies: [] },
  { id: 'clinicalSupervisor', label: 'Clinical Supervisor Engine', layer: 'governance', file: 'server/core/clinicalSupervisorEngine.ts', exportedFn: 'runClinicalSupervisorEngine', description: 'Clinical-domain supervisor with contradiction and safety checks', status: 'live', inputTypes: ['BrainOutput'], outputTypes: ['SupervisorDecision'], dependencies: [] },
  { id: 'unifiedGovernance', label: 'Unified Clinical Governance', layer: 'governance', file: 'server/core/unifiedClinicalGovernanceEngine.ts', exportedFn: 'runUnifiedClinicalGovernanceEngine', description: 'Aggregates all governance signals into final PASS/ESCALATE/BLOCK', status: 'live', inputTypes: ['GovernanceSignals'], outputTypes: ['GovernanceResult'], dependencies: [] },
  { id: 'dispositionCalibration', label: 'Disposition Calibration', layer: 'governance', file: 'server/core/dispositionCalibrationEngine.ts', exportedFn: 'runDispositionCalibrationEngine', description: 'Adjusts disposition based on governance and confidence', status: 'live', inputTypes: ['string', 'number', 'Disposition', 'GovernanceSignals'], outputTypes: ['Disposition'], dependencies: [] },
  { id: 'finalDispositionOverride', label: 'Final Disposition Override', layer: 'governance', file: 'server/core/finalDispositionOverrideLogic.ts', exportedFn: 'applyFinalDispositionOverrideLogic', description: 'Last-pass override logic for safety and supervisor decisions', status: 'live', inputTypes: ['Disposition', 'OverrideOpts'], outputTypes: ['Disposition'], dependencies: [] },
  { id: 'guidelineAdherence', label: 'Guideline Adherence Engine', layer: 'governance', file: 'server/core/guidelineAdherenceEngine.ts', exportedFn: 'runGuidelineAdherenceEngine', description: 'Checks compliance with evidence-based clinical guidelines', status: 'live', inputTypes: ['BrainCaseInput', 'string[]'], outputTypes: ['string[]'], dependencies: [] },
  { id: 'guidelineEngine', label: 'Clinical Guideline Engine', layer: 'governance', file: 'server/core/guidelineEngine.ts', exportedFn: 'guidelineEngine', description: 'Executes evidence-based protocols (Centor, CURB-65, Wells)', status: 'live', inputTypes: ['CaseData'], outputTypes: ['GuidelineResult'], dependencies: [] },
  { id: 'medicationSafety', label: 'Medication Safety Engine', layer: 'governance', file: 'server/core/medicationSafetyEngine.ts', exportedFn: 'runMedicationSafetyEngine', description: 'Allergy and interaction checks for treatment plans', status: 'live', inputTypes: ['BrainCaseInput', 'string[]'], outputTypes: ['MedicationSafetyResult'], dependencies: [] },
  { id: 'patientRiskStratification', label: 'Patient Risk Stratification', layer: 'governance', file: 'server/core/patientRiskStratificationEngine.ts', exportedFn: 'runPatientRiskStratificationEngine', description: 'Age + comorbidity risk tier assignment', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['RiskTier'], dependencies: [] },
  { id: 'enginesSupervisor', label: 'Engines Supervisor', layer: 'governance', file: 'server/core/engines/supervisorEngine.ts', exportedFn: 'supervisorEngine', description: 'Superbrain supervisor — entropy + severity gating', status: 'live', inputTypes: ['EntropyAndSeverity'], outputTypes: ['Decision'], dependencies: [] },

  // ─── Action Layer ─────────────────────────────────────────────────────────
  { id: 'physicianReviewPacket', label: 'Physician Review Packet', layer: 'action', file: 'server/core/physicianReviewPacketEngine.ts', exportedFn: 'runPhysicianReviewPacketEngine', description: 'Assembles structured review packet for physician sign-off', status: 'live', inputTypes: ['BrainOutput'], outputTypes: ['ReviewPacket'], dependencies: [] },
  { id: 'coordinationLayer', label: 'Clinical Intelligence Coordination', layer: 'action', file: 'server/core/clinicalIntelligenceCoordinationLayer.ts', exportedFn: 'runClinicalIntelligenceCoordinationLayer', description: 'Thin wrapper: runs brain then supervisor, returns CoordinationOutput', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['CoordinationOutput'], dependencies: ['clinicalBrain', 'supervisor'] },
  { id: 'ekgDevice', label: 'EKG Device Adapter', layer: 'action', file: 'server/services/devices/ekgDevice.ts', exportedFn: 'runEKG', description: 'ECG device integration for 12-lead acquisition and rhythm analysis', status: 'stub', inputTypes: [], outputTypes: ['EKGResult'], dependencies: [] },

  // ─── Learning Layer ───────────────────────────────────────────────────────
  { id: 'clinicalMemory', label: 'Clinical Memory Engine', layer: 'learning', file: 'server/core/clinicalMemoryEngine.ts', exportedFn: 'retrieveSimilarCases', description: 'NDJSON-backed case memory with Jaccard similarity retrieval', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['MemoryMatch[]'], dependencies: ['utils'] },
  { id: 'physicianFeedbackLearning', label: 'Physician Feedback Learning', layer: 'learning', file: 'server/core/physicianFeedbackLearningEngine.ts', exportedFn: 'runPhysicianFeedbackLearningEngine', description: 'Ingests physician overrides to update differential weights', status: 'live', inputTypes: ['FeedbackRecord'], outputTypes: ['void'], dependencies: [] },
  { id: 'selfImprovement', label: 'Self-Improvement Engine', layer: 'learning', file: 'server/core/selfImprovementEngine.ts', exportedFn: 'logSelfImprovementEvent', description: 'Logs improvement events with summarization', status: 'live', inputTypes: ['EventRecord'], outputTypes: ['void'], dependencies: [] },
  { id: 'continuousGraphLearning', label: 'Continuous Graph Learning', layer: 'learning', file: 'server/core/continuousGraphLearningEngine.ts', exportedFn: 'recordLearnedEdge', description: 'Automatically expands clinical graph from case outcomes', status: 'live', inputTypes: ['LearnedEdge'], outputTypes: ['void'], dependencies: [] },
  { id: 'knowledgeGraphExpansion', label: 'Knowledge Graph Expansion', layer: 'learning', file: 'server/core/clinicalKnowledgeGraphExpansionEngine.ts', exportedFn: 'runClinicalKnowledgeGraphExpansionEngine', description: 'Candidate row ingestion for graph expansion', status: 'live', inputTypes: ['string[]', 'SheetRow[]'], outputTypes: ['ExpansionResult'], dependencies: [] },
  { id: 'domainGeneralization', label: 'Domain Generalization Engine', layer: 'learning', file: 'server/core/generalization/domainGeneralizationEngine.ts', exportedFn: 'runDomainGeneralizationEngine', description: 'Extends architecture to non-clinical domains (legal, IT)', status: 'live', inputTypes: ['GenericCaseInput'], outputTypes: ['FeatureVector'], dependencies: [] },

  // ─── Simulation Layer ─────────────────────────────────────────────────────
  { id: 'scenarioGenerator', label: 'Scenario Generator', layer: 'simulation', file: 'server/testing/scenarioGenerator.ts', exportedFn: 'scenarioGenerator', description: 'Generates random clinical test scenarios for mass simulation', status: 'live', inputTypes: ['number'], outputTypes: ['SuperBrainInput[]'], dependencies: [] },
  { id: 'massSimulation', label: 'Mass Simulation Engine', layer: 'simulation', file: 'server/testing/massSimulationEngine.ts', exportedFn: 'massSimulationEngine', description: 'Batch-runs scenarios through SuperBrain with summary statistics', status: 'live', inputTypes: ['SuperBrainInput[]'], outputTypes: ['SimulationSummary'], dependencies: ['scenarioGenerator', 'clinicalSuperBrain'] },

  // ─── Advanced Layer ───────────────────────────────────────────────────────
  { id: 'outcomePrediction', label: 'Outcome Prediction Engine', layer: 'advanced', file: 'server/core/outcomePredictionEngine.ts', exportedFn: 'runOutcomePredictionEngine', description: 'Predicts hospitalization, ICU, and return visit risk', status: 'live', inputTypes: ['DifferentialScore[]', 'PatientProfile', 'number', 'Disposition'], outputTypes: ['OutcomePrediction'], dependencies: [] },
  { id: 'patientRiskForecast', label: 'Patient Risk Forecast Engine', layer: 'advanced', file: 'server/core/patientRiskForecastEngine.ts', exportedFn: 'runPatientRiskForecastEngine', description: 'MEWS-based deterioration risk with monitoring recommendations', status: 'live', inputTypes: ['string[]', 'Vitals', 'PatientProfile', 'number'], outputTypes: ['RiskForecast'], dependencies: [] },

  // ─── Coordination Layer (Brain Orchestrators) ─────────────────────────────
  { id: 'clinicalBrain', label: 'Clinical Brain Engine (Mega)', layer: 'coordination', file: 'server/core/clinicalBrainEngine.ts', exportedFn: 'runClinicalBrainEngine', description: '20-step mega-bundle pipeline: normalize→contradict→memory→graph→bayesian→aggregate→uncertainty→questions→severity→governance→disposition→treatments→tests', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['BrainOutput'], dependencies: ['all_core_engines'] },
  { id: 'brainCoordinator', label: 'Brain Coordinator (v2)', layer: 'coordination', file: 'server/core/brain/coordinator.ts', exportedFn: 'runBrainCoordinator', description: '25-step v2 pipeline with RankedItem type system and Wave 7 governance', status: 'live', inputTypes: ['BrainCaseInput'], outputTypes: ['CoordinatorOutput'], dependencies: ['all_brain_engines'] },
  { id: 'clinicalSuperBrain', label: 'Clinical Super Brain', layer: 'coordination', file: 'server/core/clinicalSuperBrain.ts', exportedFn: 'runClinicalSuperBrain', description: 'Superbundle pipeline: normalize→bayes→similarity→literature→expand→entropy→confidence→severity→supervisor→meta→action', status: 'live', inputTypes: ['SuperBrainInput'], outputTypes: ['SuperBrainOutput'], dependencies: ['engines/*'] },

  // ─── Step-10 Expansion (Meta-Clinical Controller + Visualization) ────────
  { id: 'metaClinicalIntelligence', label: 'Meta-Clinical Intelligence', layer: 'reasoning', file: 'server/core/metaClinicalIntelligenceEngine.ts', exportedFn: 'metaClinicalIntelligenceEngine', description: 'Monitors reasoning state and dynamically adjusts engine weights (entropy, similarity, safety)', status: 'live', inputTypes: ['ReasoningState'], outputTypes: ['MetaClinicalResult'], dependencies: [] },
  { id: 'longitudinalPatient', label: 'Longitudinal Patient Engine', layer: 'learning', file: 'server/core/longitudinalPatientEngine.ts', exportedFn: 'longitudinalPatientEngine', description: 'Tracks patient progression across visits — first_visit, stable, worsening, persistent, improving', status: 'live', inputTypes: ['VisitRecord', 'VisitRecord[]'], outputTypes: ['LongitudinalResult'], dependencies: [] },
  { id: 'clinicalKnowledgeExtraction', label: 'Clinical Knowledge Extraction', layer: 'learning', file: 'server/core/clinicalKnowledgeExtractionEngine.ts', exportedFn: 'clinicalKnowledgeExtractionEngine', description: 'Extracts graph edges from free-text clinical guidelines using NLP pattern matching', status: 'live', inputTypes: ['string'], outputTypes: ['ExtractedEdge[]'], dependencies: [] },
  { id: 'telepresenceController', label: 'Telepresence Controller', layer: 'action', file: 'server/services/telepresence/telepresenceController.ts', exportedFn: 'telepresenceController', description: 'Generates prioritized device activation commands for a telepresence session', status: 'live', inputTypes: ['TelepresencePlan'], outputTypes: ['TelepresenceControlPlan'], dependencies: [] },
  { id: 'clinicalPathVisualizer', label: 'Clinical Path Visualizer', layer: 'action', file: 'server/core/clinicalPathVisualizer.ts', exportedFn: 'clinicalPathVisualizer', description: 'Creates Cytoscape/Mermaid node-edge graph from symptoms through diagnosis to disposition', status: 'live', inputTypes: ['string[]', 'DifferentialScore[]', 'string[]', 'string[]', 'string'], outputTypes: ['ClinicalPathGraph'], dependencies: [] },
  { id: 'clinicalPathImporter', label: 'Clinical Path Importer', layer: 'input', file: 'server/core/clinicalPathImporter.ts', exportedFn: 'clinicalPathImporter', description: 'Parses structured clinical pathway text (A -> B syntax) into graph edges', status: 'live', inputTypes: ['string'], outputTypes: ['ImportResult'], dependencies: [] },
  { id: 'architectureDiagram', label: 'Architecture Diagram Engine', layer: 'coordination', file: 'server/core/architectureDiagramEngine.ts', exportedFn: 'architectureDiagramEngine', description: 'Generates live Mermaid, ASCII, DOT, or JSON diagram of the full system architecture', status: 'live', inputTypes: ['DiagramFormat'], outputTypes: ['DiagramResult'], dependencies: ['engineRegistry'] },
  { id: 'metaClinicalController', label: 'Meta-Clinical Controller', layer: 'coordination', file: 'server/core/metaClinicalController.ts', exportedFn: 'metaClinicalController', description: 'Top-level async orchestrator: meta-intelligence + guidelines + longitudinal + telepresence + path visualization', status: 'live', inputTypes: ['MetaClinicalInput'], outputTypes: ['MetaClinicalOutput'], dependencies: ['metaClinicalIntelligence', 'longitudinalPatient', 'guidelineEngine', 'telepresenceController', 'clinicalPathVisualizer'] },
];

export function getEnginesByLayer(layer: EngineLayer): EngineEntry[] {
  return ENGINE_REGISTRY.filter((e) => e.layer === layer);
}

export function getEngineById(id: string): EngineEntry | undefined {
  return ENGINE_REGISTRY.find((e) => e.id === id);
}

export function getEngineStats() {
  const layers = {} as Record<EngineLayer, number>;
  for (const e of ENGINE_REGISTRY) {
    layers[e.layer] = (layers[e.layer] ?? 0) + 1;
  }
  return {
    total: ENGINE_REGISTRY.length,
    byStatus: {
      live: ENGINE_REGISTRY.filter((e) => e.status === 'live').length,
      stub: ENGINE_REGISTRY.filter((e) => e.status === 'stub').length,
      planned: ENGINE_REGISTRY.filter((e) => e.status === 'planned').length,
    },
    byLayer: layers,
  };
}

export const ARCHITECTURE_LAYERS: { layer: EngineLayer; label: string; color: string; description: string }[] = [
  { layer: 'input', label: 'Input Layer', color: '#6366f1', description: 'Symptom normalization, ontology, complaint aliases' },
  { layer: 'integrity', label: 'Integrity Layer', color: '#f59e0b', description: 'Contradiction detection, completeness checks' },
  { layer: 'evidence', label: 'Evidence Layer', color: '#3b82f6', description: 'Knowledge graph, Bayesian, case similarity, literature' },
  { layer: 'hypothesis', label: 'Hypothesis Layer', color: '#8b5cf6', description: 'Evidence aggregation, differential expansion, coverage gaps' },
  { layer: 'reasoning', label: 'Reasoning Layer', color: '#06b6d4', description: 'Entropy, confidence, temporal patterns, meta-reasoning, multi-agent debate' },
  { layer: 'planning', label: 'Planning Layer', color: '#10b981', description: 'Next question, tests, treatments, action plans, copilot' },
  { layer: 'governance', label: 'Governance Layer', color: '#ef4444', description: 'Safety guard, severity, protocols, supervisor, disposition' },
  { layer: 'action', label: 'Action Layer', color: '#f97316', description: 'Physician review packets, telepresence, device adapters' },
  { layer: 'learning', label: 'Learning Layer', color: '#14b8a6', description: 'Clinical memory, feedback learning, continuous graph learning' },
  { layer: 'simulation', label: 'Simulation Layer', color: '#64748b', description: 'Scenario generation, mass simulation testing' },
  { layer: 'advanced', label: 'Advanced Layer', color: '#ec4899', description: 'Outcome prediction, deterioration risk forecasting' },
  { layer: 'coordination', label: 'Coordination Layer', color: '#a78bfa', description: 'Brain orchestrators — Mega Brain, v2 Coordinator, Super Brain' },
];

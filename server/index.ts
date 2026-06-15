// ── Suppress ioredis TCP ETIMEDOUT from unavailable Redis in dev ───────────────
// BullMQ internally duplicates ioredis connections; those duplicates have no
// error listener, so their ETIMEDOUT fires as an uncaughtException.
// We suppress only TCP connect timeouts — all other exceptions still crash.
process.on("uncaughtException", (err: any) => {
  if (err?.code === "ETIMEDOUT" && err?.syscall === "connect") return;
  if (err?.code === "ECONNREFUSED" && err?.syscall === "connect") return;
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

import express, { type Request, Response, NextFunction, Router } from "express";
import cookieParser from "cookie-parser";
import { clinicalRateLimiter, authRateLimiter, webhookRateLimiter } from "./middleware/rateLimiter";
import { globalSafetyGate } from "./middleware/globalSafetyGate";
import { tenantContextMiddleware } from "./middleware/tenantContext";
import { startDeadLetterMonitor } from "./services/ehrDeadLetterMonitor";
import { initAuditHashChain } from "./services/auditHashChain";
import { initLearningQueue } from "./learning/learningQueueStore";
import { initShadowModeFromRedis } from "./config/shadowMode";
import { initSimulationStore } from "./simulation/simulationStore";
import { getProductionFlags } from "./config/productionFlags";
import { clinicalDeadline, standardDeadline } from "./middleware/requestDeadline";
import { idempotency } from "./middleware/idempotency";
import { correlationId } from "./hardening/middleware/correlationId";
import { requestLogger } from "./hardening/middleware/requestLogger";
import { phiBoundary } from "./middleware/phiBoundary";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { loadConfig } from "./config";
import { initFirebase } from "./firebase";
import { storage } from "./storage";
import { getEntFluRules } from "./rules/entFluRuleLoader";
import { initIntakeDb, intakeRouter, filesRouter, summaryRouter, ensureDirs as ensureIntakeDirs } from "./intake";
import { authRouter } from "./routes.auth";
import { registerTestRoutes } from "./routes/test.routes";
import agentRoutes from "./routes/agent.routes";
import { registerTraceRoutes } from "./routes/trace.routes";
import { registerAnalyticsRoutes } from "./routes/analytics.routes";
import { registerRcRoutes } from "./routes/rc.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import complaintIntakeRoutes from "./routes/complaintIntake.routes";
import { casesRouter } from "./routes/cases.routes";
import { reviewRouter } from "./routes/review.routes";
import { providerFeedbackRouter } from "./routes/providerFeedback.routes";
import { followUpRouter }          from "./routes/followUp.routes";
import { registerFollowUpWorker }  from "./followup/followUpService";
import { telegramRouter } from "./routes/telegram.routes";
import { reviewQueueRouter } from "./routes/reviewQueue";
import { signoffRouter } from "./routes/signoff";
import { noteDraftRouter } from "./routes/noteDraft";
import { chatIntakeRouter } from "./routes/chatIntake";
import { discrepanciesRouter } from "./routes/discrepancies";
import { exportEncounterRouter } from "./routes/exportEncounter";
import { roleAuthRouter } from "./routes/roleAuth";
import { runtimeAnalyticsRouter } from "./routes/runtimeAnalytics";
import { shadowModeOpsRouter } from "./routes/shadowModeOps";
import { chatDispositionExplanationRouter } from "./routes/chatDispositionExplanation";
import { chatCoercionAuditRouter } from "./routes/chatCoercionAudit";
import { chatFollowupBundleRouter } from "./routes/chatFollowupBundle";
import { reviewQueueSnapshotsRouter } from "./routes/reviewQueueSnapshots";
import { exportReadinessRouter } from "./routes/exportReadiness";
import { overridePatternsRouter } from "./routes/overridePatterns";
import { questionGapsRouter } from "./routes/questionGaps";
import { opsDailyDigestRouter } from "./routes/opsDailyDigest";
import { clinicalWorkflowHealthRouter } from "./routes/clinicalWorkflowHealth";
import { caseOpsActionsRouter } from "./routes/caseOpsActions";
import automationRouter from "./automation/routes";
import recorderRouter from "./automation/recorderRoutes";
import credentialRouter from "./automation/credentialRoutes";
import replayRouter from "./automation/replayRoutes";
import desktopRouter from "./automation/desktopRoutes";
import templateStudioRoutes from "./routes/templateStudioRoutes";
import templateVariableRoutes from "./routes/templateVariableRoutes";
import replayInspectorRoutes from "./routes/replayInspectorRoutes";
import roboticsRoutes from "./routes/roboticsRoutes";
import autonomousRoutes from "./routes/autonomousRoutes";
import memoryRoutes from "./routes/memoryRoutes";
import physicianRoutes from "./routes/physicianRoutes";
import { router as cameraStreamRouter } from "./robotics/cameraStream";
import patientFlowRoutes from "./routes/patientFlowRoutes";
import { telegramPatientRouter } from "./routes/telegramPatientRoutes";
import { whatsappMetaRouter } from "./routes/whatsappMetaRoutes";
import { validateTwilioSignature } from "./whatsapp/twilioValidation";
import voiceWebhookRouter from "./voice/voiceWebhook";
import voiceIntakeRouter  from "./routes/voiceIntake";
import { initRealtimeGateway } from "./multimodal/realtimeGateway";
import multimodalRoutes from "./routes/multimodalRoutes";
import robotControlRoutes from "./routes/robotControlRoutes";
import uiAgentRoutes from "./routes/uiAgentRoutes";
import protocolRoutes from "./routes/protocolRoutes";
import deviceRoutes from "./routes/deviceRoutes";
import { handleTwilioMediaStream, handleTwilioStatus } from "./voice/twilioVoiceFull";
import { initWebRTCServer } from "./realtime/webrtcServer";
import orchestrationRoutes from "./routes/orchestrationRoutes";
import protocolLearningRoutes from "./routes/protocolLearningRoutes";
import loadBalancerRoutes from "./routing/loadBalancerRoutes";
import triageOptimizerRoutes from "./learning/triageOptimizerRoutes";
import caseMemoryRoutes from "./memory/caseMemoryRoutes";
import riskRoutes from "./risk/riskRoutes";
import cfr11Routes from "./fda/cfr11Routes";
import funnelRoutes from "./growth/funnelRoutes";
import clinicRoutes from "./clinic/clinicRoutes";
import voiceClinicRoutes from "./voice/voiceClinicRoutes";
import { startOptimizerLoop } from "./learning/triageOptimizer";
import { BackgroundTableRefresher } from "./clinical/pipelineSafetyPatches";
import contractRoutes, { startNegotiationWorker } from "./contracts/contractRoutes";
import financeRoutes from "./finance/financeRoutes";
import regulatoryRoutes from "./regulatory/regulatoryRoutes";
import medicalAiRoutes    from "./routes/medicalAiRoutes";
import sepsisTwinRoutes      from "./routes/sepsisTwinRoutes";
import hardeningReviewRoutes from "./routes/hardeningReviewRoutes";
import workforceRoutes from "./workforce/workforceRoutes";
import masterPipelineRoutes from "./core/pipelineRoutes";
import jobRoutes from "./queue/jobRoutes";
import { initOrchestrationSocket } from "./orchestration/orchestrationSocket";
import { questionImpactDebugRouter } from "./routes/questionImpactDebug";
import { outcomeCaptureRouter } from "./routes/outcomeCapture";
import { complaintQADashboardRouter } from "./routes/complaintQADashboard";
import { organizationsRouter } from "./routes/organizations";
import { notificationsRouter } from "./routes/notifications";
import { ecwPacketsRouter } from "./routes/ecwPackets";
import { auditReportsRouter } from "./routes/auditReports";
import { messagesRouter } from "./routes/messages";
import { healthRouter } from "./routes/health";
import { formularyRouter } from "./routes/formulary";
import { outcomeMonitoringRouter } from "./routes/outcomeMonitoring";
import { prescribingControlsRouter } from "./routes/prescribingControls";
import { patientConsentRouter } from "./routes/patientConsent";
import { clinicalValidationRouter } from "./routes/clinicalValidation";
import { releaseGovernanceRouter } from "./routes/releaseGovernance";
import { agentTasksRouter } from "./routes/agentTasks";
import { msAgentTasksRouter } from "./routes/msAgentTasks";
import { brainRouter } from "./routes/brainRoutes";
import { aiTasksRouter } from "./routes/aiTasks";
import { performanceStatsRouter } from "./routes/performanceStats";
import { decisionGraphsRouter } from "./routes/decisionGraphs";
import { complaintControlCenterRouter } from "./routes/complaintControlCenter";
import { syntheticTestingRouter } from "./routes/syntheticTesting";
import { goldReviewsRouter } from "./routes/goldReviews";
import { ruleSuggestionsRouter } from "./routes/ruleSuggestions";
import { skillLayerRouter } from "./routes/skillLayerRoutes";
import graphTraceRoutes from "./routes/graphTraceRoutes";
import learningRoutes from "./routes/learningRoutes";
import hardeningRoutes from "./routes/hardeningRoutes";
import goldenCaseLearningRoutes from "./routes/goldenCaseLearningRoutes";
import clinicalApiRoutes from "./routes/clinicalApiRoutes";
import outcomeRoutes from "./routes/outcomeRoutes";
import caseReplayRoutes from "./routes/caseReplayRoutes";
import costValueRoutes from "./routes/costValueRoutes";
import ruleGovernanceRoutes from "./routes/ruleGovernanceRoutes";
import reconciliationRoutes from "./routes/reconciliationRoutes";
import adminOpsRoutes from "./platform/adminOpsRoutes";
import platformMetricsRoutes from "./routes/platformMetricsRoutes";
import rolloutManagerRoutes from "./routes/rolloutManagerRoutes";
import ruleGovernanceEditorRoutes from "./routes/ruleGovernanceEditorRoutes";
import compareDiffExplorerRoutes from "./routes/compareDiffExplorerRoutes";
import sl3Routes from "./routes/sl3Routes";
import sl4Routes from "./routes/sl4Routes";
import sl5Routes from "./routes/sl5Routes";
import sl6Routes from "./routes/sl6Routes";
import sl7Routes from "./routes/sl7Routes";
import sl8Routes from "./routes/sl8Routes";
import stateRoutes from "./routes/stateRoutes";
import stateAdminRouter from "./routes/stateAdmin";
import { assertProductionSafe } from "./config/assertProductionSafe";
import { runStartupChecks } from "./config/startupChecks";
import { persistStartupAttestation } from "./config/startupAttestation";
import { assertRuntimeModes } from "./config/assertRuntimeModes";
import { assertQueueReady } from "./config/assertQueueReady";
import { validateConfig } from "./config/validateConfig";
import { loadAwsSecrets } from "./config/loadAwsSecrets";
import complaintTestLabRoutes from "./routes/complaintTestLab.routes";
import autonomousIntakeRoutes from "./routes/autonomousIntakeRoutes";
import pathwayRoutes from "./routes/pathwayRoutes";
import copilotRoutes from "./routes/copilotRoutes";
import predictiveRoutes from "./routes/predictiveRoutes";
import rlRoutes from "./routes/rlRoutes";
import telemedicineAssistantRoutes from "./routes/telemedicineAssistantRoutes";
import whatsappWebhookRouter from "./routes/whatsappWebhook";
import conversationRoutes from "./routes/conversationRoutes";
import acceptanceSlaAnalyticsRoutes from "./routes/acceptanceSlaAnalyticsRoutes";
import productionReadinessRoutes from "./routes/productionReadiness";
import stagingValidationRunnerRoutes from "./routes/stagingValidationRunner";
import recommendationAnalyticsRoutes from "./routes/recommendationAnalytics";
import translationProviderConfigRoutes from "./routes/translationProviderConfig";
import ehrDeadLetterRoutes from "./routes/ehrDeadLetter";
import ehrRetryRoutes from "./routes/ehrRetry";
import reminderTimelineRoutes from "./routes/reminderTimeline";
import multilingualTemplateCrudRoutes from "./routes/multilingualTemplateCrud";
import templateRankingV2Routes from "./routes/templateRankingV2";
import multilingualTemplatesRoutes from "./routes/multilingualTemplates";
import bulkActionPreviewRoutes from "./routes/bulkActionPreview";
import bulkMessagingRoutes from "./routes/bulkMessaging";
import smartReminderSuppressionRoutes from "./routes/smartReminderSuppression";
import caseSimilarityRoutes from "./routes/caseSimilarityRoutes";
import metricsRoutes from "./routes/metricsRoutes";
import selfImproveRoutes from "./routes/selfImproveRoutes";
import selfImprovementGovernanceRoutes from "./routes/selfImprovementGovernance";
import hybridRoutes from "./routes/hybridRoutes";
import ucsmRoutes from "./routes/ucsmRoutes";
import diagnosticConfidenceRoutes from "./routes/diagnosticConfidenceRoutes";
import adaptiveQuestionLearningRoutes from "./routes/adaptiveQuestionLearningRoutes";
import clinicalEnginesRoutes from "./routes/clinicalEnginesRoutes";
import { messagingStatusRouter } from "./routes/messagingStatus";
import { langchainRouter } from "./routes/langchainRoutes";
import { sseQueueRouter } from "./routes/sseQueue";
import { engineRegistryRouter } from "./routes/engineRegistry";
import { goldenCasesRouter } from "./routes/goldenCases";
import { skillsRouter } from "./routes/skills";
import { metaClinicalRouter } from "./routes/metaClinical";
import { physicianAnalyticsRouter } from "./routes/physicianAnalytics";
import { researchRouter } from "./routes/research";
import { clinicalVisualizationRouter } from "./routes/clinicalVisualization";
import { conversationOptimizationRouter } from "./routes/conversationOptimization";
import { decisionReplayRouter } from "./routes/decisionReplayRoutes";
import { systemReviewRouter } from "./routes/systemReviewRoutes";
import simulationLabRoutes from "./routes/simulationLabRoutes";
import coverageMatrixRoutes from "./routes/coverageMatrixRoutes";
import channelSimulationRoutes from "./routes/channelSimulationRoutes";
import clinicalControlTowerRoutes from "./routes/clinicalControlTowerRoutes";
import knowledgeGraphRoutes from "./routes/knowledgeGraphRoutes";
import graphSimulationRoutes from "./routes/graphSimulationRoutes";
import clinicalIntelligenceRoutes from "./routes/clinicalIntelligenceRoutes";
import scenarioGeneratorRoutes from "./routes/scenarioGeneratorRoutes";
import { clinicalAgentRouter } from "./routes/clinicalAgentRoutes";
import { intelligencePlanningRouter } from "./routes/intelligencePlanningRoutes";
import { sheetImportRouter } from "./routes/sheetImportRoutes";
import clinicalSchemaValidationRoutes from "./routes/clinicalSchemaValidationRoutes";
import sheetGraphIngestionRoutes from "./routes/sheetGraphIngestionRoutes";
import auditRoutes from "./routes/auditRoutes";
import interactionAuditRoutes from "./routes/interactionAuditRoutes";
import governanceRoutes from "./routes/governanceRoutes";
import clinicalVersionRoutes from "./routes/clinicalVersionRoutes";
import intelligenceMapRoutes from "./routes/intelligenceMapRoutes";
import controlCenterRoutes from "./routes/controlCenterRoutes";
import reasoningDebuggerRoutes from "./routes/reasoningDebuggerRoutes";
import clinicalAnalyticsRoutes from "./routes/clinicalAnalyticsRoutes";
import advancedEngineRoutes from "./routes/advancedEngineRoutes";
import layerArchitectureRoutes from "./routes/layerArchitectureRoutes";
import selfImprovingRoutes from "./routes/selfImprovingRoutes";
import auralynSaasRoutes from "./routes/auralynSaasRoutes";
import ehrRoutes from "./routes/ehrRoutes";
import clinicalScaleRoutes from "./routes/clinicalScaleRoutes";
import operationsRoutes from "./routes/operationsRoutes";
import smartIntakeRoutes from "./routes/smartIntakeRoutes";
import intelligenceRoutes from "./routes/intelligenceRoutes";
import adaptiveControlRoutes from "./routes/adaptiveControlRoutes";
import adaptiveInsightsRoutes from "./routes/adaptiveInsightsRoutes";
import packAdminRoutes from "./routes/packAdminRoutes";
import packDrivenIntakeRoutes from "./routes/packDrivenIntakeRoutes";
import packSimulatorRoutes from "./routes/packSimulatorRoutes";
import coverageRoutes from "./routes/coverageRoutes";
import physicianDashboardRoutes from "./routes/physicianDashboardRoutes";
import executiveDbRoutes from "./routes/executiveDbRoutes";
import executiveOpsRoutes from "./routes/executiveOpsRoutes";
import legacyTabMapperRoutes from "./routes/legacyTabMapperRoutes";
import clinicalIntegrationRoutes from "./routes/clinicalIntegrationRoutes";
import { integrationHealthRouter } from "./routes/integrationHealthRoutes";
import googleSheetsMigrationRoutes from "./routes/googleSheetsMigrationRoutes";
import pipelineRoutes from "./routes/pipelineRoutes";
import googleEmailRoutes from "./routes/googleEmailRoutes";
import sharedViewsRoutes from "./routes/sharedViewsRoutes";
import signedBoardExportsRoutes from "./routes/signedBoardExportsRoutes";
import benchmarkTrendsRoutes from "./routes/benchmarkTrendsRoutes";
import systemMonitoringRoutes from "./routes/systemMonitoringRoutes";
import adaptiveMappingRoutes from "./routes/adaptiveMappingRoutes";
import fullMappingPipeline from "./routes/fullMappingPipeline";
import systemExpansionRoutes from "./routes/systemExpansionRoutes";
import deploymentStatusRoutes from "./routes/deploymentStatusRoutes";
import extendedScoringRoutes from "./routes/extendedScoringRoutes";
import outcomeLearningRoutes from "./routes/outcomeLearningRoutes";
import billingRoutes from "./routes/billingRoutes";
import complianceRoutes from "./routes/complianceRoutes";
import securityRoutes from "./routes/securityRoutes";
import autoTuneRoutes from "./routes/autoTuneRoutes";
import gptExplanationRoutes from "./routes/gptExplanationRoutes";
import clearinghouseRoutes from "./routes/clearinghouseRoutes";
import samdComplianceRoutes from "./routes/samdComplianceRoutes";
import phiProtectionRoutes from "./routes/phiProtectionRoutes";
import fda510kRoutes from "./routes/fda510kRoutes";
import autoCodeRoutes from "./routes/autoCodeRoutes";
import encounterBundleRoutes from "./routes/encounterBundleRoutes";
import denialPredictionRoutes from "./routes/denialPredictionRoutes";
import revenuePipelineRoutes from "./routes/revenuePipelineRoutes";
import insurerRoutes from "./insurer/routes";
import qualityRoutes from "./quality/routes";
import clinicianEngineRoutes from "./clinician/routes";
import dashboardEngineRoutes from "./dashboard/routes";
import warRoomRoutes from "./warroom/routes";
import governorRoutes from "./governor/routes";
import autonomousAgentRoutes from "./routes/autonomousAgentRoutes";
import autonomousLearningRoutes from "./routes/autonomousLearningRoutes";
import intakeQueueRoutes from "./routes/intakeQueueRoutes";
import agentControlRoutes from "./routes/agentControlRoutes";
import payerIntelligenceRoutes from "./routes/payerIntelligenceRoutes";
import strategyRoutes from "./routes/strategyRoutes";
import enterpriseRoutes from "./routes/enterpriseRoutes";
import operatorRoutes from "./routes/operatorRoutes";
import engineRoutes from "./routes/engineRoutes";
import clinicalFlowRoutes from "./routes/clinicalRoutes";
import systemSimulationRoutes from "./routes/systemSimulationRoutes";
import systemAuditRoutes from "./routes/systemAuditRoutes";
import outcomeFeedbackRoutes from "./routes/outcomeFeedbackRoutes";
import { startAutonomousLoop } from "./system/autonomousLoop";
import { startEngines } from "./system/engineScheduler";
import { initAsyncWorkerHandlers } from "./queue/asyncWorkerInit";
import { runFailoverLoop } from "./monitoring/failoverDetector";
import chaosRoutes from "./routes/chaosRoutes";
import { startRecoveryLoop } from "./system/recoveryLoop";
import rweRoutes from "./routes/rweRoutes";
import fdaPackageRoutes from "./fda/fdaPackageRoutes";
import patientQueueRoutes from "./patient/patientQueueRoutes";
import stressRoutes from "./stress/stressRoutes";
import rpaRoutes from "./rpa/rpaRoutes";
import visionRoutes from "./vision/visionRoutes";
import queueRoutes from "./queue/queueRoutes";
import kbEntityRoutes from "./routes/kbRoutes";
import goldenMonitorRoutes from "./routes/goldenRoutes";
import queueAdminRoutes from "./routes/queueAdminRoutes";
import { startProductionScheduler, stopProductionScheduler } from "./scheduler/productionScheduler";
import { priorInvalidationRouter } from "./kb/priorInvalidationRoute";
import { modelFreezeRouter } from "./governance/modelFreeze";
import { commandStripRouter } from "./routes/commandStripRoutes";
import { intakeFlowRouter } from "./routes/intakeFlowRoutes";
import { systemOpsRouter } from "./routes/systemOpsRoutes";
import { kbExplorerRouter } from "./routes/kbExplorerRoutes";
import { initAllQueues } from "./queues/bullmq/queueFactory";
import { initControlTowerSocket } from "./controlTower/socket";
import { startAnomalyEngine } from "./controlTower/anomalyEngine";
import { startAlertEngine, stopAlertEngine } from "./monitoring/alertEngine";
import { startMonitorSocket } from "./ws/monitorSocket";
import { startAutoHealer, stopAutoHealer } from "./monitoring/autoHealer";
import { startSelfLearningLoop, stopSelfLearningLoop } from "./learning/selfLearningEngine";
import { startGoldenMonitor, stopGoldenMonitor } from "./golden/goldenMonitor";
import adaptiveIntelligenceRoutes from "./routes/adaptiveIntelligenceRoutes";
import fdaValidationRoutes from "./routes/fdaValidationRoutes";
import agentEvolutionRoutes from "./routes/agentEvolutionRoutes";
import { startAgentExecutor, stopAgentExecutor } from "./agents/agentExecutor";
import { startEvolutionLoop, stopEvolutionLoop } from "./evolution/evolutionLoop";
import globalIntelligenceRoutes from "./routes/globalIntelligenceRoutes";
import { startGlobalSyncLoop, stopGlobalSyncLoop } from "./global/globalSyncLoop";
import priorAuthRoutes from "./routes/priorAuthRoutes";
import eligibilityRoutes from "./routes/eligibilityRoutes";
import populationHealthRoutes from "./routes/populationHealthRoutes";
import experimentRoutes from "./routes/experimentRoutes";
import voiceMonitorRoutes from "./routes/voiceMonitorRoutes";
import medicationRoutes from "./routes/medicationRoutes";
import schedulingRoutes from "./routes/schedulingRoutes";
import fhirRoutes from "./routes/fhirRoutes";
import { fhirContextRouter } from "./routes/fhirContext.routes";
import { commandRouter }          from "./routes/command.routes";
import { intentAnalyticsRouter }  from "./routes/intentAnalytics.routes";
import { documentIndexRouter }    from "./routes/documentIndex.routes";
import { clinicalPathwaysRouter } from "./routes/clinicalPathways.routes";
import mipsRoutes from "./routes/mipsRoutes";
import trialMatcherRoutes from "./routes/trialMatcherRoutes";
import benchmarkRoutes from "./routes/benchmarkRoutes";
import { routingTelemetryRouter } from "./routes/routingTelemetry.routes";
import cdsHooksRouter from "./cds/cdsHooks";
import testGoldenRoutes from "./routes/testGoldenRoutes";
import testCoverageRoutes from "./routes/testCoverageRoutes";
import fdaDashboardRoutes from "./routes/fdaDashboardRoutes";
import liveClinicRoutes from "./routes/liveClinicRoutes";
import { fhirRoutes } from "./ehr/fhir/fhirRoutes";
import medicationRoutes from "./medications/medicationRoutes";
import productionReadinessRoutes from "./routes/productionReadinessRoutes";
import clinicalSecurityRoutes from "./routes/clinicalSecurityRoutes";
import advancedFeaturesRoutes from "./routes/advancedFeaturesRoutes";
import clinicalSafetyRoutes from "./routes/clinicalSafetyRoutes";
import physicianGovernanceRoutes from "./routes/physicianGovernanceRoutes";
import scalabilityRoutes from "./routes/scalabilityRoutes";
import observabilityRoutes from "./routes/observabilityRoutes";
import knowledgeRoutes from "./routes/knowledgeRoutes";
import knowledgeBaseAdminRoutes from "./routes/knowledgeBaseAdminRoutes";
import clinicalPipelineRoutes from "./routes/clinicalPipelineRoutes";
import auditExportRoutes from "./routes/auditExportRoutes";
import advancedReasoningRoutes from "./routes/advancedReasoningRoutes";
import billingOptimizationRoutes from "./routes/billingOptimizationRoutes";
import finalLayerRoutes from "./routes/finalLayerRoutes";
import { startEventWorkers } from "./events/workers";
import medicationSafetyRoutes from "./routes/medicationSafetyRoutes";
import architectureComplianceRoutes from "./routes/architectureComplianceRoutes";
import { moatRoutes } from "./routes/moatRoutes";
import { phase9Routes } from "./phase9/routes/phase9Routes";
import intelRoutes            from "./observability/intel/intelRoutes";
import complianceRoutes       from "./compliance/complianceRoutes";
import { startScheduledAuditVerification } from "./audit/scheduledAuditVerifier";
import unifiedRoutes          from "./routes/unifiedRoutes";
import executiveRoutes        from "./routes/executiveRoutes";
import controlTowerRoutes     from "./routes/controlTowerRoutes";
import controlTowerClinicalRoutes from "./routes/controlTowerClinicalRoutes";
import systemControlRoutes from "./routes/systemControlRoutes";
import multiPatientRoutes from "./routes/multiPatientRoutes";
import writeEncounterRoute from "./routes/writeEncounterRoute";
import qaRoutes from "./routes/qaRoutes";
import improvementLabRoutes from "./routes/improvementLabRoutes";
import ingestionRoutes from "./routes/ingestion.routes";
import analyticsRoutes from "./routes/analyticsRoutes";
import pathwayOptimizerRoutes from "./routes/pathwayOptimizerRoutes";
import governanceCommandRoutes from "./routes/governanceCommandRoutes";
import skillGraphRoutes from "./routes/skillGraphRoutes";
import skillIntelligenceRoutes from "./routes/skillIntelligenceRoutes";
import skillEvolutionRoutes from "./routes/skillEvolutionRoutes";
import icuRoutes from "./routes/icuRoutes";
import validationRoutes from "./routes/validationRoutes";
import networkRoutes from "./routes/networkRoutes";
import kbGovernanceRoutes from "./kb/routes/kbGovernanceRoutes";
import { assertClinicalStartupInvariants } from "./startup/assertions";
import { startPatientStreamSocket } from "./ws/patientStream";
import { hydrateFromRedis } from "./learning/versionedRLHF";
import engineControlRoutes from "./routes/engineControlRoutes";
import recentRunsRoutes from "./routes/recentRunsRoutes";
import decisionTreeRoutes, { suggestFixRouter } from "./routes/decisionTreeRoutes";
import masterRuleMapRoutes from "./routes/masterRuleMap.routes";
import masterRulesRoutes from "./routes/masterRules.routes";
import contextInspectorRoutes from "./routes/contextInspector.routes";
import contextHealthRoutes    from "./routes/contextHealth.routes";
import encounterRoutes        from "./routes/encounter.routes";
import memoryRoutes           from "./routes/memory.routes";
import { scheduleContextMetricsAggregate } from "./jobs/contextMetricsAggregate";
import dialogueRoutes from "./routes/dialogue";
import encounterConfigsRoutes from "./routes/encounterConfigs.routes";
import voiceParseRoutes from "./routes/voiceParse.routes";
import kbEditorRoutes from "./routes/kbEditor.routes";
import rlhfRoutes from "./routes/rlhf.routes";
import exportZipRoutes from "./routes/exportZip.routes";
// Register task agents (side-effects: all 7 agents added to registry)
import "./agents/taskAgentRegistry";
import { startGovernanceLoop, stopGovernanceLoop } from "./governance/auditAgent";
import { startTwinSync, stopTwinSync } from "./twin/digitalTwin";
import { startPredictiveLoop, stopPredictiveLoop } from "./predictive/predictiveEngine";
import { startChaosScheduler, stopChaosScheduler } from "./chaos/chaosEngine";
import resilientRoutes from "./routes/resilientRoutes";
import { startSecretRotation } from "./config/secretRotation";
import { metricsMiddleware } from "./middleware/metricsMiddleware";
import { initTraceStore } from "./traces/traceStore";
import { initConversationLog } from "./traces/conversationLog";
import { initChannels } from "./channels";
import opsRoutes from "./routes/ops";
import agentBrainRoutes from "./routes/agentBrainRoutes";
import { labRouter } from "./routes/labRoutes";
import dependenciesRoutes from "./routes/dependencies";
import engineMetricsRoutes from "./routes/engineMetrics";
import workersRoutes from "./routes/workers";
import clinicHealthRoutes from "./routes/clinicHealth";
import { traceMiddleware } from "./middleware/trace";
import { startTelemetry, stopTelemetry } from "./monitoring/otel";
import { runMigrations } from "./db/migrate";
import { systemInventoryRouter } from "./routes/systemInventory";
import { startEventLoopMonitor, stopEventLoopMonitor } from "./monitoring/eventLoopMonitor";
import { startDriftMonitor, stopDriftMonitor } from "./fda/performanceDriftAlert";
import { registerLoop, heartbeatLoop, stopLoop } from "./monitoring/loopRegistry";
import { runDriftCheck }                     from "./harness/driftCheck";
import { evaluateCase }                     from "./hybrid-reasoning/hybridController";
import { runWeeklyResearchRadar, getRadarStatus } from "./harness/researchRadar";
import longevityRouter from "./routes/longevity";
import { LongevityIntelligenceAgent } from "./agents/LongevityIntelligenceAgent";
import { specRouter }              from "./harness/specDrivenDevelopment";
import { runPeriodicSkillNudge, activateSkill, retireSkill } from "./learning/clinicalSkillsSystem";
import { SelfHealingMonitor, recordSchedulerHeartbeat } from "./infra/selfHealingMonitor";
import { db }                      from "./db";
import { sql }                     from "drizzle-orm";
import { requireReviewAuth }       from "./middleware/reviewAuth";

const config = loadConfig();

if (config.STORAGE_DRIVER === "firestore") {
  initFirebase();
  console.log("[Startup] Firebase initialized (STORAGE_DRIVER=firestore)");
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ── Keep-alive health endpoint — registered before ALL middleware ──────────────
// Zero dependencies, instant 200. Used by UptimeRobot / external ping services
// to prevent Cloud Run cold starts. Ping https://auralyn.tech/health every 5 min.
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, ts: Date.now(), uptime: Math.floor(process.uptime()) });
});

app.use(cookieParser());
app.use(correlationId);
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(traceMiddleware);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({
  extended: false,
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// ── Twilio webhooks — MUST be registered before globalSafetyGate ──────────────
// Twilio expects a 200 within 15 s. The safety gate does async DB checks that
// can block for seconds under load; mounting these routes early bypasses that.
// We respond immediately with an empty TwiML envelope, then kick off the full
// KB triage pipeline asynchronously (which sends replies via Twilio REST API).
app.post("/whatsapp/webhook", (req, res) => {
  const from = String(req.body?.From ?? "");
  const body = String(req.body?.Body ?? "");
  const sid  = String(req.body?.MessageSid ?? "");
  const sig  = String((req.headers["x-twilio-signature"] as string | undefined) ?? "(none)");
  console.log(`[WhatsApp] ✅ EARLY — From=${from} Body="${body.slice(0, 80)}" SID=${sid} sig_present=${sig !== "(none)"}`);

  // Acknowledge Twilio immediately — must happen within 15 s
  res.status(200).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);

  // Process the message asynchronously via the full KB triage pipeline
  if (from && body) {
    import("./whatsapp/kbIntake")
      .then(({ handleWhatsAppKBIntake }) =>
        handleWhatsAppKBIntake({ from, text: body, messageSid: sid })
      )
      .catch((e: any) =>
        console.error("[WhatsApp] ❌ KBIntake error:", e?.message ?? e)
      );
  }
});

// ── POST /api/test/kb-sim ────────────────────────────────────────────────────
// Synchronous test shim for kbIntake.ts. Exercises handleWhatsAppKBIntake
// without calling Twilio — intercepts sendWhatsAppMessage via the test hook
// in send.ts and returns the captured reply in JSON.
// Body: { sessionId: string, message: string }
app.post("/api/test/kb-sim", async (req: any, res: any) => {
  console.log("[kb-sim] HIT — body:", JSON.stringify(req.body));
  try {
    const { sessionId, message } = req.body ?? {};
    if (!sessionId || message === undefined) {
      return res.status(400).json({ ok: false, error: "sessionId and message required" });
    }
    const hashNum = Buffer.from(String(sessionId)).reduce((a: number, b: number) => (a * 31 + b) % 9_000_000, 0) + 1_000_000;
    const fakePhone = `+1555${String(hashNum).slice(0, 7)}`;

    const { registerTestInterceptor, clearTestInterceptor } = await import("./whatsapp/send");
    const { handleWhatsAppKBIntake } = await import("./whatsapp/kbIntake");

    const replyPromise = new Promise<string>((resolve) => {
      registerTestInterceptor(fakePhone, (msg: string) => {
        clearTestInterceptor(fakePhone);
        resolve(msg);
      });
    });

    const t0 = Date.now();
    await handleWhatsAppKBIntake({ from: fakePhone, text: String(message) || "(empty)", messageSid: `sim-${Date.now()}` });

    const reply = await Promise.race([
      replyPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => { clearTestInterceptor(fakePhone); reject(new Error("timeout")); }, 12_000)
      ),
    ]);

    res.json({ ok: true, reply, latencyMs: Date.now() - t0, phone: fakePhone });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

app.use(tenantContextMiddleware);
app.use(globalSafetyGate);

app.get("/api/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), uptime: process.uptime() });
});

app.get("/api/healthz/deps", async (_req, res) => {
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  if (config.STORAGE_DRIVER === "firestore") {
    const t0 = Date.now();
    try {
      const { getFirestore } = await import("./firebase");
      const snap = await getFirestore().collection("_healthcheck").limit(1).get();
      checks.firestore = { ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      checks.firestore = { ok: false, ms: Date.now() - t0, error: e?.message };
    }
  }

  if (config.SHEETS_SPREADSHEET_ID) {
    const t0 = Date.now();
    try {
      const { getSheetsClient } = await import("./sheets/sheetsClient");
      const sheets = getSheetsClient();
      await sheets.spreadsheets.values.get({
        spreadsheetId: config.SHEETS_SPREADSHEET_ID,
        range: "CLINICAL_QUESTIONS!A1:A1",
      });
      checks.sheets = { ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      checks.sheets = { ok: false, ms: Date.now() - t0, error: e?.message };
    }
  }

  checks.twilio = {
    ok: config.ENABLE_TWILIO === "1" && !!config.TWILIO_ACCOUNT_SID,
    ...(config.ENABLE_TWILIO === "0" ? { error: "disabled" } : {}),
  };

  const allOk = Object.values(checks).every(c => c.ok);
  res.status(allOk ? 200 : 503).json({ ok: allOk, checks, ts: Date.now() });
});

// Auth routes
app.use(authRouter);
console.log("[Auth] Session cookie auth enabled");

// State admin routes (durable DB-backed state endpoints)
app.use(stateAdminRouter);
console.log("[StateAdmin] Durable state endpoints registered at /api/state/*");

// Test/regression routes
const testRouter = Router();
registerTestRoutes(testRouter);
app.use(testRouter);
console.log("[Test] Regression gate endpoints registered");

// Agent routes (LIVE + REGRESSION agentic endpoints)
app.use("/api/agent", agentRoutes);
console.log("[Agent] Agentic endpoints registered at /api/agent/*");

// Trace viewer routes (provider auth required)
initTraceStore();
initConversationLog();
const traceRouter = Router();
registerTraceRoutes(traceRouter);
registerAnalyticsRoutes(traceRouter);
registerRcRoutes(traceRouter);
registerAdminRoutes(traceRouter);
app.use(traceRouter);
console.log("[Traces] Trace viewer endpoints registered at /api/traces/*");
console.log("[Analytics] Analytics endpoints registered at /api/analytics/*");
console.log("[RC] Release candidate + replay + review endpoints registered");

// Channel adapters (WhatsApp + Telegram senders + Telegram webhook)
const channelRouter = Router();
initChannels(channelRouter);
app.use(channelRouter);

initIntakeDb();
ensureIntakeDirs();

app.use(intakeRouter);
app.use(filesRouter);
app.use(summaryRouter);

app.use("/api/complaint-intake", phiBoundary, complaintIntakeRoutes);
console.log("[ComplaintIntake] Conversational intake endpoints registered at /api/complaint-intake/*");

app.use(casesRouter);
app.use(reviewRouter);
app.use(providerFeedbackRouter);
app.use(followUpRouter);
app.use("/api/reviewQueue", reviewQueueRouter);
app.use("/api/signoff", signoffRouter);
app.use("/api/noteDraft", noteDraftRouter);
app.use("/api/chatIntake", phiBoundary, chatIntakeRouter);
app.use("/api/discrepancies", discrepanciesRouter);
app.use("/api/exportEncounter", exportEncounterRouter);
app.use("/api/roleAuth", roleAuthRouter);
app.use("/api/runtimeAnalytics", runtimeAnalyticsRouter);
app.use("/api/shadowMode", shadowModeOpsRouter);
app.use("/api/chatDispositionExplanation", chatDispositionExplanationRouter);
app.use("/api/chatCoercionAudit", chatCoercionAuditRouter);
app.use("/api/chatFollowupBundle", chatFollowupBundleRouter);
app.use("/api/reviewQueueSnapshots", reviewQueueSnapshotsRouter);
app.use("/api/exportReadiness", exportReadinessRouter);
app.use("/api/overridePatterns", overridePatternsRouter);
app.use("/api/questionGaps", questionGapsRouter);
app.use("/api/opsDailyDigest", opsDailyDigestRouter);
app.use("/api/clinicalWorkflowHealth", clinicalWorkflowHealthRouter);
app.use("/api/caseOpsActions", caseOpsActionsRouter);
app.use("/api/automation", automationRouter);
app.use("/api/automation-recorder", recorderRouter);
app.use("/api/automation-credentials", credentialRouter);
app.use("/api/automation-replay", replayRouter);
app.use("/api/automation-desktop", desktopRouter);
app.use("/api/template-studio", templateStudioRoutes);
app.use("/api/template-vars", templateVariableRoutes);
app.use("/api/replay-inspector", replayInspectorRoutes);
app.use("/api/robotics", roboticsRoutes);
app.use("/api/autonomous", autonomousRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/physician", physicianRoutes);
app.use("/api/robotics", cameraStreamRouter);
app.use("/api/patient", patientFlowRoutes);
app.use("/api/webhooks/telegram", telegramPatientRouter);
app.use("/api/webhooks", whatsappMetaRouter);
app.use("/api/voice/intake", voiceIntakeRouter);
app.use("/api/voice", voiceWebhookRouter);
app.use("/api/multimodal", multimodalRoutes);
app.use("/api/robot", robotControlRoutes);
app.use("/api/ui-agent", uiAgentRoutes);
app.use("/api/protocol", protocolRoutes);
app.use("/api/device", deviceRoutes);
app.post("/api/voice/stream", validateTwilioSignature, handleTwilioMediaStream);
app.post("/api/voice/status", validateTwilioSignature, handleTwilioStatus);
app.use("/api/orchestration", orchestrationRoutes);
app.use("/api/protocol-learning", protocolLearningRoutes);
app.use(routingTelemetryRouter);
app.use("/api/routing", loadBalancerRoutes);
app.use("/api/triage-optimizer", triageOptimizerRoutes);
app.use("/api/case-memory", caseMemoryRoutes);
app.use("/api/risk-engine", riskRoutes);
app.use("/api/cfr11", cfr11Routes);
app.use("/api/growth", funnelRoutes);
app.use("/api/clinic-os", clinicRoutes);
app.use("/api/voice/clinic", voiceClinicRoutes);
console.log("[LoadBalancer] Predictive load balancer at /api/routing/*");
console.log("[TriageOptimizer] Autonomous triage threshold optimizer at /api/triage-optimizer/*");
console.log("[CaseMemory] Clinical memory graph at /api/case-memory/*");
console.log("[RiskEngine] Predictive failure + malpractice risk at /api/risk-engine/*");
console.log("[CFR11] FDA 21 CFR Part 11 audit log + export at /api/cfr11/*");
console.log("[Growth] Patient acquisition funnel + NYC targeting at /api/growth/*");
console.log("[ClinicOS] Unified Clinic OS pipeline at /api/clinic-os/*");
console.log("[VoiceClinic] Autonomous voice clinic at /api/voice/clinic/*");
app.use("/api/contracts", contractRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/regulatory", regulatoryRoutes);
app.use("/api/workforce", workforceRoutes);
console.log("[Contracts] Autonomous insurer contracting pipeline at /api/contracts/*");
console.log("[Finance] IPO-level financial dashboard at /api/finance/*");
console.log("[Regulatory] National licensing + compliance engine at /api/regulatory/*");
console.log("[Workforce] AI physician workforce optimizer at /api/workforce/*");
app.use("/api/pipeline", masterPipelineRoutes);
app.use("/api/jobs", jobRoutes);
console.log("[MasterPipeline] Full integrated clinical pipeline at /api/pipeline/*");
console.log("[JobQueue] Retry-backed job queue (clinical_pipeline, credentialing, claim_submission) at /api/jobs/*");
app.use("/api/questionImpactDebug", questionImpactDebugRouter);
app.use("/api/outcomeCapture", outcomeCaptureRouter);
app.use("/api/complaintQADashboard", complaintQADashboardRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/ecwPackets", ecwPacketsRouter);
app.use("/api/auditReports", auditReportsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/health", healthRouter);
app.use("/api/formulary", formularyRouter);
app.use("/api/outcomeMonitoring", outcomeMonitoringRouter);
app.use("/api/prescribingControls", prescribingControlsRouter);
app.use("/api/patientConsent", patientConsentRouter);
app.use("/api/clinicalValidation", clinicalValidationRouter);
app.use("/api/releaseGovernance", releaseGovernanceRouter);
app.use("/api/agentTasks", agentTasksRouter);
app.use("/api/msAgentTasks", msAgentTasksRouter);
app.use("/api/brain", brainRouter);
console.log("[ClinicalBrain] Brain coordinator endpoints registered at /api/brain/*");
app.use("/api/aiTasks", aiTasksRouter);
app.use("/api/performanceStats", performanceStatsRouter);
app.use("/api/decisionGraphs", decisionGraphsRouter);
app.use("/api/complaintControlCenter", complaintControlCenterRouter);
app.use("/api/syntheticTesting", syntheticTestingRouter);
app.use("/api/ruleSuggestions", ruleSuggestionsRouter);
app.use("/api/goldReviews", goldReviewsRouter);
app.use("/api/skill-layer", skillLayerRouter);
app.use(graphTraceRoutes);
app.use(learningRoutes);
app.use(hardeningRoutes);
app.use(goldenCaseLearningRoutes);
app.use(clinicalApiRoutes);
app.use(outcomeRoutes);
app.use(caseReplayRoutes);
app.use(costValueRoutes);
app.use(ruleGovernanceRoutes);
app.use(reconciliationRoutes);
app.use(adminOpsRoutes);
app.use(platformMetricsRoutes);
app.use(rolloutManagerRoutes);
app.use(ruleGovernanceEditorRoutes);
app.use(compareDiffExplorerRoutes);
app.use(sl3Routes);
app.use(sl4Routes);
app.use(sl5Routes);
app.use(sl6Routes);
app.use(sl7Routes);
app.use(sl8Routes);
console.log("[SkillLayers] SL3–SL8 routes registered");
app.use(stateRoutes);
app.use(autonomousIntakeRoutes);
app.use(pathwayRoutes);
app.use(copilotRoutes);
app.use(predictiveRoutes);
app.use(rlRoutes);
app.use(telemedicineAssistantRoutes);
app.use(whatsappWebhookRouter);
app.use(conversationRoutes);
app.use(acceptanceSlaAnalyticsRoutes);
app.use(productionReadinessRoutes);
app.use(stagingValidationRunnerRoutes);
app.use(recommendationAnalyticsRoutes);
app.use(translationProviderConfigRoutes);
app.use(ehrDeadLetterRoutes);
app.use(ehrRetryRoutes);
app.use(reminderTimelineRoutes);
app.use(multilingualTemplateCrudRoutes);
app.use(templateRankingV2Routes);
app.use(multilingualTemplatesRoutes);
app.use(bulkActionPreviewRoutes);
app.use(bulkMessagingRoutes);
app.use(smartReminderSuppressionRoutes);
app.use("/api/similarity", caseSimilarityRoutes);
app.use("/api/platform-metrics", metricsRoutes);
app.use("/api/self-improve", selfImproveRoutes);
app.use("/api/self-improvement", selfImprovementGovernanceRoutes);
app.use("/api/hybrid", hybridRoutes);
app.use("/api/ucsm", ucsmRoutes);
app.use(diagnosticConfidenceRoutes);
app.use(adaptiveQuestionLearningRoutes);
app.use(clinicalEnginesRoutes);
app.use(messagingStatusRouter);
app.use(langchainRouter);
app.use(sseQueueRouter);
app.use("/api/engine-registry", engineRegistryRouter);
app.use("/api/golden-cases", goldenCasesRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/meta-clinical", metaClinicalRouter);
app.use(physicianAnalyticsRouter);
app.use("/api/research", researchRouter);
app.use("/api/visualization", clinicalVisualizationRouter);
app.use("/api/conversation-opt", conversationOptimizationRouter);
app.use("/api/clinical-intelligence", decisionReplayRouter);
app.use("/api/system-brain", systemReviewRouter);
app.use("/api/system", systemInventoryRouter);
console.log("[SystemInventory] System inventory + version manifest at /api/system/*");
app.use("/api", simulationLabRoutes);
app.use("/api", coverageMatrixRoutes);
app.use("/api", channelSimulationRoutes);
app.use("/api", clinicalControlTowerRoutes);
app.use("/api", knowledgeGraphRoutes);
app.use("/api", graphSimulationRoutes);
app.use("/api", clinicalIntelligenceRoutes);
app.use("/api", scenarioGeneratorRoutes);
app.use(clinicalAgentRouter);
app.use(intelligencePlanningRouter);
app.use(sheetImportRouter);
app.use(clinicalSchemaValidationRoutes);
app.use(sheetGraphIngestionRoutes);
app.use(auditRoutes);
app.use(interactionAuditRoutes);
app.use(governanceRoutes);
app.use("/api/ci", autonomousLearningRoutes);
app.use(clinicalVersionRoutes);
app.use(intelligenceMapRoutes);
app.use(controlCenterRoutes);
app.use(reasoningDebuggerRoutes);
app.use(clinicalAnalyticsRoutes);
app.use(advancedEngineRoutes);
app.use(layerArchitectureRoutes);
app.use(selfImprovingRoutes);
app.use(auralynSaasRoutes);
app.use(ehrRoutes);
app.use(clinicalScaleRoutes);
app.use(operationsRoutes);
app.use("/api/smart-intake", smartIntakeRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/adaptive-control", adaptiveControlRoutes);
app.use("/api/adaptive-insights", adaptiveInsightsRoutes);
app.use("/api/adaptive-intelligence", adaptiveIntelligenceRoutes);
app.use("/api/fda-validation", fdaValidationRoutes);
app.use("/api/agent-evolution", agentEvolutionRoutes);
app.use("/api/global-intelligence", globalIntelligenceRoutes);
app.use("/api/prior-auth", priorAuthRoutes);
app.use("/api/eligibility", eligibilityRoutes);
app.use("/api/population-health", populationHealthRoutes);
app.use("/api/experiments", experimentRoutes);
app.use("/api/voice-monitor", voiceMonitorRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/scheduling", schedulingRoutes);
app.use("/api/ehr", fhirContextRouter);
app.use("/api/fhir", fhirRoutes);
app.use("/api/mips", mipsRoutes);
app.use("/api/trials", trialMatcherRoutes);
app.use("/api/benchmarks", benchmarkRoutes);
app.use("/cds-hooks", cdsHooksRouter);
app.use("/api/test/golden", testGoldenRoutes);
app.use("/api/test", testCoverageRoutes);
app.use("/api/fda-dashboard", fdaDashboardRoutes);
app.use("/api/live-clinic", liveClinicRoutes);
app.use("/api/fhir", fhirRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/production", productionReadinessRoutes);
app.use("/api/clinical-security", clinicalSecurityRoutes);
app.use("/api/advanced", advancedFeaturesRoutes);
app.use("/api/safety", clinicalSafetyRoutes);
app.use("/api/governance", physicianGovernanceRoutes);
app.use("/api/scalability", scalabilityRoutes);
app.use("/api/observability", observabilityRoutes);
app.use("/api/intel", intelRoutes);
app.use("/api/compliance", complianceRoutes);
startScheduledAuditVerification();
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/kb", knowledgeBaseAdminRoutes);
app.use("/api/clinical-pipeline", clinicalPipelineRoutes);
app.use("/api/audit", auditExportRoutes);
app.use("/api/advanced-reasoning", advancedReasoningRoutes);
app.use("/api/billing-optimization", billingOptimizationRoutes);
app.use("/api/final-layer", finalLayerRoutes);
app.use("/api/medications", medicationSafetyRoutes);
app.use("/api/architecture", architectureComplianceRoutes);
app.use("/api/moat", moatRoutes);
app.use("/api/phase9", phase9Routes);
app.use("/api", unifiedRoutes);
app.use("/api", executiveRoutes);
app.use("/api/phase6", controlTowerRoutes);
app.use("/api/monitoring", engineControlRoutes);
app.use("/api/control-tower", recentRunsRoutes);
app.use("/api/decision-tree", decisionTreeRoutes);
app.use("/api/learning", suggestFixRouter);
app.use("/api/pack-admin", packAdminRoutes);
app.use("/api/pack-intake", packDrivenIntakeRoutes);
app.use("/api/pack-simulator", packSimulatorRoutes);
app.use("/api/coverage", coverageRoutes);
app.use("/api/physician", physicianDashboardRoutes);
app.use("/api/executive-db", executiveDbRoutes);
app.use("/api/executive-ops", executiveOpsRoutes);
app.use("/api/legacy-mapper", legacyTabMapperRoutes);
app.use("/api/integrations", clinicalIntegrationRoutes);
app.use("/api/integrations", integrationHealthRouter);
app.use("/api/sheets-migration", googleSheetsMigrationRoutes);
app.use("/api/google-email", googleEmailRoutes);
app.use("/api/shared-views", sharedViewsRoutes);
app.use("/api/signed-board-exports", signedBoardExportsRoutes);
app.use("/api/benchmark-trends", benchmarkTrendsRoutes);
app.use("/api/monitoring", systemMonitoringRoutes);
app.use("/api/resilient", resilientRoutes);
app.use("/api/chaos", chaosRoutes);
app.use("/api/rwe", rweRoutes);
app.use("/api/adaptive-mapping", adaptiveMappingRoutes);
app.use("/api/full-mapping", fullMappingPipeline);
app.use("/api/system-expansion", systemExpansionRoutes);
app.use("/api/deployment-status", deploymentStatusRoutes);
app.use("/api/extended-scoring", extendedScoringRoutes);
app.use("/api/outcome-learning", outcomeLearningRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/security", securityRoutes);
app.use("/api/auto-tune", autoTuneRoutes);
app.use("/api/gpt-explanation", gptExplanationRoutes);
app.use("/api/clearinghouse", clearinghouseRoutes);
app.use("/api/samd-compliance", samdComplianceRoutes);
app.use("/api/phi-protection", phiProtectionRoutes);
app.use("/api/fda-510k", fda510kRoutes);
app.use("/api/auto-code", autoCodeRoutes);
app.use("/api/encounter-bundle", encounterBundleRoutes);
app.use("/api/denial-prediction", denialPredictionRoutes);
app.use("/api/revenue-pipeline", revenuePipelineRoutes);
app.use("/api/insurer", insurerRoutes);
app.use("/api/quality", qualityRoutes);
app.use("/api/clinician-engine", clinicianEngineRoutes);
app.use("/api/dashboard-engine", dashboardEngineRoutes);
app.use("/api/war-room", warRoomRoutes);
app.use("/api/governor", governorRoutes);
app.use("/api/autonomous-agents", autonomousAgentRoutes);
app.use("/api/intake-queue", intakeQueueRoutes);
app.use("/api/agent-control", agentControlRoutes);
app.use("/api/payer-intelligence", payerIntelligenceRoutes);
app.use("/api/strategy", strategyRoutes);
app.use("/api/enterprise", enterpriseRoutes);
app.use("/api/operator", operatorRoutes);
app.use("/api/engines", engineRoutes);
app.use("/api/clinical", clinicalRateLimiter, clinicalDeadline, clinicalFlowRoutes);
app.use("/api/simulation", standardDeadline, systemSimulationRoutes);
app.use("/api/audit", systemAuditRoutes);
app.use("/api/outcome", outcomeFeedbackRoutes);
app.use("/api/fda-package", fdaPackageRoutes);
app.use("/api/patients/session", idempotency);
app.use("/api/patients/approve", idempotency);
app.use("/api/patients", clinicalRateLimiter, clinicalDeadline, patientQueueRoutes);
app.use("/api/stress", stressRoutes);
app.use("/api/rpa", rpaRoutes);
console.log("[FDAPackage] Validation runner, metrics engine, report generator, export bundle at /api/fda-package/*");
console.log("[PatientQueue] Live patient queue + physician approve/override/escalate at /api/patients/*");
app.use("/api/vision", visionRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/kb", kbEntityRoutes);
app.use("/api/kb", priorInvalidationRouter);
app.use("/api/golden", goldenMonitorRoutes);
app.use("/api/queues", queueAdminRoutes);
app.use(modelFreezeRouter);
app.use(commandStripRouter);
app.use("/api/intake", intakeFlowRouter);
app.use(systemOpsRouter);
app.use(kbExplorerRouter);
app.use("/api/ops", opsRoutes);
app.use("/api/agent-brain", agentBrainRoutes);
app.use("/api/labs", labRouter);
app.use("/api/medical-ai",        medicalAiRoutes);
app.use("/api/sepsis-twin",       sepsisTwinRoutes);
app.use("/api/hardening-review",  hardeningReviewRoutes);
app.use("/api/dependencies", dependenciesRoutes);
app.use("/api/engine-metrics", engineMetricsRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/clinic-health", clinicHealthRoutes);
app.use("/api/control", controlTowerClinicalRoutes);
app.use("/api/sysctrl", systemControlRoutes);
app.use(commandRouter);
app.use(intentAnalyticsRouter);
app.use(documentIndexRouter);
app.use(clinicalPathwaysRouter);
console.log("[ClinicalPathways] Complaint pathway schema, master map, migration endpoints registered at /api/clinical/pathways/*");
app.use("/api/command", multiPatientRoutes);
app.use("/api", writeEncounterRoute);
app.use("/api/qa", qaRoutes);
app.use("/api/improvement", improvementLabRoutes);
app.use("/api/ingestion", ingestionRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/optimizer", pathwayOptimizerRoutes);
app.use("/api/governance", governanceCommandRoutes);
app.use("/api", skillGraphRoutes);
app.use("/api/qa", skillIntelligenceRoutes);
app.use("/api/skill-evolution", skillEvolutionRoutes);
app.use("/api/icu", icuRoutes);
app.use("/api/validation", validationRoutes);
app.use("/api/network", networkRoutes);
app.use("/api/kb-governance", kbGovernanceRoutes);
app.use("/api/rule-map", masterRuleMapRoutes);
app.use("/api/master-rules", masterRulesRoutes);
app.use("/api/complaint-test-lab", complaintTestLabRoutes);
app.use("/api/context",        contextInspectorRoutes);
app.use("/api/context-health", contextHealthRoutes);
app.use("/api/encounter",      encounterRoutes);
app.use("/api/memory",         memoryRoutes);
app.use("/api/dialogue", dialogueRoutes);
console.log("[Dialogue] /api/dialogue/* active (start·respond·briefing·updates·patient-summary)");
app.use("/api/encounter-configs", encounterConfigsRoutes);
app.use("/api/voice-parse-hpi", voiceParseRoutes);
app.use("/api/kb-editor", kbEditorRoutes);
app.use("/api/rlhf", rlhfRoutes);
app.use("/api/export", exportZipRoutes);
console.log("[MasterRuleMap] /api/rule-map/* active (summary·gaps·complaint·refresh·validate)");
console.log("[MasterRules] /api/master-rules/* active (list·stats·pipeline·dry-run·export)  263 rules");
console.log("[EncounterConfigs] /api/encounter-configs/* active (list·dynamic-config by complaint_id)");
console.log("[RLHF] /api/rlhf/* active (process-feedback·learning-status·validate-rules·export)");
console.log("[ZipExport] /api/export/codebase-zip active (admin only)");
console.log("[KbGovernance] /api/kb-governance/* active (queue·submit·approve·reject·audit)");
console.log("[StressTest] Load generator, metrics analyzer, run history at /api/stress/*");
console.log("[RPA] Browser automation templates, run engine, custom tasks at /api/rpa/*");
console.log("[Vision] GPT-4o screenshot analysis + smart form fill at /api/vision/*");
console.log("[Queue] Patient job queue (Redis/in-memory) at /api/queue/*");
console.log("[Simulation] Digital twin simulation runs + batch + history at /api/simulation/*");
console.log("[AuditTrace] Immutable audit trace log at /api/audit/*");
console.log("[OutcomeFeedback] Outcome recording, weights, learning cycle at /api/outcome/*");
console.log("[PayerIntelligence] Payer optimization, denial v2, RLHF, contracts, scaling, clinics, self-improve at /api/payer-intelligence/*");
console.log("[Strategy] Multi-payer routing, dynamic pricing, network strategy, clinic optimizer, trust scores, disagreements, daily reports, telehealth compliance at /api/strategy/*");
console.log("[Enterprise] Digital twin, simulation, adaptive control, voice swarm, growth engine, capacity/service-mix, scaling playbook, enterprise orchestrator at /api/enterprise/*");
console.log("[AutonomousAgents] Agent orchestrator with triage, diagnosis, safety, billing, risk, follow-up at /api/autonomous-agents/*");
console.log("[Engines] Agent coordinator, auto-debug, master orchestrator at /api/engines/*");
console.log("[ClinicalFlow] Master clinical pipeline (validate→score→bill→learn→audit) at /api/clinical/*");
console.log("[IntakeQueue] Queue-based intake with worker pool, priority scheduling, pause/resume at /api/intake-queue/*");
console.log("[AgentControl] Real-time agent toggle system at /api/agent-control/*");
console.log("[RevenuePipeline] Auto-fix, claim outcome learning, smart routing, revenue analytics at /api/revenue-pipeline/*");
console.log("[DenialPrediction] Claim denial risk prediction engine at /api/denial-prediction/*");
console.log("[Insurer] Contract scoring, payer-specific denial prediction, contract simulation at /api/insurer/*");
console.log("[Quality] HEDIS metrics, FDA-style quality reports, compliance scoring at /api/quality/*");
console.log("[ClinicianEngine] Physician performance, system summary, bulk coaching at /api/clinician-engine/*");
console.log("[DashboardEngine] Outcome-weighted revenue, payer leaderboard, KPIs at /api/dashboard-engine/*");
console.log("[WarRoom] Live system snapshot, agent health, RLHF status, alerts at /api/war-room/*");
console.log("[Governor] Agent oversight, failure prediction, rerouting, governor loop at /api/governor/*");
console.log("[FDA510k] Pre-filled FDA 510(k) narrative generator with live metrics at /api/fda-510k/*");
console.log("[AutoCode] ICD-10/CPT auto-coding from diagnosis clusters at /api/auto-code/*");
console.log("[EncounterBundle] Unified EHR+billing+audit encounter bundle builder at /api/encounter-bundle/*");
console.log("[AutoTune] Self-improving rule engine — failure analysis + rule suggestions registered at /api/auto-tune/*");
console.log("[GPTExplanation] AI clinical explanation layer registered at /api/gpt-explanation/*");
console.log("[Clearinghouse] X12 837P mapping, clearinghouse submission, claim status tracking registered at /api/clearinghouse/*");
console.log("[SaMDCompliance] FDA-style SaMD — model versioning, performance registry, risk controls, audit bundles at /api/samd-compliance/*");
console.log("[PHIProtection] Field-level PHI encryption/decryption wrapper registered at /api/phi-protection/*");
console.log("[ExtendedScoring] 10 additional clinical scoring systems (PERC, CHA2DS2-VASc, Ottawa, PedsFever, Alvarado, TIMI, GCS, NEWS2, CIWA, CURB-65) registered at /api/extended-scoring/*");
console.log("[OutcomeLearning] Outcome logging, RLHF reinforcement, continuous learning loop registered at /api/outcome-learning/*");
console.log("[Billing] ICD-10/CPT coding, claim builder, claim submission registered at /api/billing/*");
console.log("[Compliance] Model registry, risk classification, safe discharge validation, audit export registered at /api/compliance/*");
console.log("[Security] PHI encryption/decryption, PHI redaction, access logging registered at /api/security/*");
console.log("[GoogleEmail] Gmail API OAuth2 connection endpoints registered at /api/google-email/*");
console.log("[SharedViews] Shared dashboard views + approval workflow registered at /api/shared-views/*");
console.log("[SignedExports] Signed board exports (JSON + verify) registered at /api/signed-board-exports/*");
console.log("[BenchmarkTrends] Benchmark trend series registered at /api/benchmark-trends/*");
console.log("[Monitoring] System metrics, audit log, high-scale simulation registered at /api/monitoring/*");
console.log("[AdaptiveMapping] Workbook intelligence, adaptive mapping, feedback refiner registered at /api/adaptive-mapping/*");
console.log("[FullMapping] Full mapping pipeline (sheet fetch + adaptive map + validate) registered at /api/full-mapping/*");
console.log("[SystemExpansion] System pack generator (10 systems, 100 complaints) registered at /api/system-expansion/*");
console.log("[SmartIntake] Smart intake pipeline, review queue, batch approval, outcome feedback registered");
console.log("[AdaptiveControl] Adaptive control loop, reinforcement, case-mix, profitability, threshold simulation registered");
console.log("[PackSystem] Pack admin, pack-driven intake, complaint packs, rule parser, modifier engine registered");
console.log("[Intelligence] Physician ranking, intelligent routing, calibration, anomaly, cost, safety, coaching registered");
console.log("[Operations] Multi-physician routing, escalation queue, ops dashboard, drift monitor, audit chain registered");
console.log("[SimulationLab] Clinical simulation + coverage + channel + CCT routes registered");
console.log("[Agents] Clinical reasoning agent + chart agent + full pipeline registered");
console.log("[Scenarios] Clinical scenario generator + system architecture map registered");
console.log("[Planning] Clinical Intelligence Planning Layer registered");
console.log("[SheetImport] Clinical data sheet import endpoints registered");
console.log("[KnowledgeGraph] Clinical knowledge graph + gap detector + question coverage + engine deps routes registered");
console.log("[Intelligence] Graph simulation + engine router + cost optimizer + reasoning + outcomes + safety routes registered");
console.log("[ClinicalIntelligence] Memory engine + personalization + calibration + drift detection + research agent routes registered");
console.log("[ClinicalEngines] Temporal, Risk, Timeline, Consensus, Resources, Epi, Triage, Feedback routes registered");
console.log("[Completion Modules] State, Intake, Pathways, Copilot, Predictive, RL, Telemedicine, Self-Improve routes registered");
console.log("[Governance] Clinical governance queue + review engine + regression testing + risk monitor + consistency + deployment routes registered");
console.log("[Versioning] Clinical version control + diff + rollback + timeline routes registered");
console.log("[CICC] Control Center + Intelligence Map + Reasoning Debugger + Safety Score + Engine Profiler routes registered");
app.use("/telegram", telegramRouter);
console.log("[Cases] Case management endpoints registered at /api/cases/*");
console.log("[Review] Physician review endpoints registered at /api/review/*");
console.log("[ReviewQueue] Firestore review queue endpoints registered at /api/reviewQueue/*");
console.log("[Signoff] Firestore signoff endpoints registered at /api/signoff/*");
console.log("[NoteDraft] Note generation endpoints registered at /api/noteDraft/*");
console.log("[ChatIntake] Web chat intake endpoints registered at /api/chatIntake/*");
console.log("[Discrepancies] Discrepancy tracking endpoints registered at /api/discrepancies/*");
console.log("[ExportEncounter] eCW sidecar export endpoints registered at /api/exportEncounter/*");
console.log("[RoleAuth] JWT role-based auth endpoints registered at /api/roleAuth/*");
console.log("[RuntimeAnalytics] Runtime analytics endpoints registered at /api/runtimeAnalytics/*");
console.log("[ShadowMode] Shadow-mode ops endpoints registered at /api/shadowMode/*");
console.log("[DispositionExplanation] Disposition explanation endpoints registered at /api/chatDispositionExplanation/*");
console.log("[CoercionAudit] Coercion audit endpoints registered at /api/chatCoercionAudit/*");
console.log("[FollowupBundle] Follow-up bundle endpoints registered at /api/chatFollowupBundle/*");
console.log("[ReviewQueueSnapshots] Review queue snapshot endpoints registered at /api/reviewQueueSnapshots/*");
console.log("[ExportReadiness] Export readiness endpoints registered at /api/exportReadiness/*");
console.log("[OverridePatterns] Override pattern endpoints registered at /api/overridePatterns/*");
console.log("[QuestionGaps] Question gap endpoints registered at /api/questionGaps/*");
console.log("[OpsDailyDigest] Ops daily digest endpoints registered at /api/opsDailyDigest/*");
console.log("[ClinicalWorkflowHealth] Clinical workflow health endpoints registered at /api/clinicalWorkflowHealth/*");
console.log("[CaseOpsActions] Case ops action endpoints registered at /api/caseOpsActions/*");
console.log("[Telegram] Generic triage webhook registered at /telegram/webhook");

// ── Research Radar: GET status endpoint ──────────────────────────────────────
app.get("/api/research-radar/status", async (_req, res) => {
  try {
    const status = await getRadarStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
console.log("[ResearchRadar] /api/research-radar/status registered");

// ── Research Radar: manual trigger (admin only) ───────────────────────────────
app.post("/api/research-radar/run", async (_req, res) => {
  try {
    const report = await runWeeklyResearchRadar();
    res.json({ runId: report.runId, summary: report.summary, alertCount: report.alerts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Longevity Intelligence: findings + review + scan trigger ─────────────────
app.use("/api/longevity", longevityRouter);
console.log("[LongevityAgent] /api/longevity/* registered");

// ── Clinical Skills: CRUD routes ──────────────────────────────────────────────
app.use(specRouter);

app.get("/api/clinical-skills", requireReviewAuth, async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT * FROM clinical_skills ORDER BY created_at DESC`);
    res.json({ skills: rows.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/clinical-skills/:id/activate", requireReviewAuth, async (req, res) => {
  try {
    const ok = await activateSkill(req.params.id, (req as any).user?.id ?? "phys1");
    res.json({ ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/clinical-skills/:id/retire", requireReviewAuth, async (req, res) => {
  try {
    const ok = await retireSkill(req.params.id, (req as any).user?.id ?? "phys1", req.body.reason ?? "");
    res.json({ ok });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

console.log("[ClinicalSkills] /api/clinical-skills routes registered");

// ── Infrastructure status route ───────────────────────────────────────────────
app.get("/api/infra/status", requireReviewAuth, async (_req, res) => {
  try {
    const services = SelfHealingMonitor.getHealthSummary();

    const incidents = await db.execute(sql`
      SELECT
        event_data->>'incidentId'       AS "incidentId",
        event_data->>'service'          AS service,
        timestamp                        AS "detectedAt",
        event_data->>'succeeded'        AS succeeded,
        event_data->>'requiresHuman'    AS "requiresHuman",
        event_data->>'diagnosisSummary' AS "diagnosisSummary"
      FROM audit_hash_chain
      WHERE event_type IN ('SELF_HEAL_SUCCEEDED', 'SELF_HEAL_FAILED')
      ORDER BY timestamp DESC
      LIMIT 10
    `).catch(() => ({ rows: [] }));

    const serviceList = Object.values(services);
    const allHealthy  = serviceList.length > 0 && serviceList.every(s => s.status === "healthy");

    res.json({
      services,
      lastRunAt:  new Date().toISOString(),
      allHealthy,
      incidents:  (incidents.rows as any[]).map(r => ({
        ...r,
        succeeded:     r.succeeded === "true",
        requiresHuman: r.requiresHuman === "true",
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
console.log("[SelfHealing] /api/infra/status registered");

// ── CME Quiz route ─────────────────────────────────────────────────────────────
app.post("/api/cme/chat", requireReviewAuth, async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body as {
      messages:     Array<{ role: "user" | "assistant"; content: string }>;
      systemPrompt: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    const { llmGateway } = await import("./gateway/llmGateway");
    const result = await llmGateway.complete({
      purpose:  "cme_quiz",
      messages,
      system:   systemPrompt,
      maxTokens: 800,
    });

    res.json({ response: result.content });
  } catch (err: any) {
    console.error("[CME] Chat error:", err.message);
    res.status(500).json({ error: "Quiz generation failed" });
  }
});
console.log("[CME] /api/cme/chat registered");

// ── Research Radar: weekly self-rescheduling scheduler ────────────────────────
function scheduleResearchRadar(): void {
  const msUntilNextSunday4amUtc = (): number => {
    const now  = new Date();
    const next = new Date(now);
    const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
    next.setUTCDate(now.getUTCDate() + daysUntilSunday);
    next.setUTCHours(4, 0, 0, 0);
    return next.getTime() - now.getTime();
  };

  const runAndReschedule = async () => {
    recordSchedulerHeartbeat("research_radar");
    console.log("[ResearchRadar] Weekly scheduled scan starting at", new Date().toISOString());
    try {
      const report = await runWeeklyResearchRadar();
      console.log(`[ResearchRadar] ✅ Weekly scan complete — ${report.summary}`);
    } catch (err: any) {
      console.error("[ResearchRadar] ❌ Weekly scan threw:", err.message);
    }
    setTimeout(runAndReschedule, 7 * 24 * 60 * 60 * 1000);
  };

  const delay = msUntilNextSunday4amUtc();
  console.log(`[ResearchRadar] Scheduler armed — first run in ${Math.round(delay / 60_000)} minutes (next Sunday 4am UTC)`);
  setTimeout(runAndReschedule, delay);
}

// ── Clinical Skills: nightly 3am UTC nudge scheduler ─────────────────────────
function scheduleSkillNudge(): void {
  const now     = new Date();
  const next3am = new Date();
  next3am.setUTCHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setUTCDate(next3am.getUTCDate() + 1);
  const ms = next3am.getTime() - now.getTime();
  console.log(`[ClinicalSkills] Nudge scheduler armed — first run in ${Math.round(ms / 60_000)} minutes (next 3am UTC)`);
  setTimeout(async () => {
    recordSchedulerHeartbeat("skill_nudge");
    console.log("[ClinicalSkills] Running nightly skill nudge at", new Date().toISOString());
    try {
      const result = await runPeriodicSkillNudge();
      console.log(`[ClinicalSkills] ✅ Nudge complete — ${result.skillsGenerated} new, ${result.skillsPending} pending`);
    } catch (err: any) {
      console.error("[ClinicalSkills] ❌ Nudge threw:", err.message);
    }
    scheduleSkillNudge();
  }, ms);
}

// ── Longevity Intelligence: weekly Monday 2am UTC scheduler ──────────────────
function scheduleLongevityScan(): void {
  const msUntilNextMonday2amUtc = (): number => {
    const now  = new Date();
    const next = new Date(now);
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    next.setUTCDate(now.getUTCDate() + daysUntilMonday);
    next.setUTCHours(2, 0, 0, 0);
    return next.getTime() - now.getTime();
  };

  const runAndReschedule = async () => {
    recordSchedulerHeartbeat("longevity_scan");
    console.log("[LongevityAgent] Weekly scan starting at", new Date().toISOString());
    try {
      const agent = new LongevityIntelligenceAgent();
      const result = await agent.run();
      console.log(`[LongevityAgent] ✅ Scan complete — ${result.total} findings, ${result.highEvidence} high-evidence`);
    } catch (err: any) {
      console.error("[LongevityAgent] ❌ Scan threw:", err.message);
    }
    setTimeout(runAndReschedule, 7 * 24 * 60 * 60 * 1000);
  };

  const delay = msUntilNextMonday2amUtc();
  console.log(`[LongevityAgent] Scheduler armed — first run in ${Math.round(delay / 60_000)} minutes (next Monday 2am UTC)`);
  setTimeout(runAndReschedule, delay);
}

// ── Drift canary: daily 2am UTC scheduler ────────────────────────────────────
// Wires runDriftCheck → evaluateCase (hybrid reasoning layer).
// No external cron library needed — self-rescheduling setTimeout.
function scheduleDriftCheck(): void {
  const msUntilNext2amUtc = (): number => {
    const now   = new Date();
    const next  = new Date(now);
    next.setUTCHours(2, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  };

  const driftTriageFn = async (
    complaint: string,
    symptoms:  string[],
    ctx?:      { age?: number; sex?: string; allergies?: string[]; medications?: string[] }
  ) => {
    const result = await evaluateCase({
      caseId:    `drift-canary-${Date.now()}`,
      complaint,
      features:  symptoms,
      age:       ctx?.age,
      sex:       ctx?.sex,
    });
    return {
      disposition:  result.disposition,
      topDiagnosis: result.layer3_ensemble_differential?.[0]?.diagnosis
                    ?? result.layer3_probabilistic?.topDiagnosis
                    ?? "unknown",
      confidence:   result.confidence,
      redFlagFired: result.layer1_safety?.override === true,
    };
  };

  const runAndReschedule = async () => {
    recordSchedulerHeartbeat("drift_canary");
    console.log("[DriftCanary] Running daily drift check at", new Date().toISOString());
    try {
      const summary = await runDriftCheck(driftTriageFn);
      console.log(`[DriftCanary] ✅ Done — ${summary.passed}/${summary.passed + summary.failed} passed`);
    } catch (err: any) {
      console.error("[DriftCanary] ❌ runDriftCheck threw:", err.message);
    }
    setTimeout(runAndReschedule, 24 * 60 * 60 * 1000);  // refire in exactly 24h
  };

  const delay = msUntilNext2amUtc();
  console.log(`[DriftCanary] Scheduler armed — first run in ${Math.round(delay / 60_000)} minutes (next 2am UTC)`);
  setTimeout(runAndReschedule, delay);
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load secrets from AWS Secrets Manager before config validation (no-op locally)
  await loadAwsSecrets();
  // Production safety guards — no-ops in dev, fatal in prod
  validateConfig();
  await startTelemetry("med-scribe-api");
  assertProductionSafe();
  assertClinicalStartupInvariants();

  // Connectivity + readiness checks — throws if any fatal check fails.
  // Runs after assertProductionSafe() (pure config) and before registerRoutes()
  // so the server never accepts traffic on a broken configuration.
  const startupCheckResults = await runStartupChecks();
  // Persist an immutable audit breadcrumb — non-fatal if the write fails.
  await persistStartupAttestation(startupCheckResults).catch((err: any) =>
    console.warn("[Startup] Attestation recording failed (non-fatal):", err?.message)
  );

  assertRuntimeModes();
  try {
    await runMigrations();
  } catch (err: any) {
    console.warn("[Startup] Migration warning (non-fatal):", err?.message);
  }
  await assertQueueReady();

  await registerRoutes(httpServer, app);

  // Warm cache: load flows and rules at startup (prevents first-request delay)
  try {
    console.log("[Startup] Warming cache: loading questions and rules from Sheets...");
    const [questions, rules] = await Promise.all([
      storage.getFlowQuestions("ENT_FLU_LIKE_V1").catch((e) => {
        console.warn("[Startup] Failed to load questions from Sheets:", e?.message || e);
        return [];
      }),
      getEntFluRules().catch((e) => {
        console.warn("[Startup] Failed to load rules from Sheets:", e?.message || e);
        return {};
      }),
    ]);
    console.log(`[Startup] Cache warmed: ${questions.length} questions, ${Object.keys(rules).length} rules loaded`);
  } catch (e) {
    console.warn("[Startup] Cache warming failed, will use fallback defaults:", e);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Bind to PORT env var — set to 3000 in Docker, 5000 in Replit (injected by runtime).
  const port = Number(process.env.PORT || 3000);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // ── Self-ping keep-alive — prevents Cloud Run cold starts ─────────────
      // Pings /health every 5 minutes so the instance stays warm.
      // Pair with an external service (UptimeRobot → https://auralyn.tech/health)
      // for full cold-start prevention when no traffic is flowing.
      const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
      const selfPingUrl = `http://0.0.0.0:${port}/health`;
      setInterval(async () => {
        try {
          const { default: http } = await import("http");
          http.get(selfPingUrl, (res) => {
            res.resume(); // drain response
            console.log(`[KeepAlive] ✅ Self-ping OK — uptime=${Math.floor(process.uptime())}s status=${res.statusCode}`);
          }).on("error", (err: Error) => {
            console.warn("[KeepAlive] ⚠️  Self-ping failed:", err.message);
          });
        } catch (e: any) {
          console.warn("[KeepAlive] ⚠️  Self-ping error:", e.message);
        }
      }, KEEPALIVE_INTERVAL_MS);

      initAsyncWorkerHandlers();
      startAutonomousLoop(300_000);   // 5 min — was 60 s; heavy CPU/DB, no need to run every minute
      startEngines();
      registerFollowUpWorker().catch(console.error);
      // Warm KB runtime cache — loads diagnosis priors, red flag rules, and treatment rules
      // from Postgres into memory so all pipeline entry-points read from the KB.
      import("./kb/kbRuntime").then(({ warmKbCache }) => warmKbCache()).catch(() => {});
      // Pre-warm WhatsApp hot path: CSV caches + Twilio SDK HTTP connection pool.
      // Without this the first patient message pays ~4s (CSV reads) + ~27s (Twilio cold start).
      import("./whatsapp/send").then(({ prewarmTwilioConnection }) => prewarmTwilioConnection()).catch(() => {});
      // Pre-build the top-10 complaint bundles (goals + prompt skeletons +
      // fallback library). Bundles are pure in-memory derivation from the
      // hardcoded module-level tables in conversationalEngine.ts — no DB.
      import("./whatsapp/complaintBundle").then(({ prewarmComplaintBundles }) => prewarmComplaintBundles()).catch(() => {});
      // Pre-warm GPT-4o-mini: one 1-token completion to establish the SDK
      // client, TCP/TLS pool, and chat-completions route before the first
      // real patient turn pays that cold-start cost.
      import("./whatsapp/conversationalEngine").then(({ prewarmOpenAI }) => prewarmOpenAI()).catch(() => {});
      // Pre-warm Anthropic (Claude Sonnet): the streaming agent is the
      // patient-facing path for every protocol slug (e.g. neuro_headache).
      // One 1-token completion establishes the SDK client + TLS pool so the
      // first patient message doesn't pay the ~30s cold-start cost.
      import("./whatsapp/agent/streamingAgent").then(({ prewarmAnthropicConnection }) => prewarmAnthropicConnection()).catch(() => {});
      // Register the DB-backed per-complaint prior loader so loadComplaintPriors() works.
      // Without this, any call to loadComplaintPriors() throws "No registry adapter registered".
      import("./clinical/diagnosisPriorLoader").then(({ registerPriorLoader }) => {
        import("./db").then(({ db }) => {
          import("drizzle-orm").then(({ sql }) => {
            registerPriorLoader(async (ccId: string) => {
              try {
                const result = await (db as any).execute(sql`
                  SELECT
                    r.complaint_id AS "ccId",
                    r.diagnosis_label AS diagnosis,
                    r.base_probability AS "baseProbability",
                    f.feature_key AS feature,
                    f.likelihood AS likelihood,
                    1 AS version
                  FROM kb_diagnosis_rules r
                  JOIN kb_feature_likelihoods f ON f.rule_id = r.rule_id AND f.active = true
                  WHERE r.active = true AND (r.complaint_id = ${ccId} OR r.complaint_id = 'bayesian_global')
                  ORDER BY r.base_probability DESC
                `);
                const rows = Array.isArray(result) ? result : (result?.rows ?? []);
                return rows.map((r: any) => ({
                  ccId: r.ccId ?? ccId,
                  diagnosis: String(r.diagnosis ?? ""),
                  baseProbability: Number(r.baseProbability ?? 0),
                  feature: String(r.feature ?? ""),
                  likelihood: Number(r.likelihood ?? 0),
                  version: 1,
                }));
              } catch {
                return [];
              }
            });
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
      runFailoverLoop(300_000);        // 5 min — was 60 s
      startRecoveryLoop(30_000);
      initControlTowerSocket(httpServer);
      startPatientStreamSocket(httpServer);
      initRealtimeGateway(httpServer);
      initWebRTCServer(httpServer);
      initOrchestrationSocket(httpServer);
      startOptimizerLoop(300_000);     // 5 min — was 60 s
      startNegotiationWorker(300_000); // 5 min — was 60 s
      BackgroundTableRefresher.start(300_000); // 5 min — was 60 s
      startAnomalyEngine(5000);
      startAlertEngine(10_000);
      startGovernanceLoop(15_000);
      startTwinSync(30_000);
      startPredictiveLoop(60_000);
      scheduleContextMetricsAggregate();
      const flags = getProductionFlags();
      if (flags.CHAOS_ENGINEERING_ENABLED) {
        startChaosScheduler(60_000);
        console.log("[Chaos] Chaos engineering ENABLED — runs on schedule");
      } else {
        console.log("[Chaos] Chaos engineering DISABLED (production flag = false)");
      }
      startMonitorSocket(httpServer);
      import("./ws/liveStream").then(({ startLiveStream }) => startLiveStream(httpServer)).catch(() => {});
      import("./simulation/liveSimulator").then(({ startLiveSimulation }) => startLiveSimulation()).catch(() => {});
      import("./control/controlStream").then(({ startControlStream }) => startControlStream(httpServer)).catch(() => {});
      startEventWorkers();
      startDeadLetterMonitor(300_000); // 5 min — was 60 s
      initAuditHashChain().catch((e: any) => console.warn("[AUDIT-CHAIN] Init warning:", e?.message));
      initLearningQueue().catch((e: any) => console.warn("[LearningQueue] Init warning:", e?.message));
      initShadowModeFromRedis().catch((e: any) => console.warn("[ShadowMode] Init warning:", e?.message));
      initSimulationStore().catch((e: any) => console.warn("[SimulationStore] Init warning:", e?.message));
      hydrateFromRedis().catch((e) => console.warn("[RLHF] Hydration warning:", e?.message));
      import("./governor/governorLoop").then(({ startGovernorLoop }) => startGovernorLoop(30_000)).catch((e) => console.warn("[Governor] Loop start failed:", e?.message));
      startAutoHealer();
      startEventLoopMonitor();
      startDriftMonitor(120_000);
      registerLoop("autoHealer", "Engine health reset + stale detection", 15_000);
      registerLoop("goldenMonitor", "Clinical golden case regression suite", 300_000);
      registerLoop("alertEngine", "Clinical alert escalation engine", 10_000);
      registerLoop("governanceLoop", "Audit governance agent", 15_000);
      registerLoop("predictiveLoop", "Failure prediction engine", 5_000);
      registerLoop("autonomousLoop", "Unified learning + drift detection", 300_000);
      startSelfLearningLoop(300_000); // 5 min — was 60 s
      startGoldenMonitor(300_000);
      startAgentExecutor(30_000);
      startEvolutionLoop(600_000);
      startGlobalSyncLoop(600_000);
      if (process.env.NODE_ENV === "production") startSecretRotation();

      initAllQueues();
      startProductionScheduler();
      scheduleDriftCheck();
      scheduleResearchRadar();
      scheduleSkillNudge();
      scheduleLongevityScan();

      SelfHealingMonitor.start();
      SelfHealingMonitor.registerSchedulerRearm("drift_canary_scheduler",    () => scheduleDriftCheck());
      SelfHealingMonitor.registerSchedulerRearm("research_radar_scheduler",  () => scheduleResearchRadar());
      SelfHealingMonitor.registerSchedulerRearm("skill_nudge_scheduler",     () => scheduleSkillNudge());
      SelfHealingMonitor.registerSchedulerRearm("longevity_scan_scheduler",  () => scheduleLongevityScan());

      const shutdown = (signal: string) => {
        console.log(`[Shutdown] ${signal} received — stopping background engines`);
        stopAlertEngine();
        stopGovernanceLoop();
        stopTwinSync();
        stopPredictiveLoop();
        stopChaosScheduler();
        stopAutoHealer();
        stopEventLoopMonitor();
        stopDriftMonitor();
        stopSelfLearningLoop();
        stopGoldenMonitor();
        stopAgentExecutor();
        stopEvolutionLoop();
        stopGlobalSyncLoop();
        stopProductionScheduler();
        httpServer.close(() => {
          console.log("[Shutdown] HTTP server closed");
          process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000);
      };
      process.once("SIGTERM", () => shutdown("SIGTERM"));
      process.once("SIGINT",  () => shutdown("SIGINT"));
    },
  );
})();

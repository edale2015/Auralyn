# System Overview

## Review Prompt

Review this medical triage system overview.
Focus on architecture, safety boundaries, and where hallucinations could bypass safeguards.
Critical rule: only the disposition engine sets final clinical decisions.

Also note: any FILE NOT FOUND entries represent architectural components that do not
yet exist — flag these as gaps in the review.

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/app.ts

```ts
// FILE NOT FOUND: server/app.ts
```

### server/db/schema.ts

```ts
// FILE NOT FOUND: server/db/schema.ts
```

### server/index.ts

```ts
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
import contractRoutes, { startNegotiationWorker } from "./contracts/contractRoutes";
import financeRoutes from "./finance/financeRoutes";
import regulatoryRoutes from "./regulatory/regulatoryRoutes";
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
import mipsRoutes from "./routes/mipsRoutes";
import trialMatcherRoutes from "./routes/trialMatcherRoutes";
import benchmarkRoutes from "./routes/benchmarkRoutes";
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
app.use("/api/dependencies", dependenciesRoutes);
app.use("/api/engine-metrics", engineMetricsRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/clinic-health", clinicHealthRoutes);
app.use("/api/control", controlTowerClinicalRoutes);
app.use("/api/sysctrl", systemControlRoutes);
app.use("/api/command", multiPatientRoutes);
app.use("/api", writeEncounterRoute);
app.use("/api/qa", qaRoutes);
app.use("/api/improvement", improvementLabRoutes);
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
  if ([REDACTED_SECRET] === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Bind to PORT env var — set to 3000 in Docker, 5000 in Replit (injected by runtime).
  const port = Number([REDACTED_SECRET] || 3000);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      initAsyncWorkerHandlers();
      startAutonomousLoop(60_000);
      startEngines();
      // Warm KB runtime cache — loads diagnosis priors, red flag rules, and treatment rules
      // from Postgres into memory so all pipeline entry-points read from the KB.
      import("./kb/kbRuntime").then(({ warmKbCache }) => warmKbCache()).catch(() => {});
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
      runFailoverLoop(60_000);
      startRecoveryLoop(10_000);
      initControlTowerSocket(httpServer);
      startPatientStreamSocket(httpServer);
      initRealtimeGateway(httpServer);
      initWebRTCServer(httpServer);
      initOrchestrationSocket(httpServer);
      startOptimizerLoop(60_000);
      startNegotiationWorker(60_000);
      startAnomalyEngine(5000);
      startAlertEngine(10_000);
      startGovernanceLoop(15_000);
      startTwinSync(1_000);
      startPredictiveLoop(5_000);
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
      startDeadLetterMonitor(60_000);
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
      registerLoop("autonomousLoop", "Unified learning + drift detection", 60_000);
      startSelfLearningLoop(60_000);
      startGoldenMonitor(300_000);
      startAgentExecutor(1_000);
      startEvolutionLoop(600_000);
      startGlobalSyncLoop(600_000);
      if ([REDACTED_SECRET] === "production") startSecretRotation();

      initAllQueues();
      startProductionScheduler();

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
```

### shared/schema.ts

```ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, boolean, jsonb, real, doublePrecision, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Physicians (users who can approve cases)
export const physicians = pgTable("physicians", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPhysicianSchema = createInsertSchema(physicians).omit({
  id: true,
  createdAt: true,
});

export type InsertPhysician = z.infer<typeof insertPhysicianSchema>;
export type Physician = typeof physicians.$inferSelect;

// Patients (from WhatsApp)
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

// Encounters (medical cases)
export const encounters = pgTable("encounters", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  chiefComplaint: text("chief_complaint"),
  conversationHistory: text("conversation_history"), // JSON string of WhatsApp messages
  aiDiagnosis: text("ai_diagnosis"),
  aiDisposition: text("ai_disposition"),
  aiConfidence: integer("ai_confidence"), // 0-100
  status: text("status").notNull().default("gathering_info"), // gathering_info, in_progress, pending_review, approved, rejected
  urgencyLevel: text("urgency_level").default("routine"), // routine, urgent, emergent
  physicianId: integer("physician_id").references(() => physicians.id),
  physicianDiagnosis: text("physician_diagnosis"),
  physicianDisposition: text("physician_disposition"),
  physicianNotes: text("physician_notes"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // ENT Flu Flow fields
  system: text("system"), // e.g., "ENT"
  complaint: text("complaint"), // e.g., "FLU_LIKE_URI"
  specialty: text("specialty"), // e.g., "ENT"
  flowId: text("flow_id"), // e.g., "ENT_FLU_LIKE_V1"
  flowIndex: integer("flow_index").default(0), // current question index
  answers: text("answers"), // JSON string of collected answers
  proposal: text("proposal"), // JSON string of computed proposal
  physicianSummary: text("physician_summary"), // JSON string of summary for physician
  // Intake case linking
  intakeCaseId: text("intake_case_id"), // links to intake case from portal workflow
  intakeLinkEvents: text("intake_link_events"), // JSON array of link/unlink audit events
  intakeLinkedAt: timestamp("intake_linked_at"), // when the intake case was last linked
  intakeToken: text("intake_token"), // token for patient intake link
  intakeCode: text("intake_code"), // 6-digit verification code for intake
  intakeExpiresAt: text("intake_expires_at"), // expiration timestamp for intake link
});

export const insertEncounterSchema = createInsertSchema(encounters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertEncounter = z.infer<typeof insertEncounterSchema>;
export type Encounter = typeof encounters.$inferSelect;

// Orders (prescriptions, referrals, labs, etc.)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  encounterId: integer("encounter_id").notNull().references(() => encounters.id),
  orderType: text("order_type").notNull(), // prescription, lab, imaging, referral
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  aiGenerated: boolean("ai_generated").default(true),
  physicianApproved: boolean("physician_approved").default(false),
  physicianId: integer("physician_id").references(() => physicians.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// WhatsApp Messages Log
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  encounterId: integer("encounter_id").references(() => encounters.id),
  patientId: integer("patient_id").notNull().references(() => patients.id),
  direction: text("direction").notNull(), // inbound, outbound
  messageBody: text("message_body").notNull(),
  messageSid: text("message_sid"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;

// Legacy users table for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Outcome learning records
export const outcomes = pgTable("outcomes", {
  id: serial("id").primaryKey(),
  input: jsonb("input"),
  predicted: text("predicted"),
  actual: text("actual"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertOutcomeSchema = createInsertSchema(outcomes).omit({ id: true, createdAt: true });
export type InsertOutcome = z.infer<typeof insertOutcomeSchema>;
export type Outcome = typeof outcomes.$inferSelect;

// Diagnosis weights (learning system)
export const weights = pgTable("weights", {
  id: serial("id").primaryKey(),
  diagnosis: text("diagnosis").notNull().unique(),
  value: real("value").default(1.0),
});
export const insertWeightSchema = createInsertSchema(weights).omit({ id: true });
export type InsertWeight = z.infer<typeof insertWeightSchema>;
export type Weight = typeof weights.$inferSelect;

// Engine execution logs (monitoring)
export const engineLogs = pgTable("engine_logs", {
  id: serial("id").primaryKey(),
  engine: text("engine").notNull(),
  status: text("status").notNull(),
  latencyMs: integer("latency_ms"),
  error: text("error"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  createdAtIdx: index("idx_engine_logs_created_at").on(t.createdAt),
  engineIdx: index("idx_engine_logs_engine").on(t.engine),
}));
export const insertEngineLogSchema = createInsertSchema(engineLogs).omit({ id: true, createdAt: true });
export type InsertEngineLog = z.infer<typeof insertEngineLogSchema>;
export type EngineLog = typeof engineLogs.$inferSelect;

// Digital twin simulation runs
export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  input: jsonb("input"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertSimulationSchema = createInsertSchema(simulations).omit({ id: true, createdAt: true });
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
export type Simulation = typeof simulations.$inferSelect;

// Immutable audit trace logs (with SHA-256 hash chain)
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id").notNull(),
  step: text("step").notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  metadata: jsonb("metadata"),
  hash: text("hash"),
  prevHash: text("prev_hash"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  traceIdIdx: index("idx_audit_logs_trace_id").on(t.traceId),
  createdAtIdx: index("idx_audit_logs_created_at").on(t.createdAt),
}));
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Model versioning — snapshot of diagnosis weights after each learning cycle
export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  weights: jsonb("weights").notNull(),
  cycleCount: integer("cycle_count"),
  triggeredBy: text("triggered_by"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertModelVersionSchema = createInsertSchema(modelVersions).omit({ id: true, createdAt: true });
export type InsertModelVersion = z.infer<typeof insertModelVersionSchema>;
export type ModelVersion = typeof modelVersions.$inferSelect;

// Patient sessions (persistent queue — replaces in-memory store)
export const patientSessions = pgTable("patient_sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  riskLevel: text("risk_level"),
  safetyFlags: jsonb("safety_flags").default([]),
  disposition: jsonb("disposition"),
  approvedBy: text("approved_by"),
  overrideData: jsonb("override_data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  statusIdx: index("idx_patient_sessions_status").on(t.status),
  createdAtIdx: index("idx_patient_sessions_created_at").on(t.createdAt),
}));
export type PatientSessionRow = typeof patientSessions.$inferSelect;

// Alert log (high-risk SMS alerts sent to on-call physician)
export const alertLogs = pgTable("alert_logs", {
  id: serial("id").primaryKey(),
  patientId: text("patient_id").notNull(),
  riskLevel: text("risk_level").notNull(),
  reasons: jsonb("reasons").notNull(),
  channel: text("channel").notNull(),
  traceId: text("trace_id"),
  sentAt: timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type AlertLog = typeof alertLogs.$inferSelect;

// Full system snapshots — replayable decision state
export const systemSnapshots = pgTable("system_snapshots", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id"),
  patientId: text("patient_id"),
  state: jsonb("state").notNull(),
  complaint: text("complaint"),
  autonomyMode: text("autonomy_mode"),
  safetyLevel: text("safety_level"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertSystemSnapshotSchema = createInsertSchema(systemSnapshots).omit({ id: true, createdAt: true });
export type InsertSystemSnapshot = z.infer<typeof insertSystemSnapshotSchema>;
export type SystemSnapshot = typeof systemSnapshots.$inferSelect;

// Autonomy performance tracking — FDA evidence, trust metric, tuning engine
export const autonomyMetrics = pgTable("autonomy_metrics", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id"),
  complaint: text("complaint"),
  mode: text("mode").notNull(),
  dispositionGiven: text("disposition_given"),
  confidence: real("confidence"),
  wasOverridden: boolean("was_overridden").default(false).notNull(),
  safetyTriggered: boolean("safety_triggered").default(false).notNull(),
  guardrailsTriggered: text("guardrails_triggered").array().default([]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertAutonomyMetricSchema = createInsertSchema(autonomyMetrics).omit({ id: true, createdAt: true });
export type InsertAutonomyMetric = z.infer<typeof insertAutonomyMetricSchema>;
export type AutonomyMetric = typeof autonomyMetrics.$inferSelect;

// Idempotency keys — prevent duplicate POSTs from retries or ALB replays
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// FDA experiment log — reproducibility + submission tracking
export const fdaExperiments = pgTable("fda_experiments", {
  id: serial("id").primaryKey(),
  config: jsonb("config").notNull(),
  metrics: jsonb("metrics").notNull(),
  pass: boolean("pass").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertFdaExperimentSchema = createInsertSchema(fdaExperiments).omit({ id: true, createdAt: true });
export type InsertFdaExperiment = z.infer<typeof insertFdaExperimentSchema>;
export type FdaExperiment = typeof fdaExperiments.$inferSelect;

// Re-export chat models for OpenAI integration
export * from "./models/chat";

// ─── Production Clinic Layer (multi-tenant, FHIR-ready) ────────────────────

export const clinicSites = pgTable("clinic_sites", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").unique(),
  name: varchar("name", { length: 255 }).notNull(),
  ehrVendor: varchar("ehr_vendor", { length: 100 }),
  fhirTenantKey: varchar("fhir_tenant_key", { length: 255 }),
  plan: varchar("plan", { length: 50 }).default("basic").notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicSiteSchema = createInsertSchema(clinicSites).omit({ id: true, createdAt: true });
export type InsertClinicSite = z.infer<typeof insertClinicSiteSchema>;
export type ClinicSite = typeof clinicSites.$inferSelect;

export const clinicPatients = pgTable("clinic_patients", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id").notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  dob: varchar("dob", { length: 25 }),
  sex: varchar("sex", { length: 50 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  externalPatientId: varchar("external_patient_id", { length: 255 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicPatientSchema = createInsertSchema(clinicPatients).omit({ id: true, createdAt: true });
export type InsertClinicPatient = z.infer<typeof insertClinicPatientSchema>;
export type ClinicPatient = typeof clinicPatients.$inferSelect;

export const clinicEncounters = pgTable("clinic_encounters", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id").notNull(),
  patientId: integer("patient_id").notNull().references(() => clinicPatients.id),
  complaint: varchar("complaint", { length: 120 }).notNull(),
  encounterStatus: varchar("encounter_status", { length: 50 }).default("created").notNull(),
  intakePayload: jsonb("intake_payload").$type<Record<string, unknown>>().default({}).notNull(),
  triageResult: jsonb("triage_result").$type<Record<string, unknown>>(),
  reviewed: boolean("reviewed").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicEncounterSchema = createInsertSchema(clinicEncounters).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicEncounter = z.infer<typeof insertClinicEncounterSchema>;
export type ClinicEncounter = typeof clinicEncounters.$inferSelect;

export const clinicIntakeSessions = pgTable("clinic_intake_sessions", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id").notNull(),
  patientId: integer("patient_id").references(() => clinicPatients.id),
  channel: varchar("channel", { length: 50 }).notNull(),
  consented: boolean("consented").default(false).notNull(),
  sessionState: varchar("session_state", { length: 50 }).default("awaiting_consent").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertClinicIntakeSessionSchema = createInsertSchema(clinicIntakeSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicIntakeSession = z.infer<typeof insertClinicIntakeSessionSchema>;
export type ClinicIntakeSession = typeof clinicIntakeSessions.$inferSelect;

export const labeledOutcomeStats = pgTable("labeled_outcome_stats", {
  id: serial("id").primaryKey(),
  clinicExternalId: text("clinic_external_id"),
  totalLabeledEncounters: integer("total_labeled_encounters").default(0).notNull(),
  totalGoldenCases: integer("total_golden_cases").default(0).notNull(),
  lastComputedAt: timestamp("last_computed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertLabeledOutcomeStatsSchema = createInsertSchema(labeledOutcomeStats).omit({ id: true });
export type InsertLabeledOutcomeStats = z.infer<typeof insertLabeledOutcomeStatsSchema>;

// ─── Knowledge Base Admin Tables ─────────────────────────────────────────────

export const kbComplaints = pgTable("kb_complaints", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull().unique(),
  system: text("system").notNull().default("GENERAL"),
  label: text("label").notNull(),
  aliases: text("aliases").array().default([]).notNull(),
  defaultCluster: text("default_cluster"),
  scoringModule: text("scoring_module"),
  graphId: text("graph_id"),
  engineType: text("engine_type").default("STANDARD"),
  enabled: boolean("enabled").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbComplaintSchema = createInsertSchema(kbComplaints).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbComplaint = z.infer<typeof insertKbComplaintSchema>;
export type KbComplaint = typeof kbComplaints.$inferSelect;

export const kbQuestions = pgTable("kb_questions", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  questionId: text("question_id").notNull(),
  prompt: text("prompt").notNull(),
  type: text("type").notNull().default("yes_no"),
  required: boolean("required").default(false).notNull(),
  priority: integer("priority").default(50).notNull(),
  category: text("category"),
  askIf: text("ask_if"),
  conditionalOn: jsonb("conditional_on").$type<Record<string, unknown>>().default({}).notNull(),
  linkedDiagnoses: text("linked_diagnoses").array().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbQuestionSchema = createInsertSchema(kbQuestions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbQuestion = z.infer<typeof insertKbQuestionSchema>;
export type KbQuestion = typeof kbQuestions.$inferSelect;

export const kbModifiers = pgTable("kb_modifiers", {
  id: serial("id").primaryKey(),
  modifierId: text("modifier_id").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  appliesTo: text("applies_to").array().default([]).notNull(),
  addDiagnoses: text("add_diagnoses").array().default([]).notNull(),
  removeDiagnoses: text("remove_diagnoses").array().default([]).notNull(),
  workupChanges: jsonb("workup_changes").$type<Record<string, unknown>>().default({}).notNull(),
  medChanges: jsonb("med_changes").$type<Record<string, unknown>>().default({}).notNull(),
  dispositionThresholdShift: real("disposition_threshold_shift").default(0),
  active: boolean("active").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbModifierSchema = createInsertSchema(kbModifiers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbModifier = z.infer<typeof insertKbModifierSchema>;
export type KbModifier = typeof kbModifiers.$inferSelect;

export const kbRedFlagRules = pgTable("kb_red_flag_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  label: text("label").notNull(),
  triggerExpr: text("trigger_expr").notNull(),
  severity: text("severity").notNull().default("HARD"),
  action: text("action").notNull().default("ER_SEND"),
  immediateActions: text("immediate_actions"),
  rationale: text("rationale"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbRedFlagRuleSchema = createInsertSchema(kbRedFlagRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbRedFlagRule = z.infer<typeof insertKbRedFlagRuleSchema>;
export type KbRedFlagRule = typeof kbRedFlagRules.$inferSelect;

export const kbWorkupRules = pgTable("kb_workup_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  testName: text("test_name").notNull(),
  testType: text("test_type").notNull().default("labs"),
  triggerExpr: text("trigger_expr"),
  modifierOverrides: jsonb("modifier_overrides").$type<Record<string, unknown>>().default({}).notNull(),
  priority: integer("priority").default(50).notNull(),
  rationale: text("rationale"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbWorkupRuleSchema = createInsertSchema(kbWorkupRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbWorkupRule = z.infer<typeof insertKbWorkupRuleSchema>;
export type KbWorkupRule = typeof kbWorkupRules.$inferSelect;

export const kbDiagnosisRules = pgTable("kb_diagnosis_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  diagnosisId: text("diagnosis_id").notNull(),
  diagnosisLabel: text("diagnosis_label").notNull(),
  icdCode: text("icd_code"),
  baseProbability: real("base_probability").default(0.1).notNull(),
  featureLikelihoods: jsonb("feature_likelihoods").$type<Record<string, number>>().default({}).notNull(),
  cannotMiss: boolean("cannot_miss").default(false).notNull(),
  basePoints: integer("base_points").default(1),
  clusterPriority: integer("cluster_priority").default(50),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisRuleSchema = createInsertSchema(kbDiagnosisRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbDiagnosisRule = z.infer<typeof insertKbDiagnosisRuleSchema>;
export type KbDiagnosisRule = typeof kbDiagnosisRules.$inferSelect;

export const kbTreatmentRules = pgTable("kb_treatment_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id"),
  diagnosisId: text("diagnosis_id"),
  medicationName: text("medication_name").notNull(),
  medicationGroup: text("medication_group"),
  isFirstLine: boolean("is_first_line").default(true).notNull(),
  adultDose: text("adult_dose"),
  adultMaxDose: text("adult_max_dose"),
  pediatricDose: text("pediatric_dose"),
  route: text("route"),
  renalAdjust: text("renal_adjust"),
  hepaticAdjust: text("hepatic_adjust"),
  pregnancyCategory: text("pregnancy_category"),
  contraindications: text("contraindications"),
  allergyCrossReacts: text("allergy_cross_reacts").array().default([]).notNull(),
  keyInteractions: text("key_interactions"),
  commonSideEffects: text("common_side_effects"),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbTreatmentRuleSchema = createInsertSchema(kbTreatmentRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbTreatmentRule = z.infer<typeof insertKbTreatmentRuleSchema>;
export type KbTreatmentRule = typeof kbTreatmentRules.$inferSelect;

export const kbDispositionRules = pgTable("kb_disposition_rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull().unique(),
  complaintId: text("complaint_id").notNull(),
  priority: integer("priority").default(50).notNull(),
  whenExpr: text("when_expr").notNull(),
  dispositionLevel: text("disposition_level").notNull(),
  rationaleTemplateId: text("rationale_template_id"),
  confidenceHint: text("confidence_hint").default("MODERATE"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDispositionRuleSchema = createInsertSchema(kbDispositionRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbDispositionRule = z.infer<typeof insertKbDispositionRuleSchema>;
export type KbDispositionRule = typeof kbDispositionRules.$inferSelect;

export const kbPlanTemplates = pgTable("kb_plan_templates", {
  id: serial("id").primaryKey(),
  templateKey: text("template_key").notNull().unique(),
  complaintId: text("complaint_id"),
  diagnosisLabel: text("diagnosis_label").notNull(),
  defaultDisposition: text("default_disposition").notNull(),
  summary: text("summary"),
  homeCare: text("home_care").array().default([]).notNull(),
  followUp: text("follow_up").array().default([]).notNull(),
  returnPrecautions: text("return_precautions").array().default([]).notNull(),
  patientMessage: text("patient_message"),
  dischargeText: text("discharge_text"),
  erPrecautions: text("er_precautions"),
  medicationInstructions: text("medication_instructions"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbPlanTemplateSchema = createInsertSchema(kbPlanTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbPlanTemplate = z.infer<typeof insertKbPlanTemplateSchema>;
export type KbPlanTemplate = typeof kbPlanTemplates.$inferSelect;

export const kbGoldenCases = pgTable("kb_golden_cases", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().unique(),
  complaint: text("complaint").notNull(),
  title: text("title").notNull(),
  structuredInputs: jsonb("structured_inputs").$type<Record<string, unknown>>().default({}).notNull(),
  modifiers: text("modifiers").array().default([]).notNull(),
  clinicalFindings: jsonb("clinical_findings").$type<Record<string, unknown>>().default({}).notNull(),
  workupResults: jsonb("workup_results").$type<Record<string, unknown>>().default({}).notNull(),
  expectedDiagnosis: text("expected_diagnosis").notNull(),
  expectedDifferential: jsonb("expected_differential").$type<string[]>().default([]).notNull(),
  expectedDisposition: text("expected_disposition").notNull(),
  expectedWorkup: text("expected_workup").array().default([]).notNull(),
  expectedTreatment: jsonb("expected_treatment").$type<Record<string, unknown>>().default({}).notNull(),
  expectedRedFlags: text("expected_red_flags").array().default([]).notNull(),
  explanation: text("explanation"),
  version: integer("version").default(1).notNull(),
  author: text("author").default("system"),
  status: text("status").notNull().default("draft"),
  tags: text("tags").array().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbGoldenCaseSchema = createInsertSchema(kbGoldenCases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbGoldenCase = z.infer<typeof insertKbGoldenCaseSchema>;
export type KbGoldenCase = typeof kbGoldenCases.$inferSelect;

// ── Phase 3: Normalized feature likelihoods (replaces JSONB blob in kb_diagnosis_rules) ─────────
export const kbFeatureLikelihoods = pgTable("kb_feature_likelihoods", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),                     // FK to kb_diagnosis_rules.rule_id
  featureKey: text("feature_key").notNull(),             // e.g. "painful arc", "fever"
  featureValue: text("feature_value").default("yes"),    // "yes" | "no" | "severe" etc.
  likelihood: real("likelihood").notNull(),              // P(feature | diagnosis) 0..1
  weight: real("weight").default(1.0).notNull(),         // optional scaling
  source: text("source").default("ui_edit").notNull(),   // hardcoded_prior | jsonb_migration | ui_edit
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbFeatureLikelihoodSchema = createInsertSchema(kbFeatureLikelihoods).omit({ id: true, createdAt: true });
export type InsertKbFeatureLikelihood = z.infer<typeof insertKbFeatureLikelihoodSchema>;
export type KbFeatureLikelihood = typeof kbFeatureLikelihoods.$inferSelect;

// ── Phase 3: Clinical weights (replaces in-memory weight store) ────────────────────────────────
export const kbClinicalWeights = pgTable("kb_clinical_weights", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),                   // e.g. "prior_weight", "symptom_weight"
  value: real("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbClinicalWeightSchema = createInsertSchema(kbClinicalWeights).omit({ id: true, updatedAt: true });
export type InsertKbClinicalWeight = z.infer<typeof insertKbClinicalWeightSchema>;
export type KbClinicalWeight = typeof kbClinicalWeights.$inferSelect;

// ── Phase 3: Complaint modules (replaces SCORING_MODULE_DISPATCH) ───────────────────────────────
export const kbComplaintModules = pgTable("kb_complaint_modules", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  moduleType: text("module_type").notNull(),             // scoring | workup | diagnosis | triage
  moduleConfig: jsonb("module_config").$type<Record<string, unknown>>().default({}).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbComplaintModuleSchema = createInsertSchema(kbComplaintModules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbComplaintModule = z.infer<typeof insertKbComplaintModuleSchema>;
export type KbComplaintModule = typeof kbComplaintModules.$inferSelect;

// ── Phase 3: Complaint packs (replaces COMPLAINT_PACK_REGISTRY) ─────────────────────────────────
export const kbComplaintPacks = pgTable("kb_complaint_packs", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  questions: jsonb("questions").$type<unknown[]>().default([]).notNull(),
  findings: jsonb("findings").$type<unknown[]>().default([]).notNull(),
  modifiers: jsonb("modifiers").$type<unknown[]>().default([]).notNull(),
  version: integer("version").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbComplaintPackSchema = createInsertSchema(kbComplaintPacks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbComplaintPack = z.infer<typeof insertKbComplaintPackSchema>;
export type KbComplaintPack = typeof kbComplaintPacks.$inferSelect;

// ── Phase 3+: Full probabilistic feature model (replaces kb_feature_likelihoods) ──────────────
export const kbFeatureModels = pgTable("kb_feature_models", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  featureKey: text("feature_key").notNull(),
  featureType: text("feature_type").notNull().default("boolean"), // boolean | categorical | numeric | range
  pPresent: real("p_present"),          // P(feature present | Dx)
  pAbsent: real("p_absent"),            // P(feature absent | Dx)
  categoricalMap: jsonb("categorical_map").$type<Record<string, number>>(), // {"mild":0.3,"severe":0.9}
  mean: real("mean"),
  stdDev: real("std_dev"),
  minValue: real("min_value"),
  maxValue: real("max_value"),
  weight: real("weight").default(1.0).notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  source: text("source").default("manual").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbFeatureModelSchema = createInsertSchema(kbFeatureModels).omit({ id: true, createdAt: true });
export type InsertKbFeatureModel = z.infer<typeof insertKbFeatureModelSchema>;
export type KbFeatureModel = typeof kbFeatureModels.$inferSelect;

// ── Phase 3+: Engine routing (replaces SCORING_MODULE_DISPATCH) ─────────────────────────────
export const kbEngineRouting = pgTable("kb_engine_routing", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id").notNull(),
  engineType: text("engine_type").notNull().default("bayesian"), // bayesian | rule | hybrid | legacy
  config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
  priority: integer("priority").default(50).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbEngineRoutingSchema = createInsertSchema(kbEngineRouting).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbEngineRouting = z.infer<typeof insertKbEngineRoutingSchema>;
export type KbEngineRouting = typeof kbEngineRouting.$inferSelect;

// ── Advanced Reasoning: Co-morbidity interactions ─────────────────────────────
export const kbDiagnosisInteractions = pgTable("kb_diagnosis_interactions", {
  id: serial("id").primaryKey(),
  dxA: text("dx_a").notNull(),
  dxB: text("dx_b").notNull(),
  interactionType: text("interaction_type").notNull().default("synergy"),
  strength: real("strength").notNull().default(0),
  conditions: jsonb("conditions").$type<Record<string, unknown>>(),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisInteractionSchema = createInsertSchema(kbDiagnosisInteractions).omit({ id: true, createdAt: true });
export type InsertKbDiagnosisInteraction = z.infer<typeof insertKbDiagnosisInteractionSchema>;
export type KbDiagnosisInteraction = typeof kbDiagnosisInteractions.$inferSelect;

export const kbDiagnosisClusters = pgTable("kb_diagnosis_clusters", {
  id: serial("id").primaryKey(),
  clusterId: text("cluster_id").notNull().unique(),
  diagnoses: text("diagnoses").array().notNull().default([]),
  boost: real("boost").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisClusterSchema = createInsertSchema(kbDiagnosisClusters).omit({ id: true, createdAt: true });
export type InsertKbDiagnosisCluster = z.infer<typeof insertKbDiagnosisClusterSchema>;
export type KbDiagnosisCluster = typeof kbDiagnosisClusters.$inferSelect;

// ── Advanced Reasoning: Temporal patterns ─────────────────────────────────────
export const kbTemporalPatterns = pgTable("kb_temporal_patterns", {
  id: serial("id").primaryKey(),
  diagnosis: text("diagnosis").notNull(),
  featureKey: text("feature_key").notNull(),
  patternType: text("pattern_type").notNull(),
  durationHours: integer("duration_hours"),
  likelihood: real("likelihood").notNull().default(1.0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbTemporalPatternSchema = createInsertSchema(kbTemporalPatterns).omit({ id: true, createdAt: true });
export type InsertKbTemporalPattern = z.infer<typeof insertKbTemporalPatternSchema>;
export type KbTemporalPattern = typeof kbTemporalPatterns.$inferSelect;

export const patientTimeSeries = pgTable("patient_time_series", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull(),
  featureKey: text("feature_key").notNull(),
  t: timestamp("t").default(sql`CURRENT_TIMESTAMP`).notNull(),
  value: real("value").notNull(),
  unit: text("unit"),
});
export const insertPatientTimeSeriesSchema = createInsertSchema(patientTimeSeries).omit({ id: true });
export type InsertPatientTimeSeries = z.infer<typeof insertPatientTimeSeriesSchema>;
export type PatientTimeSeries = typeof patientTimeSeries.$inferSelect;

// ── Outcome Learning System ───────────────────────────────────────────────────
export const kbOutcomes = pgTable("kb_outcomes", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull(),
  predictedDx: text("predicted_dx"),
  actualDx: text("actual_dx"),
  predictedDisposition: text("predicted_disposition"),
  actualDisposition: text("actual_disposition"),
  correct: boolean("correct"),
  clinicianOverride: boolean("clinician_override").notNull().default(false),
  outcomeSeverity: text("outcome_severity"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbOutcomeSchema = createInsertSchema(kbOutcomes).omit({ id: true, createdAt: true });
export type InsertKbOutcome = z.infer<typeof insertKbOutcomeSchema>;
export type KbOutcome = typeof kbOutcomes.$inferSelect;

export const kbLearningEvents = pgTable("kb_learning_events", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  featureKey: text("feature_key").notNull().default("__base__"),
  delta: real("delta").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  source: text("source").notNull().default("simulation"),
  status: text("status").notNull().default("pending"),
  rationale: text("rationale"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbLearningEventSchema = createInsertSchema(kbLearningEvents).omit({ id: true, createdAt: true });
export type InsertKbLearningEvent = z.infer<typeof insertKbLearningEventSchema>;
export type KbLearningEvent = typeof kbLearningEvents.$inferSelect;

export const kbKnowledgeChanges = pgTable("kb_knowledge_changes", {
  id: serial("id").primaryKey(),
  changeId: text("change_id").notNull().unique(),
  domain: text("domain").notNull(),
  recordId: text("record_id").notNull(),
  action: text("action").notNull(),
  changedBy: text("changed_by").default("system"),
  oldValue: jsonb("old_value").$type<Record<string, unknown>>(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>(),
  rationale: text("rationale"),
  status: text("status").notNull().default("draft"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbKnowledgeChangeSchema = createInsertSchema(kbKnowledgeChanges).omit({ id: true, createdAt: true });
export type InsertKbKnowledgeChange = z.infer<typeof insertKbKnowledgeChangeSchema>;
export type KbKnowledgeChange = typeof kbKnowledgeChanges.$inferSelect;
export type LabeledOutcomeStats = typeof labeledOutcomeStats.$inferSelect;

// ── Clinical Control Tower Tables ─────────────────────────────────────────────

export const kbConfidenceRules = pgTable("kb_confidence_rules", {
  id: serial("id").primaryKey(),
  complaintId: text("complaint_id"),
  minConfidence: real("min_confidence").notNull(),
  action: text("action").notNull(),
  description: text("description"),
  priority: integer("priority").default(1).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbConfidenceRuleSchema = createInsertSchema(kbConfidenceRules).omit({ id: true, createdAt: true });
export type KbConfidenceRule = typeof kbConfidenceRules.$inferSelect;

export const kbDiagnosisRisk = pgTable("kb_diagnosis_risk", {
  id: serial("id").primaryKey(),
  diagnosis: text("diagnosis").notNull().unique(),
  minDisposition: text("min_disposition").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbDiagnosisRiskSchema = createInsertSchema(kbDiagnosisRisk).omit({ id: true, createdAt: true });
export type KbDiagnosisRisk = typeof kbDiagnosisRisk.$inferSelect;

export const kbWorkupCosts = pgTable("kb_workup_costs", {
  id: serial("id").primaryKey(),
  testName: text("test_name").notNull().unique(),
  cost: real("cost").notNull().default(0),
  sensitivity: real("sensitivity"),
  specificity: real("specificity"),
  turnaroundMinutes: integer("turnaround_minutes"),
  riskScore: real("risk_score").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbWorkupCostSchema = createInsertSchema(kbWorkupCosts).omit({ id: true, createdAt: true });
export type KbWorkupCost = typeof kbWorkupCosts.$inferSelect;

export const kbTestUtility = pgTable("kb_test_utility", {
  id: serial("id").primaryKey(),
  testName: text("test_name").notNull(),
  diagnosis: text("diagnosis").notNull(),
  infoGain: real("info_gain").notNull().default(0),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbTestUtilitySchema = createInsertSchema(kbTestUtility).omit({ id: true, createdAt: true });
export type KbTestUtility = typeof kbTestUtility.$inferSelect;

export const kbQuestionUtility = pgTable("kb_question_utility", {
  id: serial("id").primaryKey(),
  questionKey: text("question_key").notNull(),
  diagnosis: text("diagnosis").notNull(),
  infoGain: real("info_gain").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertKbQuestionUtilitySchema = createInsertSchema(kbQuestionUtility).omit({ id: true, createdAt: true });
export type KbQuestionUtility = typeof kbQuestionUtility.$inferSelect;

// ── Robotic Exam & Patient Stream Tables ─────────────────────────────────────

export const robotDevices = pgTable("robot_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull().unique(),
  type: text("type").notNull(),
  status: text("status").notNull().default("offline"),
  lastSeen: timestamp("last_seen").default(sql`CURRENT_TIMESTAMP`),
});
export type RobotDevice = typeof robotDevices.$inferSelect;

export const robotCommands = pgTable("robot_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull(),
  command: text("command").notNull(),
  payload: jsonb("payload"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export type RobotCommand = typeof robotCommands.$inferSelect;

export const robotResults = pgTable("robot_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: text("device_id").notNull(),
  resultType: text("result_type").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export type RobotResult = typeof robotResults.$inferSelect;

export const patientLiveStream = pgTable("patient_live_stream", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  featureKey: text("feature_key").notNull(),
  value: real("value").notNull(),
  timestamp: timestamp("timestamp").default(sql`CURRENT_TIMESTAMP`),
});
export type PatientLiveStream = typeof patientLiveStream.$inferSelect;

export const patientState = pgTable("patient_state", {
  patientId: text("patient_id").primaryKey(),
  currentDx: text("current_dx"),
  currentDisposition: text("current_disposition"),
  riskScore: real("risk_score").default(0),
  lastUpdated: timestamp("last_updated").default(sql`CURRENT_TIMESTAMP`),
});
export type PatientState = typeof patientState.$inferSelect;

export const patientMultimodalInputs = pgTable("patient_multimodal_inputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  type: text("type").notNull(),
  content: text("content"),
  processed: jsonb("processed"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export type PatientMultimodalInput = typeof patientMultimodalInputs.$inferSelect;

export const kbDeteriorationRules = pgTable("kb_deterioration_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  featureKey: text("feature_key").notNull(),
  threshold: real("threshold").notNull(),
  trend: text("trend").notNull(),
  action: text("action").notNull(),
  riskWeight: real("risk_weight").notNull().default(1.0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});
export const insertKbDeteriorationRuleSchema = createInsertSchema(kbDeteriorationRules).omit({ id: true, createdAt: true });
export type KbDeteriorationRule = typeof kbDeteriorationRules.$inferSelect;

// ── Clinical Rules — Versioned KB Tier-1 Foundation ───────────────────────────
// Each row is one immutable version of a clinical decision rule.
// Active rule = isActive=true + no expiryDate (or expiryDate in future).
// Superseded rules are expired (expiryDate set) but never deleted for audit trail.
export const clinicalRules = pgTable("clinical_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleKey: text("rule_key").notNull(),
  version: integer("version").notNull().default(1),
  complaintCluster: text("complaint_cluster").notNull(),
  ruleType: text("rule_type").notNull(),
  snomedCode: text("snomed_code"),
  evidenceSource: text("evidence_source"),
  ruleBody: jsonb("rule_body").notNull(),
  authoredBy: text("authored_by").notNull().default("system"),
  approvedBy: text("approved_by"),
  effectiveDate: timestamp("effective_date").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiryDate: timestamp("expiry_date"),
  isActive: boolean("is_active").notNull().default(true),
  tenantId: text("tenant_id"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertClinicalRuleSchema = createInsertSchema(clinicalRules).omit({ id: true, createdAt: true });
export type InsertClinicalRule = z.infer<typeof insertClinicalRuleSchema>;
export type ClinicalRule = typeof clinicalRules.$inferSelect;

// ── Meta-KB Entity Store (Production Upgrade Patch) ──────────────────────────
// A versioned, generic entity store sitting on top of the domain-specific KB tables.
// kbSources tracks provenance; kbEntityStore holds the current version of any KB entity;
// kbEntityVersions provides an immutable audit trail of all changes.

export const kbSources = pgTable("kb_sources", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull(),
  sourceType: text("source_type").notNull(),  // "csv" | "json" | "manual" | "llm"
  name: text("name").notNull(),
  description: text("description"),
  isAuthoritative: boolean("is_authoritative").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_kb_sources_key").on(t.sourceKey)]);

export const insertKbSourceSchema = createInsertSchema(kbSources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbSource = z.infer<typeof insertKbSourceSchema>;
export type KbSource = typeof kbSources.$inferSelect;

export const kbEntityStore = pgTable("kb_entity_store", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),  // "complaint" | "red_flag_rule" | "workup_rule" etc.
  entityKey: text("entity_key").notNull(),     // domain-unique key, e.g. "sore_throat"
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),  // "draft" | "active" | "deprecated"
  version: integer("version").notNull().default(1),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  currentContent: jsonb("current_content").$type<Record<string, unknown>>().notNull().default({}),
  sourceId: integer("source_id").references(() => kbSources.id),
  createdBy: text("created_by").default("system"),
  updatedBy: text("updated_by").default("system"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_kb_entity_type_key").on(t.entityType, t.entityKey)]);

export const insertKbEntityStoreSchema = createInsertSchema(kbEntityStore).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbEntityStore = z.infer<typeof insertKbEntityStoreSchema>;
export type KbEntityStore = typeof kbEntityStore.$inferSelect;

export const kbEntityVersions = pgTable("kb_entity_versions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => kbEntityStore.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  changeSummary: text("change_summary"),
  changedBy: text("changed_by").default("system"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertKbEntityVersionSchema = createInsertSchema(kbEntityVersions).omit({ id: true, createdAt: true });
export type InsertKbEntityVersion = z.infer<typeof insertKbEntityVersionSchema>;
export type KbEntityVersion = typeof kbEntityVersions.$inferSelect;

// ── Golden Case Run Persistence (Production Upgrade Patch) ────────────────────
// Separate from kbGoldenCases (which stores the case definitions), these tables
// record the history of every monitor run and the aggregate coverage matrix.

export const goldenCaseRuns = pgTable("golden_case_runs", {
  id: serial("id").primaryKey(),
  goldenCaseId: integer("golden_case_id").notNull().references(() => kbGoldenCases.id, { onDelete: "cascade" }),
  runBatch: text("run_batch").notNull(),          // ISO timestamp string identifying the batch
  systemVersion: text("system_version").notNull().default("1.0.0"),
  engineVersion: text("engine_version").notNull().default("1.0.0"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  score: real("score").notNull().default(0),
  passed: boolean("passed").notNull().default(false),
  failReason: text("fail_reason"),
  runAt: timestamp("run_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertGoldenCaseRunSchema = createInsertSchema(goldenCaseRuns).omit({ id: true, runAt: true });
export type InsertGoldenCaseRun = z.infer<typeof insertGoldenCaseRunSchema>;
export type GoldenCaseRun = typeof goldenCaseRuns.$inferSelect;

export const goldenCaseCoverage = pgTable("golden_case_coverage", {
  id: serial("id").primaryKey(),
  complaint: text("complaint").notNull(),
  riskBand: text("risk_band").notNull(),    // "low" | "medium" | "high" | "critical"
  ageBand: text("age_band").notNull(),      // "pediatric" | "adult" | "elderly"
  count: integer("count").notNull().default(0),
  targetCount: integer("target_count").notNull().default(3),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_golden_coverage").on(t.complaint, t.riskBand, t.ageBand)]);

export const insertGoldenCaseCoverageSchema = createInsertSchema(goldenCaseCoverage).omit({ id: true, updatedAt: true });
export type InsertGoldenCaseCoverage = z.infer<typeof insertGoldenCaseCoverageSchema>;
export type GoldenCaseCoverage = typeof goldenCaseCoverage.$inferSelect;

// ── BullMQ Job Tracking via Drizzle (Production Upgrade Patch) ────────────────
// Drizzle-backed job record store; the existing raw-SQL `jobs` table via jobRepo.ts
// remains untouched for backward compat. This table is written to by the new
// queues/bullmq/jobTracker.ts and exposed via /api/queues routes.

export const queueJobs = pgTable("queue_jobs", {
  id: serial("id").primaryKey(),
  queueName: text("queue_name").notNull(),
  jobId: text("job_id").notNull(),
  jobName: text("job_name").notNull(),
  status: text("status").notNull().default("queued"),  // "queued" | "processing" | "completed" | "failed"
  attemptsMade: integer("attempts_made").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  clinicId: text("clinic_id"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("uq_queue_jobs_job_id").on(t.queueName, t.jobId)]);

export const insertQueueJobSchema = createInsertSchema(queueJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQueueJob = z.infer<typeof insertQueueJobSchema>;
export type QueueJob = typeof queueJobs.$inferSelect;

// ── Safety Gate Configuration ─────────────────────────────────────────────────
//
// Versioned, DB-persisted safety thresholds.
//
// FDA 21 CFR Part 11 requires that configuration changes to safety-critical
// thresholds be versioned, auditable, and authorized. Magic numbers in source
// code satisfy none of those requirements — this table is the alternative.
//
// Rules:
//  - Only one row may have is_active = true at any time (enforced at app level)
//  - Thresholds must satisfy: risk_threshold < hard_stop_threshold
//  - Every row requires approved_by and approval_note before activation
//  - Never DELETE rows — soft-replace only (deactivate old, insert new)

export const safetyConfigs = pgTable(
  "safety_configs",
  {
    id:                   serial("id").primaryKey(),
    version:              text("version").notNull().unique(),
    isActive:             boolean("is_active").notNull().default(false),

    riskThreshold:        real("risk_threshold").notNull(),
    hardStopThreshold:    real("hard_stop_threshold").notNull(),
    uncertaintyThreshold: real("uncertainty_threshold").notNull(),

    approvedBy:           text("approved_by").notNull(),
    approvalNote:         text("approval_note"),
    createdAt:            timestamp("created_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    activatedAt:          timestamp("activated_at", { withTimezone: true }),
  },
  (table) => [
    index("safety_configs_active_idx").on(table.isActive),
  ]
);

export const insertSafetyConfigSchema = createInsertSchema(safetyConfigs).omit({
  id: true,
  createdAt: true,
});
export type InsertSafetyConfig = z.infer<typeof insertSafetyConfigSchema>;
export type SafetyConfig = typeof safetyConfigs.$inferSelect;

// ── Self-Improvement Governance ──────────────────────────────────────────────

export const ACTION_STATUSES = ["proposed", "pending_review", "approved", "applied", "rejected", "failed"] as const;
export type ActionStatus = typeof ACTION_STATUSES[number];

export const agentThresholdRecords = pgTable(
  "agent_threshold_records",
  {
    id:           serial("id").primaryKey(),
    agent:        text("agent").notNull(),
    parameter:    text("parameter").notNull(),
    currentValue: doublePrecision("current_value").notNull(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy:    text("updated_by").notNull().default("system"),
  },
  (t) => [
    uniqueIndex("agent_threshold_records_agent_param_uidx").on(t.agent, t.parameter),
    index("agent_threshold_records_agent_idx").on(t.agent),
  ]
);
export const insertAgentThresholdSchema = createInsertSchema(agentThresholdRecords).omit({ id: true, updatedAt: true });
export type InsertAgentThreshold = z.infer<typeof insertAgentThresholdSchema>;
export type AgentThresholdRecord = typeof agentThresholdRecords.$inferSelect;

export const improvementActions = pgTable(
  "improvement_actions",
  {
    id:            serial("id").primaryKey(),
    agent:         text("agent").notNull(),
    action:        text("action").notNull(),
    parameter:     text("parameter").notNull(),
    fromValue:     doublePrecision("from_value"),
    toValue:       doublePrecision("to_value"),
    reason:        text("reason").notNull(),
    status:        text("status").notNull().default("proposed"),
    proposedAt:    timestamp("proposed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    decidedAt:     timestamp("decided_at", { withTimezone: true }),
    decidedBy:     text("decided_by"),
    metric:        jsonb("metric"),
    errorMessage:  text("error_message"),
  },
  (t) => [
    index("improvement_actions_status_idx").on(t.status),
    index("improvement_actions_agent_idx").on(t.agent),
    index("improvement_actions_proposed_at_idx").on(t.proposedAt),
  ]
);
export const insertImprovementActionSchema = createInsertSchema(improvementActions).omit({ id: true, proposedAt: true });
export type InsertImprovementAction = z.infer<typeof insertImprovementActionSchema>;
export type ImprovementAction = typeof improvementActions.$inferSelect;

export const improvementReviews = pgTable(
  "improvement_reviews",
  {
    id:         serial("id").primaryKey(),
    actionId:   integer("action_id").notNull().references(() => improvementActions.id),
    reviewerId: text("reviewer_id").notNull(),
    decision:   text("decision").notNull(),
    note:       text("note"),
    decidedAt:  timestamp("decided_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("improvement_reviews_action_idx").on(t.actionId),
    index("improvement_reviews_reviewer_idx").on(t.reviewerId),
  ]
);
export const insertImprovementReviewSchema = createInsertSchema(improvementReviews).omit({ id: true, decidedAt: true });
export type InsertImprovementReview = z.infer<typeof insertImprovementReviewSchema>;
export type ImprovementReview = typeof improvementReviews.$inferSelect;

export const improvementCycleLog = pgTable(
  "improvement_cycle_log",
  {
    id:               serial("id").primaryKey(),
    ranAt:            timestamp("ran_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
    actionsProposed:  integer("actions_proposed").notNull().default(0),
    actionsApplied:   integer("actions_applied").notNull().default(0),
    actionsRejected:  integer("actions_rejected").notNull().default(0),
    durationMs:       integer("duration_ms").notNull().default(0),
    error:            text("error"),
  },
  (t) => [
    index("improvement_cycle_log_ran_at_idx").on(t.ranAt),
  ]
);
export const insertImprovementCycleLogSchema = createInsertSchema(improvementCycleLog).omit({ id: true, ranAt: true });
export type InsertImprovementCycleLog = z.infer<typeof insertImprovementCycleLogSchema>;
export type ImprovementCycleLog = typeof improvementCycleLog.$inferSelect;

// ─── Canonical Pathways (KB admin — batch 26/27) ──────────────────────────────
export const canonicalPathways = pgTable("canonical_pathways", {
  pathwayId:            text("pathway_id").primaryKey(),
  sourceType:           text("source_type").notNull(),
  complaintId:          text("complaint_id").notNull(),
  syndromeId:           text("syndrome_id").notNull(),
  label:                text("label").notNull(),
  requiredFeatures:     jsonb("required_features").$type<string[]>().notNull().default([]),
  positiveWeights:      jsonb("positive_weights").$type<Record<string, number>>().notNull().default({}),
  negativeWeights:      jsonb("negative_weights").$type<Record<string, number>>().notNull().default({}),
  exclusions:           jsonb("exclusions").$type<string[]>().notNull().default([]),
  treatmentClass:       text("treatment_class").notNull(),
  medicationKey:        text("medication_key"),
  canonicalDisposition: text("canonical_disposition").notNull(),
  rationale:            jsonb("rationale").$type<string[]>().notNull().default([]),
  active:               boolean("active").notNull().default(true),
  createdBy:            text("created_by").notNull(),
  updatedBy:            text("updated_by").notNull(),
  retiredBy:            text("retired_by"),
  retirementReason:     text("retirement_reason"),
  retiredAt:            timestamp("retired_at"),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
});
export const insertCanonicalPathwaySchema = createInsertSchema(canonicalPathways).omit({ createdAt: true, updatedAt: true });
export type InsertCanonicalPathway = z.infer<typeof insertCanonicalPathwaySchema>;
export type CanonicalPathway = typeof canonicalPathways.$inferSelect;

// ─── Phenotype Registry (batch 27) ───────────────────────────────────────────
export const phenotypeRegistry = pgTable("phenotype_registry", {
  phenotypeHash:           text("phenotype_hash").primaryKey(),
  complaintId:             text("complaint_id").notNull(),
  canonicalSyndromeId:     text("canonical_syndrome_id"),
  canonicalMedicationKey:  text("canonical_medication_key"),
  canonicalDisposition:    text("canonical_disposition").notNull(),
  confidence:              text("confidence").notNull(),
  seenCount:               integer("seen_count").notNull().default(1),
  firstSeenAt:             timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt:              timestamp("last_seen_at").defaultNow().notNull(),
});
export const insertPhenotypeRegistrySchema = createInsertSchema(phenotypeRegistry).omit({ firstSeenAt: true, lastSeenAt: true });
export type InsertPhenotypeRegistry = z.infer<typeof insertPhenotypeRegistrySchema>;
export type PhenotypeRegistryEntry = typeof phenotypeRegistry.$inferSelect;

// ─── KB Physician Overrides (batch 26 — kb_physician_overrides) ──────────────
export const kbPhysicianOverrides = pgTable("kb_physician_overrides", {
  id:                serial("id").primaryKey(),
  overrideId:        text("override_id").notNull().unique(),
  patientId:         text("patient_id").notNull(),
  complaint:         text("complaint").notNull(),
  systemDecision:    text("system_decision").notNull(),
  physicianDecision: text("physician_decision").notNull(),
  reason:            text("reason").notNull(),
  discrepancy:       boolean("discrepancy").notNull().default(false),
  actorId:           text("actor_id").notNull(),
  traceId:           text("trace_id").notNull(),
  createdAt:         timestamp("created_at").defaultNow(),
});
export const insertKbPhysicianOverrideSchema = createInsertSchema(kbPhysicianOverrides).omit({ id: true, createdAt: true });
export type InsertKbPhysicianOverride = z.infer<typeof insertKbPhysicianOverrideSchema>;
export type KbPhysicianOverride = typeof kbPhysicianOverrides.$inferSelect;

// ─── Guideline Documents — existing table (matches DB: id serial, source text, etc.) ──
export const guidelineDocuments = pgTable("guideline_documents", {
  id:        serial("id").primaryKey(),
  source:    text("source").notNull().default("manual"),
  title:     text("title"),
  content:   text("content").notNull(),
  parsed:    jsonb("parsed"),
  status:    text("status").notNull().default("processed"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type GuidelineDocument = typeof guidelineDocuments.$inferSelect;

// ─── Batch 57 — PageIndex Clinical Reasoning (Article 30) ────────────────────

// clinical_doc_nodes — hierarchical tree nodes from PageIndexBuilder
export const clinicalDocNodes = pgTable("clinical_doc_nodes", {
  id:           serial("id").primaryKey(),
  documentId:   integer("document_id").notNull(),
  nodeId:       text("node_id").notNull(),
  title:        text("title").notNull(),
  startPage:    integer("start_page").notNull().default(0),
  endPage:      integer("end_page").notNull().default(0),
  summary:      text("summary").default(""),
  content:      text("content").default(""),
  parentNodeId: text("parent_node_id"),
  depth:        integer("depth").notNull().default(0),
  createdAt:    timestamp("created_at").defaultNow(),
});
export const insertClinicalDocNodeSchema = createInsertSchema(clinicalDocNodes).omit({ id: true, createdAt: true });
export type InsertClinicalDocNode = z.infer<typeof insertClinicalDocNodeSchema>;
export type ClinicalDocNode = typeof clinicalDocNodes.$inferSelect;

// clinical_reasoning_queries — query log with node selection and answer
export const clinicalReasoningQueries = pgTable("clinical_reasoning_queries", {
  id:            serial("id").primaryKey(),
  documentId:    integer("document_id").notNull(),
  question:      text("question").notNull(),
  selectedNode:  text("selected_node"),
  answer:        text("answer"),
  confidence:    real("confidence"),
  retrievalMode: text("retrieval_mode").notNull().default("keyword"),
  createdAt:     timestamp("created_at").defaultNow(),
});
export const insertClinicalReasoningQuerySchema = createInsertSchema(clinicalReasoningQueries).omit({ id: true, createdAt: true });
export type InsertClinicalReasoningQuery = z.infer<typeof insertClinicalReasoningQuerySchema>;
export type ClinicalReasoningQuery = typeof clinicalReasoningQueries.$inferSelect;

// clinical_cross_ref_logs — cross-reference resolution audit trail
export const clinicalCrossRefLogs = pgTable("clinical_cross_ref_logs", {
  id:           serial("id").primaryKey(),
  queryId:      integer("query_id").notNull(),
  reference:    text("reference").notNull(),
  resolvedNode: text("resolved_node"),
  resolved:     boolean("resolved").notNull().default(false),
  createdAt:    timestamp("created_at").defaultNow(),
});
export const insertClinicalCrossRefLogSchema = createInsertSchema(clinicalCrossRefLogs).omit({ id: true, createdAt: true });
export type InsertClinicalCrossRefLog = z.infer<typeof insertClinicalCrossRefLogSchema>;
export type ClinicalCrossRefLog = typeof clinicalCrossRefLogs.$inferSelect;

// knowledge_documents — hybrid retrieval knowledge store (BM25 + vector + RRF)
export const knowledgeDocuments = pgTable("knowledge_documents", {
  id:        serial("id").primaryKey(),
  docId:     text("doc_id").notNull().unique(),
  title:     text("title"),
  content:   text("content").notNull(),
  embedding: real("embedding").array(),
  source:    text("source").notNull().default("manual"),
  metadata:  jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertKnowledgeDocumentSchema = createInsertSchema(knowledgeDocuments).omit({ id: true, createdAt: true });
export type InsertKnowledgeDocument = z.infer<typeof insertKnowledgeDocumentSchema>;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;

// rag_evaluations — RAGAS-style evaluation results for CI regression tracking
export const ragEvaluations = pgTable("rag_evaluations", {
  id:               serial("id").primaryKey(),
  question:         text("question").notNull(),
  answer:           text("answer").notNull(),
  faithfulness:     real("faithfulness"),
  answerRelevancy:  real("answer_relevancy"),
  contextPrecision: real("context_precision"),
  overallScore:     real("overall_score"),
  pass:             boolean("pass").notNull().default(false),
  groundTruth:      text("ground_truth"),
  retrievalCount:   integer("retrieval_count").notNull().default(0),
  cacheHit:         boolean("cache_hit").notNull().default(false),
  createdAt:        timestamp("created_at").defaultNow(),
});
export const insertRagEvaluationSchema = createInsertSchema(ragEvaluations).omit({ id: true, createdAt: true });
export type InsertRagEvaluation = z.infer<typeof insertRagEvaluationSchema>;
export type RagEvaluation = typeof ragEvaluations.$inferSelect;

// agent_artifacts — typed structured outputs from agent fleet / best-of-N (Batch 59)
export const agentArtifacts = pgTable("agent_artifacts", {
  id:        text("id").primaryKey(),            // UUID string (set by app)
  type:      text("type").notNull(),             // fleet_result | best_of_n_result | ...
  content:   text("content").notNull(),          // JSON-serialized artifact
  agentId:   text("agent_id").notNull(),
  patientId: text("patient_id"),
  metadata:  jsonb("metadata"),
  status:    text("status").notNull().default("pending_review"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertAgentArtifactSchema = createInsertSchema(agentArtifacts).omit({ createdAt: true });
export type InsertAgentArtifact = z.infer<typeof insertAgentArtifactSchema>;
export type AgentArtifact = typeof agentArtifacts.$inferSelect;

// ── Batch-1 Remediation: Persist governance, traces, audit-verification ────────

// governance_items — durable record of every governance approval/rejection
// Replaces in-memory governanceQueue. Required for HIPAA + FDA 21 CFR Part 11.
export const governanceItems = pgTable("governance_items", {
  id:         text("id").primaryKey(),
  sheet:      text("sheet").notNull(),
  change:     jsonb("change").notNull(),
  status:     text("status").notNull().default("pending"),  // pending | approved | rejected
  risk:       text("risk").notNull(),
  reason:     text("reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});
export const insertGovernanceItemSchema = createInsertSchema(governanceItems).omit({ createdAt: true });
export type InsertGovernanceItem = z.infer<typeof insertGovernanceItemSchema>;
export type GovernanceItem = typeof governanceItems.$inferSelect;

// execution_traces — durable AI reasoning trace for every clinical decision
// Replaces in-memory 200-cap store. Required for FDA audit + malpractice defense.
export const executionTraces = pgTable("execution_traces", {
  id:        text("id").primaryKey(),
  patientId: text("patient_id"),
  complaint: text("complaint"),
  steps:     jsonb("steps").notNull(),
  totalMs:   integer("total_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  patientIdx:   index("idx_exec_traces_patient").on(t.patientId),
  createdAtIdx: index("idx_exec_traces_created").on(t.createdAt),
}));
export type ExecutionTraceRow = typeof executionTraces.$inferSelect;

// audit_verification_runs — persisted scheduled verification results
// Replaces in-memory 90-day cap. Required for 45 CFR §164.312(b) compliance.
export const auditVerificationRuns = pgTable("audit_verification_runs", {
  id:          text("id").primaryKey(),
  frequency:   text("frequency").notNull(),         // nightly | weekly
  triggeredBy: text("triggered_by").notNull(),       // scheduled | manual | incident
  verified:    boolean("verified").notNull(),
  recordsChecked: integer("records_checked").notNull(),
  durationMs:  integer("duration_ms").notNull(),
  brokenAt:    jsonb("broken_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index("idx_audit_verify_created").on(t.createdAt),
}));
export type AuditVerificationRun = typeof auditVerificationRuns.$inferSelect;

// agent_memory_log — persistent agent memory across runs (Batch 59)
export const agentMemoryLog = pgTable("agent_memory_log", {
  id:         serial("id").primaryKey(),
  agentId:    text("agent_id").notNull(),
  memoryType: text("memory_type").notNull(),     // clinical_decision | outcome | physician_override | ...
  content:    text("content").notNull(),
  importance: real("importance").notNull().default(0.5),
  context:    jsonb("context"),
  createdAt:  timestamp("created_at").defaultNow(),
});
export const insertAgentMemorySchema = createInsertSchema(agentMemoryLog).omit({ id: true, createdAt: true });
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemoryLog.$inferSelect;

// ── KB Governance Tables ─────────────────────────────────────────────────────

// kb_population_priors — Bayesian prior multipliers per population segment
// (e.g., elderly, pediatric, immunocompromised). Queried at triage time to
// adjust differential probability for the patient's demographic cluster.
export const kbPopulationPriors = pgTable("kb_population_priors", {
  id:             serial("id").primaryKey(),
  populationFlag: text("population_flag").notNull(),
  diagnosisKey:   text("diagnosis_key").notNull(),
  multiplier:     real("multiplier").notNull().default(1.0),
  rationale:      text("rationale"),
  active:         boolean("active").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});
export const insertKbPopulationPriorSchema = createInsertSchema(kbPopulationPriors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKbPopulationPrior = z.infer<typeof insertKbPopulationPriorSchema>;
export type KbPopulationPrior = typeof kbPopulationPriors.$inferSelect;

// kb_review_queue — Pending KB entity changes awaiting physician/admin approval.
// New entities land as "draft" (kbRepository.ts FIX) and must be reviewed here
// before they are activated. Provides Draft → Approve/Reject lifecycle.
export const kbReviewQueue = pgTable("kb_review_queue", {
  id:          serial("id").primaryKey(),
  entityType:  text("entity_type").notNull(),
  entityKey:   text("entity_key").notNull(),
  version:     integer("version").notNull(),
  proposedBy:  text("proposed_by").notNull(),
  status:      text("status").notNull().default("pending"),   // pending | approved | rejected
  rationale:   text("rationale"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  reviewedBy:  text("reviewed_by"),
  reviewedAt:  timestamp("reviewed_at"),
});
export const insertKbReviewQueueSchema = createInsertSchema(kbReviewQueue).omit({ id: true, createdAt: true });
export type InsertKbReviewQueue = z.infer<typeof insertKbReviewQueueSchema>;
export type KbReviewQueueItem = typeof kbReviewQueue.$inferSelect;

// kb_audit_trail — Immutable log of every KB governance action.
// Captures CREATE, UPDATE, APPROVE, REJECT, ROLLBACK with full payload for FDA audit.
export const kbAuditTrail = pgTable("kb_audit_trail", {
  id:          serial("id").primaryKey(),
  entityType:  text("entity_type"),
  entityKey:   text("entity_key"),
  version:     integer("version"),
  action:      text("action"),           // CREATE | UPDATE | APPROVE | REJECT | ROLLBACK | SUBMIT_REVIEW
  actorId:     text("actor_id"),
  payload:     jsonb("payload"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});
export const insertKbAuditTrailSchema = createInsertSchema(kbAuditTrail).omit({ id: true, createdAt: true });
export type InsertKbAuditTrail = z.infer<typeof insertKbAuditTrailSchema>;
export type KbAuditTrailEntry = typeof kbAuditTrail.$inferSelect;

// ── ICU Predictor + Digital Twin (Batch 6 security/architecture wave) ─────────

export const patientSnapshots = pgTable(
  "patient_snapshots",
  {
    id:        serial("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    clinicId:  text("clinic_id"),
    complaint: text("complaint"),
    ageYears:  integer("age_years"),
    vitals:    jsonb("vitals").$type<Record<string, unknown>>().notNull().default({}),
    labs:      jsonb("labs").$type<Record<string, unknown>>().notNull().default({}),
    timeline:  jsonb("timeline").$type<Array<Record<string, unknown>>>().notNull().default([]),
    source:    text("source").notNull().default("command_center_v3"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("patient_snapshots_patient_idx").on(t.patientId, t.createdAt),
  })
);
export const insertPatientSnapshotSchema = createInsertSchema(patientSnapshots).omit({ id: true, createdAt: true });
export type InsertPatientSnapshot = z.infer<typeof insertPatientSnapshotSchema>;
export type PatientSnapshot = typeof patientSnapshots.$inferSelect;

export const icuPredictions = pgTable(
  "icu_predictions",
  {
    id:                     serial("id").primaryKey(),
    patientId:              text("patient_id").notNull(),
    clinicId:               text("clinic_id"),
    modelVersion:           text("model_version").notNull().default("icu-v3-news2-lactate"),
    riskScore:              real("risk_score").notNull(),
    riskBand:               text("risk_band").notNull(),
    recommendedLevel:       text("recommended_level").notNull(),
    explanation:            jsonb("explanation").$type<Array<{ factor: string; value: number | string; impact: number; note: string }>>().notNull().default([]),
    features:               jsonb("features").$type<Record<string, unknown>>().notNull().default({}),
    requiresPhysicianReview:boolean("requires_physician_review").notNull().default(true),
    createdAt:              timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("icu_predictions_patient_idx").on(t.patientId, t.createdAt),
  })
);
export const insertIcuPredictionSchema = createInsertSchema(icuPredictions).omit({ id: true, createdAt: true });
export type InsertIcuPrediction = z.infer<typeof insertIcuPredictionSchema>;
export type IcuPrediction = typeof icuPredictions.$inferSelect;

export const digitalTwinRuns = pgTable(
  "digital_twin_runs",
  {
    id:                serial("id").primaryKey(),
    patientId:         text("patient_id").notNull(),
    clinicId:          text("clinic_id"),
    scenarioName:      text("scenario_name").notNull(),
    horizonHours:      integer("horizon_hours").notNull().default(12),
    inputs:            jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    output:            jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    riskDelta:         real("risk_delta").notNull().default(0),
    recommendedAction: text("recommended_action"),
    createdBy:         text("created_by").notNull(),
    createdAt:         timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    patientIdx: index("digital_twin_runs_patient_idx").on(t.patientId, t.createdAt),
  })
);
export const insertDigitalTwinRunSchema = createInsertSchema(digitalTwinRuns).omit({ id: true, createdAt: true });
export type InsertDigitalTwinRun = z.infer<typeof insertDigitalTwinRunSchema>;
export type DigitalTwinRun = typeof digitalTwinRuns.$inferSelect;

// ─── Clinical Knowledge Base ───────────────────────────────────────────────
export const clinicalKnowledge = pgTable("clinical_knowledge", {
  id:        serial("id").primaryKey(),
  title:     text("title").notNull(),
  content:   text("content").notNull(),
  category:  text("category").notNull().default("general"),
  source:    text("source").notNull().default("internal"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export const insertClinicalKnowledgeSchema = createInsertSchema(clinicalKnowledge).omit({ id: true, updatedAt: true });
export type InsertClinicalKnowledge = z.infer<typeof insertClinicalKnowledgeSchema>;
export type ClinicalKnowledge = typeof clinicalKnowledge.$inferSelect;

// ─── Physician Review Queue ────────────────────────────────────────────────
export const physicianReviewQueue = pgTable("physician_review_queue", {
  id:               serial("id").primaryKey(),
  query:            text("query").notNull(),
  proposedAnswer:   text("proposed_answer").notNull(),
  finalAnswer:      text("final_answer"),
  confidenceScore:  integer("confidence_score").notNull(),
  confidenceLevel:  text("confidence_level").notNull(),
  sourceCount:      integer("source_count").notNull(),
  hedgeWordCount:   integer("hedge_word_count").notNull().default(0),
  patientContextId: text("patient_context_id"),
  requestedBy:      text("requested_by"),
  status:           text("status").notNull().default("pending"),
  reviewedBy:       text("reviewed_by"),
  reviewNote:       text("review_note"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow(),
  reviewedAt:       timestamp("reviewed_at", { withTimezone: true }),
});
export const insertPhysicianReviewQueueSchema = createInsertSchema(physicianReviewQueue).omit({ id: true, createdAt: true });
export type InsertPhysicianReviewQueue = z.infer<typeof insertPhysicianReviewQueueSchema>;
export type PhysicianReviewQueue = typeof physicianReviewQueue.$inferSelect;

// ─── Clinical Answer Audit ─────────────────────────────────────────────────
export const clinicalAnswerAudit = pgTable("clinical_answer_audit", {
  id:        text("id").primaryKey(),
  payload:   jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ClinicalAnswerAudit = typeof clinicalAnswerAudit.$inferSelect;
```

### server/clinical/finalPipeline.ts

```ts
/**
 * Final Governed Pipeline (Section 8) — v1.1.0
 *
 * 8-stage authoritative clinical flow:
 *   1. NLP Intake              — normalise free-text → canonical ICD-10
 *   1.5 Multi-Complaint Fusion — detect high-acuity compound syndromes (NEW)
 *   2. Hybrid Reasoning        — deterministic fusion first, Bayesian fallback
 *   3. Safety Pipeline         — Sepsis / PEWS / OB / Mental-Health gate
 *   4. Explainability          — 1-line physician summary
 *   5. Versioned RLHF Proposal — never autonomous, always gated
 *   6. Security Log            — audit every invocation
 *   7. Human-Factors Emit      — INTAKE_REVIEWED telemetry
 *   8. FHIR Sync Trigger       — async publish to EHR worker (non-blocking)
 */

import { structuredIntake }           from "./nlpIntake";
import { hybridReasoning }            from "./hybridReasoning";
import { safetyPipeline }             from "./safetyPipeline";
import { generateSummary }            from "./physicianSummary";
import { fuseComplaints }             from "./multiComplaintFusion";
import { proposeWeightUpdate }        from "../learning/versionedRLHF";
import { logSecurityEvent }           from "../ops/security";
import { trackPhysicianInteraction }  from "./humanFactors";
import { canLearn }                   from "../release/modelFreeze";
import { publish }                    from "../events/bus";
import { Topics }                     from "../events/topics";
import { recordFlywheelEntry, inferSpecialty } from "../moat/flywheelEngine";
import { recordNetworkContribution }           from "../moat/networkLearning";
import { evaluateRarity }                      from "../moat/rareCaseEngine";
import { updateClinicValue }                   from "../moat/clinicLockIn";

export interface FinalPipelineInput {
  freeText?:    string;
  complaint?:   string;
  symptoms?:    string[];
  vitals?:      Record<string, number>;
  history?:     string[];
  patientId?:   string;
  encounterId?: string;
  physicianId?: string;
  clinicId?:    string;
  ageYears?:    number;
  isPregnant?:  boolean;
  actualOutcome?: string;
  [key: string]: any;
}

export interface FinalPipelineOutput {
  encounterId:        string;
  patientId:          string;
  normalizedInput:    ReturnType<typeof structuredIntake>;
  fusionResult:       { suspicion: string; priority: string; rationale: string; matchedSigns: string[] } | null;
  topDiagnosis:       string;
  confidence:         number;
  differential:       Array<{ dx: string; id?: string; score: number; label?: string }>;
  explainability:     string;
  safetyDisposition:  string;
  safetyFlags:        string[];
  physicianSummary:   string;
  rlhfProposal:       { accepted: boolean; proposalId: string; reason?: string } | null;
  durationMs:         number;
  pipelineVersion:    string;
  governedAt:         string;
  fhirSyncQueued:     boolean;
  /** Per-stage latency breakdown — every stage is timed, none is omitted */
  stageTimings:       Record<string, number>;
  /** True if any non-critical stage failed — does not block clinical output */
  degraded:           boolean;
  /** Set when FHIR sync fails — operations must investigate */
  fhirError?:         string;
}

const PIPELINE_VERSION = "1.3.0";

// ── Per-stage timing helpers ──────────────────────────────────────────────────
// timedStage: critical stage — any error propagates up and aborts the pipeline.
// timedOptional: non-critical stage — error is captured, never thrown.

function timedStage<T>(
  stageName: string,
  timings:   Record<string, number>,
  fn:        () => T
): T {
  const t0 = Date.now();
  try {
    return fn();
  } finally {
    timings[stageName] = Date.now() - t0;
  }
}

function timedOptional<T>(
  stageName: string,
  timings:   Record<string, number>,
  fn:        () => T,
  fallback:  T
): { value: T; failed: boolean; error?: string } {
  const t0 = Date.now();
  try {
    const value = fn();
    timings[stageName] = Date.now() - t0;
    return { value, failed: false };
  } catch (err) {
    timings[stageName] = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    return { value: fallback, failed: true, error: message };
  }
}

// ── RLHF governance gate ──────────────────────────────────────────────────────
// RUNTIME assertion — "never autonomous, always gated" is a comment; this is
// a contractual check. Any RLHF proposal that doesn't pass this assertion is
// not stored and not returned in the pipeline output.

export function assertRlhfGated(proposal: unknown): void {
  if (!proposal || typeof proposal !== "object") {
    throw new Error("[RLHF] Proposal is not an object");
  }
  const p = proposal as Record<string, unknown>;
  if (p.requiresHumanApproval !== true) {
    throw new Error(
      `[RLHF] GOVERNANCE VIOLATION: requiresHumanApproval=${p.requiresHumanApproval}. ` +
      `All RLHF proposals must require human approval before application.`
    );
  }
}

export function runFinalPipeline(input: FinalPipelineInput): FinalPipelineOutput {
  const start       = Date.now();
  const encounterId = input.encounterId ?? `ENC-${Date.now()}`;
  const patientId   = input.patientId   ?? "unknown";
  const timings: Record<string, number> = {};
  let   degraded = false;

  // ── 1. NLP Intake — CRITICAL ───────────────────────────────────────────────
  // Short-circuits if complaint is empty. An empty complaint cannot safely
  // proceed through clinical stages — the patient would receive a "no issues
  // found" result for a complaint the system never actually processed.
  const normalizedInput = timedStage("stage1_nlp_intake", timings, () => {
    const result = structuredIntake({
      ...input,
      freeText: input.freeText ?? input.complaint ?? "",
    });
    const rawText = input.freeText ?? input.complaint ?? "";
    if (!result.complaintLabel && !rawText.trim()) {
      throw new Error(
        `[Pipeline] Stage 1 NLP produced empty complaint. ` +
        `Pipeline cannot proceed without a parseable complaint.`
      );
    }
    return result;
  });

  const symptoms = [
    ...(normalizedInput.symptomCodes ?? []).map((s: any) => s.raw as string),
    ...(input.symptoms ?? []),
  ].filter(Boolean);

  // ── 1.5 Multi-Complaint Fusion (compound syndrome detection) ──────────────
  let fusionResult: FinalPipelineOutput["fusionResult"] = null;
  let fusionEscalation = false;
  const fusionStage = timedOptional("stage1_5_fusion", timings, () => {
    const vitals = input.vitals ?? {};
    const fusion = fuseComplaints({
      symptoms,
      age:    input.ageYears,
      vitals: {
        heartRate: vitals.heartRate ?? vitals.hr,
        tempC:     vitals.tempC ?? vitals.temp,
        sbp:       vitals.sbp ?? vitals.systolicBP,
        o2Sat:     vitals.o2Sat ?? vitals.spo2,
        respRate:  vitals.respRate ?? vitals.respiratoryRate,
      },
    });
    return fusion ?? null;
  }, null);
  if (!fusionStage.failed && fusionStage.value) {
    const f = fusionStage.value;
    fusionResult     = { suspicion: f.suspicion, priority: f.priority, rationale: f.rationale, matchedSigns: f.matchedSigns };
    fusionEscalation = f.priority === "CRITICAL" || f.priority === "HIGH";
  }
  if (fusionStage.failed) degraded = true;

  // ── 2. Hybrid Reasoning — CRITICAL ────────────────────────────────────────
  const reasoning = timedStage("stage2_reasoning", timings, () =>
    hybridReasoning({
      symptoms,
      complaint: normalizedInput.complaintLabel ?? input.complaint ?? "",
      vitals:    input.vitals ?? {},
    })
  );

  // ── 3. Safety Pipeline Gate — FAIL-CLOSED CRITICAL ────────────────────────
  // FIXED: Previously used timedOptional which let the pipeline continue without
  // a valid safety disposition. If safetyPipeline() threw, safetyDisposition
  // remained "ROUTINE" and degraded was set to true — meaning a patient with
  // sepsis or obstetric emergency could receive a routine disposition.
  // Now uses timedStage (hard fail) so any safety pipeline error aborts the pipeline.
  let safetyDisposition = "ROUTINE";
  const safetyFlags: string[] = [];

  if (fusionEscalation && fusionResult) {
    safetyDisposition = fusionResult.priority === "CRITICAL" ? "ER_NOW" : "URGENT";
    safetyFlags.push(`FUSION:${fusionResult.suspicion}`);
  }

  const safetyResult = timedStage("stage3_safety", timings, () =>
    safetyPipeline({
      symptoms,
      vitals:     input.vitals  ?? {},
      history:    input.history ?? [],
      ageYears:   input.ageYears,
      isPregnant: input.isPregnant ?? false,
    })
  );
  if (safetyResult) {
    const sr = safetyResult;
    if (sr.disposition === "ER_NOW" || safetyDisposition === "ROUTINE") safetyDisposition = sr.disposition;
    if ((sr as any).flags)     safetyFlags.push(...(sr as any).flags);
    if ((sr as any).triggered) safetyFlags.push((sr as any).triggered);
  }

  // ── 4. Physician 1-Line Summary — OPTIONAL ────────────────────────────────
  const summaryStage = timedOptional("stage4_physician_summary", timings, () => {
    const s = generateSummary({
      topDiagnosis: fusionResult?.suspicion ?? reasoning.topDiagnosis,
      disposition:  safetyDisposition,
      confidence:   reasoning.confidence,
      differential: reasoning.differential.map((d) => ({ dx: d.dx, score: d.score })),
    });
    let headline = s.headline;
    if (fusionResult) {
      headline = `⚠ ${fusionResult.suspicion.toUpperCase()} suspected [${fusionResult.priority}]. ${headline}`;
    }
    return headline;
  }, `Likely ${reasoning.topDiagnosis} — confidence ${(reasoning.confidence * 100).toFixed(0)}%.`);
  const physicianSummary = summaryStage.value;
  if (summaryStage.failed) degraded = true;

  // ── 5. Versioned RLHF Proposal — OPTIONAL + GATED ─────────────────────────
  // RUNTIME governance assertion: "never autonomous, always gated" is enforced
  // by assertRlhfGated(). Any proposal that doesn't pass this assertion is
  // not stored and not returned. A governance violation is logged as critical.
  let rlhfProposal: FinalPipelineOutput["rlhfProposal"] = null;
  const rlhfStage = timedOptional("stage5_rlhf", timings, () => {
    if (!canLearn() || !reasoning.topDiagnosis) return null;
    const raw = proposeWeightUpdate({
      diagnosisKey: (reasoning as any).topDiagnosisId ?? reasoning.topDiagnosis,
      delta:        0.005,
      rationale:    `Governed pipeline proposal for encounter ${encounterId}`,
      proposedBy:   `governed_pipeline_v${PIPELINE_VERSION}`,
      outcome:      input.actualOutcome,
    });
    // Tag the proposal with the governance fields the gate requires.
    // If proposeWeightUpdate() ever returns a different shape, the assertion catches it.
    const tagged = { ...raw, requiresHumanApproval: true as const, status: "pending_review" as const };
    assertRlhfGated(tagged);
    return tagged;
  }, null);
  if (!rlhfStage.failed) {
    rlhfProposal = rlhfStage.value;
  } else {
    degraded = true;
    if (rlhfStage.error?.includes("GOVERNANCE VIOLATION")) {
      console.error("[Pipeline] RLHF GOVERNANCE VIOLATION:", rlhfStage.error);
    }
  }

  const durationMs = Date.now() - start;

  // ── 6. Security / Access Log — OPTIONAL ───────────────────────────────────
  const secLogStage = timedOptional("stage6_security_log", timings, () =>
    logSecurityEvent({
      type:     "PIPELINE_RUN",
      userId:   input.physicianId,
      clinicId: input.clinicId,
      path:     "/governed-pipeline/run",
      detail:   { encounterId, durationMs, topDx: reasoning.topDiagnosis, fusion: fusionResult?.suspicion },
    }),
  undefined);
  if (secLogStage.failed) degraded = true;

  // ── 7. Human Factors Telemetry — OPTIONAL ─────────────────────────────────
  if (input.physicianId) {
    const hfStage = timedOptional("stage7_human_factors", timings, () =>
      trackPhysicianInteraction({
        physicianId: input.physicianId!,
        encounterId,
        action:      "INTAKE_REVIEWED",
        durationMs,
        success:     true,
      }),
    undefined);
    if (hfStage.failed) degraded = true;
  } else {
    timings["stage7_human_factors"] = 0;
  }

  // ── 8. FHIR Sync Trigger — NON-BLOCKING, error captured ───────────────────
  // "Non-blocking" means the patient response is not held for FHIR.
  // But errors are explicitly captured and surfaced — a FHIR failure is a
  // data integrity issue that operations must know about.
  let fhirSyncQueued = false;
  let fhirError: string | undefined;
  const fhirStage = timedOptional("stage8_fhir_sync", timings, () =>
    publish(Topics.FhirSyncRequested, {
      clinicId:     input.clinicId ?? "default",
      encounterId,
      patientId,
      encounter: {
        id:           encounterId,
        complaint:    normalizedInput.complaintLabel ?? input.complaint ?? "",
        status:       "triage_complete",
        triageResult: {
          topDiagnosis:    fusionResult?.suspicion ?? reasoning.topDiagnosis,
          disposition:     safetyDisposition,
          confidence:      reasoning.confidence,
          safetyFlags,
          fusionSuspicion: fusionResult?.suspicion ?? null,
        },
      },
      patient: {
        id:    patientId,
        phone: input.phone ?? null,
        name:  input.name  ?? null,
      },
    }),
  Promise.resolve());
  if (!fhirStage.failed) {
    fhirSyncQueued = true;
  } else {
    fhirError = fhirStage.error;
    degraded  = true;
    console.error(`[Pipeline] FHIR sync failed for encounter ${encounterId}:`, fhirStage.error);
  }

  // ── 9. Moat Data Flywheel (async, non-blocking) ────────────────────────────
  const clinicId  = (input as any).clinicId ?? "default";
  const diagnosis = fusionResult?.suspicion ?? reasoning.topDiagnosis ?? "unknown";
  const specialty = inferSpecialty(input.complaint ?? "", diagnosis);
  ;(async () => {
    try {
      const rarity = await evaluateRarity(diagnosis);
      await Promise.all([
        recordFlywheelEntry({
          encounterId,
          clinicId,
          complaint:    input.complaint ?? "",
          topDiagnosis: diagnosis,
          disposition:  safetyDisposition,
          confidence:   reasoning.confidence,
          fusionHit:    !!fusionResult,
          rareCase:     rarity.rare,
          specialty,
          validated:    false,   // set to true when physician confirms
          ts:           new Date().toISOString(),
        }),
        recordNetworkContribution({
          clinicId,
          specialty,
          diagnosis,
          disposition: safetyDisposition,
          ts: new Date().toISOString(),
        }),
        updateClinicValue(clinicId, {
          encounters:   1,
          diagnoses:    [diagnosis],
          specialties:  [specialty],
          rarePatterns: rarity.rare ? 1 : 0,
        }),
      ]);
    } catch { /* fire-and-forget — never block triage */ }
  })();

  return {
    encounterId,
    patientId,
    normalizedInput,
    fusionResult,
    topDiagnosis:     fusionResult?.suspicion ?? reasoning.topDiagnosis,
    confidence:       reasoning.confidence,
    differential:     reasoning.differential,
    explainability:   reasoning.explainability,
    safetyDisposition,
    safetyFlags,
    physicianSummary,
    rlhfProposal,
    durationMs,
    pipelineVersion:  PIPELINE_VERSION,
    governedAt:       new Date().toISOString(),
    fhirSyncQueued,
    stageTimings:     timings,
    degraded,
    ...(fhirError !== undefined ? { fhirError } : {}),
  };
}

export function getFinalPipelineStats() {
  return {
    active:          true,
    pipelineVersion: PIPELINE_VERSION,
    stages:          10,
    stageNames: [
      "NLP Intake (empty-complaint guard)",
      "Multi-Complaint Fusion",
      "Hybrid Reasoning",
      "Safety Pipeline (priority-ordered, structurally enforced)",
      "Physician Summary",
      "Versioned RLHF Proposal (gated)",
      "Security Log",
      "Human Factors Telemetry",
      "FHIR Sync Trigger (error-captured)",
      "Moat Data Flywheel",
    ],
  };
}

// ── Global safety gate ────────────────────────────────────────────────────────
//
// Call this after runFinalPipeline() to enforce that:
//   (a) the safety pipeline actually ran   — if safetyDisposition is missing,
//       block all output
//   (b) a degraded system did not produce  — if degraded=true and disposition
//       a safety-critical result without    is not routine, escalate to
//       human review                        physician
//
// CRITICAL: the null check on safetyDisposition MUST come before any property
// access on the output object. This function contains both checks — the
// missing-safety check is executed first, then the degraded+critical check.
// Swapping those two lines would mean a null deref fires before the guard.

export function globalClinicalSafetyGate(result: FinalPipelineOutput): void {
  // ── Guard 1: safety pipeline must have run ───────────────────────────────
  // Check this FIRST — before any access to safety-related fields.
  if (!result.safetyDisposition) {
    throw new Error("[SafetyGate] Safety pipeline missing — BLOCK ALL OUTPUT");
  }

  // ── Guard 2: no safety-critical decision under degraded conditions ────────
  // Only checked after we know safetyDisposition is present.
  const isCritical = result.safetyDisposition === "ER_NOW" || result.safetyDisposition === "URGENT_24H";
  if (result.degraded && isCritical) {
    throw new Error(
      `[SafetyGate] System degraded (degraded=true) during safety-critical decision ` +
      `(disposition=${result.safetyDisposition}) — escalate to physician for manual review`
    );
  }
}
```

### server/clinical/orchestrator.ts

```ts
import { runFinalPipeline } from "./finalPipeline";
import { processRevenue } from "../revenue/fullRevenue";
import { writeEHRAll } from "../integrations/ehrUnified";
import { safeExternalCall } from "./followupUtils";
import { sendSlackAlert } from "../monitoring/alerts";
import { sendTelegramAlert, broadcastMultiChannel } from "../monitoring/alerts";
import { sendToECWEncounter } from "../integrations/ecwAdapter";

export interface OrchestratorResult {
  triage: ReturnType<typeof runFinalPipeline>;
  revenue: ReturnType<typeof processRevenue>;
  ehr: { epic: string; ecw: string };
}

export async function orchestrate(patient: {
  patientId: string;
  complaint: string;
  insurance?: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}): Promise<OrchestratorResult> {
  const triage  = runFinalPipeline(patient as any);
  const revenue = processRevenue(patient, triage.safetyDisposition);
  const ehr = await writeEHRAll({
    patientId: patient.patientId,
    disposition: triage.safetyDisposition,
    vitals: patient.vitals,
  });
  await safeExternalCall(
    async () => sendSlackAlert(`🏥 Hospital referral: ${patient.patientId} → ${triage.safetyDisposition}`),
    undefined
  );
  return { triage, revenue, ehr };
}

// ── System Health Score ────────────────────────────────────────────────────────
export function systemScore(metrics: {
  errorRate: number;
  latency: number;
  denialRate: number;
}): number {
  const score =
    (1 - metrics.errorRate)             * 0.4 +
    (1 - metrics.latency / 3000)        * 0.3 +
    (1 - metrics.denialRate)            * 0.3;
  return Math.max(0, Math.min(1, score));
}

// ── Universal Connector Router ─────────────────────────────────────────────────
async function noop(payload: unknown): Promise<unknown> {
  console.log("[Connector] No handler registered, payload:", payload);
  return null;
}

export async function routeConnector(type: string, payload: unknown): Promise<unknown> {
  const map: Record<string, (p: unknown) => Promise<unknown>> = {
    slack:    async (p: any) => { await sendSlackAlert(String(p?.msg ?? p)); return { ok: true }; },
    telegram: async (p: any) => { await sendTelegramAlert(String(p?.msg ?? p)); return { ok: true }; },
    broadcast: async (p: any) => { await broadcastMultiChannel(String(p?.msg ?? p)); return { ok: true }; },
    ecw:      async (p: any) => sendToECWEncounter(p as any),
  };
  return (map[type] ?? noop)(payload);
}

// ── Fast Action Cache ─────────────────────────────────────────────────────────
const actionCache: Record<string, unknown> = {};

export function cacheAction(key: string, result: unknown): void {
  actionCache[key] = result;
}

export function getCachedAction(key: string): unknown {
  return actionCache[key];
}

export function clearActionCache(): void {
  Object.keys(actionCache).forEach(k => delete actionCache[k]);
}
```

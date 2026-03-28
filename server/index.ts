import express, { type Request, Response, NextFunction, Router } from "express";
import cookieParser from "cookie-parser";
import { clinicalRateLimiter, authRateLimiter, webhookRateLimiter } from "./middleware/rateLimiter";
import { clinicalDeadline, standardDeadline } from "./middleware/requestDeadline";
import { idempotency } from "./middleware/idempotency";
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
import autonomousAgentRoutes from "./routes/autonomousAgentRoutes";
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
import { initControlTowerSocket } from "./controlTower/socket";
import { startAnomalyEngine } from "./controlTower/anomalyEngine";
import { startAlertEngine, stopAlertEngine } from "./monitoring/alertEngine";
import { startMonitorSocket } from "./ws/monitorSocket";
import { startAutoHealer, stopAutoHealer } from "./monitoring/autoHealer";
import { startSelfLearningLoop, stopSelfLearningLoop } from "./learning/selfLearningEngine";
import { startGoldenMonitor, stopGoldenMonitor } from "./golden/goldenMonitor";
import adaptiveIntelligenceRoutes from "./routes/adaptiveIntelligenceRoutes";
import fdaValidationRoutes from "./routes/fdaValidationRoutes";
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
app.post("/api/voice/stream", handleTwilioMediaStream);
app.post("/api/voice/status", handleTwilioStatus);
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
app.use(governanceRoutes);
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
app.use("/api/pack-admin", packAdminRoutes);
app.use("/api/pack-intake", packDrivenIntakeRoutes);
app.use("/api/pack-simulator", packSimulatorRoutes);
app.use("/api/coverage", coverageRoutes);
app.use("/api/physician", physicianDashboardRoutes);
app.use("/api/executive-db", executiveDbRoutes);
app.use("/api/executive-ops", executiveOpsRoutes);
app.use("/api/legacy-mapper", legacyTabMapperRoutes);
app.use("/api/integrations", clinicalIntegrationRoutes);
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
app.use("/api/ops", opsRoutes);
app.use("/api/dependencies", dependenciesRoutes);
app.use("/api/engine-metrics", engineMetricsRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/clinic-health", clinicHealthRoutes);
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
      initAsyncWorkerHandlers();
      startAutonomousLoop(60_000);
      startEngines();
      runFailoverLoop(60_000);
      startRecoveryLoop(10_000);
      initControlTowerSocket(httpServer);
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
      startChaosScheduler(60_000);
      startMonitorSocket(httpServer);
      startAutoHealer();
      startSelfLearningLoop(60_000);
      startGoldenMonitor(300_000);
      if (process.env.NODE_ENV === "production") startSecretRotation();

      const shutdown = (signal: string) => {
        console.log(`[Shutdown] ${signal} received — stopping background engines`);
        stopAlertEngine();
        stopGovernanceLoop();
        stopTwinSync();
        stopPredictiveLoop();
        stopChaosScheduler();
        stopAutoHealer();
        stopSelfLearningLoop();
        stopGoldenMonitor();
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

import express, { type Request, Response, NextFunction, Router } from "express";
import cookieParser from "cookie-parser";
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
import outcomeRoutes from "./routes/outcomeRoutes";
import caseReplayRoutes from "./routes/caseReplayRoutes";
import costValueRoutes from "./routes/costValueRoutes";
import ruleGovernanceRoutes from "./routes/ruleGovernanceRoutes";
import reconciliationRoutes from "./routes/reconciliationRoutes";
import { initTraceStore } from "./traces/traceStore";
import { initConversationLog } from "./traces/conversationLog";
import { initChannels } from "./channels";

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

app.use("/api/complaint-intake", complaintIntakeRoutes);
console.log("[ComplaintIntake] Conversational intake endpoints registered at /api/complaint-intake/*");

app.use(casesRouter);
app.use(reviewRouter);
app.use("/api/reviewQueue", reviewQueueRouter);
app.use("/api/signoff", signoffRouter);
app.use("/api/noteDraft", noteDraftRouter);
app.use("/api/chatIntake", chatIntakeRouter);
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
app.use(outcomeRoutes);
app.use(caseReplayRoutes);
app.use(costValueRoutes);
app.use(ruleGovernanceRoutes);
app.use(reconciliationRoutes);
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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

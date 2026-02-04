import express, { type Request, Response, NextFunction, Router } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { getEntFluRules } from "./rules/entFluRuleLoader";
import { initIntakeDb, intakeRouter, filesRouter, summaryRouter, ensureDirs as ensureIntakeDirs } from "./intake";
import { authRouter } from "./routes.auth";
import { registerTestRoutes } from "./routes/test.routes";

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

app.use(express.urlencoded({ extended: false }));

// Auth routes
app.use(authRouter);
console.log("[Auth] Session cookie auth enabled");

// Test/regression routes
const testRouter = Router();
registerTestRoutes(testRouter);
app.use(testRouter);
console.log("[Test] Regression gate endpoints registered");

initIntakeDb();
ensureIntakeDirs();

app.use(intakeRouter);
app.use(filesRouter);
app.use(summaryRouter);

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

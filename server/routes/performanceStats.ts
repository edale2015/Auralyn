import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getRuleCacheStats } from "../services/performance/ruleCacheService";
import { getExpressionCacheStats } from "../services/performance/expressionCacheService";
import { getCaseCacheStats } from "../services/performance/caseCacheService";
import { getHotPathMetrics } from "../services/performance/hotPathExecutor";

export const performanceStatsRouter = Router();

performanceStatsRouter.get("/", requireRole(["admin"]), async (_req, res) => {
  res.json({
    ruleCache: getRuleCacheStats(),
    expressionCache: getExpressionCacheStats(),
    caseCache: getCaseCacheStats(),
    hotPath: getHotPathMetrics(),
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    uptime: Math.round(process.uptime()),
  });
});

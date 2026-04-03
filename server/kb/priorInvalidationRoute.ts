import { Router } from "express";
import { invalidatePriorCache, getPriorCacheStats } from "../clinical/bayesianPriorService";
import { appendAuditEvent } from "../governance/audit";

export const priorInvalidationRouter = Router();

priorInvalidationRouter.post("/api/kb/priors/invalidate", async (req: any, res, next) => {
  try {
    const user = req.user ?? req.auth ?? {};
    const roles: string[] = user.roles ?? (user.role ? [user.role] : []);
    if (!roles.some(r => ["admin", "system_admin"].includes(r))) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    const statsBefore = getPriorCacheStats();
    invalidatePriorCache();

    await appendAuditEvent({
      tenantId: user.tenantId ?? null,
      actorId: user.id ?? user.email ?? null,
      action: "KB_PRIOR_CACHE_INVALIDATED",
      entityType: "kb_prior_cache",
      justification: req.body?.reason ?? "manual emergency invalidation",
      payload: {
        sourceIp: req.ip,
        cacheEntriesCleared: statsBefore.size,
      },
    });

    return res.json({
      ok: true,
      invalidated: true,
      cacheEntriesCleared: statsBefore.size,
    });
  } catch (err) {
    next(err);
  }
});

priorInvalidationRouter.get("/api/kb/priors/cache-stats", async (req: any, res, next) => {
  try {
    const user = req.user ?? req.auth ?? {};
    const roles: string[] = user.roles ?? (user.role ? [user.role] : []);
    if (!roles.some(r => ["admin", "system_admin"].includes(r))) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    return res.json(getPriorCacheStats());
  } catch (err) {
    next(err);
  }
});

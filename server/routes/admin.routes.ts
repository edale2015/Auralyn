import type { Router, Request, Response } from "express";
import { requireProviderAuth } from "../auth";
import { runRetentionSweep, getRetentionConfig } from "../channels/retentionPolicy";

export function registerAdminRoutes(router: Router) {
  router.get("/api/admin/retention/config", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const config = getRetentionConfig();
      res.json({ ok: true, config });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/admin/retention/sweep", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

      if (dryRun) {
        const config = getRetentionConfig();
        const cutoff = new Date(Date.now() - config.telemetryTtlDays * 24 * 60 * 60 * 1000);
        return res.json({
          ok: true,
          dryRun: true,
          config,
          cutoff: cutoff.toISOString(),
          message: `Would sweep telemetry older than ${config.telemetryTtlDays} days (before ${cutoff.toISOString()})`,
        });
      }

      console.log("[Retention] Sweep triggered by provider");
      const result = await runRetentionSweep();
      console.log(`[Retention] Sweep complete: ${result.conversationStatesRedacted} states redacted, ${result.dedupeDocsDeleted} dedupe docs deleted in ${result.durationMs}ms`);

      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Retention] Sweep error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

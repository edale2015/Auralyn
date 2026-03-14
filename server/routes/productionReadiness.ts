import { Router } from "express"
import { buildHealthBundle } from "../services/healthBundleService"
import { runStartupChecks } from "../config/startupChecks"
import { checkAllProviders } from "../services/providerHealthService"
import { checkMigrations } from "../services/migrationCheckService"
import { deadLetterStats } from "../services/ehrDeadLetterService"

const router = Router()

router.get("/api/production-readiness", async (_req, res) => {
  try {
    const bundle = await buildHealthBundle()

    const sections = {
      environment: {
        ok: bundle.env.every((c) => c.ok),
        checks: bundle.env,
      },
      providers: {
        ok: bundle.providers.every((p) => p.ok),
        checks: bundle.providers,
      },
      migrations: {
        ok: bundle.migrations.ok,
        pending: bundle.migrations.pending,
        applied: bundle.migrations.applied,
      },
      deadLetter: {
        ok: bundle.deadLetter.unresolved === 0,
        ...bundle.deadLetter,
      },
    }

    const allOk = Object.values(sections).every((s) => s.ok)

    res.json({
      ok: allOk,
      timestamp: bundle.timestamp,
      readinessLevel: allOk ? "PRODUCTION_READY" : bundle.env.every((c) => c.ok) ? "STAGING_READY" : "NOT_READY",
      sections,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router

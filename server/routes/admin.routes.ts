import type { Router, Request, Response } from "express";
import { requireProviderAuth } from "../auth";
import { runRetentionSweep, getRetentionConfig } from "../channels/retentionPolicy";
import { invalidateAll, invalidateTable, getCacheStatus, getRegisteredTables } from "../data/registry";
import { invalidateRouterCache } from "../services/complaintRouter";
import { initializePipeline } from "../agent/pipeline";
import { resolveDiagnoses } from "../services/diagnosisResolver";
import { getMedSuggestions } from "../services/medSuggestions";
import { resolveClusterDisposition } from "../services/clusterDisposition";
import type { CaseState } from "../../shared/agentTypes";

export function registerAdminRoutes(router: Router) {
  router.post("/api/admin/registry/reload", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const table = req.query.table as string | undefined;
      if (table) {
        invalidateTable(table);
        res.json({ ok: true, message: `Invalidated cache for ${table}` });
      } else {
        invalidateAll();
        invalidateRouterCache();
        res.json({ ok: true, message: "Invalidated all registry caches" });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/admin/registry/status", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      res.json({
        ok: true,
        registeredTables: getRegisteredTables(),
        cacheStatus: getCacheStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
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

  router.post("/api/admin/test/runScenario", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const {
        complaint,
        answers = {},
        modifierAnswers = {},
        forcedClusters = [],
        forcedModifiers = {},
        demographics = {},
        allergies = [],
        meds = [],
        pmh = [],
      } = req.body;

      if (!complaint) {
        return res.status(400).json({ ok: false, error: "complaint is required" });
      }

      const now = new Date().toISOString();
      const scenarioId = `scenario_${Date.now()}`;

      const seedState: CaseState = {
        caseId: scenarioId,
        createdAt: now,
        updatedAt: now,
        chiefComplaint: complaint,
        demographics: demographics || undefined,
        modifiers: {
          allergies: allergies.length > 0 ? allergies : undefined,
          meds: meds.length > 0 ? meds : undefined,
          pmh: pmh.length > 0 ? pmh : undefined,
        },
        modifierAnswers: { ...modifierAnswers, ...forcedModifiers },
        answers: answers,
        scores: {},
        activeClusters: [...forcedClusters],
        diagnosisClusterIds: [],
        disposition: undefined,
        dispositionReasonCodes: [],
        candidateMeds: [],
        candidateDiagnoses: [],
        ruleTrace: [],
        redFlags: [],
        requiredQuestionIdsMissing: [],
        recommendedActions: [],
        questionQueue: [],
        routing: { state: "INTAKE_PENDING" },
        audit: { steps: [], events: [] },
      };

      const debug: Record<string, any> = {
        scenarioId,
        input: { complaint, answers, modifierAnswers: seedState.modifierAnswers, forcedClusters, demographics, allergies, meds, pmh },
      };

      const pipelineResult = await initializePipeline(seedState, {
        runId: scenarioId,
        mode: "REGRESSION",
        maxSteps: 1,
        llm: { enabled: false },
      });

      const pState = pipelineResult.state;
      debug.pipeline = {
        routerEntry: pipelineResult.routerEntry,
        events: pipelineResult.events,
        system: pState.system,
        normalizedComplaint: pState.normalizedComplaint,
        activeClusters: pState.activeClusters,
        routingState: pState.routing,
        modifierAnswers: pState.modifierAnswers,
        ruleTrace: pState.ruleTrace,
        questionQueue: pState.questionQueue.map(q => ({
          questionId: q.questionId,
          bundleId: q.bundleId,
          askOrder: q.askOrder,
          isRedFlag: q.isRedFlag,
          questionText: q.questionText,
          answered: q.answered,
        })),
        bundlesAdded: [
          pipelineResult.routerEntry?.primarySecondaryBundleId,
          ...pState.ruleTrace.filter(r => r.action === "ADD_BUNDLE").map(r => r.detail),
        ].filter(Boolean),
        rulesFired: pState.ruleTrace.map(r => ({
          ruleId: r.ruleId,
          triggerLevel: r.triggerLevel,
          action: r.action,
          detail: r.detail,
        })),
      };

      const defaultCluster = pipelineResult.routerEntry?.defaultCluster || forcedClusters[0] || "";
      const triageUpgrade = pState.ruleTrace
        .filter(r => r.action === "TRIAGE_UPGRADE")
        .map(r => r.detail)
        .pop();

      let dxResult = null;
      let medsResult = null;
      let dispositionResult = null;

      if (pState.system || forcedClusters.length > 0) {
        try {
          const sys = pState.system || "";
          const cc = pState.normalizedComplaint || complaint;

          dxResult = await resolveDiagnoses(
            sys, cc, pState.activeClusters, pState.modifierAnswers, pState.answers
          );
        } catch (err: any) {
          dxResult = { error: err.message };
        }

        try {
          const derivedFlags = pState.fhirPrefill?.derivedFlags ?? {
            onAnticoagulant: false,
            hasAsthmaCOPD: false,
            immunosuppressed: false,
            pregnant: demographics?.pregnant ?? false,
            ckd: false,
            hepatic: false,
          };
          const patientAllergies = allergies.length > 0 ? allergies : (pState.fhirPrefill?.allergies ?? []);
          const medContraFlags = pState.ruleTrace
            .filter(r => r.action === "MED_CONTRA_FLAG")
            .map(r => r.detail?.match(/MED_CONTRA_FLAG\(([^)]+)\)/)?.[1] ?? "")
            .filter(Boolean);

          medsResult = await getMedSuggestions(
            pState.activeClusters, derivedFlags, patientAllergies, medContraFlags
          );
        } catch (err: any) {
          medsResult = { error: err.message };
        }

        try {
          dispositionResult = await resolveClusterDisposition(
            pState, defaultCluster, triageUpgrade
          );
        } catch (err: any) {
          dispositionResult = { error: err.message };
        }
      }

      debug.resolution = {
        diagnoses: dxResult,
        medications: medsResult,
        disposition: dispositionResult,
      };

      debug.summary = {
        complaint,
        system: pState.system ?? "(no router entry)",
        routerEntryFound: !!pipelineResult.routerEntry,
        activeClusters: pState.activeClusters,
        rulesFiredCount: pState.ruleTrace.length,
        questionsInQueue: pState.questionQueue.length,
        unansweredQuestions: pState.questionQueue.filter(q => !q.answered).length,
        candidateDxCount: Array.isArray(dxResult) ? dxResult.length : 0,
        candidateMedGroupCount: Array.isArray(medsResult) ? medsResult.filter((m: any) => m.medications).length : 0,
        finalDisposition: dispositionResult && !("error" in dispositionResult) ? dispositionResult.dispositionCandidate : null,
        redFlags: pState.redFlags,
      };

      res.json({ ok: true, ...debug });
    } catch (err: any) {
      console.error("[TestScenario] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

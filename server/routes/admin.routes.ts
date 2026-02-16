import type { Router, Request, Response } from "express";
import { requireProviderAuth } from "../auth";
import { runRetentionSweep, getRetentionConfig } from "../channels/retentionPolicy";
import { invalidateAll, invalidateTable, getCacheStatus, getRegisteredTables, getTable } from "../data/registry";
import { invalidateRouterCache } from "../services/complaintRouter";
import { initializePipeline } from "../agent/pipeline";
import { resolveDiagnoses } from "../services/diagnosisResolver";
import { getMedSuggestions, CARE_SETTING_PRESETS, type CareSetting } from "../services/medSuggestions";
import { resolveClusterDisposition } from "../services/clusterDisposition";
import type { CaseState } from "../../shared/agentTypes";
import {
  extractObesityOutputData,
  formatObesityOutput,
  renderSectionsAsText,
  type OutputChannel,
} from "../agents/obesity/outputFormatter";

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

  router.get("/api/admin/data/clusters", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string || "").toUpperCase();
      const system = (req.query.system as string || "").toUpperCase();
      const rows = await getTable("GLOBAL_CLUSTER_MASTER");
      const normId = (s: any) => String(s ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
      const results = rows
        .map(r => ({
          clusterId: normId(r.Cluster_ID),
          clusterName: String(r.Cluster_Name ?? "").trim(),
          system: String(r.System ?? "").trim(),
          defaultDisposition: String(r.Default_Disposition ?? "").trim(),
          primaryComplaints: String(r.Primary_Chief_Complaints ?? "").trim(),
        }))
        .filter(r => {
          if (search && !r.clusterId.includes(search) && !r.clusterName.toUpperCase().includes(search)) return false;
          if (system && r.system.toUpperCase() !== system) return false;
          return true;
        })
        .slice(0, 50);
      res.json({ ok: true, count: results.length, clusters: results });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/admin/data/validate", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const issues: Array<{ severity: "error" | "warn" | "info"; table: string; message: string }> = [];
      const stats: Record<string, any> = {};

      const [clusterRows, medRows, cpDxRows] = await Promise.all([
        getTable("GLOBAL_CLUSTER_MASTER").catch(() => []),
        getTable("GLOBAL_MEDICATIONS_MASTER").catch(() => []),
        getTable("CLUSTER_PRIMARY_DIAGNOSIS").catch(() => []),
      ]);

      const sampleColumns = (rows: any[]) => rows.length > 0 ? Object.keys(rows[0]) : [];

      stats.GLOBAL_CLUSTER_MASTER = { rowCount: clusterRows.length, columns: sampleColumns(clusterRows) };
      stats.GLOBAL_MEDICATIONS_MASTER = { rowCount: medRows.length, columns: sampleColumns(medRows) };
      stats.CLUSTER_PRIMARY_DIAGNOSIS = { rowCount: cpDxRows.length, columns: sampleColumns(cpDxRows) };

      if (clusterRows.length === 0) {
        issues.push({ severity: "error", table: "GLOBAL_CLUSTER_MASTER", message: "Table is empty or missing" });
      }
      if (medRows.length === 0) {
        issues.push({ severity: "error", table: "GLOBAL_MEDICATIONS_MASTER", message: "Table is empty or missing" });
      }
      if (cpDxRows.length === 0) {
        issues.push({ severity: "warn", table: "CLUSTER_PRIMARY_DIAGNOSIS", message: "Table is empty or missing" });
      }

      const normId = (s: any) => String(s ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");

      const clusterIds = new Set(clusterRows.map(r => normId(r.Cluster_ID)).filter(Boolean));
      stats.GLOBAL_CLUSTER_MASTER.uniqueClusterIds = clusterIds.size;

      const linkTypeCounts: Record<string, number> = {};
      let medsWithoutDxId = 0;
      const medClustersNotInMaster: string[] = [];

      const parseClusterList = (s: any) =>
        String(s ?? "").split(/[;,]/).map(x => normId(x.replace(/^_/, ""))).filter(Boolean);

      for (const row of medRows) {
        const lt = String(row.Medication_Link_Type ?? "").trim().toUpperCase() || "UNTYPED";
        linkTypeCounts[lt] = (linkTypeCounts[lt] || 0) + 1;

        const clusters = parseClusterList(row.Indications_Cluster);
        for (const cluster of clusters) {
          if (cluster && !clusterIds.has(cluster) && !medClustersNotInMaster.includes(cluster)) {
            medClustersNotInMaster.push(cluster);
          }
        }

        if (lt === "PRIMARY_DIAGNOSIS") {
          const dxId = String(row.DIAGNOSIS_ID ?? "").trim();
          const safeFill = String(row.DIAGNOSIS_ID_SafeFill ?? "").trim();
          if (!dxId && !safeFill) {
            medsWithoutDxId++;
          }
        }
      }

      stats.GLOBAL_MEDICATIONS_MASTER.byLinkType = linkTypeCounts;

      for (const cluster of medClustersNotInMaster) {
        issues.push({
          severity: "warn",
          table: "GLOBAL_MEDICATIONS_MASTER",
          message: `Indications_Cluster "${cluster}" not found in GLOBAL_CLUSTER_MASTER.Cluster_ID`,
        });
      }

      if (medsWithoutDxId > 0) {
        issues.push({
          severity: "error",
          table: "GLOBAL_MEDICATIONS_MASTER",
          message: `${medsWithoutDxId} row(s) with Medication_Link_Type=PRIMARY_DIAGNOSIS have no DIAGNOSIS_ID or DIAGNOSIS_ID_SafeFill`,
        });
      }

      const cpDxClustersNotInMaster: string[] = [];
      for (const row of cpDxRows) {
        const cluster = normId(row.Cluster_ID);
        if (cluster && !clusterIds.has(cluster)) {
          cpDxClustersNotInMaster.push(cluster);
        }
      }

      for (const cluster of cpDxClustersNotInMaster) {
        issues.push({
          severity: "warn",
          table: "CLUSTER_PRIMARY_DIAGNOSIS",
          message: `Cluster_ID "${cluster}" not found in GLOBAL_CLUSTER_MASTER.Cluster_ID`,
        });
      }

      stats.CLUSTER_PRIMARY_DIAGNOSIS.mappingCount = cpDxRows.length;

      const errorCount = issues.filter(i => i.severity === "error").length;
      const warnCount = issues.filter(i => i.severity === "warn").length;

      res.json({
        ok: errorCount === 0,
        summary: {
          errors: errorCount,
          warnings: warnCount,
          clusterCount: clusterIds.size,
          medCount: medRows.length,
          clusterDxMappings: cpDxRows.length,
        },
        stats,
        issues,
      });
    } catch (err: any) {
      console.error("[DataValidate] Error:", err);
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
        careSetting,
        careMode,
        metabolic,
        dm,
        htn,
        bariatric,
        glp1,
        social,
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
        metabolic: metabolic || undefined,
        dm: dm || undefined,
        htn: htn || undefined,
        bariatric: bariatric || undefined,
        glp1: glp1 || undefined,
        social: social || undefined,
        spotInterventions: [],
        careMode: careMode || undefined,
        routing: { state: "INTAKE_PENDING", careSetting: careSetting || careMode || undefined },
        audit: { steps: [], events: [] },
      };

      const debug: Record<string, any> = {
        scenarioId,
        input: { complaint, answers, modifierAnswers: seedState.modifierAnswers, forcedClusters, demographics, allergies, meds, pmh, metabolic, dm, htn, bariatric, glp1, social },
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
        careMode: pState.careMode,
        bundlesAdded: [
          pipelineResult.routerEntry?.primarySecondaryBundleId,
          ...pState.ruleTrace.filter(r => r.action === "ADD_BUNDLE").map(r => r.detail),
        ].filter(Boolean),
        medTriggersMatched: pipelineResult.events
          .filter(e => e.type === "MED_TRIGGERS_MATCHED")
          .map(e => e.message),
        obesityAgent: {
          triggered: pipelineResult.events.some(e => e.type === "OBESITY_AGENT_TRIGGERED"),
          entryReasons: pipelineResult.events
            .filter(e => e.type === "OBESITY_AGENT_TRIGGERED")
            .map(e => e.message),
          dm: pState.dm,
          htn: pState.htn,
          glp1: pState.glp1,
          metabolic: pState.metabolic,
          spotInterventions: pState.spotInterventions,
          completeSummary: pipelineResult.events
            .filter(e => e.type === "OBESITY_AGENT_COMPLETE")
            .map(e => e.message),
        },
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

          const resolvedDxIds = Array.isArray(dxResult)
            ? dxResult.map((d: any) => d.diagnosisId).filter(Boolean)
            : [];

          const careSettingKey = pState.careMode || pState.routing?.careSetting;
          const allowedCareSettings = careSettingKey
            ? CARE_SETTING_PRESETS[careSettingKey] ?? careSettingKey.split(",").map(s => s.trim()) as CareSetting[]
            : undefined;

          medsResult = await getMedSuggestions(
            pState.activeClusters, derivedFlags, patientAllergies, medContraFlags, resolvedDxIds,
            undefined, allowedCareSettings
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
        candidateMedCount: Array.isArray(medsResult) ? medsResult.length : 0,
        candidateMedCountUnblocked: Array.isArray(medsResult) ? medsResult.filter((m: any) => !m.blocked).length : 0,
        medsByLinkType: Array.isArray(medsResult) ? medsResult.reduce((acc: Record<string, number>, m: any) => {
          const lt = m.linkType || "UNKNOWN";
          acc[lt] = (acc[lt] || 0) + 1;
          return acc;
        }, {}) : {},
        finalDisposition: dispositionResult && !("error" in dispositionResult) ? dispositionResult.dispositionCandidate : null,
        redFlags: pState.redFlags,
      };

      if (debug.pipeline?.obesityAgent?.triggered) {
        const obesityData = extractObesityOutputData(pState, debug.pipeline.obesityAgent.bundlesAdded || []);
        const channel = (req.query.channel as OutputChannel) || "web";
        const formatted = formatObesityOutput(obesityData, channel);
        debug.formattedOutput = {
          channel,
          sections: formatted.sections,
          text: renderSectionsAsText(formatted),
        };
      }

      res.json({ ok: true, ...debug });
    } catch (err: any) {
      console.error("[TestScenario] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

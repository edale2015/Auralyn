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
import { formatRedFlagOutput } from "../services/redFlagsMaster";
import { formatUCSpotOutput } from "../services/urgentCareSpotInterventions";
import { runRedFlagAudit } from "../services/redFlagAudit";
import { storeTrace, buildTraceTimeline, getStoredTraceIds } from "../services/traceViewer";
import { runComplaintGraph } from "../services/complaintNodeRunner";
import { loadComplaintConfig, listAvailableComplaints, invalidateComplaintConfigCache } from "../services/complaintConfigLoader";

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

      debug.clinicalStateTrace = pState.clinicalStateTrace || null;
      debug.redFlagGate = pState.redFlagGate || null;
      debug.confidence = pState.confidence || null;
      debug.careGaps = pState.careGaps || [];

      const traceScenarioId = `scenario_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      storeTrace(traceScenarioId, pState, pipelineResult.events, debug.pipeline);
      debug.traceId = traceScenarioId;

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
        redFlagGateResult: pState.redFlagGate?.gateResult ?? "NOT_EVALUATED",
        confidenceGlobal: pState.confidence?.global ?? "NOT_EVALUATED",
        careGapCount: (pState.careGaps ?? []).length,
        clinicalStateMedCount: pState.clinicalStateTrace?.normalizedMeds?.length ?? 0,
        clinicalStateConditionCount: pState.clinicalStateTrace?.inferredConditions?.length ?? 0,
        clinicalStateRiskFlagCount: pState.clinicalStateTrace?.riskFlags?.length ?? 0,
        clinicalStateBuildMs: pState.clinicalStateTrace?.buildDurationMs ?? null,
      };

      const channel = (req.query.channel as OutputChannel) || "web";

      if (pState.redFlagGate && pState.redFlagGate.flagsFound.length > 0) {
        debug.formattedRedFlagOutput = formatRedFlagOutput(pState.redFlagGate as any, channel as any);
      }

      if (pState.spotInterventions.length > 0) {
        debug.formattedUCSpotOutput = formatUCSpotOutput(
          { selected: pState.spotInterventions.map(si => ({ ...si, safetyClass: si.safetyClass || "spot_intervention" })) as any, skipped: [], source: "pipeline" },
          channel as any
        );
      }

      if (debug.pipeline?.obesityAgent?.triggered) {
        const obesityData = extractObesityOutputData(pState, debug.pipeline.obesityAgent.bundlesAdded || []);
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

  router.get("/api/admin/audit/redflags", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const report = await runRedFlagAudit();
      res.json({ ok: true, ...report });
    } catch (err: any) {
      console.error("[RedFlagAudit] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/admin/trace", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const ids = getStoredTraceIds();
      res.json({ ok: true, count: ids.length, traceIds: ids.slice(-50) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/admin/trace/:scenarioId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const timeline = buildTraceTimeline(req.params.scenarioId);
      if (!timeline) {
        res.status(404).json({ ok: false, error: "Trace not found" });
        return;
      }
      res.json({ ok: true, ...timeline });
    } catch (err: any) {
      console.error("[TraceViewer] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/admin/stress-test", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const { scenarios } = req.body;
      if (!Array.isArray(scenarios) || scenarios.length === 0) {
        res.status(400).json({ ok: false, error: "scenarios array required" });
        return;
      }

      const results: any[] = [];
      const startTime = Date.now();

      for (const scenario of scenarios) {
        const scenarioStart = Date.now();
        try {
          const {
            complaint = "",
            meds = [],
            allergies = [],
            pmh = [],
            answers = {},
            demographics = {},
            dm,
            htn,
            glp1,
            bariatric,
            social,
            forcedClusters = [],
            assertions = {},
          } = scenario;

          const now = new Date().toISOString();
          const stressId = `stress_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

          const seedState: CaseState = {
            caseId: stressId,
            createdAt: now,
            updatedAt: now,
            chiefComplaint: complaint,
            demographics: demographics || undefined,
            modifiers: {
              allergies: allergies.length > 0 ? allergies : undefined,
              meds: meds.length > 0 ? meds : undefined,
              pmh: pmh.length > 0 ? pmh : undefined,
            },
            modifierAnswers: {},
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
            dm: dm || undefined,
            htn: htn || undefined,
            bariatric: bariatric || undefined,
            glp1: glp1 || undefined,
            social: social || undefined,
            spotInterventions: [],
            routing: { state: "INTAKE_PENDING" },
            audit: { steps: [], events: [] },
          };

          const pipelineResult = await initializePipeline(seedState, {
            maxSteps: 1,
            runId: stressId,
            promptVersion: "v1",
          });

          const pState = pipelineResult.state;
          const elapsed = Date.now() - scenarioStart;

          const assertionResults: Record<string, { pass: boolean; expected: any; actual: any }> = {};

          if (assertions.expectRedFlagGate !== undefined) {
            assertionResults["expectRedFlagGate"] = {
              pass: pState.redFlagGate?.gateResult === assertions.expectRedFlagGate,
              expected: assertions.expectRedFlagGate,
              actual: pState.redFlagGate?.gateResult ?? "NOT_EVALUATED",
            };
          }

          if (assertions.expectConfidence !== undefined) {
            assertionResults["expectConfidence"] = {
              pass: pState.confidence?.global === assertions.expectConfidence,
              expected: assertions.expectConfidence,
              actual: pState.confidence?.global ?? "NOT_EVALUATED",
            };
          }

          if (assertions.expectMinCareGaps !== undefined) {
            assertionResults["expectMinCareGaps"] = {
              pass: (pState.careGaps ?? []).length >= assertions.expectMinCareGaps,
              expected: `>= ${assertions.expectMinCareGaps}`,
              actual: (pState.careGaps ?? []).length,
            };
          }

          if (assertions.expectCareGapIds !== undefined && Array.isArray(assertions.expectCareGapIds)) {
            const gapIds = (pState.careGaps ?? []).map(g => g.gap_id);
            assertionResults["expectCareGapIds"] = {
              pass: assertions.expectCareGapIds.every((id: string) => gapIds.includes(id)),
              expected: assertions.expectCareGapIds,
              actual: gapIds,
            };
          }

          if (assertions.expectMinRedFlags !== undefined) {
            assertionResults["expectMinRedFlags"] = {
              pass: pState.redFlags.length >= assertions.expectMinRedFlags,
              expected: `>= ${assertions.expectMinRedFlags}`,
              actual: pState.redFlags.length,
            };
          }

          if (assertions.expectRoutingState !== undefined) {
            assertionResults["expectRoutingState"] = {
              pass: pState.routing.state === assertions.expectRoutingState,
              expected: assertions.expectRoutingState,
              actual: pState.routing.state,
            };
          }

          if (assertions.expectSystem !== undefined) {
            assertionResults["expectSystem"] = {
              pass: pState.system === assertions.expectSystem,
              expected: assertions.expectSystem,
              actual: pState.system,
            };
          }

          if (assertions.expectMinSpotInterventions !== undefined) {
            assertionResults["expectMinSpotInterventions"] = {
              pass: pState.spotInterventions.length >= assertions.expectMinSpotInterventions,
              expected: `>= ${assertions.expectMinSpotInterventions}`,
              actual: pState.spotInterventions.length,
            };
          }

          if (assertions.expectNoEmergent !== undefined && assertions.expectNoEmergent) {
            assertionResults["expectNoEmergent"] = {
              pass: pState.routing.state !== "EMERGENT_ESCALATION",
              expected: "NOT EMERGENT_ESCALATION",
              actual: pState.routing.state,
            };
          }

          const allPassed = Object.values(assertionResults).every(r => r.pass);

          const traceId = `stress_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          storeTrace(traceId, pState, pipelineResult.events);

          results.push({
            id: scenario.id || results.length,
            label: scenario.label || complaint,
            pass: allPassed,
            assertions: assertionResults,
            elapsedMs: elapsed,
            traceId,
            summary: {
              system: pState.system,
              redFlagGate: pState.redFlagGate?.gateResult,
              confidence: pState.confidence?.global,
              careGapCount: (pState.careGaps ?? []).length,
              redFlagCount: pState.redFlags.length,
              spotInterventionCount: pState.spotInterventions.length,
            },
          });
        } catch (err: any) {
          results.push({
            id: scenario.id || results.length,
            label: scenario.label || scenario.complaint || "(unknown)",
            pass: false,
            error: err?.message || String(err),
            elapsedMs: Date.now() - scenarioStart,
          });
        }
      }

      const totalElapsed = Date.now() - startTime;
      const passCount = results.filter(r => r.pass).length;
      const failCount = results.filter(r => !r.pass).length;

      res.json({
        ok: true,
        totalScenarios: results.length,
        passed: passCount,
        failed: failCount,
        elapsedMs: totalElapsed,
        avgMs: Math.round(totalElapsed / results.length),
        results,
      });
    } catch (err: any) {
      console.error("[StressTest] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/admin/complaint/list", requireProviderAuth, async (_req: Request, res: Response) => {
    try {
      const complaints = await listAvailableComplaints();
      res.json({ ok: true, complaints });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.get("/api/admin/complaint/config/:ccId", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const config = await loadComplaintConfig(req.params.ccId);
      if (!config) {
        res.status(404).json({ ok: false, error: `No config for complaint: ${req.params.ccId}` });
        return;
      }
      res.json({ ok: true, config });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/admin/complaint/reload", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const ccId = req.query.ccId as string | undefined;
      invalidateComplaintConfigCache(ccId);
      res.json({ ok: true, message: ccId ? `Invalidated config for ${ccId}` : "Invalidated all complaint configs" });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/admin/complaint/run-graph", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const {
        complaint,
        answers = {},
        demographics = {},
        allergies = [],
        meds = [],
        pmh = [],
        immunocompromised = false,
      } = req.body;

      if (!complaint) {
        return res.status(400).json({ ok: false, error: "complaint is required" });
      }

      const now = new Date().toISOString();
      const runId = `graph_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const seedState: CaseState = {
        caseId: runId,
        createdAt: now,
        updatedAt: now,
        chiefComplaint: complaint,
        demographics: demographics || undefined,
        modifiers: {
          allergies: allergies.length > 0 ? allergies : undefined,
          meds: meds.length > 0 ? meds : undefined,
          pmh: pmh.length > 0 ? pmh : undefined,
          immunocompromised: immunocompromised || undefined,
        },
        modifierAnswers: {},
        answers,
        scores: {},
        activeClusters: [],
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
        spotInterventions: [],
        routing: { state: "INTAKE_PENDING" },
        audit: { steps: [], events: [] },
      };

      const result = await runComplaintGraph(seedState, complaint);

      storeTrace(runId, result.state, result.events);

      res.json({
        ok: true,
        runId,
        currentNode: result.currentNode,
        done: result.done,
        pendingAction: result.pendingAction ?? null,
        nodeTraces: result.nodeTraces,
        events: result.events,
        state: {
          system: result.state.system,
          disposition: result.state.disposition,
          dispositionReasonCodes: result.state.dispositionReasonCodes,
          scores: result.state.scores,
          redFlags: result.state.redFlags,
          redFlagGate: result.state.redFlagGate,
          routing: result.state.routing,
          recommendedActions: result.state.recommendedActions,
          questionQueue: result.state.questionQueue,
          activeClusters: result.state.activeClusters,
          audit: result.state.audit,
        },
      });
    } catch (err: any) {
      console.error("[ComplaintGraph] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/admin/complaint/stress-test", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const { scenarios } = req.body;
      if (!Array.isArray(scenarios) || scenarios.length === 0) {
        res.status(400).json({ ok: false, error: "scenarios array required" });
        return;
      }

      const results: any[] = [];
      const startTime = Date.now();

      for (const scenario of scenarios) {
        const scenarioStart = Date.now();
        try {
          const {
            complaint = "sore throat",
            answers = {},
            demographics = {},
            allergies = [],
            meds = [],
            pmh = [],
            immunocompromised = false,
            assertions = {},
          } = scenario;

          const now = new Date().toISOString();
          const runId = `cstress_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

          const seedState: CaseState = {
            caseId: runId,
            createdAt: now,
            updatedAt: now,
            chiefComplaint: complaint,
            demographics: demographics || undefined,
            modifiers: {
              allergies: allergies.length > 0 ? allergies : undefined,
              meds: meds.length > 0 ? meds : undefined,
              pmh: pmh.length > 0 ? pmh : undefined,
              immunocompromised: immunocompromised || undefined,
            },
            modifierAnswers: {},
            answers,
            scores: {},
            activeClusters: [],
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
            spotInterventions: [],
            routing: { state: "INTAKE_PENDING" },
            audit: { steps: [], events: [] },
          };

          const graphResult = await runComplaintGraph(seedState, complaint);
          const pState = graphResult.state;
          const elapsed = Date.now() - scenarioStart;

          const assertionResults: Record<string, { pass: boolean; expected: any; actual: any }> = {};

          if (assertions.expectDisposition !== undefined) {
            assertionResults["expectDisposition"] = {
              pass: pState.disposition === assertions.expectDisposition,
              expected: assertions.expectDisposition,
              actual: pState.disposition ?? "NOT_SET",
            };
          }

          if (assertions.expectRedFlagGate !== undefined) {
            assertionResults["expectRedFlagGate"] = {
              pass: pState.redFlagGate?.gateResult === assertions.expectRedFlagGate,
              expected: assertions.expectRedFlagGate,
              actual: pState.redFlagGate?.gateResult ?? "NOT_EVALUATED",
            };
          }

          if (assertions.expectMinRedFlags !== undefined) {
            assertionResults["expectMinRedFlags"] = {
              pass: pState.redFlags.length >= assertions.expectMinRedFlags,
              expected: `>= ${assertions.expectMinRedFlags}`,
              actual: pState.redFlags.length,
            };
          }

          if (assertions.expectRedFlagIds !== undefined && Array.isArray(assertions.expectRedFlagIds)) {
            assertionResults["expectRedFlagIds"] = {
              pass: assertions.expectRedFlagIds.every((id: string) => pState.redFlags.includes(id)),
              expected: assertions.expectRedFlagIds,
              actual: pState.redFlags,
            };
          }

          if (assertions.expectCentorScore !== undefined) {
            assertionResults["expectCentorScore"] = {
              pass: pState.scores?.centor === assertions.expectCentorScore,
              expected: assertions.expectCentorScore,
              actual: pState.scores?.centor ?? "NOT_COMPUTED",
            };
          }

          if (assertions.expectMinCentorScore !== undefined) {
            assertionResults["expectMinCentorScore"] = {
              pass: (pState.scores?.centor ?? 0) >= assertions.expectMinCentorScore,
              expected: `>= ${assertions.expectMinCentorScore}`,
              actual: pState.scores?.centor ?? 0,
            };
          }

          if (assertions.expectTemplateId !== undefined) {
            const matchedRule = pState.dispositionReasonCodes[pState.dispositionReasonCodes.length - 1];
            assertionResults["expectTemplateId"] = {
              pass: pState.dispositionReasonCodes.includes(assertions.expectTemplateId) || matchedRule === assertions.expectTemplateId,
              expected: assertions.expectTemplateId,
              actual: pState.dispositionReasonCodes,
            };
          }

          if (assertions.expectRoutingState !== undefined) {
            assertionResults["expectRoutingState"] = {
              pass: pState.routing.state === assertions.expectRoutingState,
              expected: assertions.expectRoutingState,
              actual: pState.routing.state,
            };
          }

          if (assertions.expectDone !== undefined) {
            assertionResults["expectDone"] = {
              pass: graphResult.done === assertions.expectDone,
              expected: assertions.expectDone,
              actual: graphResult.done,
            };
          }

          if (assertions.expectPendingQuestion !== undefined) {
            const pendingQId = graphResult.pendingAction?.type === "ASK_QUESTION"
              ? (graphResult.pendingAction as any).questionId
              : null;
            assertionResults["expectPendingQuestion"] = {
              pass: pendingQId === assertions.expectPendingQuestion,
              expected: assertions.expectPendingQuestion,
              actual: pendingQId,
            };
          }

          if (assertions.expectNoPendingAction !== undefined && assertions.expectNoPendingAction) {
            assertionResults["expectNoPendingAction"] = {
              pass: !graphResult.pendingAction,
              expected: "no pending action",
              actual: graphResult.pendingAction ? graphResult.pendingAction.type : "none",
            };
          }

          if (assertions.expectMinScores !== undefined && typeof assertions.expectMinScores === "object") {
            for (const [scoreKey, minVal] of Object.entries(assertions.expectMinScores)) {
              const actual = pState.scores?.[scoreKey.toLowerCase()] ?? pState.scores?.[scoreKey] ?? 0;
              assertionResults[`expectMinScore_${scoreKey}`] = {
                pass: (actual as number) >= (minVal as number),
                expected: `>= ${minVal}`,
                actual,
              };
            }
          }

          if (assertions.expectMinActiveClusters !== undefined) {
            assertionResults["expectMinActiveClusters"] = {
              pass: (pState.activeClusters ?? []).length >= assertions.expectMinActiveClusters,
              expected: `>= ${assertions.expectMinActiveClusters}`,
              actual: (pState.activeClusters ?? []).length,
            };
          }

          if (assertions.expectMinDiagnosisCandidates !== undefined) {
            assertionResults["expectMinDiagnosisCandidates"] = {
              pass: (pState.candidateDiagnoses ?? []).length >= assertions.expectMinDiagnosisCandidates,
              expected: `>= ${assertions.expectMinDiagnosisCandidates}`,
              actual: (pState.candidateDiagnoses ?? []).length,
            };
          }

          if (assertions.expectNoCouncilRun !== undefined && assertions.expectNoCouncilRun) {
            const councilTrace = graphResult.nodeTraces.find((t: any) => t.node === "SPECIALIST_COUNCIL" && t.skipped !== true);
            assertionResults["expectNoCouncilRun"] = {
              pass: !councilTrace || councilTrace.skipped === true,
              expected: "council not executed",
              actual: councilTrace ? "council ran" : "council skipped/absent",
            };
          }

          const allPassed = Object.values(assertionResults).every(r => r.pass);

          results.push({
            id: scenario.id || results.length,
            label: scenario.label || complaint,
            pass: allPassed,
            assertions: assertionResults,
            elapsedMs: elapsed,
            currentNode: graphResult.currentNode,
            done: graphResult.done,
            summary: {
              disposition: pState.disposition,
              redFlagGate: pState.redFlagGate?.gateResult,
              centorScore: pState.scores?.centor,
              redFlagCount: pState.redFlags.length,
              redFlagIds: pState.redFlags,
              routingState: pState.routing.state,
              nodeCount: graphResult.nodeTraces.length,
              activeClusters: pState.activeClusters ?? [],
              diagnosisCandidateCount: (pState.candidateDiagnoses ?? []).length,
            },
          });
        } catch (err: any) {
          results.push({
            id: scenario.id || results.length,
            label: scenario.label || scenario.complaint || "(unknown)",
            pass: false,
            error: err?.message || String(err),
            elapsedMs: Date.now() - scenarioStart,
          });
        }
      }

      const totalElapsed = Date.now() - startTime;
      const passCount = results.filter(r => r.pass).length;
      const failCount = results.filter(r => !r.pass).length;

      res.json({
        ok: true,
        totalScenarios: results.length,
        passed: passCount,
        failed: failCount,
        elapsedMs: totalElapsed,
        avgMs: Math.round(totalElapsed / results.length),
        results,
      });
    } catch (err: any) {
      console.error("[ComplaintStressTest] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}

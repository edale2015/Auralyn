import type { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { google } from "googleapis";
import { z } from "zod";
import {
  AgentRunRequestSchema,
  CompareRequestSchema,
  type AgentRunResponse,
  type RulesSnapshotResponse,
  type CompareResponse,
  type NormalizedResult,
  type CompareFailure,
} from "../../shared/testingTypes";
import { CaseStateSchema, AgentRunConfigSchema } from "../../shared/agentTypes";
import { normalizeAnswer } from "../agent/normalize";
import { runAgentLoop, buildAgentRunResponse } from "../agent/runtime";
import { isSessionValid } from "../auth";

const GIT_COMMIT = process.env.REPL_ID?.slice(0, 7) || "local";

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function requireTestAuth(req: Request, res: Response): boolean {
  const testToken = req.header("x-test-token") || "";
  const envToken = process.env.TEST_EXEC_TOKEN || "";
  
  if (envToken && testToken === envToken) {
    return true;
  }
  
  const cookie = req.cookies?.medsess;
  if (cookie && isSessionValid(cookie)) {
    return true;
  }
  
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

async function getSheetsClient() {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let auth;
  
  if (credsJson) {
    const credentials = JSON.parse(credsJson);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  } else {
    auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }
  
  return google.sheets({ version: "v4", auth });
}

const DISPOSITION_SAFETY_ORDER = [
  "ed_stat",
  "ed",
  "urgent_or_ed",
  "urgent_care",
  "urgent",
  "routine_or_supportive",
  "routine",
  "self_care_with_routine_followup",
  "self_care_with_precautions",
  "self_care",
  "home",
];

function getDispositionSafetyLevel(disp: string): number {
  const normalized = disp.toLowerCase().replace(/[^a-z_]/g, "");
  const idx = DISPOSITION_SAFETY_ORDER.indexOf(normalized);
  if (idx >= 0) return idx;
  
  if (normalized.includes("urgent") || normalized.includes("ed")) return 3;
  if (normalized.includes("routine")) return 5;
  if (normalized.includes("self_care") || normalized.includes("home")) return 8;
  
  return -1;
}

function normalizeAnswerValue(val: unknown): string | number | boolean {
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val;
  const s = String(val).toLowerCase().trim();
  if (s === "yes" || s === "y") return "Yes";
  if (s === "no" || s === "n") return "No";
  if (s === "not_sure" || s === "not sure") return "Not sure";
  return val as string;
}

export function registerTestRoutes(router: Router): void {
  router.get("/api/test/rules/snapshot", async (req: Request, res: Response) => {
    try {
      if (!requireTestAuth(req, res)) return;
      
      const sheetEnv = (req.query.sheetEnv as string) || "staging";
      const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
      
      if (!spreadsheetId) {
        return res.status(500).json({ error: "SHEETS_SPREADSHEET_ID not configured" });
      }
      
      const sheets = await getSheetsClient();
      
      const tabNames = ["CLINICAL_QUESTIONS", "CLINICAL_RULES", "CLINICAL_MEDICATIONS", "DIAGNOSES"];
      const tabs: Array<{ name: string; rows: number; hash: string }> = [];
      const allData: string[] = [];
      
      for (const tabName of tabNames) {
        try {
          const resp = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${tabName}!A1:Z1000`,
            valueRenderOption: "UNFORMATTED_VALUE",
          });
          
          const values = resp.data.values || [];
          const rowCount = values.length;
          const tabData = JSON.stringify(values);
          const tabHash = sha256(tabData).slice(0, 16);
          
          tabs.push({ name: tabName, rows: rowCount, hash: tabHash });
          allData.push(tabData);
        } catch (err: any) {
          if (err.code === 400 || err.message?.includes("Unable to parse range")) {
            tabs.push({ name: tabName, rows: 0, hash: "not_found" });
          } else {
            throw err;
          }
        }
      }
      
      const rulesetHash = sha256(allData.join("::")).slice(0, 32);
      
      const response: RulesSnapshotResponse = {
        sheetEnv,
        spreadsheetId,
        rulesetHash,
        tabs,
      };
      
      res.json(response);
    } catch (error: any) {
      console.error("[test/rules/snapshot] Error:", error);
      res.status(500).json({ error: error.message || "Failed to get rules snapshot" });
    }
  });

  router.post("/api/test/agent-run", async (req: Request, res: Response) => {
    try {
      if (!requireTestAuth(req, res)) return;
      
      const parsed = AgentRunRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid request", details: parsed.error.issues });
      }
      
      const { case: testCase, run } = parsed.data;
      const runId = run.runId;
      const sheetEnv = run.rules?.sheetEnv || "staging";
      
      const normalizedAnswers: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(testCase.answers)) {
        normalizedAnswers[key] = normalizeAnswer(val);
      }
      
      const nowISO = new Date().toISOString();
      const caseState = CaseStateSchema.parse({
        caseId: `test-${runId}`,
        createdAt: nowISO,
        updatedAt: nowISO,
        chiefComplaint: testCase.chiefComplaint,
        demographics: testCase.demographics,
        modifiers: testCase.modifiers,
        answers: normalizedAnswers,
        scores: {},
        diagnosisClusterIds: [],
        dispositionReasonCodes: [],
        redFlags: [],
        requiredQuestionIdsMissing: [],
        recommendedActions: [],
        routing: { state: "CORE_QS_PENDING" },
        audit: { steps: [], events: [] },
      });
      
      const config = AgentRunConfigSchema.parse({
        runId,
        mode: run.mode,
        maxSteps: run.maxSteps,
        llm: run.llm,
        rules: run.rules,
        options: run.options || { disableWrites: true, disableTwilio: true, disableFileUploads: true },
      });
      
      const agentOut = runAgentLoop(caseState, config);
      
      let rulesetHash = "unknown";
      try {
        const sheets = await getSheetsClient();
        const tabNames = ["CLINICAL_QUESTIONS", "CLINICAL_RULES"];
        const allData: string[] = [];
        for (const tabName of tabNames) {
          try {
            const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID || "";
            const resp = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: `${tabName}!A1:Z500`,
              valueRenderOption: "UNFORMATTED_VALUE",
            });
            allData.push(JSON.stringify(resp.data.values || []));
          } catch {}
        }
        rulesetHash = sha256(allData.join("::")).slice(0, 32);
      } catch {}
      
      const response = buildAgentRunResponse(
        runId,
        sheetEnv,
        rulesetHash,
        agentOut.finalState,
        agentOut.steps,
        agentOut.events
      );
      
      res.json(response);
    } catch (error: any) {
      console.error("[test/agent-run] Error:", error);
      res.status(500).json({ ok: false, error: error.message || "Agent run failed" });
    }
  });

  router.post("/api/test/compare", async (req: Request, res: Response) => {
    try {
      if (!requireTestAuth(req, res)) return;
      
      const parsed = CompareRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid request", details: parsed.error.issues });
      }
      
      const { baseline, candidate, policy } = parsed.data;
      
      const hardFailCodes = policy?.hardFails || [
        "DISPOSITION_CHANGED_UP",
        "RED_FLAG_REMOVED",
        "ANTIBIOTIC_RECOMMENDATION_CHANGED",
        "SCORE_CHANGED",
      ];
      
      const softFailCodes = policy?.softFails || [
        "DX_CHANGED",
        "QUESTION_ORDER_CHANGED",
        "DISPOSITION_CHANGED_DOWN",
      ];
      
      const allowLists = policy?.allowLists || { dxReorderOk: true, traceStepCountDeltaMax: 3 };
      
      const hardFailures: CompareFailure[] = [];
      const softFailures: CompareFailure[] = [];
      
      const baseNorm = baseline?.normalized?.final as NormalizedResult | undefined;
      const candNorm = candidate?.normalized?.final as NormalizedResult | undefined;
      
      if (!baseNorm || !candNorm) {
        hardFailures.push({
          code: "MISSING_NORMALIZED",
          path: "normalized.final",
          details: "One or both runs missing normalized output",
        });
      } else {
        if (baseNorm.disposition !== candNorm.disposition) {
          const baseSafety = getDispositionSafetyLevel(baseNorm.disposition);
          const candSafety = getDispositionSafetyLevel(candNorm.disposition);
          
          if (baseSafety === -1 || candSafety === -1) {
            hardFailures.push({
              code: "UNKNOWN_DISPOSITION",
              path: "normalized.final.disposition",
              details: `Unknown disposition value detected: baseline="${baseNorm.disposition}" (level=${baseSafety}), candidate="${candNorm.disposition}" (level=${candSafety})`,
              baseline: baseNorm.disposition,
              candidate: candNorm.disposition,
            });
          } else if (candSafety > baseSafety) {
            hardFailures.push({
              code: "DISPOSITION_CHANGED_UP",
              path: "normalized.final.disposition",
              details: `Disposition became less safe: ${baseNorm.disposition} → ${candNorm.disposition}`,
              baseline: baseNorm.disposition,
              candidate: candNorm.disposition,
            });
          } else if (candSafety < baseSafety) {
            softFailures.push({
              code: "DISPOSITION_CHANGED_DOWN",
              path: "normalized.final.disposition",
              details: `Disposition became more conservative: ${baseNorm.disposition} → ${candNorm.disposition}`,
              baseline: baseNorm.disposition,
              candidate: candNorm.disposition,
            });
          }
        }
        
        const baseRedFlags = new Set(baseNorm.redFlags || []);
        const candRedFlags = new Set(candNorm.redFlags || []);
        
        for (const rf of baseRedFlags) {
          if (!candRedFlags.has(rf)) {
            hardFailures.push({
              code: "RED_FLAG_REMOVED",
              path: "normalized.final.redFlags",
              details: `Red flag "${rf}" was removed`,
              baseline: Array.from(baseRedFlags),
              candidate: Array.from(candRedFlags),
            });
          }
        }
        
        for (const rf of candRedFlags) {
          if (!baseRedFlags.has(rf)) {
            softFailures.push({
              code: "RED_FLAG_ADDED",
              path: "normalized.final.redFlags",
              details: `Red flag "${rf}" was added (more conservative)`,
            });
          }
        }
        
        for (const [scoreKey, baseVal] of Object.entries(baseNorm.scores || {})) {
          const candVal = candNorm.scores?.[scoreKey];
          if (candVal !== undefined && candVal !== baseVal) {
            hardFailures.push({
              code: "SCORE_CHANGED",
              path: `normalized.final.scores.${scoreKey}`,
              details: `Score "${scoreKey}" changed: ${baseVal} → ${candVal}`,
              baseline: baseVal,
              candidate: candVal,
            });
          }
        }
        
        const baseDx = baseNorm.dx || [];
        const candDx = candNorm.dx || [];
        
        const baseDxSet = new Set(baseDx);
        const candDxSet = new Set(candDx);
        
        const dxAdded = candDx.filter((d) => !baseDxSet.has(d));
        const dxRemoved = baseDx.filter((d) => !candDxSet.has(d));
        
        if (dxAdded.length > 0 || dxRemoved.length > 0) {
          softFailures.push({
            code: "DX_CHANGED",
            path: "normalized.final.dx",
            details: `Dx added: [${dxAdded.join(", ")}], removed: [${dxRemoved.join(", ")}]`,
            baseline: baseDx,
            candidate: candDx,
          });
        } else if (!allowLists.dxReorderOk && JSON.stringify(baseDx) !== JSON.stringify(candDx)) {
          softFailures.push({
            code: "DX_REORDERED",
            path: "normalized.final.dx",
            details: "Diagnosis order changed",
            baseline: baseDx,
            candidate: candDx,
          });
        }
      }
      
      const baseSteps = baseline?.trace?.steps?.length || 0;
      const candSteps = candidate?.trace?.steps?.length || 0;
      const stepDelta = Math.abs(candSteps - baseSteps);
      
      if (stepDelta > (allowLists.traceStepCountDeltaMax || 3)) {
        softFailures.push({
          code: "TRACE_STEP_COUNT_CHANGED",
          path: "trace.steps.length",
          details: `Step count changed by ${stepDelta} (max allowed: ${allowLists.traceStepCountDeltaMax})`,
          baseline: baseSteps,
          candidate: candSteps,
        });
      }
      
      const response: CompareResponse = {
        pass: hardFailures.length === 0,
        hardFailures,
        softFailures,
        summary: { hard: hardFailures.length, soft: softFailures.length },
      };
      
      res.json(response);
    } catch (error: any) {
      console.error("[test/compare] Error:", error);
      res.status(500).json({ ok: false, error: error.message || "Compare failed" });
    }
  });
}

import { Router, Request, Response } from "express";
import { google } from "googleapis";
import { requireRole } from "../middleware/requireRole";
import { auditMiddleware } from "../middleware/auditMiddleware";
import { adaptiveMapWorkbook } from "../engines/adaptiveLegacyMapper";
import { validateAnyPackRow, validatePackQuestionRow } from "../engines/packValidationEngine";

const router = Router();
const auth = requireRole(["admin"]);

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

router.post(
  "/run-full-pipeline",
  auth,
  auditMiddleware("RUN_FULL_MAPPING_PIPELINE"),
  async (_req: Request, res: Response) => {
    try {
      const spreadsheetId = process.env.PACKS_SPREADSHEET_ID;
      if (!spreadsheetId) {
        res.status(400).json({ error: "PACKS_SPREADSHEET_ID not configured" });
        return;
      }

      const sheets = getSheets();
      const meta = await sheets.spreadsheets.get({ spreadsheetId });

      const workbook: Record<string, string[][]> = {};

      for (const s of meta.data.sheets || []) {
        const title = s.properties?.title;
        if (!title) continue;
        const data = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${title}!A:Z`,
        });
        workbook[title] = data.data.values || [];
      }

      const mapped = adaptiveMapWorkbook(workbook);

      const validation = {
        symptom: mapped.symptomRows.map((r: any) => ({
          id: r.id,
          ok: validateAnyPackRow(r).ok,
        })),
        question: mapped.questionRows.map((r: any) => ({
          id: r.id,
          ok: validatePackQuestionRow(r).ok,
        })),
      };

      res.json({
        ok: true,
        detectedTabs: Object.keys(workbook),
        mappingReport: mapped.mappingReport,
        counts: {
          symptoms: mapped.symptomRows.length,
          questions: mapped.questionRows.length,
          modifiers: mapped.modifierRows.length,
          algorithms: mapped.algorithmRows.length,
        },
        validation,
        preview: {
          symptoms: mapped.symptomRows.slice(0, 10),
          questions: mapped.questionRows.slice(0, 10),
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

router.post(
  "/run-full-pipeline-local",
  auth,
  auditMiddleware("RUN_FULL_MAPPING_PIPELINE_LOCAL"),
  (req: Request, res: Response) => {
    try {
      const workbook: Record<string, string[][]> = req.body.workbook || {};
      if (!Object.keys(workbook).length) {
        res.status(400).json({ error: "workbook data required in body" });
        return;
      }

      const mapped = adaptiveMapWorkbook(workbook);

      const validation = {
        symptom: mapped.symptomRows.map((r: any) => ({
          id: r.id,
          ok: validateAnyPackRow(r).ok,
        })),
        question: mapped.questionRows.map((r: any) => ({
          id: r.id,
          ok: validatePackQuestionRow(r).ok,
        })),
      };

      res.json({
        ok: true,
        detectedTabs: Object.keys(workbook),
        mappingReport: mapped.mappingReport,
        counts: {
          symptoms: mapped.symptomRows.length,
          questions: mapped.questionRows.length,
          modifiers: mapped.modifierRows.length,
          algorithms: mapped.algorithmRows.length,
        },
        validation,
        preview: {
          symptoms: mapped.symptomRows.slice(0, 10),
          questions: mapped.questionRows.slice(0, 10),
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

export default router;

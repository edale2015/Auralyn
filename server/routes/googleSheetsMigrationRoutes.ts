import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  ensureCanonicalTabs,
  verifyCanonicalTabs,
  dryRunMigration,
  applyMigration,
  runQaChecks,
  cutoverToCanonicalOnly,
} from "../engines/googleSheetsMigrationEngine";
import { importClinicalSheetsToDb } from "../scripts/importClinicalSheetsToDb";
import { importAllSystemSheetsToDb } from "../scripts/importAllSystemSheetsToDb";

const router = Router();
const auth = requireRole(["admin"]);

router.post("/ensure-canonical-tabs", auth, async (_req: Request, res: Response) => {
  try {
    const result = await ensureCanonicalTabs();
    const verification = await verifyCanonicalTabs();
    res.json({ ok: true, result, verification });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/dry-run", auth, async (req: Request, res: Response) => {
  try {
    const result = await dryRunMigration(req.body?.sources || {});
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/apply", auth, async (req: Request, res: Response) => {
  try {
    const result = await applyMigration(req.body?.sources || {});
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/run-qa", auth, async (_req: Request, res: Response) => {
  try {
    const result = await runQaChecks();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/cutover", auth, async (_req: Request, res: Response) => {
  try {
    const result = await cutoverToCanonicalOnly();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/import-clinical", auth, async (_req: Request, res: Response) => {
  try {
    const result = await importClinicalSheetsToDb();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/import-all-systems", auth, async (_req: Request, res: Response) => {
  try {
    const result = await importAllSystemSheetsToDb();
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;

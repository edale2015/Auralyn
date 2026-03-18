import { Router, Request, Response } from 'express';
import { mapLegacyTabs, LegacyTabData } from '../engines/legacyTabMapper';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.post('/dry-run', requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  try {
    const tabs = (req.body?.tabs || []) as LegacyTabData[];
    const result = mapLegacyTabs(tabs);
    res.json({
      ok: true,
      ...result,
      counts: {
        symptomPackRows: result.symptomPackRows.length,
        modifierPackRows: result.modifierPackRows.length,
        questionRows: result.questionRows.length,
        algorithmRows: result.algorithmRows.length,
        planTemplateRows: result.planTemplateRows.length,
        issues: result.issues.length,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;

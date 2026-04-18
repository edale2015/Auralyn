/**
 * server/routes/controlTowerValidationRoutes.ts
 * Control Tower validation dashboard routes.
 *
 *   GET /api/control-tower-validation/validation-dashboard — live trend data
 *   POST /api/control-tower-validation/calibration         — per-complaint calibration
 *   POST /api/control-tower-validation/generate-cases/:type — generate synthetic gold-standard cases
 */

import express                     from "express";
import { getValidationDashboard }  from "../controlTower/validationDashboard";
import { calibrationByComplaint }  from "../controlTower/calibrationService";
import { generatePECases }         from "../validation/generators/peGenerator";
import { generateACSCases }        from "../validation/generators/acsGenerator";
import { generateSepsisCases }     from "../validation/generators/sepsisGenerator";

const router = express.Router();

/* ── Live validation dashboard ─────────────────────────────────────────── */
router.get("/validation-dashboard", async (_req, res) => {
  try {
    const data = await getValidationDashboard();
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Per-complaint calibration ─────────────────────────────────────────── */
router.post("/calibration", (req, res) => {
  try {
    const rows   = req.body.results ?? [];
    const result = calibrationByComplaint(rows);
    res.json({ ok: true, calibration: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

/* ── Gold-standard case generators ────────────────────────────────────── */
router.post("/generate-cases/:type", (req, res) => {
  try {
    const n    = Number(req.body.n ?? 100);
    const type = req.params.type;

    let cases: any[];
    switch (type) {
      case "pe":
        cases = generatePECases(n);
        break;
      case "acs":
        cases = generateACSCases(n);
        break;
      case "sepsis":
        cases = generateSepsisCases(n);
        break;
      default:
        return res.status(400).json({
          ok: false,
          error: `Unknown case type "${type}". Valid: pe | acs | sepsis`,
        });
    }

    res.json({ ok: true, type, count: cases.length, cases });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message ?? "Unknown error" });
  }
});

export default router;

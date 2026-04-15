/**
 * Control Tower Feed Route (Phase 6 — Step 4 from bundle)
 *
 * GET /api/phase6/control-tower — live system status snapshot
 *
 * Note: /api/control-tower is already registered for run records.
 * This route serves the Phase 6 system status feed at /api/phase6/control-tower
 * to preserve both endpoints without collision.
 */

import { Router }            from "express";
import { getControlTowerData } from "../phase6/controlTower/controlTowerFeed";
import { requireRole }          from "../middleware/requireRole";

const router = Router();

// Phase 2 Fix: Control tower exposes system-wide clinical operations data.
// Lock to admin + physician — unauthenticated access would expose pipeline health,
// rule weights, and clinical throughput metrics without any credential check.
router.use(requireRole(["admin", "physician"]));

router.get("/control-tower", (_req, res) => {
  res.json(getControlTowerData());
});

export default router;

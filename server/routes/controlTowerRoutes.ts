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

const router = Router();

router.get("/control-tower", (_req, res) => {
  res.json(getControlTowerData());
});

export default router;

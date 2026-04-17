/**
 * server/automation/desktopRoutes.ts — Desktop automation execution
 *
 * FIX (Code Review Security Gap):
 *   POST /execute was unauthenticated — any unauthenticated caller could execute
 *   arbitrary desktop automation actions. requirePhysician added to entire router.
 */

import { Router } from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { createDesktopAdapter } from "./desktopAdapter";

const router = Router();
router.use(requirePhysician);

router.post("/execute", async (req, res) => {
  try {
    const adapter = createDesktopAdapter();
    const result = await adapter.execute(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Desktop action failed" });
  }
});

export default router;

/**
 * server/automation/credentialRoutes.ts — EHR automation credential management
 *
 * FIX (Code Review Security Gap):
 *   All endpoints were unauthenticated. requirePhysician is now applied to
 *   the entire router — any unauthenticated caller gets 401.
 */

import { Router } from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { saveAutomationCredential, listAutomationCredentials } from "./credentialVault";

const router = Router();
router.use(requirePhysician);

router.get("/", async (_req, res) => {
  const rows = await listAutomationCredentials();
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { credentialKey, systemName, username, secretJson } = req.body || {};

  if (!credentialKey || !systemName || !secretJson) {
    return res.status(400).json({ error: "credentialKey, systemName, and secretJson are required" });
  }

  const row = await saveAutomationCredential({ credentialKey, systemName, username, secretJson });
  res.json(row);
});

export default router;

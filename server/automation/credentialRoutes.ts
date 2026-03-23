import { Router } from "express";
import { saveAutomationCredential, listAutomationCredentials } from "./credentialVault";

const router = Router();

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

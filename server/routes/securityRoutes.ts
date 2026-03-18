import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { encrypt, decrypt } from "../security/encryption";
import { redactPHI, redactObject } from "../security/redaction";
import { getAccessLog, getAccessLogCount } from "../security/accessLog";

const router = Router();

router.post("/encrypt", requireRole(["admin"]), (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    res.json({ encrypted: encrypt(text) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/decrypt", requireRole(["admin"]), (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "encrypted data required" });
  try {
    res.json({ decrypted: decrypt(data) });
  } catch (err: any) {
    res.status(400).json({ error: "Decryption failed: " + err.message });
  }
});

router.post("/redact", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { text, object } = req.body;
  if (text) return res.json({ redacted: redactPHI(text) });
  if (object) return res.json({ redacted: redactObject(object) });
  res.status(400).json({ error: "text or object required" });
});

router.get("/access-log", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const userId = req.query.userId as string;
  res.json({ count: getAccessLogCount(), entries: getAccessLog(limit, userId) });
});

export default router;

import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { protectPHI, unprotectPHI, protectSpecificFields } from "../security/phiWrapper";

const router = Router();

router.post("/protect", requireRole(["admin"]), (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "data object required" });
  res.json({ protected: protectPHI(data) });
});

router.post("/unprotect", requireRole(["admin"]), (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "data object required" });
  res.json({ unprotected: unprotectPHI(data) });
});

router.post("/protect-fields", requireRole(["admin"]), (req: Request, res: Response) => {
  const { data, fields } = req.body;
  if (!data || !Array.isArray(fields)) {
    return res.status(400).json({ error: "data object and fields array required" });
  }
  res.json({ protected: protectSpecificFields(data, fields) });
});

export default router;

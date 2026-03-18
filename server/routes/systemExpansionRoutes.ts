import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { auditMiddleware } from "../middleware/auditMiddleware";
import {
  generateSystemPacks,
  generateSystemPacksForSystem,
  getAvailableSystems,
} from "../engines/systemPackGenerator";

const router = Router();
const auth = requireRole(["admin"]);

router.post(
  "/generate-all-systems",
  auth,
  auditMiddleware("GENERATE_ALL_SYSTEM_PACKS"),
  (_req: Request, res: Response) => {
    const packs = generateSystemPacks();
    res.json({
      ok: true,
      count: packs.length,
      systems: getAvailableSystems(),
      packs,
    });
  }
);

router.post(
  "/generate-system/:system",
  auth,
  auditMiddleware("GENERATE_SYSTEM_PACKS"),
  (req: Request, res: Response) => {
    const system = req.params.system;
    const packs = generateSystemPacksForSystem(system);
    if (!packs.length) {
      res.status(404).json({ error: `No system definition found for: ${system}` });
      return;
    }
    res.json({
      ok: true,
      system,
      count: packs.length,
      packs,
    });
  }
);

router.get("/available-systems", auth, (_req: Request, res: Response) => {
  res.json({ systems: getAvailableSystems() });
});

export default router;

import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  createSharedView,
  listSharedViews,
  approveSharedView,
} from "../services/sharedViewsStore";

const router = Router();
const auth = requireRole(["admin", "physician"]);

router.get("/", auth, (req: Request, res: Response) => {
  const user = (req as any).user || {};
  const approvedOnly = req.query.approvedOnly === "true";
  const rows = listSharedViews(user.clinicId || "default", approvedOnly);
  res.json(rows);
});

router.post("/", auth, (req: Request, res: Response) => {
  const user = (req as any).user || {};
  const row = createSharedView({
    clinicId: user.clinicId || "default",
    createdByUserId: user.id || "unknown",
    name: req.body.name,
    viewType: req.body.viewType,
    filters: req.body.filters,
  });
  res.json(row);
});

router.post(
  "/:id/approve",
  requireRole(["admin"]),
  (req: Request, res: Response) => {
    const user = (req as any).user || {};
    const row = approveSharedView(
      Number(req.params.id),
      user.id || "unknown"
    );
    if (!row) {
      res.status(404).json({ error: "View not found" });
      return;
    }
    res.json(row);
  }
);

export default router;

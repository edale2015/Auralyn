import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { reviewQueueSnapshotService } from "../services/reviewQueueSnapshotService";

export const reviewQueueSnapshotsRouter = Router();

reviewQueueSnapshotsRouter.get(
  "/",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 100);
      const snapshots = await reviewQueueSnapshotService.listQueueSnapshots(limit);
      res.json({
        count: snapshots.length,
        snapshots,
      });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? "Failed to load review queue snapshots",
      });
    }
  }
);

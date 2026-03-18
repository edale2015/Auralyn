import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { buildBenchmarkTrendSeries } from "../services/benchmarkTrends";

const router = Router();
const auth = requireRole(["admin", "physician"]);

router.post("/", auth, (req: Request, res: Response) => {
  res.json(buildBenchmarkTrendSeries(req.body.rows || []));
});

export default router;

import express from "express";
import { ReplayRepository } from "../templateStudio/replayRepository";

const router = express.Router();
const repo = new ReplayRepository();

router.get("/replays", async (_req, res) => {
  const replays = await repo.list();
  res.json({ replays });
});

router.get("/replays/:replayId", async (req, res) => {
  const replay = await repo.get(req.params.replayId);
  if (!replay) return res.status(404).json({ error: "Replay not found" });
  res.json({ replay });
});

export default router;

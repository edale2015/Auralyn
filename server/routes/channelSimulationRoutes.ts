import express from "express";
import { simulateChannelPerformance, getAllChannelPerformance } from "../simulation/channelSimulationHarness";

const router = express.Router();

router.get("/channel-simulation", (_req, res) => {
  res.json(getAllChannelPerformance());
});

router.get("/channel-simulation/:channel", (req, res) => {
  res.json(simulateChannelPerformance(req.params.channel));
});

export default router;

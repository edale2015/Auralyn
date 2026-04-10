import { Router } from "express";
import { startLiveSimulation, stopLiveSimulation, getLiveSnapshot, getTickCount, isRunning } from "./liveSimulator";
import { buildForecastReport } from "./surgeForecast";
import { getLiveStreamStats } from "../ws/liveStream";

const router = Router();

router.get("/status", (_req, res) => {
  const snapshot = getLiveSnapshot();
  const stream   = getLiveStreamStats();
  res.json({
    ok:          true,
    running:     isRunning(),
    tick:        getTickCount(),
    latest:      snapshot,
    connections: stream.connections,
  });
});

router.post("/start", (_req, res) => {
  startLiveSimulation();
  res.json({ ok: true, running: true });
});

router.post("/stop", (_req, res) => {
  stopLiveSimulation();
  res.json({ ok: true, running: false });
});

router.post("/forecast", (req, res) => {
  try {
    const { history } = req.body ?? {};
    if (!Array.isArray(history)) {
      return res.status(400).json({ ok: false, error: "history array required" });
    }
    const report = buildForecastReport(history);
    res.json({ ok: true, ...report });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/geo", (req, res) => {
  const { selectRegionByIp } = require("../infra/geoRouter");
  const ip     = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ?? req.socket.remoteAddress ?? "";
  const region = selectRegionByIp(ip);
  res.json({ ok: true, clientIp: ip, region });
});

export default router;
